// InnerTube fast path for single YouTube videos (port of the desktop app's electron/utils/innertube.ts).
//
// Calls the InnerTube `player` endpoint directly instead of spawning yt-dlp, so paste -> formats takes a few hundred
// ms instead of several seconds. Nothing here downloads anything: downloads still go through yt-dlp, which re-resolves
// the video. The result is shaped like `yt-dlp --dump-single-json`, so VT.normalize() treats both paths the same.
//
// This is a *fast* path, not a second extractor: anything it is not sure about returns null and the caller falls back
// to yt-dlp. It never throws.
//
// Easy to undo by accident (kept in sync with the desktop app):
//  - VISIONOS is deliberate. ANDROID_VR media URLs are 403'd. VISIONOS returns plain `url` fields instead of
//    `signatureCipher` blobs, so no JS runtime is needed to read formats.
//  - visitorData is required. Without it YouTube answers LOGIN_REQUIRED for most videos.
//  - Client versions rotate. CACHE_VERSION is part of the stored key so a token for a replaced profile cannot outlive it.
(function () {
    const https = require('https');

    const PLAYER_ENDPOINT = 'https://youtubei.googleapis.com/youtubei/v1/player';
    const VISITOR_ENDPOINT = 'https://youtubei.googleapis.com/youtubei/v1/visitor_id';

    const CLIENT_NAME = 'VISIONOS';
    const CLIENT_VERSION = '1.02';
    const DEVICE_MAKE = 'Apple';
    const DEVICE_MODEL = 'RealityDevice17,1';
    const OS_NAME = 'visionOS';
    const OS_VERSION = '26.5.23O471';
    const USER_AGENT = 'com.google.ios.youtube/20.10.4 (ApplevisionDevice; U; CPU visionOS 26_5 like Mac OS X)';

    const CACHE_VERSION = 'v1';
    const VISITOR_KEY = 'vp_visitor_' + CACHE_VERSION;

    // VISIONOS has no `microformat` (category, upload date, likes). A WEB player request returns it even though it
    // returns no streams for an anonymous caller, so it is asked in parallel for that and nothing else.
    const WEB_CLIENT_VERSION = '2.20250925.01.00';
    const WEB_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    const MICROFORMAT_TIMEOUT_MS = 3000;
    const MICROFORMAT_GRACE_MS = 400;     // how long the main answer waits for it once the streams are ready
    const REQUEST_TIMEOUT_MS = 6000;
    const FAST_PATH_BUDGET_MS = 8000;     // wall-clock ceiling, retry included: never slower than the yt-dlp path

    const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

    // ---------- URL ----------
    // Strict on purpose: the host must be YouTube's and `v=` only counts on /watch.
    function parseVideoId(input) {
        const t = String(input || '').trim();
        if (!t) return null;
        let u;
        try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : 'https://' + t); } catch (e) { return null; }
        const host = u.hostname.toLowerCase();
        if (host === 'youtu.be') {
            const id = u.pathname.split('/')[1] || '';
            return VIDEO_ID.test(id) ? id : null;
        }
        if (host !== 'youtube.com' && !/\.youtube\.com$/.test(host)) return null;
        if (u.pathname === '/watch') {
            const v = u.searchParams.get('v') || '';
            return VIDEO_ID.test(v) ? v : null;
        }
        const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})(?:\/|$)/);
        return m ? m[1] : null;
    }

    // ---------- cancel token (no AbortController: old CEP Chromium builds lack it) ----------
    function makeBudget(ms) {
        const cbs = [];
        const b = {
            aborted: false,
            onAbort: fn => { if (b.aborted) fn(); else cbs.push(fn); },
            abort: () => { if (b.aborted) return; b.aborted = true; cbs.splice(0).forEach(fn => { try { fn(); } catch (e) {} }); }
        };
        b._timer = setTimeout(b.abort, ms);
        b.done = () => { clearTimeout(b._timer); b.abort(); };
        return b;
    }

    // ---------- HTTP (Node https, so CORS never applies) ----------
    // Resolves { status, json }; status 0 = no HTTP status (network error / timeout / cancelled). Never rejects.
    function postJson(url, body, visitor, budget, userAgent, timeoutMs) {
        return new Promise(resolve => {
            let settled = false;
            const finish = r => { if (!settled) { settled = true; resolve(r); } };
            if (budget && budget.aborted) return finish({ status: 0, json: null });
            let req;
            try {
                // JSON.stringify, never a template string: stray newlines get "400 Precondition check failed".
                const data = JSON.stringify(body);
                const u = new URL(url);
                const headers = {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data),
                    'User-Agent': userAgent || USER_AGENT
                };
                if (visitor) headers['X-Goog-Visitor-Id'] = visitor;
                req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'POST', headers: headers }, res => {
                    let text = '';
                    res.setEncoding('utf8');
                    res.on('data', c => { text += c; });
                    res.on('end', () => {
                        if (res.statusCode < 200 || res.statusCode >= 300) return finish({ status: res.statusCode, json: null });
                        try { finish({ status: res.statusCode, json: text.trim() ? JSON.parse(text) : null }); }
                        catch (e) { finish({ status: res.statusCode, json: null }); }
                    });
                    res.on('error', () => finish({ status: 0, json: null }));
                });
                const timer = setTimeout(() => { try { req.destroy(); } catch (e) {} finish({ status: 0, json: null }); }, timeoutMs || REQUEST_TIMEOUT_MS);
                req.on('close', () => clearTimeout(timer));
                req.on('error', () => finish({ status: 0, json: null }));
                if (budget) budget.onAbort(() => { try { req.destroy(); } catch (e) {} finish({ status: 0, json: null }); });
                req.write(data);
                req.end();
            } catch (e) { finish({ status: 0, json: null }); }
        });
    }

    function clientContext(visitor) {
        const client = {
            clientName: CLIENT_NAME, clientVersion: CLIENT_VERSION, deviceMake: DEVICE_MAKE, deviceModel: DEVICE_MODEL,
            osName: OS_NAME, osVersion: OS_VERSION, hl: 'en', gl: 'US'
        };
        if (visitor) client.visitorData = visitor;
        return { client: client };
    }

    // ---------- visitor token (memory + localStorage, so the first paste after launch skips the mint) ----------
    let cachedVisitor = null, visitorInflight = null;
    const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const lsSet = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) {} };

    async function mintVisitor() {
        // Own budget: concurrent callers share this promise, and one caller's spent budget must not fail the others.
        const res = await postJson(VISITOR_ENDPOINT, { context: clientContext(null) }, null, null);
        const token = res.json && res.json.responseContext && res.json.responseContext.visitorData;
        if (typeof token !== 'string' || !token) return null;
        cachedVisitor = token;
        lsSet(VISITOR_KEY, token);
        return token;
    }

    // `minted` is true when this call had to ask YouTube, so a retry cannot help.
    async function getVisitor() {
        if (cachedVisitor) return { token: cachedVisitor, minted: false };
        const stored = lsGet(VISITOR_KEY);
        if (stored) { cachedVisitor = stored; return { token: stored, minted: false }; }
        // A pasted batch shares one request instead of each minting its own token.
        if (!visitorInflight) visitorInflight = mintVisitor().then(t => { visitorInflight = null; return t; }, () => { visitorInflight = null; return null; });
        return { token: await visitorInflight, minted: true };
    }
    function dropVisitor() { cachedVisitor = null; lsSet(VISITOR_KEY, null); }

    // ---------- player response -> yt-dlp-shaped payload ----------
    const AUDIO_CODEC = /^(mp4a|opus|vorbis|ac-3|ec-3|flac)/i;
    const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };

    // `en.4`, `hi_3` -> `en`, `hi`; case kept (yt-dlp reports `en-US`, and a selector filter is case-sensitive).
    function audioTrackLanguage(track) {
        const head = String(track.id || '').split('.')[0].split('_')[0];
        if (/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/i.test(head)) return head;
        return String(track.displayName || '').trim() || 'und';
    }

    function parseFormat(node, duration) {
        const itag = node.itag;
        const mimeType = typeof node.mimeType === 'string' ? node.mimeType : '';
        if (itag === undefined || !mimeType) return null;
        // Plain URLs only: a ciphered format needs the JS solver, and DRM streams are not downloadable.
        if (typeof node.url !== 'string' || !node.url) return null;
        if (node.drmFamilies || node.drmTrackType) return null;

        const kind = mimeType.split('/')[0];
        const subtype = (mimeType.split('/')[1] || '').split(';')[0].toLowerCase();
        let ext;
        if (subtype.indexOf('mp4') >= 0) ext = kind === 'audio' ? 'm4a' : 'mp4';
        else if (subtype.indexOf('webm') >= 0) ext = 'webm';
        else return null;

        const cm = mimeType.match(/codecs="([^"]*)"/);
        const codecs = (cm ? cm[1] : '').split(',').map(c => c.trim()).filter(Boolean);
        const vcodec = kind === 'video' ? (codecs.filter(c => !AUDIO_CODEC.test(c))[0] || 'unknown') : 'none';
        const acodec = kind === 'audio' ? (codecs[0] || 'unknown') : (codecs.filter(c => AUDIO_CODEC.test(c))[0] || 'none');

        const width = num(node.width), height = num(node.height);
        const bitrate = num(node.averageBitrate) || num(node.bitrate);
        const contentLength = num(node.contentLength);
        const audioQuality = String(node.audioQuality || '').replace('AUDIO_QUALITY_', '').toLowerCase();

        const f = {
            format_id: String(itag), ext: ext, url: node.url, protocol: 'https', vcodec: vcodec, acodec: acodec,
            video_ext: vcodec !== 'none' ? ext : 'none',
            width: width || undefined, height: height || undefined, fps: num(node.fps) || undefined,
            tbr: bitrate ? bitrate / 1000 : undefined,
            format_note: String(node.qualityLabel || '') || audioQuality || undefined,
            resolution: height ? width + 'x' + height : 'audio only'
        };
        if (contentLength) f.filesize = contentLength;
        else if (bitrate && duration) f.filesize_approx = Math.round(bitrate * duration / 8);

        if (node.audioTrack && typeof node.audioTrack === 'object') {
            f.language = audioTrackLanguage(node.audioTrack);
            f.language_preference = node.audioTrack.audioIsDefault ? 10 : -1;     // >= 0 marks the original track
            if (node.isDrc) f.vibe_drc = true;
            if (/DESCRIPTIVE/i.test(String(node.audioTrack.audioTrackType || ''))) f.vibe_descriptive = true;
        }
        return f;
    }

    // Captions in yt-dlp's layout, one `vtt` entry per language. Every translatable track can be machine translated
    // into ~150 languages; they are expanded here too so the picker offers the same choices as the yt-dlp path.
    // The files themselves are written by yt-dlp at download time, so `url` is informational.
    function parseCaptions(root) {
        const subtitles = {}, automatic = {};
        const r = root && root.captions && root.captions.playerCaptionsTracklistRenderer;
        const tracks = r && Array.isArray(r.captionTracks) ? r.captionTracks : [];
        const translations = r && Array.isArray(r.translationLanguages) ? r.translationLanguages : [];
        let translatableBase = null;
        tracks.forEach(t => {
            const lang = typeof t.languageCode === 'string' ? t.languageCode : '';
            const baseUrl = typeof t.baseUrl === 'string' ? t.baseUrl : '';
            if (!lang) return;
            const entry = [{ ext: 'vtt', url: baseUrl ? baseUrl + '&fmt=vtt' : '' }];
            const target = t.kind === 'asr' ? automatic : subtitles;
            if (!target[lang]) target[lang] = entry;
            if (t.isTranslatable && baseUrl && (!translatableBase || t.kind === 'asr')) translatableBase = baseUrl;
        });
        if (translatableBase) {
            translations.forEach(t => {
                const lang = typeof t.languageCode === 'string' ? t.languageCode : '';
                if (lang && !automatic[lang]) automatic[lang] = [{ ext: 'vtt', url: translatableBase + '&fmt=vtt&tlang=' + lang }];
            });
        }
        return { subtitles: subtitles, automatic_captions: automatic };
    }

    const SELECTOR_LANGUAGE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

    // Dubbed videos publish one audio stream per language under the SAME itag (140 for each), while yt-dlp numbers
    // them 140-0, 140-20... in an order not derivable here. So a track carries a yt-dlp format *selector* that filters
    // on the language itself, e.g. `ba[language=de-DE][acodec^=mp4a]`. Returns { formats } or { decline }.
    function resolveDubbedFormats(all) {
        const rest = [], seen = {}, best = {}, order = [];
        const rank = f => /^mp4a/i.test(String(f.acodec)) ? 0 : /opus/i.test(String(f.acodec)) ? 1 : 2;
        for (let i = 0; i < all.length; i++) {
            const f = all[i];
            const isTrack = f.vcodec === 'none' && typeof f.language === 'string' && f.language;
            if (!isTrack) { if (!seen[f.format_id]) { seen[f.format_id] = 1; rest.push(f); } continue; }
            if (f.vibe_descriptive) return { decline: 'descriptive audio track' };   // yt-dlp files it under `en-desc`
            if (f.vibe_drc) continue;                                                  // volume-normalised twin
            if (!SELECTOR_LANGUAGE.test(f.language)) return { decline: 'unusable audio language "' + f.language + '"' };
            const cur = best[f.language];
            if (!cur) order.push(f.language);
            if (!cur || rank(f) < rank(cur) || (rank(f) === rank(cur) && num(f.tbr) > num(cur.tbr))) best[f.language] = f;
        }
        if (order.length < 2) return { decline: 'fewer than two usable audio languages' };
        order.forEach(lang => {
            const f = best[lang];
            const aac = /^mp4a/i.test(String(f.acodec));
            rest.push(Object.assign({}, f, { format_id: f.format_id + '-' + f.language, vibe_selector: 'ba[language=' + f.language + ']' + (aac ? '[acodec^=mp4a]' : '') }));
        });
        return { formats: rest };
    }

    // Same judgement the yt-dlp path applies: a thin list (nothing above 360p, or video without audio) is not trusted.
    function inspectFormats(raw) {
        const formats = Array.isArray(raw && raw.formats) ? raw.formats : [];
        const video = formats.filter(f => f.vcodec && f.vcodec !== 'none' && num(f.height) > 0);
        const audio = formats.filter(f => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'));
        const heights = video.map(f => num(f.height)).filter((h, i, a) => a.indexOf(h) === i).sort((a, b) => b - a);
        return { formatCount: formats.length, videoFormatCount: video.length, audioFormatCount: audio.length, maxHeight: heights[0] || 0, heights: heights };
    }
    function isDegraded(i) {
        if (i.formatCount === 0) return true;
        if (i.videoFormatCount > 0 && i.maxHeight <= 360 && i.videoFormatCount <= 3) return true;
        if (i.videoFormatCount > 0 && i.audioFormatCount === 0) return true;
        return false;
    }
    const summary = i => !i.formatCount ? 'no formats returned' :
        i.formatCount + ' formats, max ' + (i.maxHeight || '?') + 'p (' + (i.heights.join('/') || 'audio only') + '), ' + i.audioFormatCount + ' audio';

    function buildRaw(root, videoId) {
        const status = root && root.playabilityStatus && root.playabilityStatus.status;
        if (status && status !== 'OK') return { decline: 'playability ' + status };
        const d = (root && root.videoDetails) || {};
        if (d.isLive || d.isUpcoming) return { decline: 'live or upcoming' };
        const streaming = root && root.streamingData;
        if (!streaming) return { decline: 'no streamingData' };

        const duration = num(d.lengthSeconds);
        const seen = {}, parsedAll = [], langs = {};
        let formats = [], langCount = 0;
        ['formats', 'adaptiveFormats'].forEach(key => {
            const list = streaming[key];
            if (!Array.isArray(list)) return;
            list.forEach(node => {
                if (!node || typeof node !== 'object') return;
                const f = parseFormat(node, duration);
                if (!f) return;
                // Recorded BEFORE id de-duplication: every language of a dubbed video shares one itag.
                parsedAll.push(f);
                if (f.language && f.vcodec === 'none' && !langs[f.language]) { langs[f.language] = 1; langCount++; }
                if (seen[f.format_id]) return;
                seen[f.format_id] = 1;
                formats.push(f);
            });
        });
        if (!formats.length) return { decline: 'no usable formats' };
        if (langCount > 1) {
            const dubbed = resolveDubbedFormats(parsedAll);
            if (dubbed.decline) return { decline: dubbed.decline };
            formats = dubbed.formats;
        }

        const micro = (root.microformat && root.microformat.playerMicroformatRenderer) || {};
        const thumbs = ((d.thumbnail && Array.isArray(d.thumbnail.thumbnails)) ? d.thumbnail.thumbnails : []).filter(t => t && typeof t.url === 'string' && t.url);
        if (!thumbs.length) thumbs.push({ url: 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg', width: 480, height: 360 });
        const bestThumb = thumbs.slice().sort((a, b) => num(b.width) * num(b.height) - num(a.width) * num(a.height))[0];

        const publish = typeof micro.publishDate === 'string' ? micro.publishDate.slice(0, 10).replace(/-/g, '') : '';
        const id = typeof d.videoId === 'string' && d.videoId ? d.videoId : videoId;
        const author = typeof d.author === 'string' ? d.author : '';
        const channelId = typeof d.channelId === 'string' ? d.channelId : '';
        const cap = parseCaptions(root);

        const raw = {
            _type: 'video', id: id, title: d.title || 'Untitled', fulltitle: d.title || 'Untitled',
            description: typeof d.shortDescription === 'string' ? d.shortDescription : '',
            thumbnail: bestThumb.url, thumbnails: thumbs, uploader: author, channel: author,
            uploader_url: typeof micro.ownerProfileUrl === 'string' ? micro.ownerProfileUrl : undefined,
            channel_url: channelId ? 'https://www.youtube.com/channel/' + channelId : undefined,
            view_count: num(d.viewCount), like_count: num(micro.likeCount), duration: duration,
            // yt-dlp's duration_string, which the panel shows on the hero image
            duration_string: fmtDuration(duration),
            upload_date: publish || undefined,
            categories: typeof micro.category === 'string' && micro.category ? [micro.category] : [],
            is_live: false, webpage_url: 'https://www.youtube.com/watch?v=' + id, extractor: 'youtube', extractor_key: 'Youtube',
            formats: formats, subtitles: cap.subtitles, automatic_captions: cap.automatic_captions
        };

        const insp = inspectFormats(raw);
        if (isDegraded(insp)) return { decline: 'thin format list (' + summary(insp) + ')' };
        return { raw: raw };
    }

    function fmtDuration(s) {
        s = Math.round(s || 0);
        if (!s) return '';
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
        const pad = n => (n < 10 ? '0' : '') + n;
        return h ? h + ':' + pad(m) + ':' + pad(x) : m + ':' + pad(x);
    }

    // ---------- public entry ----------
    async function requestPlayer(videoId, visitor, budget) {
        const res = await postJson(PLAYER_ENDPOINT,
            { context: clientContext(visitor), videoId: videoId, contentCheckOk: true, racyCheckOk: true }, visitor, budget);
        if (!res.json) {
            // A rejected request may mean a stale token; a network error / timeout may not (retrying would burn the budget).
            return { ok: false, retry: res.status >= 400, reason: 'HTTP ' + (res.status || 'error') };
        }
        const st = res.json.playabilityStatus && res.json.playabilityStatus.status;
        // LOGIN_REQUIRED is what a stale/missing token looks like; UNPLAYABLE/ERROR are the video's own state.
        if (st && st !== 'OK') return { ok: false, retry: st === 'LOGIN_REQUIRED', reason: 'playability ' + st };
        return { ok: true, root: res.json };
    }

    // `microformat` from a WEB request, or null. HTTP/playability status ignored on purpose: it answers UNPLAYABLE to an
    // anonymous caller and still carries the microformat.
    function fetchMicroformat(videoId, visitor, budget) {
        const body = {
            context: { client: { clientName: 'WEB', clientVersion: WEB_CLIENT_VERSION, hl: 'en', gl: 'US', visitorData: visitor } },
            videoId: videoId, contentCheckOk: true, racyCheckOk: true
        };
        return postJson(PLAYER_ENDPOINT, body, visitor, budget, WEB_USER_AGENT, MICROFORMAT_TIMEOUT_MS)
            .then(r => (r.json && r.json.microformat && typeof r.json.microformat === 'object') ? r.json.microformat : null);
    }

    function settleWithin(promise, ms) {
        return new Promise(resolve => {
            const timer = setTimeout(() => resolve(null), ms);
            promise.then(v => { clearTimeout(timer); resolve(v); }, () => { clearTimeout(timer); resolve(null); });
        });
    }

    // A yt-dlp-shaped payload for `videoId`, or null when yt-dlp should answer. Never throws.
    async function resolve(videoId, budgetMs) {
        const started = Date.now();
        const budget = makeBudget(budgetMs || FAST_PATH_BUDGET_MS);
        const t = () => (Date.now() - started) + 'ms';
        try {
            let v = await getVisitor();
            let token = v.token;
            if (!token) { return null; }

            // Asked alongside the player request, so it adds no wall-clock time.
            let micro = fetchMicroformat(videoId, token, budget);
            let outcome = await requestPlayer(videoId, token, budget);

            // One retry, only when the token came from the cache (a token minted a moment ago is not the problem).
            if (!outcome.ok && outcome.retry && !v.minted && !budget.aborted) {
                dropVisitor();
                v = await getVisitor();
                token = v.token;
                if (token) { micro = fetchMicroformat(videoId, token, budget); outcome = await requestPlayer(videoId, token, budget); }
            }
            if (!outcome.ok) { return null; }

            // Streams are ready; the category gets a moment more, never a slower answer.
            const mf = await settleWithin(micro, MICROFORMAT_GRACE_MS);
            if (mf && !outcome.root.microformat) outcome.root.microformat = mf;

            const built = buildRaw(outcome.root, videoId);
            if (built.decline) { return null; }
            return built.raw;
        } catch (e) {
            console.warn('[InnerTube] failed (' + (e && e.message) + ') after ' + t());
            return null;
        } finally {
            budget.done();     // also cancels a microformat request still in flight
        }
    }

    window.VInnerTube = {
        resolve: resolve, parseVideoId: parseVideoId, buildRaw: buildRaw,
        reset: () => { cachedVisitor = null; visitorInflight = null; }
    };
})();

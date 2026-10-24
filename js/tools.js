// Tools: yt-dlp wrapper. Installs yt-dlp (always), QuickJS (YouTube only) and FFmpeg (only when a merge/convert needs it).
(function () {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const https = require('https');
    const { spawn, execFile } = require('child_process');

    const WIN = process.platform === 'win32';
    const BASE = WIN ? process.env.APPDATA : path.join(os.homedir(), 'Library', 'Application Support');
    const BIN_DIR = path.join(BASE, 'VibePlugin', 'bin');
    const exe = n => path.join(BIN_DIR, WIN ? n + '.exe' : n);
    const YTDLP = exe('yt-dlp'), QJS = exe('qjs'), FFMPEG = exe('ffmpeg');

    const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/' + (WIN ? 'yt-dlp.exe' : 'yt-dlp_macos');
    // QuickJS (2 MB) solves YouTube's JS challenge just like Deno (94 MB) did.
    const QJS_URL = 'https://github.com/quickjs-ng/quickjs/releases/latest/download/' +
        (WIN ? 'qjs-windows-x86_64.exe' : (process.arch === 'arm64' ? 'qjs-darwin-arm64' : 'qjs-darwin-x86_64'));
    const FFMPEG_URL = 'https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip';

    // ---------- helpers ----------
    function fetchFile(url, dest, onProgress, hops) {
        hops = hops || 0;
        return new Promise((resolve, reject) => {
            if (hops > 8) return reject(new Error('Too many redirects'));
            https.get(url, { headers: { 'User-Agent': 'VibePlugin' } }, res => {
                if ([301, 302, 303, 307, 308].indexOf(res.statusCode) >= 0) {
                    res.resume();
                    return fetchFile(new URL(res.headers.location, url).href, dest, onProgress, hops + 1).then(resolve, reject);
                }
                if (res.statusCode !== 200) { res.resume(); return reject(new Error('Download failed: HTTP ' + res.statusCode)); }
                const total = +res.headers['content-length'] || 0;
                let got = 0;
                // Write to a .part file and rename at the end, so an interrupted download never leaves a broken binary behind.
                const part = dest + '.part';
                const f = fs.createWriteStream(part);
                const fail = e => { try { f.destroy(); fs.unlinkSync(part); } catch (x) {} reject(e); };
                res.on('data', c => { got += c.length; if (onProgress && total) onProgress(got / total); });
                res.on('error', fail);
                res.on('aborted', () => fail(new Error('Connection lost while downloading')));
                res.pipe(f);
                f.on('finish', () => f.close(() => {
                    if (total && got < total) return fail(new Error('Download was cut short, please try again'));
                    try { fs.renameSync(part, dest); resolve(); } catch (e) { fail(e); }
                }));
                f.on('error', fail);
            }).on('error', reject);
        });
    }

    function run(cmd, args) {
        return new Promise((resolve, reject) => {
            execFile(cmd, args, { windowsHide: true, maxBuffer: 1 << 26 }, (err, so, se) => err ? reject(new Error(se || err.message)) : resolve(so));
        });
    }

    function findFile(dir, name) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { const r = findFile(p, name); if (r) return r; }
            else if (e.name.toLowerCase() === name) return p;
        }
        return null;
    }

    function rmrf(p) {
        try {
            const st = fs.lstatSync(p);
            if (st.isDirectory()) { fs.readdirSync(p).forEach(n => rmrf(path.join(p, n))); fs.rmdirSync(p); }
            else fs.unlinkSync(p);
        } catch (e) {}
    }

    async function unzip(zip, dest) {
        const q = s => String(s).replace(/'/g, "''");
        if (WIN) await run('powershell', ['-NoProfile', '-Command', "Expand-Archive -Force -LiteralPath '" + q(zip) + "' -DestinationPath '" + q(dest) + "'"]);
        else await run('unzip', ['-o', zip, '-d', dest]);
    }

    async function installZip(url, names, label, status) {
        const zip = path.join(os.tmpdir(), 'vibe-' + label + '.zip');
        const tmp = path.join(os.tmpdir(), 'vibe-' + label);
        rmrf(tmp);
        try {
            status('Setting up ' + label + '… 0%');
            await fetchFile(url, zip, p => status('Setting up ' + label + '… ' + Math.round(p * 100) + '%'));
            status('Unpacking ' + label + '…');
            await unzip(zip, tmp);
            names.forEach(n => {
                const src = findFile(tmp, (WIN ? n + '.exe' : n).toLowerCase());
                if (src) { fs.copyFileSync(src, exe(n)); if (!WIN) fs.chmodSync(exe(n), 0o755); }
            });
        } finally {
            try { fs.unlinkSync(zip); } catch (e) {}
            rmrf(tmp);
        }
    }

    // needs: {youtube:boolean, ffmpeg:boolean}
    async function prepare(needs, status) {
        fs.mkdirSync(BIN_DIR, { recursive: true });
        // Slim-down migration: older versions also installed Deno (94 MB) and ffprobe (161 MB) and left unzipped copies in Temp.
        ['deno', 'ffprobe'].forEach(n => rmrf(exe(n)));
        ['vibe-ffmpeg', 'vibe-deno'].forEach(n => rmrf(path.join(os.tmpdir(), n)));
        if (updatePromise) { status('Updating yt-dlp…'); await updatePromise; }
        // A truncated yt-dlp from an older interrupted install: remove it so it gets downloaded again.
        try { if (fs.existsSync(YTDLP) && fs.statSync(YTDLP).size < 1e6) fs.unlinkSync(YTDLP); } catch (e) {}
        if (!fs.existsSync(YTDLP)) {
            status('Setting up yt-dlp… 0%');
            await fetchFile(YTDLP_URL, YTDLP, p => status('Setting up yt-dlp… ' + Math.round(p * 100) + '%'));
            if (!WIN) fs.chmodSync(YTDLP, 0o755);
        }
        if (needs.youtube && !fs.existsSync(QJS)) {
            status('Setting up JS engine… 0%');
            await fetchFile(QJS_URL, QJS, p => status('Setting up JS engine… ' + Math.round(p * 100) + '%'));
            if (!WIN) fs.chmodSync(QJS, 0o755);
        }
        if (needs.ffmpeg && !fs.existsSync(FFMPEG)) {
            if (!WIN) throw new Error('FFmpeg is needed for this format. Install it with: brew install ffmpeg');
            await installZip(FFMPEG_URL, ['ffmpeg'], 'ffmpeg', status);
        }
        status('Ready');
    }

    // YouTube changes often and old yt-dlp builds break. Quietly self-update at most once a day (called once at panel start).
    // prepare() waits for a running update, so a download never starts while the exe is being replaced.
    let updatePromise = null;
    function autoUpdate() {
        if (updatePromise || !fs.existsSync(YTDLP)) return;
        let last = 0;
        try { last = +localStorage.getItem('vp_lastUpdate') || 0; } catch (e) {}
        if (Date.now() - last < 24 * 3600 * 1000) return;
        updatePromise = run(YTDLP, ['-U'])
            .then(() => { try { localStorage.setItem('vp_lastUpdate', String(Date.now())); } catch (e) {} }, () => {})
            .then(() => { updatePromise = null; });
    }

    function commonArgs(o) {
        const a = ['--no-playlist', '--no-warnings', '--socket-timeout', '30'];
        if (fs.existsSync(QJS)) a.push('--no-js-runtimes', '--js-runtimes', 'quickjs:' + QJS);
        if (o && o.cookies) a.push('--cookies-from-browser', o.cookies);
        return a;
    }

    function updateYtDlp() { return run(YTDLP, ['-U']); }

    // ---------- format parsing (same source as the desktop app: --dump-single-json) ----------
    function codecName(v) {
        v = (v || '').toLowerCase();
        if (/^(avc|h264)/.test(v)) return 'H.264';
        if (/^(vp9|vp09)/.test(v)) return 'VP9';
        if (/^(av01|av1)/.test(v)) return 'AV1';
        if (/^(hev|hvc|h265)/.test(v)) return 'HEVC';
        return (v.split('.')[0] || '').toUpperCase();
    }
    const RANK = { 'H.264': 4, 'HEVC': 3, 'VP9': 2, 'AV1': 1 };

    function normalize(j, url) {
        const dur = j.duration || 0;
        const all = j.formats || [];
        const hasV = f => f.vcodec && f.vcodec !== 'none';
        const hasA = f => f.acodec && f.acodec !== 'none';
        const size = f => f.filesize || f.filesize_approx || ((f.tbr && dur) ? f.tbr * 125 * dur : 0);

        // Prefer AAC (m4a) so merged files are MP4-safe, then highest bitrate.
        const cmpKey = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) return b[i] - a[i]; } return 0; };
        const audioKey = f => [
            /original|\(default\)/i.test(f.format_note || '') ? 1 : 0,
            f.language_preference || 0,
            /^mp4a/.test(f.acodec) ? 1 : 0,
            /^https?/.test(f.protocol || '') ? 1 : 0,
            f.abr || f.tbr || 0
        ];
        const audios = all.filter(f => !hasV(f) && hasA(f) && !/drc/i.test(f.format_id) && !/drc/i.test(f.format_note || ''))
            .sort((a, b) => cmpKey(audioKey(a), audioKey(b)));
        const bestAudio = audios[0];

        // One row per resolution(+60fps); inside a row prefer H.264 > HEVC > VP9 > AV1, then bitrate.
        const groups = {};
        all.filter(f => hasV(f) && f.height).forEach(f => {
            const hi = (f.fps || 0) > 30;
            const k = f.height + '_' + (hi ? 60 : 30);
            const c = codecName(f.vcodec);
            const cur = groups[k];
            const key = [RANK[c] || 0, /^https?/.test(f.protocol || '') ? 1 : 0, f.tbr || 0];
            if (!cur || cmpKey(cur.key, key) > 0) groups[k] = { f: f, c: c, key: key };
        });

        const videos = Object.keys(groups).map(k => {
            const f = groups[k].f, c = groups[k].c;
            const merge = !hasA(f);
            return {
                // vibe_selector: the fast path's id for a dubbed track is synthetic (140-en-US), so yt-dlp gets a language selector instead
                kind: 'video', formatId: f.format_id, audioId: merge && bestAudio ? (bestAudio.vibe_selector || bestAudio.format_id) : null,
                merge: merge, height: f.height, fps: Math.round(f.fps || 0), codec: c, ext: f.ext,
                size: size(f) + (merge && bestAudio ? size(bestAudio) : 0),
                tag: f.height + 'p' + ((f.fps || 0) > 30 ? Math.round(f.fps) : '')
            };
        }).sort((a, b) => (b.height - a.height) || (b.fps - a.fps));

        return {
            url: j.webpage_url || url,
            title: j.title || url,
            thumb: j.thumbnail || '',
            duration: j.duration_string || '',
            durationSec: j.duration || 0,
            live: !!j.is_live,
            channel: j.uploader || j.channel || '',
            site: j.extractor_key || '',
            videos: videos,
            audioSize: bestAudio ? size(bestAudio) : 0,
            // Subtitle languages and (for dubbed videos only) audio languages; empty lists hide the pickers.
            subtitles: window.VTracks ? window.VTracks.buildSubtitleList(j) : [],
            audioTracks: window.VTracks ? window.VTracks.buildAudioTrackList(j) : []
        };
    }

    function getInfo(url, opts) {
        return new Promise((resolve, reject) => {
            const args = commonArgs(opts).concat(['--dump-single-json', url]);
            const child = spawn(YTDLP, args, { windowsHide: true, env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' }) });
            let out = '', err = '';
            const timer = setTimeout(() => { child.kill(); reject(new Error('Timed out fetching video info')); }, 90000);
            child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
            child.stdout.on('data', d => out += d);
            child.stderr.on('data', d => err = (err + d).slice(-1200));
            child.on('error', e => { clearTimeout(timer); reject(e); });
            child.on('close', code => {
                clearTimeout(timer);
                if (code !== 0) {
                    const m = err.split(/\r?\n/).filter(Boolean).pop() || 'yt-dlp exited with code ' + code;
                    return reject(new Error(m.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?/, '')));
                }
                try { resolve(normalize(JSON.parse(out), url)); }
                catch (e) { reject(new Error('Could not read video info')); }
            });
        });
    }

    // InnerTube fast path (see innertube.js): single YouTube videos only. Returns the same info object as getInfo(), or
    // null when yt-dlp should answer (playlists, live, login walls, thin format list, network trouble). Never throws and
    // needs no yt-dlp, so the caller can run it BEFORE prepare(). Turn off with localStorage vp_innertube = '0'.
    async function getInfoFast(url) {
        try {
            if (!window.VInnerTube || localStorage.getItem('vp_innertube') === '0') return null;
            // a playlist / radio-mix link is the yt-dlp path's job (--no-playlist still wants its own handling)
            if (/[?&]list=RD|start_radio=1|\/playlist/i.test(url)) return null;
            const id = window.VInnerTube.parseVideoId(url);
            if (!id) return null;
            const raw = await window.VInnerTube.resolve(id);
            return raw ? normalize(raw, url) : null;
        } catch (e) {
            console.warn('[InnerTube] fast path failed, falling back:', e && e.message);
            return null;
        }
    }

    // ---------- playlists & channels (flat listing: fast, no per-video format lookup) ----------
    function isPlaylistUrl(u) {
        if (!/youtube\.com/i.test(u)) return false;
        if (/youtube\.com\/playlist\?/i.test(u)) return true;
        // channel pages: @handle, /channel/, /c/, /user/ (optionally on the videos/shorts/streams tab)
        return /youtube\.com\/(@[^/?#]+|channel\/[^/?#]+|c\/[^/?#]+|user\/[^/?#]+)(\/(videos|shorts|streams))?\/?([?#]|$)/i.test(u);
    }
    function getPlaylist(url, opts) {
        return new Promise((resolve, reject) => {
            let u = url;
            // A bare channel link lists tabs; point it at the Videos tab so we get actual videos.
            if (/youtube\.com\/(@[^/?#]+|channel\/[^/?#]+|c\/[^/?#]+|user\/[^/?#]+)\/?$/i.test(u)) u = u.replace(/\/?$/, '/videos');
            const limit = (opts && opts.limit) || 150;
            const args = commonArgs(opts).concat(['--yes-playlist', '--flat-playlist', '--playlist-end', String(limit), '--dump-single-json', u]);
            const child = spawn(YTDLP, args, { windowsHide: true, env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' }) });
            let out = '', err = '';
            const timer = setTimeout(() => { child.kill(); reject(new Error('Timed out reading the playlist')); }, 120000);
            child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
            child.stdout.on('data', d => out += d);
            child.stderr.on('data', d => err = (err + d).slice(-1200));
            child.on('error', e => { clearTimeout(timer); reject(e); });
            child.on('close', code => {
                clearTimeout(timer);
                if (code !== 0) {
                    const m = err.split(/\r?\n/).filter(Boolean).pop() || 'yt-dlp exited with code ' + code;
                    return reject(new Error(m.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?/, '')));
                }
                try {
                    const j = JSON.parse(out);
                    const yt = /youtube\.com|youtu\.be/i.test(u);
                    const entries = (j.entries || []).filter(e => e && (e.id || e.url)).map(e => {
                        const id = e.id || '';
                        const vurl = e.url && /^https?:/.test(e.url) ? e.url : (yt && id ? 'https://www.youtube.com/watch?v=' + id : e.url || '');
                        const th = e.thumbnails && e.thumbnails.length ? e.thumbnails[e.thumbnails.length - 1].url : (yt && id ? 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg' : '');
                        return { id: id, title: e.title || 'Untitled', url: vurl, thumb: th, duration: e.duration || 0, channel: e.channel || e.uploader || '' };
                    }).filter(e => e.url);
                    resolve({ title: j.title || 'Playlist', channel: j.channel || j.uploader || '', count: j.playlist_count || entries.length, entries: entries, capped: (j.playlist_count || 0) > entries.length });
                } catch (e) { reject(new Error('Could not read the playlist')); }
            });
        });
    }

    window.VT = { prepare: prepare, getInfo: getInfo, getPlaylist: getPlaylist, isPlaylistUrl: isPlaylistUrl, getInfoFast: getInfoFast, updateYtDlp: updateYtDlp, autoUpdate: autoUpdate, BIN_DIR: BIN_DIR, _int: { YTDLP: YTDLP, BIN_DIR: BIN_DIR, commonArgs: commonArgs } };
})();

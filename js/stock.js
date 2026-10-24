// Stock: free photos and videos from Pexels, Pixabay and Unsplash.
// Bring-your-own-key: every user adds their own free API key, so each person gets their own request limit and
// nothing secret ships in this open-source repo. Keys are stored on this PC only (the panel's local storage).
(function () {
    const https = require('https');
    const http = require('http');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const { URL } = require('url');

    let A = null;   // helpers handed over by main.js (see VStock.init)

    // ---------- small helpers ----------
    const qs = o => Object.keys(o).filter(k => o[k] !== undefined && o[k] !== '' && o[k] !== null)
        .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(o[k])).join('&');
    const sideLabel = (w, h) => {
        const s = Math.min(w || 0, h || 0);
        return s >= 4320 ? '8K' : s >= 2160 ? '4K' : s >= 1440 ? '2K' : s ? s + 'p' : '';
    };
    const fileExt = (url, d) => { const m = /\.(jpe?g|png|webp|gif|svg|mp4|webm|mov)(?=$|\?)/i.exec(url || ''); return m ? m[1].toLowerCase() : d; };
    const fmtDur = s => { s = Math.round(s || 0); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); };
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
    const safe = s => String(s || '').replace(/[<>:"\/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim();
    const slug = s => safe(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    const joinQ = (u, extra) => u + (u.indexOf('?') < 0 ? '?' : '&') + extra;
    function copyText(t) {
        try {
            const ta = document.createElement('textarea');
            ta.value = t; ta.style.cssText = 'position:fixed;opacity:0;left:-999px';
            document.body.appendChild(ta); ta.select();
            const ok = document.execCommand('copy'); ta.remove(); return ok;
        } catch (e) { return false; }
    }

    // ---------- network ----------
    function netErr(kind, message) { const e = new Error(message); e.kind = kind; return e; }

    function getJson(urlStr, headers) {
        return new Promise((resolve, reject) => {
            let u; try { u = new URL(urlStr); } catch (e) { return reject(netErr('http', 'Bad address.')); }
            const req = https.get({
                hostname: u.hostname, path: u.pathname + u.search, timeout: 15000,
                headers: Object.assign({ 'User-Agent': 'VibePlugin', 'Accept': 'application/json' }, headers || {})
            }, res => {
                let d = ''; res.setEncoding('utf8');
                res.on('data', c => d += c);
                res.on('end', () => {
                    const s = res.statusCode;
                    if (s === 401 || s === 403 || (s === 400 && /key/i.test(d))) return reject(netErr('auth', 'That key was rejected. Check it under Keys.'));
                    if (s === 429) return reject(netErr('rate', 'Request limit reached for this key. Try again in a little while.'));
                    if (s !== 200) return reject(netErr('http', 'The service answered ' + s + '.'));
                    try { resolve({ json: JSON.parse(d), headers: res.headers }); }
                    catch (e) { reject(netErr('http', 'Unexpected answer from the service.')); }
                });
            });
            req.on('timeout', () => { req.destroy(); reject(netErr('net', 'The service took too long to answer.')); });
            req.on('error', e => reject(netErr('net', 'No connection (' + (e.code || e.message) + ').')));
        });
    }

    // Streams a file to disk. tok.abort is set so the card's cancel button can stop it.
    function fetchTo(url, dest, onProg, tok, hops) {
        hops = hops || 0;
        return new Promise((resolve, reject) => {
            if (tok.cancelled) return reject(new Error('Cancelled'));
            if (hops > 6) return reject(new Error('Too many redirects'));
            let u; try { u = new URL(url); } catch (e) { return reject(new Error('Bad download address')); }
            const lib = u.protocol === 'http:' ? http : https;
            const part = dest + '.part';
            const req = lib.get({ hostname: u.hostname, port: u.port || undefined, path: u.pathname + u.search, headers: { 'User-Agent': 'VibePlugin' }, timeout: 30000 }, res => {
                if ([301, 302, 303, 307, 308].indexOf(res.statusCode) >= 0 && res.headers.location) {
                    res.resume();
                    return fetchTo(new URL(res.headers.location, url).href, dest, onProg, tok, hops + 1).then(resolve, reject);
                }
                if (res.statusCode !== 200) { res.resume(); return reject(new Error('The server answered ' + res.statusCode + '.')); }
                const total = +res.headers['content-length'] || 0;
                let got = 0, last = 0, lastT = Date.now(), lastB = 0, speed = 0;
                const out = fs.createWriteStream(part);
                tok.abort = () => { req.destroy(); out.destroy(); try { fs.unlinkSync(part); } catch (e) {} };
                res.on('data', c => {
                    got += c.length;
                    const now = Date.now();
                    if (now - lastT >= 400) { speed = (got - lastB) / ((now - lastT) / 1000); lastT = now; lastB = got; }
                    if (now - last > 150) {
                        last = now;
                        const sp = speed ? ' \u00b7 ' + A.fmtSize(speed) + '/s' : '';
                        if (total) onProg(Math.min(99, got / total * 100), 'Downloading \u00b7 ' + Math.round(got / total * 100) + '%' + sp);
                        else onProg(-1, 'Downloading \u00b7 ' + A.fmtSize(got) + sp);
                    }
                });
                res.pipe(out);
                out.on('finish', () => { out.close(() => { try { fs.renameSync(part, dest); resolve(); } catch (e) { reject(e); } }); });
                out.on('error', e => reject(e));
                res.on('error', e => { try { fs.unlinkSync(part); } catch (x) {} reject(e); });
            });
            req.on('timeout', () => { req.destroy(); reject(new Error('The download timed out.')); });
            req.on('error', e => { if (tok.cancelled) reject(new Error('Cancelled')); else reject(new Error('No connection (' + (e.code || e.message) + ').')); });
        });
    }

    // ---------- 24h search cache (Pixabay requires it; it also saves everyone's request quota) ----------
    const CACHE_FILE = path.join(process.platform === 'win32' ? process.env.APPDATA : path.join(os.homedir(), 'Library', 'Application Support'), 'VibePlugin', 'stock-cache.json');
    const TTL = 24 * 3600 * 1000, MAX_CACHE = 40;
    let cache = {}, saveT = null;
    function loadCache() {
        try {
            const j = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')), now = Date.now();
            Object.keys(j).forEach(k => { if (j[k] && now - j[k].t < TTL) cache[k] = j[k]; });
        } catch (e) {}
    }
    function saveCache() {
        clearTimeout(saveT);
        saveT = setTimeout(() => {
            try {
                const keys = Object.keys(cache).sort((a, b) => cache[b].t - cache[a].t).slice(0, MAX_CACHE), out = {};
                keys.forEach(k => { out[k] = cache[k]; });
                cache = out;
                fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
                fs.writeFileSync(CACHE_FILE, JSON.stringify(out));
            } catch (e) {}
        }, 1500);
    }

    // ---------- providers ----------
    // An item: {provider,id,type,w,h,thumb,view,preview?,duration?,color?,title,tags[],author,authorUrl,pageUrl,files[],hook?}
    // A file: {label,sub,url,ext,w?,h?,size?}

    function pxPhoto(x) {
        const s = x.src || {};
        return {
            provider: 'pexels', id: 'px' + x.id, type: 'photo', w: x.width, h: x.height,
            thumb: s.medium || s.small, view: s.large || s.medium, color: x.avg_color, title: x.alt || '', tags: [],
            author: x.photographer, authorUrl: x.photographer_url, pageUrl: x.url,
            files: [
                { label: 'Original', sub: x.width + ' \u00d7 ' + x.height, url: s.original, ext: fileExt(s.original, 'jpg') },
                { label: 'Large', sub: 'Up to 1880 px wide', url: s.large2x, ext: 'jpg' },
                { label: 'Medium', sub: '940 px wide', url: s.large, ext: 'jpg' }
            ].filter(f => f.url)
        };
    }
    function pxVideo(x) {
        const files = (x.video_files || []).filter(f => /mp4/i.test(f.file_type || '') && f.link).sort((a, b) => (b.width || 0) - (a.width || 0));
        const prev = files.slice().sort((a, b) => Math.abs((a.width || 0) - 640) - Math.abs((b.width || 0) - 640))[0];
        const u = x.user || {};
        return {
            provider: 'pexels', id: 'px' + x.id, type: 'video', w: x.width, h: x.height, duration: x.duration,
            thumb: x.image, view: x.image, preview: prev && prev.link, title: '', tags: [],
            author: u.name, authorUrl: u.url, pageUrl: x.url,
            files: files.map(f => ({
                label: sideLabel(f.width, f.height) || 'Video',
                sub: f.width + ' \u00d7 ' + f.height + (f.fps ? ' \u00b7 ' + Math.round(f.fps) + ' fps' : ''),
                url: f.link, ext: 'mp4', w: f.width, h: f.height
            }))
        };
    }

    function pbPhoto(type) {
        return x => ({
            provider: 'pixabay', id: 'pb' + x.id, type: type, w: x.imageWidth, h: x.imageHeight,
            thumb: x.webformatURL, view: x.largeImageURL || x.webformatURL, title: '',
            tags: (x.tags || '').split(',').map(s => s.trim()).filter(Boolean),
            author: x.user, authorUrl: 'https://pixabay.com/users/' + x.user + '-' + x.user_id + '/', pageUrl: x.pageURL,
            files: [
                x.vectorURL && { label: 'Vector', sub: 'SVG', url: x.vectorURL, ext: 'svg' },
                x.imageURL && { label: 'Full size', sub: x.imageWidth + ' \u00d7 ' + x.imageHeight, url: x.imageURL, ext: fileExt(x.imageURL, 'jpg') },
                x.fullHDURL && { label: 'Full HD', sub: '1920 px wide', url: x.fullHDURL, ext: fileExt(x.fullHDURL, 'jpg') },
                x.largeImageURL && { label: 'Large', sub: '1280 px wide', url: x.largeImageURL, ext: fileExt(x.largeImageURL, 'jpg') },
                x.webformatURL && { label: 'Medium', sub: '640 px wide', url: x.webformatURL, ext: fileExt(x.webformatURL, 'jpg') }
            ].filter(Boolean)
        });
    }
    function pbVideo(x) {
        const v = x.videos || {};
        const files = ['large', 'medium', 'small', 'tiny'].filter(k => v[k] && v[k].url).map(k => ({
            label: sideLabel(v[k].width, v[k].height) || cap(k),
            sub: v[k].width + ' \u00d7 ' + v[k].height + (v[k].size ? ' \u00b7 ' + A.fmtSize(v[k].size) : ''),
            url: v[k].url, ext: 'mp4', w: v[k].width, h: v[k].height, size: v[k].size
        }));
        const big = v.large && v.large.url ? v.large : (v.medium || v.small || v.tiny || {});
        const small = v.tiny || v.small || v.medium || {};
        return {
            provider: 'pixabay', id: 'pb' + x.id, type: 'video', w: big.width, h: big.height, duration: x.duration,
            thumb: (v.medium && v.medium.thumbnail) || (v.small && v.small.thumbnail) || small.thumbnail,
            view: (v.medium && v.medium.thumbnail) || small.thumbnail, preview: small.url, title: '',
            tags: (x.tags || '').split(',').map(s => s.trim()).filter(Boolean),
            author: x.user, authorUrl: 'https://pixabay.com/users/' + x.user + '-' + x.user_id + '/', pageUrl: x.pageURL, files: files
        };
    }

    function usPhoto(x) {
        const u = x.urls || {}, un = x.user || {}, utm = 'utm_source=vibe_plugin&utm_medium=referral';
        const raw = u.raw || u.full || u.regular;
        return {
            provider: 'unsplash', id: 'us' + x.id, type: 'photo', w: x.width, h: x.height,
            thumb: u.small, view: u.regular, color: x.color, title: x.description || x.alt_description || '', tags: [],
            author: un.name, authorUrl: joinQ((un.links && un.links.html) || ('https://unsplash.com/@' + un.username), utm),
            pageUrl: joinQ((x.links && x.links.html) || ('https://unsplash.com/photos/' + x.id), utm),
            hook: x.links && x.links.download_location,
            files: [
                { label: 'Original', sub: x.width + ' \u00d7 ' + x.height, url: raw, ext: 'jpg' },
                { label: 'Large', sub: '2400 px wide', url: joinQ(raw, 'w=2400&q=85&fm=jpg&fit=max'), ext: 'jpg' },
                { label: 'Medium', sub: '1080 px wide', url: u.regular, ext: 'jpg' }
            ].filter(f => f.url)
        };
    }

    const PROVS = {
        pexels: {
            id: 'pexels', name: 'Pexels', color: '#05a081', site: 'https://www.pexels.com',
            keyUrl: 'https://www.pexels.com/api/new/', limit: '200 requests per hour',
            types: ['video', 'photo'],
            how: ['Log in or sign up (it is free).', 'Fill the short form. A line like \u201cImporting stock into Premiere\u201d is fine.', 'Copy the API key shown on the page.'],
            license: 'Free to use. Crediting the creator is appreciated.',
            async search(q, type, page, o, key) {
                const h = { Authorization: key };
                const orient = o.orient && o.orient !== 'any' ? o.orient : '';
                let url;
                if (type === 'video') url = q ? 'https://api.pexels.com/videos/search?' + qs({ query: q, page: page, per_page: 24, orientation: orient }) : 'https://api.pexels.com/videos/popular?' + qs({ page: page, per_page: 24 });
                else url = q ? 'https://api.pexels.com/v1/search?' + qs({ query: q, page: page, per_page: 24, orientation: orient }) : 'https://api.pexels.com/v1/curated?' + qs({ page: page, per_page: 24 });
                const r = await getJson(url, h), j = r.json;
                const list = type === 'video' ? (j.videos || []) : (j.photos || []);
                return { items: list.map(type === 'video' ? pxVideo : pxPhoto), hasMore: !!j.next_page, rate: r.headers['x-ratelimit-remaining'] };
            }
        },
        pixabay: {
            id: 'pixabay', name: 'Pixabay', color: '#2ec66d', site: 'https://pixabay.com',
            keyUrl: 'https://pixabay.com/api/docs/', limit: '100 requests per minute',
            types: ['video', 'photo', 'illustration', 'vector', 'music', 'sound', 'gif', 'model'],
            how: ['Log in or sign up for a free Pixabay account.', 'Open the API docs. Your key is shown next to \u201ckey (required)\u201d under Parameters.', 'Copy that long key.'],
            license: 'Pixabay Content License. Free for commercial use, no credit required.',
            async search(q, type, page, o, key) {
                const base = { key: key, q: q, page: page, per_page: 24, safesearch: 'true' };
                let url;
                if (type === 'video') url = 'https://pixabay.com/api/videos/?' + qs(base);
                else {
                    const orient = o.orient === 'landscape' ? 'horizontal' : o.orient === 'portrait' ? 'vertical' : '';
                    url = 'https://pixabay.com/api/?' + qs(Object.assign({}, base, { image_type: type, orientation: orient }));
                }
                const r = await getJson(url), j = r.json;
                const items = (j.hits || []).map(type === 'video' ? pbVideo : pbPhoto(type));
                return { items: items, hasMore: page * 24 < Math.min(j.totalHits || 0, 500), rate: r.headers['x-ratelimit-remaining'] };
            }
        },
        unsplash: {
            id: 'unsplash', name: 'Unsplash', color: '#d9d9d9', site: 'https://unsplash.com',
            keyUrl: 'https://unsplash.com/oauth/applications/new', limit: '50 requests per hour',
            types: ['photo'],
            how: ['Log in or sign up, then accept the API terms.', 'Click \u201cNew Application\u201d, tick the boxes and name it anything (e.g. Vibe Plugin).', 'Copy the \u201cAccess Key\u201d, not the Secret key.'],
            license: 'Unsplash License. Free to use. The photographer is credited with every download.',
            async search(q, type, page, o, key) {
                const h = { Authorization: 'Client-ID ' + key, 'Accept-Version': 'v1' };
                const orient = o.orient === 'square' ? 'squarish' : (o.orient && o.orient !== 'any' ? o.orient : '');
                const url = q ? 'https://api.unsplash.com/search/photos?' + qs({ query: q, page: page, per_page: 24, orientation: orient })
                    : 'https://api.unsplash.com/photos?' + qs({ page: page, per_page: 24, order_by: 'popular' });
                const r = await getJson(url, h), j = r.json;
                const list = q ? (j.results || []) : (Array.isArray(j) ? j : []);
                return { items: list.map(usPhoto), hasMore: q ? page < (j.total_pages || 0) : list.length >= 24, rate: r.headers['x-ratelimit-remaining'] };
            },
            // Unsplash API rule: tell them when a photo is downloaded.
            async onDownload(item, key) { if (item.hook) { try { await getJson(item.hook, { Authorization: 'Client-ID ' + key }); } catch (e) {} } }
        }
    };

    const TYPE_LABEL = { video: 'Videos', photo: 'Photos', illustration: 'Illustrations', vector: 'Vectors', music: 'Music', sound: 'Sound Effects', gif: 'GIFs', model: '3D Models' };
    const TYPE_ICON = { video: 'film', photo: 'image', illustration: 'sparkles', vector: 'layers', music: 'music', sound: 'volume', gif: 'play', model: 'cube' };
    // Pixabay's free API only covers photos, illustrations, vectors and videos. These categories live on pixabay.com,
    // so the panel opens them pre-searched and then imports the file you download.
    const EXT = {
        music: { path: 'music', h: 'Free music', noun: 'music tracks', audio: true, exts: ['mp3', 'wav', 'ogg', 'm4a', 'flac'] },
        sound: { path: 'sound-effects', h: 'Free sound effects', noun: 'sound effects', audio: true, exts: ['mp3', 'wav', 'ogg', 'm4a', 'flac'] },
        gif: { path: 'gifs', h: 'Free GIFs', noun: 'GIFs', exts: ['gif', 'mp4', 'webm'] },
        model: { path: '3d-models', h: 'Free 3D models', noun: '3D models', noImport: true, exts: ['glb', 'gltf', 'obj', 'fbx', 'stl', 'zip'] }
    };
    const SUGGEST = {
        video: ['drone', 'ocean', 'timelapse', 'city night', 'nature', 'abstract', 'clouds', 'people', 'fire', 'rain', 'technology', 'food', 'space'],
        photo: ['nature', 'flowers', 'background', 'sunset', 'forest', 'landscape', 'sky', 'texture', 'portrait', 'city', 'minimal', 'food'],
        illustration: ['pattern', 'abstract', 'floral', 'geometric', 'background', 'cartoon', 'christmas', 'icon'],
        vector: ['pattern', 'icon', 'abstract', 'floral', 'geometric', 'logo', 'arrow', 'frame'],
        music: ['lofi', 'cinematic', 'upbeat', 'ambient', 'corporate', 'epic', 'piano', 'chill', 'electronic'],
        sound: ['whoosh', 'transition', 'click', 'explosion', 'rain', 'footsteps', 'swoosh', 'notification', 'impact'],
        gif: ['reaction', 'loading', 'fire', 'confetti', 'arrow', 'heart', 'glitch', 'sparkle'],
        model: ['car', 'robot', 'house', 'tree', 'character', 'furniture', 'weapon', 'planet']
    };
    const ORIENTS = [['any', 'Any'], ['landscape', 'Wide'], ['portrait', 'Tall'], ['square', 'Square']];

    // ---------- state ----------
    const S = { provider: 'pexels', type: 'video', q: '', orient: 'any', page: 1, items: [], ids: {}, hasMore: false, loading: false, err: null, rate: null, seq: 0, mode: 'grid', first: true, scroll: 0 };
    const getKey = id => (A.store.get('stock_key_' + id, '') || '').trim();
    const setKey = (id, v) => A.store.set('stock_key_' + id, v || '');
    const hoverOn = () => A.store.get('stock_hover', '1') === '1' && !document.body.classList.contains('lite');
    const creditOn = () => A.store.get('stock_credit', '1') === '1';

    // ---------- DOM refs ----------
    let root, headEl, h1El, provRow, inputEl, clearBtn, tabsRow, orientRow, chipsRow, scrollEl;
    let viewGrid, viewDetail, viewKeys, connectEl, extEl, errEl, gridEl, footEl, sentinel, io;
    const isExt = () => !!EXT[S.type];
    const brand = (id, n) => { if (window.brandIcon) return window.brandIcon(id, n); const i = document.createElement('i'); i.style.background = PROVS[id].color; return i; };

    function creditLine(item) {
        const what = item.type === 'video' ? 'Video' : item.type === 'photo' ? 'Photo' : 'Image';
        return what + ' by ' + (item.author || 'unknown') + ' on ' + PROVS[item.provider].name;
    }
    function itemTitle(item) {
        return item.title || item.tags.slice(0, 3).join(', ') || (item.type === 'video' ? 'Stock video' : 'Stock ' + item.type);
    }

    // ---------- header ----------
    function renderH1() {
        h1El.textContent = isExt() ? EXT[S.type].h : 'Free stock ' + TYPE_LABEL[S.type].toLowerCase();
        if (inputEl) inputEl.placeholder = isExt() ? 'Search Pixabay ' + TYPE_LABEL[S.type].toLowerCase() : 'Search free photos & videos';
    }

    function renderProv() {
        provRow.textContent = '';
        Object.keys(PROVS).forEach(id => {
            const P = PROVS[id];
            const b = A.el('button', 'sk-p' + (id === S.provider ? ' on' : ''));
            b.appendChild(brand(id, 15));
            b.appendChild(A.el('span', null, P.name));
            if (getKey(id)) { const ok = A.el('span', 'kok'); ok.appendChild(A.icon('check', 11)); ok.title = 'Key added'; b.appendChild(ok); }
            b.onclick = () => setProvider(id);
            provRow.appendChild(b);
        });
        refreshRows();
    }
    function renderTabs() {
        tabsRow.textContent = '';
        PROVS[S.provider].types.forEach(t => {
            const b = A.el('button', 'sk-tab' + (t === S.type ? ' on' : '') + (EXT[t] ? ' ext' : ''));
            b.appendChild(A.icon(TYPE_ICON[t], 14));
            b.appendChild(document.createTextNode(TYPE_LABEL[t]));
            if (EXT[t]) { const x = A.icon('ext', 10); x.className += ' xi'; b.appendChild(x); b.title = 'Opens on pixabay.com'; }
            b.onclick = () => setType(t);
            tabsRow.appendChild(b);
        });
        const on = tabsRow.querySelector('.on');
        if (on) scrollTabs();
        refreshRows();
    }
    function scrollTabs() { const on = tabsRow && tabsRow.querySelector('.on'); if (on) tabsRow.scrollLeft = Math.max(0, on.offsetLeft - (tabsRow.clientWidth - on.offsetWidth) / 2); }
    function renderOrient() {
        orientRow.textContent = '';
        orientRow.classList.toggle('hidden', isExt());
        ORIENTS.forEach(o => {
            if (o[0] === 'square' && S.provider === 'pixabay') return;
            const b = A.el('button', 'sk-o' + (o[0] === S.orient ? ' on' : ''), o[1]);
            b.onclick = () => { S.orient = o[0]; A.store.set('stock_orient', S.orient); renderOrient(); load(true); };
            orientRow.appendChild(b);
        });
    }
    function renderChips() {
        chipsRow.textContent = '';
        (SUGGEST[S.type] || []).forEach(w => {
            const c = A.el('button', 'chip', w);
            c.onclick = () => doSearch(w);
            chipsRow.appendChild(c);
        });
        chipsRow.scrollLeft = 0;
    }
    function renderAll() { renderH1(); renderProv(); renderTabs(); renderOrient(); renderChips(); }

    function setProvider(id) {
        if (id === S.provider) return;
        S.provider = id; A.store.set('stock_provider', id);
        const P = PROVS[id];
        if (P.types.indexOf(S.type) < 0) S.type = P.types[0];
        if (S.orient === 'square' && id === 'pixabay') S.orient = 'any';
        A.store.set('stock_type', S.type); A.store.set('stock_orient', S.orient);
        renderAll(); drawState();
        if (getKey(id)) load(true);
    }
    function setType(t) {
        if (t === S.type) return;
        S.type = t; A.store.set('stock_type', t);
        S.seq++; S.loading = false;
        renderH1(); renderTabs(); renderOrient(); renderChips();
        drawState();
        if (!isExt() && getKey(S.provider)) load(true);
    }
    function doSearch(q) {
        S.q = (q || '').trim();
        inputEl.value = S.q;
        clearBtn.classList.toggle('hidden', !S.q);
        if (S.mode !== 'grid') setMode('grid');
        if (isExt()) { renderExt(); if (S.q) A.openUrl(extUrl()); return; }
        load(true);
    }

    // ---------- modes ----------
    function setMode(m) {
        S.mode = m;
        headEl.classList.toggle('hidden', m !== 'grid');
        viewGrid.classList.toggle('hidden', m !== 'grid');
        viewDetail.classList.toggle('hidden', m !== 'detail');
        viewKeys.classList.toggle('hidden', m !== 'keys');
        if (m !== 'detail') viewDetail.textContent = '';   // also stops any playing preview
        if (m === 'grid') scrollEl.scrollTop = S.scroll;
        else scrollEl.scrollTop = 0;
    }

    // ---------- grid ----------
    const RATIOS = [1.5, 0.75, 1, 1.33, 0.8, 1.78, 1, 0.66];

    function drawState() {
        refreshRows();
        const ext = isExt(), has = !!getKey(S.provider);
        extEl.classList.toggle('hidden', !ext);
        connectEl.classList.toggle('hidden', ext || has);
        gridEl.classList.toggle('hidden', ext || !has);
        footEl.classList.toggle('hidden', ext || !has);
        if (ext) { errEl.classList.add('hidden'); S.hasMore = false; renderExt(); return; }
        if (!has) { errEl.classList.add('hidden'); renderConnect(); }
    }

    // ---------- stable masonry: a tile never changes column when more are loaded ----------
    let mCols = [], mH = [], mTiles = [];
    const mCount = () => { const w = gridEl.clientWidth || (scrollEl && scrollEl.clientWidth) || 340; return w >= 700 ? 4 : w >= 480 ? 3 : 2; };
    function mBuild() {
        const n = mCount();
        gridEl.textContent = ''; mCols = []; mH = [];
        for (let i = 0; i < n; i++) { const c = A.el('div', 'sk-col'); gridEl.appendChild(c); mCols.push(c); mH.push(0); }
    }
    function mReset() { mTiles = []; mBuild(); }
    function mAdd(t) {
        if (!mCols.length) mBuild();
        const r = parseFloat(t.style.aspectRatio) || 1.5;
        let k = 0;
        for (let i = 1; i < mH.length; i++) if (mH[i] < mH[k] - 0.001) k = i;
        mCols[k].appendChild(t); mH[k] += 1 / r + 0.04; mTiles.push(t);
    }
    function mRelayout() {
        if (!mTiles.length || gridEl.classList.contains('hidden') || !gridEl.clientWidth) return;
        if (mCount() === mCols.length) return;
        const old = mTiles; mTiles = []; mBuild(); old.forEach(mAdd);
    }
    // IntersectionObserver only fires on changes, so after each page re-arm it. Otherwise a tall panel can get stuck.
    function rearm() { setTimeout(() => { try { if (io && S.hasMore) { io.unobserve(sentinel); io.observe(sentinel); } } catch (e) {} }, 60); }

    function skeletons() {
        mReset();
        for (let i = 0; i < 8; i++) {
            const t = A.el('div', 'sk-tile sk');
            t.style.aspectRatio = String(RATIOS[i % RATIOS.length]);
            mAdd(t);
        }
    }

    function hoverPreview(t, item) {
        let v = null;
        t.addEventListener('mouseenter', () => {
            if (!item.preview || !hoverOn()) return;
            v = document.createElement('video');
            v.className = 'pv'; v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto'; v.src = item.preview;
            v.addEventListener('playing', () => t.classList.add('pl'));
            t.insertBefore(v, t.children[1] || null);
            const p = v.play(); if (p && p.catch) p.catch(() => {});
        });
        t.addEventListener('mouseleave', () => {
            if (!v) return;
            try { v.pause(); } catch (e) {}
            v.removeAttribute('src'); try { v.load(); } catch (e) {}
            v.remove(); v = null; t.classList.remove('pl');
        });
    }

    function tile(item) {
        const t = A.el('div', 'sk-tile');
        const r = item.w && item.h ? item.w / item.h : 1.5;
        t.style.aspectRatio = String(Math.max(0.62, Math.min(2, r)));
        if (item.color) t.style.background = item.color;
        const img = document.createElement('img');
        img.loading = 'lazy'; img.decoding = 'async'; img.alt = '';
        img.onload = () => t.classList.add('ld');
        img.onerror = () => t.classList.add('ld', 'bad');
        img.src = item.thumb || '';
        t.appendChild(img);

        if (item.type === 'video') {
            const top = item.files[0];
            if (top && top.label) t.appendChild(A.el('span', 'sk-b tl', top.label));
            if (item.duration) t.appendChild(A.el('span', 'sk-b tr', fmtDur(item.duration)));
        }
        const ov = A.el('div', 'ov');
        ov.appendChild(A.el('span', 'au', item.author || ''));
        const f = bestFile(item);
        if (f) {
            const q = A.el('button', null); q.appendChild(A.icon('download', 14));
            q.title = 'Download ' + f.label;
            q.onclick = e => { e.stopPropagation(); download(item, f); };
            ov.appendChild(q);
        }
        t.appendChild(ov);
        t.onclick = () => openDetail(item);
        hoverPreview(t, item);
        return t;
    }

    // The file one click on a tile downloads: videos up to 1080p, photos at "Large".
    function bestFile(item) {
        const f = item.files;
        if (!f.length) return null;
        if (item.type === 'video') {
            const ok = f.filter(x => { const s = Math.min(x.w || 0, x.h || 0); return s > 0 && s <= 1080; });
            return ok.length ? ok[0] : f[f.length - 1];
        }
        return f.length > 1 ? f[1] : f[0];
    }

    function drawFooter() {
        footEl.textContent = '';
        if (S.loading && S.items.length) {
            const l = A.el('div', 'sk-load'); l.appendChild(A.el('span', 'spin')); l.appendChild(A.el('span', null, 'Loading more\u2026')); footEl.appendChild(l);
        } else if (S.err && S.items.length) {
            const m = A.el('div', 'sk-load bad', 'Could not load more. ');
            m.appendChild(A.btn('Retry', 'retry', 'mini', () => loadMore())); footEl.appendChild(m);
        } else if (!S.hasMore && S.items.length) {
            footEl.appendChild(A.el('div', 'sk-load', 'You have reached the end'));
        }
        const P = PROVS[S.provider];
        const pw = A.el('div', 'sk-pow');
        pw.appendChild(document.createTextNode('Powered by '));
        const a = A.el('a', null, P.name + ' \u2197'); a.href = '#'; a.onclick = e => { e.preventDefault(); A.openUrl(P.site); };
        pw.appendChild(a);
        if (S.rate != null && S.rate !== '') pw.appendChild(document.createTextNode(' \u00b7 ' + S.rate + ' requests left'));
        footEl.appendChild(pw);
    }

    function drawError() {
        errEl.textContent = '';
        const show = !!(S.err && !S.items.length && !S.loading);
        errEl.classList.toggle('hidden', !show);
        if (!show) return;
        const box = A.el('div', 'msg bad');
        const ic = A.el('div', 'ic'); ic.appendChild(A.icon('alert', 20));
        box.appendChild(ic); box.appendChild(A.el('div', null, S.err.message));
        const row = A.el('div', 'sk-erow');
        if (S.err.kind === 'auth') row.appendChild(A.btn('Fix key', 'key', null, () => openKeys()));
        row.appendChild(A.btn('Try again', 'retry', 'ghost', () => load(true)));
        box.appendChild(row); errEl.appendChild(box);
    }

    function drawEmpty() {
        if (S.items.length || S.loading || S.err) return;
        mReset();
        errEl.classList.remove('hidden'); errEl.textContent = '';
        const box = A.el('div', 'msg');
        const ic = A.el('div', 'ic'); ic.appendChild(A.icon('search', 20));
        box.appendChild(ic); box.appendChild(A.el('div', null, 'Nothing found for \u201c' + S.q + '\u201d. Try a simpler word.'));
        errEl.appendChild(box);
    }

    // Returns true when the page loaded.
    async function load(reset) {
        if (isExt()) { drawState(); return false; }
        const P = PROVS[S.provider], key = getKey(S.provider);
        if (!key) { drawState(); return false; }
        if (S.loading && !reset) return false;
        const my = ++S.seq;
        if (reset) {
            S.page = 1; S.items = []; S.ids = {}; S.hasMore = false; S.err = null;
            errEl.classList.add('hidden'); skeletons();
        }
        S.loading = true; S.err = null; drawFooter();
        let ok = false;
        try {
            const ck = [S.provider, S.type, S.q, S.orient, S.page].join('|'), hit = cache[ck];
            let res;
            if (hit && Date.now() - hit.t < TTL) res = hit.v;
            else {
                res = await P.search(S.q, S.type, S.page, { orient: S.orient }, key);
                cache[ck] = { t: Date.now(), v: { items: res.items, hasMore: res.hasMore } };
                saveCache();
                if (res.rate != null) S.rate = res.rate;
            }
            if (my !== S.seq) return false;
            if (reset) mReset();
            const fresh = res.items.filter(i => !S.ids[i.id] && i.files.length);
            fresh.forEach(i => { S.ids[i.id] = 1; S.items.push(i); mAdd(tile(i)); });
            S.hasMore = !!res.hasMore;
            ok = true;
        } catch (e) {
            if (my !== S.seq) return false;
            S.err = e;
            if (reset) mReset();
        }
        S.loading = false;
        drawError(); drawEmpty(); drawFooter();
        if (ok) rearm();
        return ok;
    }
    async function loadMore() {
        if (S.loading || !S.hasMore || S.mode !== 'grid') return;
        S.page++;
        const before = S.seq;
        const ok = await load(false);
        // Only roll the page back if this request failed itself (not if a new search replaced it).
        if (!ok && S.seq === before + 1) S.page--;
    }

    // ---------- connect / keys ----------
    function keyForm(pid, onSaved) {
        const P = PROVS[pid];
        const wrap = A.el('div', 'sk-kform');
        const field = A.el('div', 'sk-inp');
        const inp = document.createElement('input');
        inp.type = 'password'; inp.placeholder = 'Paste your ' + P.name + ' key here'; inp.value = getKey(pid); inp.spellcheck = false; inp.autocomplete = 'off';
        field.appendChild(inp);
        const tools = A.el('div', 'sk-it');
        const paste = A.el('button', 'xbtn'); paste.title = 'Paste from clipboard'; paste.appendChild(A.icon('clipboard', 14));
        paste.onclick = async () => {
            try { const t = ((await navigator.clipboard.readText()) || '').trim(); if (t) { inp.value = t; inp.focus(); return; } } catch (e) {}
            inp.focus(); A.toast('Press Ctrl+V to paste your key');
        };
        const eye = A.el('button', 'xbtn'); eye.title = 'Show or hide the key'; eye.appendChild(A.icon('eye', 14));
        eye.onclick = () => { inp.type = inp.type === 'password' ? 'text' : 'password'; };
        tools.appendChild(paste); tools.appendChild(eye); field.appendChild(tools);
        const save = A.btn('Save & test', 'check', 'sk-save', null);
        const err = A.el('div', 'sk-kerr hidden');
        const showErr = m => { err.textContent = m; err.classList.remove('hidden'); };
        const label = () => { save.textContent = ''; save.appendChild(A.icon('check', 14)); save.appendChild(document.createTextNode('Save & test')); };
        const run = async () => {
            const k = inp.value.trim();
            if (!k) return showErr('Paste the key first.');
            err.classList.add('hidden'); save.disabled = true; save.textContent = 'Testing\u2026';
            try {
                await P.search('nature', P.types[0], 1, { orient: 'any' }, k);
                setKey(pid, k); A.toast(P.name + ' connected');
                if (onSaved) onSaved();
            } catch (e) { showErr(e.message); }
            save.disabled = false; label();
        };
        save.onclick = run;
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
        wrap.appendChild(field); wrap.appendChild(save); wrap.appendChild(err);
        return wrap;
    }

    function renderConnect() {
        const P = PROVS[S.provider];
        connectEl.textContent = '';
        const logo = A.el('div', 'big'); logo.appendChild(brand(S.provider, 28));
        if (logo.querySelector('.img')) { logo.textContent = ''; logo.appendChild(brand(S.provider, 54)); logo.classList.add('bare'); }
        connectEl.appendChild(logo);
        connectEl.appendChild(A.el('div', 'ct', 'Connect ' + P.name));
        const what = { pexels: 'free videos and photos', pixabay: 'free videos, photos and illustrations', unsplash: 'free photos' }[S.provider];
        connectEl.appendChild(A.el('div', 'cs', 'One free key unlocks millions of ' + what + '. It takes about a minute and stays on this PC.'));
        const steps = A.el('div', 'sk-stepper');
        const step = (n, title, node) => {
            const r = A.el('div', 'sk-step');
            r.appendChild(A.el('div', 'n', String(n)));
            const b = A.el('div', 'sb'); b.appendChild(A.el('div', 'st', title));
            if (node) b.appendChild(node);
            r.appendChild(b); steps.appendChild(r);
        };
        const s1 = A.el('div');
        const ul = A.el('ul', 'sk-how'); (P.how || []).forEach(h => ul.appendChild(A.el('li', null, h))); s1.appendChild(ul);
        s1.appendChild(A.btn('Open ' + P.name + ' key page', 'ext', 'ghost', () => A.openUrl(P.keyUrl)));
        step(1, 'Get your free key', s1);
        step(2, 'Paste it here', keyForm(S.provider, () => { renderProv(); drawState(); load(true); }));
        step(3, 'Search and import', A.el('div', 'sd', 'Hover a tile to preview, press download, and it lands in your Premiere project.'));
        connectEl.appendChild(steps);
        connectEl.appendChild(A.el('div', 'sk-note', 'Limit with a free key: ' + P.limit + '.'));
        if (S.provider === 'pixabay') connectEl.appendChild(A.el('div', 'sk-note', 'Music, sound effects, GIFs and 3D models need no key. Use the tabs above.'));
    }

    // ---------- Pixabay categories that are not in the API (music, sound effects, GIFs, 3D) ----------
    function extUrl() {
        const E = EXT[S.type];
        return 'https://pixabay.com/' + E.path + '/' + (S.q ? 'search/' + encodeURIComponent(S.q) + '/' : '');
    }
    function newestDownload(exts) {
        let best = null;
        try {
            const dir = path.join(os.homedir(), 'Downloads');
            fs.readdirSync(dir).forEach(n => {
                const m = /\.([a-z0-9]+)$/i.exec(n);
                if (!m || exts.indexOf(m[1].toLowerCase()) < 0) return;
                const f = path.join(dir, n), st = fs.statSync(f);
                if (st.isFile() && st.size > 0 && Date.now() - st.mtimeMs < 3600000 && (!best || st.mtimeMs > best.t)) best = { f: f, t: st.mtimeMs };
            });
        } catch (e) {}
        return best && best.f;
    }
    function pickFile(E) {
        try {
            const r = window.cep.fs.showOpenDialogEx(false, false, 'Choose the file you downloaded', path.join(os.homedir(), 'Downloads'), E.exts, '');
            return r && r.data && r.data[0];
        } catch (e) { return null; }
    }
    async function importExt(file) {
        if (!file) return;
        const E = EXT[S.type];
        A.toast('Importing ' + path.basename(file) + '\u2026');
        const r = await A.importToPremiere(file, !!A.$('#tl').checked, !!E.audio);
        A.toast((r.ok ? '' : 'Could not import: ') + r.msg);
    }
    function renderExt() {
        if (!isExt()) return;
        const E = EXT[S.type], label = TYPE_LABEL[S.type];
        extEl.textContent = '';
        const top = A.el('div', 'sx-top');
        const ic = A.el('div', 'sx-ic'); ic.appendChild(A.icon(TYPE_ICON[S.type], 22)); top.appendChild(ic);
        const tx = A.el('div', 'sx-tx');
        tx.appendChild(A.el('div', 'ct', 'Pixabay ' + label));
        tx.appendChild(A.el('div', 'cs', 'Pixabay does not offer ' + E.noun + ' through its free API, so you choose them on pixabay.com and bring the file back here.'));
        top.appendChild(tx); extEl.appendChild(top);

        const open = A.btn(S.q ? 'Search \u201c' + S.q + '\u201d on Pixabay' : 'Browse Pixabay ' + label, 'ext', 'sx-open', () => A.openUrl(extUrl()));
        if (window.brandIcon) open.insertBefore(window.brandIcon('pixabay', 15, true), open.firstChild);
        extEl.appendChild(open);

        const steps = A.el('div', 'sk-stepper');
        const step = (n, title, node) => {
            const r = A.el('div', 'sk-step');
            r.appendChild(A.el('div', 'n', String(n)));
            const b = A.el('div', 'sb'); b.appendChild(A.el('div', 'st', title));
            if (node) b.appendChild(node);
            r.appendChild(b); steps.appendChild(r);
        };
        step(1, 'Open Pixabay', A.el('div', 'sd', 'Pick the ' + E.noun + ' you like. Searching above opens the page already filtered.'));
        step(2, 'Press Download on the page', A.el('div', 'sd', 'Free for commercial use. No credit needed (Pixabay Content License).'));
        if (E.noImport) {
            step(3, 'Use it in a 3D app', A.el('div', 'sd', 'Premiere cannot import 3D models. Open the file in Blender, After Effects or Cinema 4D.'));
        } else {
            const row = A.el('div', 'sk-xrow');
            row.appendChild(A.btn('Import latest download', 'download', null, () => {
                const f = newestDownload(E.exts);
                if (!f) return A.toast('No new ' + label.toLowerCase() + ' file found in Downloads. Try \u201cChoose file\u201d.');
                importExt(f);
            }));
            row.appendChild(A.btn('Choose file\u2026', 'folder', 'ghost', () => importExt(pickFile(E))));
            const wrap = A.el('div');
            wrap.appendChild(A.el('div', 'sd', 'Finds the newest file in your Downloads folder and imports it into Premiere.'));
            wrap.appendChild(row);
            step(3, 'Import it here', wrap);
        }
        extEl.appendChild(steps);
        extEl.appendChild(A.el('div', 'sk-note', PROVS.pixabay.license));
    }

    function openKeys() { renderKeys(); setMode('keys'); }
    function closeKeys() {
        setMode('grid'); renderProv(); drawState();
        if (getKey(S.provider) && !S.items.length && !S.loading) load(true);
    }

    function toggleSet(title, desc, key, def) {
        const s = A.el('div', 'set inline');
        const l = A.el('div'); l.appendChild(A.el('div', 'sl', title)); l.appendChild(A.el('div', 'sd', desc));
        const lab = A.el('label', 'switch');
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = A.store.get(key, def) === '1';
        cb.onchange = () => A.store.set(key, cb.checked ? '1' : '0');
        lab.appendChild(cb); lab.appendChild(document.createElement('i'));
        s.appendChild(l); s.appendChild(lab);
        return s;
    }

    function renderKeys() {
        const v = viewKeys; v.textContent = '';
        v.appendChild(A.btn('Back', 'back', 'back', closeKeys));
        v.appendChild(A.el('div', 'eyebrow', 'STOCK LIBRARY'));
        v.appendChild(A.el('h1', 'sk-h', 'API keys'));
        v.appendChild(A.el('p', 'sk-psub', 'Each service gives you a free key. Yours stays on this computer, so you get your own request limit.'));
        Object.keys(PROVS).forEach(id => {
            const P = PROVS[id], has = !!getKey(id);
            const card = A.el('div', 'sk-kc');
            const head = A.el('div', 'sk-kh');
            head.appendChild(brand(id, 18));
            head.appendChild(A.el('span', 'kn', P.name));
            head.appendChild(A.el('span', 'badge ' + (has ? 'ok' : ''), has ? 'CONNECTED' : 'NOT CONNECTED'));
            card.appendChild(head);
            card.appendChild(keyForm(id, () => renderKeys()));
            const foot = A.el('div', 'sk-kfoot');
            foot.appendChild(A.el('span', null, P.limit));
            const get = A.el('a', null, 'Get a key \u2197'); get.href = '#'; get.onclick = e => { e.preventDefault(); A.openUrl(P.keyUrl); };
            foot.appendChild(get);
            if (has) { const rm = A.el('a', 'danger', 'Remove'); rm.href = '#'; rm.onclick = e => { e.preventDefault(); setKey(id, ''); A.toast(P.name + ' key removed'); renderKeys(); }; foot.appendChild(rm); }
            card.appendChild(foot);
            v.appendChild(card);
        });
        v.appendChild(toggleSet('Save a credit file', 'Writes a small .txt with the creator and license next to each download.', 'stock_credit', '1'));
        v.appendChild(toggleSet('Play video previews on hover', 'Turn off to save bandwidth. Always off on slower PCs.', 'stock_hover', '1'));
    }

    // ---------- detail ----------
    function openDetail(item) {
        S.scroll = scrollEl.scrollTop;
        renderDetail(item);
        setMode('detail');
    }
    function closeDetail() { setMode('grid'); }

    function renderDetail(item) {
        const P = PROVS[item.provider], d = viewDetail;
        d.textContent = '';
        d.appendChild(A.btn('Back', 'back', 'back', closeDetail));

        const media = A.el('div', 'sk-media');
        const r = item.w && item.h ? item.w / item.h : 1.6;
        media.style.aspectRatio = String(Math.max(0.7, Math.min(2, r)));
        if (item.color) media.style.background = item.color;
        if (item.type === 'video' && item.preview) {
            const v = document.createElement('video');
            v.src = item.preview; v.poster = item.thumb || ''; v.controls = true; v.autoplay = true; v.loop = true; v.muted = true; v.playsInline = true;
            media.appendChild(v);
        } else {
            const im = document.createElement('img'); im.src = item.view || item.thumb || ''; im.alt = ''; media.appendChild(im);
        }
        d.appendChild(media);

        d.appendChild(A.el('div', 'sk-title', itemTitle(item)));
        const cr = A.el('div', 'sk-credit');
        const av = A.el('div', 'av', (item.author || '?').charAt(0).toUpperCase()); av.style.background = P.color;
        cr.appendChild(av);
        const who = A.el('div', 'who');
        const by = A.el('a', null, item.author || 'Unknown'); by.href = '#'; by.onclick = e => { e.preventDefault(); if (item.authorUrl) A.openUrl(item.authorUrl); };
        who.appendChild(by);
        const on = A.el('div', 'on'); on.appendChild(document.createTextNode('on ' + P.name + ' \u00b7 '));
        const pg = A.el('a', null, 'View page \u2197'); pg.href = '#'; pg.onclick = e => { e.preventDefault(); if (item.pageUrl) A.openUrl(item.pageUrl); };
        on.appendChild(pg); who.appendChild(on);
        cr.appendChild(who);
        cr.appendChild(A.btn('Copy credit', 'copy', 'mini', () => { A.toast(copyText(creditLine(item)) ? 'Credit copied' : 'Could not copy'); }));
        d.appendChild(cr);

        if (item.tags.length) {
            const tg = A.el('div', 'sk-tags');
            item.tags.slice(0, 8).forEach(t => { const c = A.el('button', 'chip', t); c.onclick = () => doSearch(t); tg.appendChild(c); });
            d.appendChild(tg);
        }

        d.appendChild(A.el('div', 'eyebrow sk-dl', 'DOWNLOAD'));
        const best = bestFile(item);
        item.files.forEach(f => {
            const row = A.el('div', 'frow' + (f === best ? ' feat' : ''));
            const l = A.el('div', 'fl');
            const big = A.el('div', 'fbig', f.label);
            if (f === best) big.appendChild(A.el('span', 'badge ok', 'RECOMMENDED'));
            if (f.ext === 'svg') big.appendChild(A.el('span', 'badge', 'NO PREMIERE IMPORT'));
            l.appendChild(big); l.appendChild(A.el('div', 'fsub', f.sub));
            row.appendChild(l);
            const fa = A.el('div', 'fa');
            const b = A.btn('', 'download', null, () => download(item, f)); b.title = 'Download'; b.style.padding = '0 10px';
            fa.appendChild(b); row.appendChild(fa);
            d.appendChild(row);
        });
        d.appendChild(A.el('div', 'sk-lic', P.license));
    }

    // ---------- download + import ----------
    let running = 0; const waitQ = [];
    // take() -> {p, cancel}: leaving the line is instant for a queued download
    const take = () => {
        let entry = null, rejFn;
        const p = new Promise((res, rej) => { rejFn = rej; if (running < 3) { running++; res(); } else { entry = { res: res }; waitQ.push(entry); } });
        return { p: p, cancel: () => { if (!entry) return; const i = waitQ.indexOf(entry); if (i >= 0) { waitQ.splice(i, 1); entry = null; rejFn(new Error('Cancelled')); } } };
    };
    const give = () => { const n = waitQ.shift(); if (n) n.res(); else running--; };

    function writeCredit(dest, item) {
        try {
            const P = PROVS[item.provider];
            const txt = creditLine(item) + '\n' + (item.pageUrl || '') + '\nLicense: ' + P.license + '\nSource: ' + P.site + '\n';
            fs.writeFileSync(dest.replace(/\.[^.\\\/]+$/, '') + '.credit.txt', txt);
        } catch (e) {}
    }

    async function download(item, file) {
        const P = PROVS[item.provider];
        const card = A.addCard(P.name + ' \u00b7 ' + itemTitle(item), file.label);
        A.noteQueued();
        const tok = { cancelled: false, abort: null };
        let tk = null;
        card.onCancel(() => { tok.cancelled = true; if (tk) tk.cancel(); if (tok.abort) tok.abort(); });
        let dest, holding = false;
        const fail = m => { card.set('\u2717 ' + m, null, 'bad'); card.action('Retry', () => { card.remove(); download(item, file); }, 'retry'); card.done(); };
        card.set('Waiting for a free slot\u2026', -1);
        try {
            tk = take(); await tk.p; holding = true;
            if (tok.cancelled) throw new Error('Cancelled');
            const dir = path.join(A.getDir(), 'Stock');
            fs.mkdirSync(dir, { recursive: true });
            dest = path.join(dir, [item.provider, item.id.slice(2), slug(itemTitle(item)), slug(file.label)].filter(Boolean).join('-') + '.' + file.ext);
            card.set('Connecting\u2026', -1);
            if (fs.existsSync(dest) && fs.statSync(dest).size > 0) card.set('Already downloaded', 100);
            else {
                if (P.onDownload) await P.onDownload(item, getKey(item.provider));
                await fetchTo(file.url, dest, (p, t) => card.set(t, p), tok);
            }
            if (creditOn() || item.provider === 'unsplash') writeCredit(dest, item);
        } catch (e) {
            if (holding) give();
            return fail(e.message);
        }
        give();
        if (A.addHistory) card.tag(A.addHistory({ title: P.name + ' \u00b7 ' + itemTitle(item), label: file.label, file: dest, audio: false }));

        card.action('Show file', () => A.showFile(dest), 'folder');
        card.action('Copy credit', () => A.toast(copyText(creditLine(item)) ? 'Credit copied' : 'Could not copy'), 'copy');
        if (file.ext === 'svg') {
            card.set('\u2713 Saved. Premiere cannot import SVG, so use a PNG/JPG size to import.', 100, 'ok');
            card.done();
            return;
        }
        const run = async tl => {
            card.set('Importing into Premiere\u2026', 100, 'run');
            const r = await A.importToPremiere(dest, tl, false);
            card.set((r.ok ? '\u2713 ' : '\u2717 ') + r.msg, 100, r.ok ? 'ok' : 'bad');
        };
        card.action('Import', () => run(false), 'download');
        card.action('Add to timeline', () => run(true), 'layers');
        card.done();
        card.set('Saved \u00b7 importing into Premiere\u2026', 100);
        await run(A.$('#tl').checked);
    }

    // ---------- init ----------
    // Scrollable row with hover arrows, edge fades and end-snapping (same behaviour as the platform chips).
    function slider(row, pill) {
        const wrap = A.el('div', 'sk-rw' + (pill ? ' pill' : ''));
        row.classList.add('sk-scr');
        const bl = A.btn('', 'chevl', 'arrow l'), br = A.btn('', 'chevron', 'arrow r');
        bl.title = 'Scroll left'; br.title = 'Scroll right';
        const upd = () => {
            const max = row.scrollWidth - row.clientWidth;
            const l = max > 4 && row.scrollLeft > 10, r = max > 4 && row.scrollLeft < max - 10;
            wrap.classList.toggle('can-l', l); wrap.classList.toggle('can-r', r);
            row.classList.toggle('ml', l); row.classList.toggle('mr', r);
        };
        let t;
        const snap = () => {
            clearTimeout(t);
            t = setTimeout(() => {
                if (row._down) return;
                const max = row.scrollWidth - row.clientWidth;
                if (row.scrollLeft <= 24) row.scrollLeft = 0; else if (row.scrollLeft >= max - 24) row.scrollLeft = max;
                upd();
            }, 140);
        };
        const nudge = d => row.scrollBy({ left: d * Math.max(120, row.clientWidth * 0.6), behavior: 'smooth' });
        bl.onclick = () => nudge(-1); br.onclick = () => nudge(1);
        row.addEventListener('scroll', () => { upd(); snap(); });
        window.addEventListener('resize', upd);
        wrap.appendChild(bl); wrap.appendChild(row); wrap.appendChild(br);
        row._upd = upd;
        return wrap;
    }
    const refreshRows = () => setTimeout(() => [provRow, tabsRow, chipsRow].forEach(r => r && r._upd && r._upd()), 0);

    function buildShell() {
        root = A.$('#stock-root'); root.textContent = '';
        headEl = A.el('div', 'sk-head');
        headEl.appendChild(A.el('div', 'eyebrow', 'STOCK LIBRARY'));
        h1El = A.el('h1', 'sk-h', ''); headEl.appendChild(h1El);
        provRow = A.el('div', 'sk-prov'); headEl.appendChild(slider(provRow));

        const box = A.el('div', 'search');
        const si = A.el('span', 'si'); si.appendChild(A.icon('search', 16)); box.appendChild(si);
        inputEl = document.createElement('input'); inputEl.type = 'text'; inputEl.spellcheck = false; inputEl.autocomplete = 'off';
        inputEl.placeholder = 'Search free photos & videos'; box.appendChild(inputEl);
        clearBtn = A.el('button', 'xbtn hidden'); clearBtn.title = 'Clear'; clearBtn.appendChild(A.icon('x', 14)); box.appendChild(clearBtn);
        const go = A.el('button', null, 'Search'); box.appendChild(go);
        headEl.appendChild(box);

        tabsRow = A.el('div', 'sk-tabs'); headEl.appendChild(slider(tabsRow, true));
        const sub = A.el('div', 'sk-sub');
        orientRow = A.el('div', 'sk-or'); sub.appendChild(orientRow);
        const keys = A.btn('Keys', 'key', 'mini', () => openKeys()); keys.title = 'Manage API keys'; sub.appendChild(keys);
        headEl.appendChild(sub);
        chipsRow = A.el('div', 'sk-chips'); headEl.appendChild(slider(chipsRow));
        // mouse wheel slides the rows sideways
        [tabsRow, provRow, chipsRow].forEach(r => r.addEventListener('wheel', e => {
            if (r.scrollWidth > r.clientWidth) { r.scrollLeft += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY); e.preventDefault(); }
        }, { passive: false }));
        // click-and-drag to slide (a drag never counts as a click)
        [tabsRow, provRow, chipsRow].forEach(r => {
            let moved = false, sx = 0, sl = 0;
            r.addEventListener('mousedown', e => { r._down = true; moved = false; sx = e.clientX; sl = r.scrollLeft; });
            window.addEventListener('mousemove', e => { if (!r._down) return; const dx = e.clientX - sx; if (Math.abs(dx) > 4) { moved = true; r.scrollLeft = sl - dx; } });
            window.addEventListener('mouseup', () => { if (r._down) { r._down = false; r.dispatchEvent(new Event('scroll')); } });
            r.addEventListener('click', e => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
        });
        let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(mRelayout, 120); });

        scrollEl = A.el('div', 'sk-scroll');
        viewGrid = A.el('div', 'sk-view');
        connectEl = A.el('div', 'sk-conn hidden');
        extEl = A.el('div', 'sk-ext hidden');
        errEl = A.el('div', 'hidden');
        gridEl = A.el('div', 'sk-grid');
        footEl = A.el('div', 'sk-foot');
        sentinel = A.el('div', 'sk-sentinel');
        [connectEl, extEl, errEl, gridEl, sentinel, footEl].forEach(n => viewGrid.appendChild(n));
        viewDetail = A.el('div', 'sk-view hidden');
        viewKeys = A.el('div', 'sk-view hidden');
        [viewGrid, viewDetail, viewKeys].forEach(n => scrollEl.appendChild(n));
        root.appendChild(headEl); root.appendChild(scrollEl);

        go.onclick = () => doSearch(inputEl.value);
        inputEl.addEventListener('keydown', e => {
            if (e.key === 'Enter') doSearch(inputEl.value);
            if (e.key === 'Escape') { inputEl.value = ''; clearBtn.classList.add('hidden'); if (S.q) doSearch(''); }
        });
        inputEl.addEventListener('input', () => clearBtn.classList.toggle('hidden', !inputEl.value));
        clearBtn.onclick = () => { inputEl.value = ''; inputEl.focus(); clearBtn.classList.add('hidden'); if (S.q) doSearch(''); };

        // Infinite scroll
        try {
            io = new IntersectionObserver(es => { if (es[0].isIntersecting) loadMore(); }, { root: scrollEl, rootMargin: '300px' });
            io.observe(sentinel);
        } catch (e) {}
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && S.mode !== 'grid' && !A.$('#view-stock').classList.contains('hidden')) { S.mode === 'keys' ? closeKeys() : closeDetail(); }
        });
    }

    window.VStock = {
        init: function (api) {
            A = api;
            loadCache();
            const sp = A.store.get('stock_provider', 'pexels');
            if (PROVS[sp]) S.provider = sp;
            const st = A.store.get('stock_type', 'video');
            S.type = PROVS[S.provider].types.indexOf(st) >= 0 ? st : PROVS[S.provider].types[0];
            S.orient = A.store.get('stock_orient', 'any');
            if (S.orient === 'square' && S.provider === 'pixabay') S.orient = 'any';
            buildShell();
            renderAll();
            drawState();
            footEl.textContent = '';
        },
        // Called each time the Stock tab opens; the first call loads the popular feed.
        show: function () {
            if (!A) return;
            scrollTabs(); mRelayout(); rearm(); refreshRows();
            if (S.first) { S.first = false; if (getKey(S.provider)) load(true); }
        }
    };
})();

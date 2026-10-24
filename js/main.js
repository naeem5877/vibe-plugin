(function () {
    const os = require('os');
    const path = require('path');
    const $ = s => document.querySelector(s);
    const $$ = s => Array.prototype.slice.call(document.querySelectorAll(s));
    const ev = s => new Promise(r => window.__adobe_cep__.evalScript(s, r));
    const store = {
        get: (k, d) => { try { const v = localStorage.getItem('vp_' + k); return v === null ? d : v; } catch (e) { return d; } },
        set: (k, v) => { try { localStorage.setItem('vp_' + k, v); } catch (e) {} }
    };
    const openUrl = u => { try { window.cep.util.openURLInDefaultBrowser(u); } catch (e) {} };

    // ---------- icons (inline SVG, stroke style) ----------
    const ICONS = {
        eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
        volume: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>',
        cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5"/><path d="M12 12v9"/>',
        play: '<circle cx="12" cy="12" r="9"/><path d="m10 8.5 5 3.5-5 3.5z"/>',
        key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9"/><path d="m16 7 3 3"/><path d="m14 9 2 2"/>',
        copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
        image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-9 9"/>',
        logo: '<path fill="currentColor" stroke="none" d="M 20.44 6.00 C 21.09 6.00 21.47 6.84 21.00 7.59 L 13.31 20.81 C 12.75 21.75 11.25 21.75 10.69 20.81 L 3.00 7.59 C 2.53 6.84 2.91 6.00 3.56 6.00 L 12.75 6.00 C 13.31 6.00 13.69 6.38 13.69 6.94 L 13.69 10.50 L 15.75 10.50 C 16.31 10.50 16.59 11.16 16.12 11.62 L 12.38 16.31 C 12.19 16.59 11.81 16.59 11.62 16.31 L 7.88 11.62 C 7.41 11.16 7.69 10.50 8.25 10.50 L 10.31 10.50 L 10.31 8.62 C 10.31 8.25 9.94 7.88 9.56 7.88 L 6.19 7.88 C 5.62 7.88 5.25 8.44 5.53 8.91 L 11.44 19.12 C 11.72 19.59 12.28 19.59 12.56 19.12 L 18.41 9.00 C 18.66 8.53 18.28 7.88 17.72 7.88 L 16.31 7.88 C 15.75 7.88 15.38 7.41 15.38 6.94 C 15.38 6.00 15.94 6.00 16.50 6.00 Z"/>',
        search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
        download: '<path d="M12 4v11"/><path d="m7 10.5 5 5 5-5"/><path d="M5 20h14"/>',
        sliders: '<path d="M4 7h9"/><path d="M17 7h3"/><circle cx="15" cy="7" r="2"/><path d="M4 17h3"/><path d="M11 17h9"/><circle cx="9" cy="17" r="2"/>',
        folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
        music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
        film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16M16 4v16M3 9h5M3 15h5M16 9h5M16 15h5"/>',
        clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
        x: '<path d="M18 6 6 18M6 6l12 12"/>',
        check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
        back: '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>',
        chevron: '<path d="m9 6 6 6-6 6"/>',
        chevl: '<path d="m15 6-6 6 6 6"/>',
        grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
        list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
        ext: '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
        sparkles: '<path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/>',
        link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
        clipboard: '<rect x="8" y="3" width="8" height="4" rx="1"/><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/>',
        retry: '<path d="M20 12a8 8 0 1 1-2.6-5.9L20 8"/><path d="M20 3v5h-5"/>',
        layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
        zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
        history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 8v4l3 2"/>',
        alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17.5v.5"/>',
        inbox: '<path d="M4 13 6 5h12l2 8"/><path d="M4 13v6h16v-6h-5a3 3 0 0 1-6 0z"/>',
        scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88"/><path d="M14.47 14.48 20 20"/><path d="M8.12 8.12 12 12"/>'
    };
    function icon(name, size) {
        const s = el('span', 'i');
        const n = size || 16;
        s.innerHTML = '<svg viewBox="0 0 24 24" width="' + n + '" height="' + n + '" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>';
        return s;
    }
    function el(tag, cls, txt) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (txt != null) e.textContent = txt;
        return e;
    }
    function btn(label, ic, cls, fn) {
        const b = el('button', cls || null);
        if (ic) b.appendChild(icon(ic, 14));
        if (label) b.appendChild(document.createTextNode(label));
        if (fn) b.onclick = fn;
        return b;
    }
    $$('[data-i]').forEach(n => n.insertBefore(icon(n.getAttribute('data-i'), +n.getAttribute('data-s') || 16), n.firstChild));

    function fmtSize(b) {
        if (!b) return '';
        const u = ['B', 'KB', 'MB', 'GB']; let i = 0;
        while (b >= 1024 && i < 3) { b /= 1024; i++; }
        return (b >= 100 || i === 0 ? Math.round(b) : b.toFixed(1)) + ' ' + u[i];
    }
    function resLabel(h) { return h >= 4320 ? '8K' : h >= 2160 ? '4K' : h >= 1440 ? '2K' : h + 'p'; }

    // ---------- platforms ----------
    const PLATFORMS = [
        { id: 'youtube', name: 'YouTube', color: '#ff3b3b', site: 'https://www.youtube.com', re: /youtube\.com|youtu\.be/i },
        { id: 'instagram', name: 'Instagram', color: '#e1306c', site: 'https://www.instagram.com', re: /instagram\.com|instagr\.am/i },
        { id: 'tiktok', name: 'TikTok', color: '#25f4ee', site: 'https://www.tiktok.com', re: /tiktok\.com/i },
        { id: 'facebook', name: 'Facebook', color: '#3b82f6', site: 'https://www.facebook.com', re: /facebook\.com|fb\.watch|fb\.com/i },
        { id: 'x', name: 'X', color: '#e7e7e7', site: 'https://x.com', re: /twitter\.com|(^|\/\/|\.)x\.com/i },
        { id: 'vimeo', name: 'Vimeo', color: '#1ab7ea', site: 'https://vimeo.com', re: /vimeo\.com/i },
        { id: 'reddit', name: 'Reddit', color: '#ff5a1f', site: 'https://www.reddit.com', re: /reddit\.com|redd\.it/i }
    ];
    let platform = store.get('platform', 'youtube');
    const curPlatform = () => PLATFORMS.filter(p => p.id === platform)[0] || PLATFORMS[0];
    const platformOf = url => PLATFORMS.filter(p => p.re.test(url))[0];
    const isYT = url => /youtube\.com|youtu\.be/i.test(url);
    const isUrl = s => /^https?:\/\/\S+$/i.test(s);

    // ---------- views / nav ----------
    let view = 'search', unseen = 0;
    const TITLES = { search: 'Search', stock: 'Stock', downloads: 'Downloads', settings: 'Settings' };
    function setView(v) {
        view = v;
        Object.keys(TITLES).forEach(n => {
            $('#view-' + n).classList.toggle('hidden', n !== v);
            $('#nav-' + n).classList.toggle('on', n === v);
        });
        $('#crumb').textContent = TITLES[v];
        if (v === 'downloads') { unseen = 0; renderBadge(); }
        if (v === 'stock' && window.VStock) VStock.show();
        refreshMini();
    }
    function renderBadge() {
        const b = $('#navbadge');
        b.textContent = unseen;
        b.classList.toggle('hidden', !unseen);
    }
    Object.keys(TITLES).forEach(n => { $('#nav-' + n).onclick = () => setView(n); });
    $('#mini').onclick = () => setView('downloads');

    let toastTimer;
    function toast(text, actLabel, actFn) {
        const t = $('#toast');
        t.textContent = '';
        t.appendChild(icon('check', 14));
        t.appendChild(el('span', null, text));
        if (actLabel) { const b = el('button', null, actLabel); b.onclick = () => { t.classList.remove('show'); actFn(); }; t.appendChild(b); }
        t.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('show'), 3600);
    }

    function status(m) {
        $('#status').textContent = m || '';
        $('#statuswrap').classList.toggle('on', !!m);
    }

    // ---------- settings ----------
    $('#dir').value = store.get('dir', path.join(os.homedir(), 'Videos', 'VibePlugin'));
    $('#cookies').value = store.get('cookies', '');
    $('#tl').checked = store.get('tl', '0') === '1';
    $('#cookies').onchange = () => store.set('cookies', $('#cookies').value);
    $('#tl').onchange = () => store.set('tl', $('#tl').checked ? '1' : '0');
    $('#perf').value = VPerf.mode();
    const showPerf = () => { $('#perfinfo').textContent = VPerf.info(); };
    showPerf();
    $('#perf').onchange = () => { VPerf.setMode($('#perf').value); showPerf(); };
    VPerf.applyUi();
    $('#pick').onclick = () => {
        const r = window.cep.fs.showOpenDialogEx(false, true, 'Choose download folder', $('#dir').value, [], '');
        if (r && r.data && r.data[0]) { $('#dir').value = r.data[0]; store.set('dir', r.data[0]); }
    };
    $('#upd').onclick = async e => {
        e.preventDefault();
        status('Updating downloader…');
        try { await VT.prepare({}, status); await VT.updateYtDlp(); status(''); toast('Downloader is up to date'); }
        catch (err) { status(''); toast('Update failed: ' + err.message); }
    };

    // ---------- platform chips + hero ----------
    let chipDragged = false, chipDown = false;
    function updateChips() {
        const c = $('#chips'), w = $('#chipwrap');
        const max = c.scrollWidth - c.clientWidth;
        // 10px tolerance: near the start/end counts as "at the start/end", so the arrow and fade disappear.
        const l = max > 4 && c.scrollLeft > 10, r = max > 4 && c.scrollLeft < max - 10;
        w.classList.toggle('can-l', l);
        w.classList.toggle('can-r', r);
        c.className = (l ? 'ml ' : '') + (r ? 'mr' : '');
    }
    let snapTimer;
    function snapChips() {
        clearTimeout(snapTimer);
        snapTimer = setTimeout(() => {
            const c = $('#chips'), max = c.scrollWidth - c.clientWidth;
            if (c.scrollLeft <= 24) c.scrollLeft = 0;
            else if (c.scrollLeft >= max - 24) c.scrollLeft = max;
            updateChips();
        }, 140);
    }
    function renderChips() {
        const box = $('#chips');
        box.textContent = '';
        PLATFORMS.forEach(p => {
            const c = el('div', 'chip' + (p.id === platform ? ' on' : ''));
            const dot = window.brandIcon ? window.brandIcon(p.id, 14) : el('i');
            if (!window.brandIcon) dot.style.background = p.color;
            c.appendChild(dot); c.appendChild(el('span', null, p.name));
            c.onclick = () => { if (chipDragged) return; platform = p.id; store.set('platform', p.id); renderChips(); renderHero(); showHome(); };
            box.appendChild(c);
        });
        // keep the active chip in view
        const on = box.querySelector('.chip.on');
        if (on) box.scrollLeft = Math.max(0, on.offsetLeft - (box.clientWidth - on.offsetWidth) / 2);
        updateChips();
        snapChips();
    }
    (function chipScrolling() {
        const box = $('#chips');
        const nudge = d => box.scrollBy({ left: d * Math.max(120, box.clientWidth * 0.6), behavior: 'smooth' });
        $('#chl').onclick = () => nudge(-1);
        $('#chr').onclick = () => nudge(1);
        box.addEventListener('scroll', () => { updateChips(); if (!chipDown) snapChips(); });
        window.addEventListener('resize', () => { updateChips(); snapChips(); });
        // mouse wheel scrolls the row sideways
        box.addEventListener('wheel', e => {
            if (box.scrollWidth <= box.clientWidth) return;
            box.scrollLeft += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY);
            e.preventDefault();
        }, { passive: false });
        // click-and-drag to slide
        let sx = 0, sl = 0;
        box.addEventListener('mousedown', e => { chipDown = true; chipDragged = false; sx = e.clientX; sl = box.scrollLeft; });
        window.addEventListener('mousemove', e => {
            if (!chipDown) return;
            const dx = e.clientX - sx;
            if (Math.abs(dx) > 4) { chipDragged = true; box.scrollLeft = sl - dx; }
        });
        window.addEventListener('mouseup', () => { if (chipDown) { chipDown = false; snapChips(); } setTimeout(() => { chipDragged = false; }, 0); });
    })();
    function renderHero() {
        const p = curPlatform(), yt = p.id === 'youtube';
        $('#eyebrow').textContent = yt ? 'SEARCH & IMPORT' : 'LINK DOWNLOAD';
        $('#h1').textContent = yt ? 'Search YouTube' : 'Grab from ' + p.name;
        $('#sub').textContent = yt ? 'Find footage, music and sound effects, or paste any link.' : 'Paste a ' + p.name + ' link and pick a quality.';
        $('#q').placeholder = yt ? 'Search or paste a link' : 'Paste a ' + p.name + ' link';
        $('#go').textContent = yt ? 'Search' : 'Fetch';
        syncSearchBox();
    }
    function syncSearchBox() {
        const v = $('#q').value.trim();
        $('#qclear').classList.toggle('hidden', !v);
        const si = $('#sicon');
        si.textContent = '';
        si.appendChild(icon(isUrl(v) ? 'link' : 'search', 16));
        $('#go').textContent = isUrl(v) ? 'Fetch' : (platform === 'youtube' ? 'Search' : 'Fetch');
    }
    function heroVisible(on) { $('#hero').classList.toggle('hidden', !on); $('#chipwrap').classList.toggle('hidden', !on); if (on) updateChips(); }

    // ---------- recent searches ----------
    function getRecent() { try { return JSON.parse(store.get('recent', '[]')) || []; } catch (e) { return []; } }
    function addRecent(q) {
        const l = getRecent().filter(x => x.toLowerCase() !== q.toLowerCase());
        l.unshift(q);
        store.set('recent', JSON.stringify(l.slice(0, 8)));
    }

    // ---------- home ----------
    const IDEAS = [
        { i: 'music', t: 'Royalty-free music', s: 'Background tracks', q: 'no copyright background music' },
        { i: 'film', t: 'B-roll footage', s: 'Cinematic clips', q: 'cinematic b-roll footage 4k' },
        { i: 'zap', t: 'Sound effects', s: 'Whooshes and hits', q: 'whoosh transition sound effect' },
        { i: 'sparkles', t: 'Overlays & FX', s: 'Light leaks, grain', q: 'free light leak overlay' }
    ];

    function runQuery(q) { $('#q').value = q; syncSearchBox(); go(); }

    async function pasteFromClipboard() {
        try {
            const t = (await navigator.clipboard.readText() || '').trim();
            if (t) { $('#q').value = t; syncSearchBox(); if (isUrl(t)) return go(); }
        } catch (e) {}
        $('#q').focus();
        toast('Press Ctrl+V to paste your link');
    }

    function showHome(content) {
        $('#detail').classList.add('hidden');
        $('#home').classList.remove('hidden');
        const h = $('#home');
        h.textContent = '';
        if (content) { h.appendChild(content); return; }
        heroVisible(true);
        const p = curPlatform();
        const wrap = el('div');

        if (p.id === 'youtube') {
            const recent = getRecent();
            if (recent.length) {
                const hd = el('div', 'sect'); hd.appendChild(el('span', null, 'Recent'));
                const clr = el('a', null, 'Clear'); clr.onclick = () => { store.set('recent', '[]'); showHome(); };
                hd.appendChild(clr); wrap.appendChild(hd);
                const rc = el('div', 'recent');
                recent.forEach(q => {
                    const c = el('div', 'rc'); c.appendChild(icon('history', 13)); c.appendChild(el('span', 't', q));
                    c.onclick = () => runQuery(q);
                    rc.appendChild(c);
                });
                wrap.appendChild(rc);
            }
            const hd2 = el('div', 'sect'); hd2.appendChild(el('span', null, 'Try searching for'));
            wrap.appendChild(hd2);
            const grid = el('div', 'ideas');
            IDEAS.forEach(d => {
                const c = el('div', 'idea');
                const ic = el('div', 'ic'); ic.appendChild(icon(d.i, 15));
                c.appendChild(ic); c.appendChild(el('div', 'it', d.t)); c.appendChild(el('div', 'is', d.s));
                c.onclick = () => runQuery(d.q);
                grid.appendChild(c);
            });
            wrap.appendChild(grid);
            const tip = el('div', 'tip');
            const ti = el('span', 'ic'); ti.appendChild(icon('link', 16));
            const tx = el('div', 'tx');
            tx.innerHTML = '<b>Have a link?</b> Paste a YouTube, TikTok, Instagram, X or Vimeo link in the box above.';
            tip.appendChild(ti); tip.appendChild(tx);
            tip.appendChild(btn('Paste', 'clipboard', 'mini', pasteFromClipboard));
            wrap.appendChild(tip);
        } else {
            const c = el('div', 'pcard');
            const pd = el('div', 'pd');
            if (window.brandIcon) pd.appendChild(window.brandIcon(p.id, 24));
            else { const dot = el('i'); dot.style.background = p.color; pd.appendChild(dot); }
            c.appendChild(pd);
            c.appendChild(el('div', 'pt', 'Paste a ' + p.name + ' link'));
            c.appendChild(el('div', 'ps', 'Copy the video link from ' + p.name + ', then paste it here.'));
            const row = el('div', 'pb');
            row.appendChild(btn('Paste link', 'clipboard', null, pasteFromClipboard));
            row.appendChild(btn('Open ' + p.name, 'ext', 'ghost', () => openUrl(p.site)));
            c.appendChild(row);
            wrap.appendChild(c);
        }
        h.appendChild(wrap);
    }

    function msg(text, bad, ic) {
        const d = el('div', 'msg' + (bad ? ' bad' : ''));
        const i = el('div', 'ic'); i.appendChild(icon(ic || (bad ? 'alert' : 'inbox'), 20));
        d.appendChild(i); d.appendChild(el('div', null, text));
        return d;
    }

    function skeleton() {
        const w = el('div');
        for (let i = 0; i < 5; i++) {
            const r = el('div', 'skrow');
            r.appendChild(el('div', 'a sk'));
            const b = el('div', 'b');
            const l1 = el('div', 'sk'), l2 = el('div', 'sk'); l2.style.width = '60%';
            b.appendChild(l1); b.appendChild(l2); r.appendChild(b); w.appendChild(r);
        }
        return w;
    }

    async function search(q) {
        heroVisible(false);
        showHome(skeleton());
        try {
            const list = await ytSearch(q);
            addRecent(q);
            if (!list.length) return showHome(msg('No results for “' + q + '”. Try different words.'));
            const box = el('div');
            const hd = el('div', 'rhead');
            const ht = el('div', 'rht');
            ht.appendChild(el('b', null, 'Results'));
            ht.appendChild(el('span', null, list.length + ' videos for “' + q + '”'));
            const rl = el('div', 'rlist' + (store.get('rview', 'list') === 'grid' ? ' grid' : ''));
            const seg = el('div', 'seg');
            const bl = btn('', 'list', 'xbtn'), bg = btn('', 'grid', 'xbtn');
            bl.title = 'List'; bg.title = 'Grid';
            const syncSeg = () => { const g = rl.classList.contains('grid'); bl.classList.toggle('on', !g); bg.classList.toggle('on', g); };
            bl.onclick = () => { rl.classList.remove('grid'); store.set('rview', 'list'); syncSeg(); };
            bg.onclick = () => { rl.classList.add('grid'); store.set('rview', 'grid'); syncSeg(); };
            seg.appendChild(bl); seg.appendChild(bg); syncSeg();
            hd.appendChild(ht); hd.appendChild(seg);
            box.appendChild(hd);
            box.appendChild(rl);
            list.forEach(v => {
                const r = el('div', 'res');
                const tw = el('div', 'thumbwrap');
                const img = document.createElement('img'); img.loading = 'lazy'; img.decoding = 'async'; img.src = v.thumb;
                tw.appendChild(img); tw.appendChild(el('span', 'dur', v.duration));
                const info = el('div', 'info');
                info.appendChild(el('div', 'rt', v.title));
                info.appendChild(el('div', 'rs', v.channel + (v.views ? ' · ' + v.views : '')));
                r.appendChild(tw); r.appendChild(info);
                const g = icon('chevron', 16); g.className += ' go-ic'; r.appendChild(g);
                r.onclick = () => openDetail(v.url, v);
                rl.appendChild(r);
            });
            showHome(box);
            $('#main').scrollTop = 0;
        } catch (e) { showHome(msg(e.message, true)); }
    }

    // ---------- detail / format picker ----------
    function closeDetail() {
        $('#detail').classList.add('hidden');
        $('#home').classList.remove('hidden');
        if (!$('#home .res') && !$('#home .msg')) heroVisible(true);
    }

    async function openDetail(url, seed) {
        $('#home').classList.add('hidden');
        heroVisible(false);
        const d = $('#detail');
        d.classList.remove('hidden');
        d.textContent = '';
        d.appendChild(btn('Back', 'back', 'back', closeDetail));
        const body = el('div');
        d.appendChild(body);
        $('#main').scrollTop = 0;

        const loading = el('div', 'msg');
        const sp = el('span', 'spin'); const lt = el('div', null, 'Fetching available formats…');
        loading.appendChild(sp); loading.appendChild(lt);
        body.appendChild(loading);

        try {
            // Fast path first (YouTube single videos): straight from InnerTube in a few hundred ms, before yt-dlp is even set up.
            let info = isYT(url) ? await VT.getInfoFast(url) : null;
            if (!info) {
                await VT.prepare({ youtube: isYT(url) }, m => { lt.textContent = m; status(m); });
                status('');
                info = await VT.getInfo(url, { cookies: $('#cookies').value });
            }
            if (!info.thumb && seed) info.thumb = seed.thumb;
            body.textContent = '';
            renderDetail(body, info);
        } catch (e) {
            status('');
            let m = e.message;
            if (/login|cookies|rate-limit|private|sign in/i.test(m) && !isYT(url)) m += '\n\nTip: open Settings and pick a browser under “Login cookies”.';
            body.textContent = '';
            body.appendChild(msg(m, true));
        }
    }

    const AUDIO_ROWS = [
        { fmt: 'm4a', big: 'M4A', sub: 'AAC · original quality, best for editing' },
        { fmt: 'mp3', big: 'MP3', sub: 'Highest quality, widely compatible' },
        { fmt: 'wav', big: 'WAV', sub: 'Uncompressed · large files' }
    ];

    function frow(big, sub, size, onDl, badge, extra, feat) {
        const r = el('div', 'frow' + (feat ? ' feat' : ''));
        const l = el('div', 'fl');
        const b = el('div', 'fbig', big);
        if (badge) b.appendChild(el('span', 'badge ' + badge.cls, badge.text));
        l.appendChild(b);
        l.appendChild(el('div', 'fsub', sub));
        r.appendChild(l);
        if (size) r.appendChild(el('div', 'fsize', size));
        const fa = el('div', 'fa');
        if (extra) {
            const ex = btn(extra.label, 'zap', 'ghost', extra.fn);
            ex.title = extra.title || '';
            fa.appendChild(ex);
        }
        const dl = btn('', 'download', null, onDl);
        dl.title = 'Download';
        dl.style.padding = '0 10px';
        fa.appendChild(dl);
        r.appendChild(fa);
        return r;
    }

    function renderDetail(body, info) {
        const grid = el('div', 'dgrid'), left = el('div', 'dleft'), right = el('div', 'dright');
        grid.appendChild(left); grid.appendChild(right); body.appendChild(grid);
        const hero = el('div', 'hero');
        if (info.thumb) { const im = document.createElement('img'); im.decoding = 'async'; im.src = info.thumb; hero.appendChild(im); }
        if (info.duration) hero.appendChild(el('span', 'dur', info.duration));
        left.appendChild(hero);
        left.appendChild(el('div', 'dtitle', info.title));
        left.appendChild(el('div', 'dmeta', [info.channel, info.site].filter(Boolean).join(' · ')));

        let showing = 'video';
        const trim = VTrim.create(info, { el: el, icon: icon, onCommit: () => (showing === 'video' ? showVideo() : showing === 'audio' ? showAudio() : null) });
        if (trim.el) right.appendChild(trim.el);
        const isRisky = v => !!v && (v.codec === 'VP9' || v.codec === 'AV1');
        // Dubbed videos only: the audio language picked in the dropdown (null = leave yt-dlp's default / original track).
        let audioPick = null;
        // VP9/AV1 are converted to H.264 automatically so Premiere can import them (no separate button).
        const prep = row => {
            if (row.kind === 'best' && info.videos.length && !row.safe) row = Object.assign({}, info.videos[0]);
            if (row.kind === 'video' && isRisky(row)) row = Object.assign({}, row, { convert: true, tag: row.tag + '-h264' });
            if (audioPick) {
                // A non-original language forces a separate-audio merge (a progressive stream carries only one language).
                if (row.kind === 'video') row = Object.assign({}, row, { merge: true, audioId: audioPick.formatId, tag: row.tag + '-' + audioPick.lang });
                else if (row.kind === 'best') row = Object.assign({}, row, { audioId: audioPick.formatId, tag: 'best-' + audioPick.lang });
                else if (row.kind === 'audio') row = Object.assign({}, row, { audioTrack: audioPick.formatId, langTag: audioPick.lang });
            }
            return Object.assign({}, row, { dur: info.durationSec });
        };
        const go = row => start(info, trim.apply(prep(row)));

        if (info.audioTracks && info.audioTracks.length > 1) {
            const ar = el('div', 'set');
            ar.style.marginBottom = '10px';
            ar.appendChild(el('div', 'sd', 'Audio language'));
            const sel = document.createElement('select');
            info.audioTracks.forEach((t, i) => {
                const o = document.createElement('option');
                o.value = String(i);
                o.textContent = t.langLabel + (t.isOriginal ? ' (original)' : '');
                sel.appendChild(o);
            });
            sel.onchange = () => { const t = info.audioTracks[+sel.value]; audioPick = t.isOriginal ? null : t; };
            ar.appendChild(sel);
            right.appendChild(ar);
        }

        const tabs = el('div', 'tabs');
        const tv = btn('Video', 'film', 'tab on');
        const ta = btn('Audio', 'music', 'tab');
        tabs.appendChild(tv); tabs.appendChild(ta);
        const hasSubs = !!(info.subtitles && info.subtitles.length);
        const ts = hasSubs ? btn('Subtitles', 'list', 'tab') : null;
        if (ts) tabs.appendChild(ts);
        right.appendChild(tabs);
        const list = el('div');
        right.appendChild(list);

        function showVideo() {
            showing = 'video';
            tv.className = 'tab on'; ta.className = 'tab'; if (ts) ts.className = 'tab';
            list.textContent = '';
            list.appendChild(frow('Best available', trim.active() ? 'Selected section only \u00b7 H.264 MP4' : (isRisky(info.videos[0]) ? 'Highest quality \u00b7 converts to H.264 for Premiere' : 'Highest quality \u00b7 merged to MP4'), '', () => go({ kind: 'best', tag: 'best' }), { cls: 'ok', text: 'AUTO' }, null, true));
            let warn = false;
            if (isRisky(info.videos[0])) {
                list.appendChild(frow('Premiere-ready \u00b7 fast', 'H.264 + AAC straight from the source, no re-encoding', '', () => go({ kind: 'best', safe: true, tag: 'best-h264' }), { cls: 'ok', text: 'H.264' }, null, false));
            }
            info.videos.forEach(v => {
                const risky = v.codec === 'VP9' || v.codec === 'AV1';
                if (risky) warn = true;
                const sub = v.height + 'p' + (v.fps > 30 ? v.fps : '') + ' · ' + v.codec + (v.merge ? '' : ' · with audio');
                list.appendChild(frow(resLabel(v.height) + (v.fps > 30 ? ' ' + v.fps + 'fps' : ''), sub, fmtSize(v.size * trim.frac()), () => go(v),
                    v.codec === 'H.264' ? { cls: 'ok', text: 'PREMIERE-READY' } : risky ? { cls: 'warn', text: v.codec + ' \u2192 H.264' } : null,
                    null));
            });
            if (!info.videos.length) list.appendChild(el('div', 'note', 'No separate resolutions listed for this link. Use “Best available”.'));
            if (warn) {
                const n = el('div', 'note'); n.appendChild(icon('alert', 14));
                n.appendChild(el('div', null, 'H.264 imports straight into Premiere. VP9/AV1 (usually 4K on YouTube) are converted to H.264 automatically while downloading, which takes a little longer.'));
                list.appendChild(n);
            }
        }
        function showAudio() {
            showing = 'audio';
            ta.className = 'tab on'; tv.className = 'tab'; if (ts) ts.className = 'tab';
            list.textContent = '';
            AUDIO_ROWS.forEach((a, i) => list.appendChild(frow(a.big, a.sub, i === 0 ? fmtSize(info.audioSize * trim.frac()) : '', () => go({ kind: 'audio', fmt: a.fmt }), null, null, i === 0)));
        }
        // Subtitles: every caption language the video publishes (creator-uploaded first, then YouTube's automatic and
        // translated ones). Files are written by yt-dlp when you press download, as .srt (what Premiere imports) or .vtt.
        let subFmt = store.get('subfmt', 'srt'), subFilter = '';
        function showSubs() {
            showing = 'subs';
            ts.className = 'tab on'; tv.className = 'tab'; ta.className = 'tab';
            list.textContent = '';
            const bar = el('div', 'row');
            bar.style.cssText = 'display:flex;gap:8px;margin-bottom:8px';
            const q = document.createElement('input');
            q.type = 'text'; q.placeholder = 'Filter ' + info.subtitles.length + ' languages'; q.value = subFilter;
            const fsel = document.createElement('select');
            fsel.style.width = '84px';
            [['srt', 'SRT'], ['vtt', 'VTT']].forEach(p => { const o = document.createElement('option'); o.value = p[0]; o.textContent = p[1]; fsel.appendChild(o); });
            fsel.value = subFmt;
            fsel.onchange = () => { subFmt = fsel.value; store.set('subfmt', subFmt); };
            bar.appendChild(q); bar.appendChild(fsel);
            list.appendChild(bar);
            const rows = el('div');
            list.appendChild(rows);
            const draw = () => {
                rows.textContent = '';
                const f = subFilter.trim().toLowerCase();
                const shown = info.subtitles.filter(t => !f || t.label.toLowerCase().indexOf(f) >= 0 || t.lang.toLowerCase().indexOf(f) >= 0)
                    .sort((a, b) => (a.isAuto - b.isAuto) || a.langLabel.localeCompare(b.langLabel));
                if (!shown.length) { rows.appendChild(el('div', 'note', 'No language matches “' + subFilter + '”.')); return; }
                shown.forEach(t => rows.appendChild(frow(t.langLabel, t.isAuto ? 'Auto-generated by YouTube · ' + t.lang : 'Uploaded by the creator · ' + t.lang, '',
                    () => startSub(info, t, subFmt), t.isAuto ? { cls: 'warn', text: 'AUTO' } : { cls: 'ok', text: 'CREATOR' }, null)));
            };
            q.oninput = () => { subFilter = q.value; draw(); };
            draw();
        }
        tv.onclick = showVideo; ta.onclick = showAudio;
        if (ts) ts.onclick = showSubs;
        showVideo();
    }

    // ---------- queue ----------
    const { exec } = require('child_process');
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    function emptyQueue() {
        const d = el('div', 'qempty');
        const i = el('div', 'ic'); i.appendChild(icon('download', 20));
        d.appendChild(i);
        const t = el('div'); t.innerHTML = '<b>No downloads yet</b>';
        d.appendChild(t);
        d.appendChild(el('div', null, 'Find a video and press download. Progress shows up here.'));
        d.appendChild(btn('Start searching', 'search', 'ghost', () => setView('search')));
        return d;
    }
    function checkEmpty() {
        const q = $('#queue'), has = q.querySelector('.card') || getHist().length, em = q.querySelector('.qempty');
        if (has && em) em.remove();
        if (!has && !em) q.appendChild(emptyQueue());
    }

    // ---------- download history (last 20, survives restarts) ----------
    function getHist() { try { return JSON.parse(store.get('hist', '[]')) || []; } catch (e) { return []; } }
    function histAdd(e) {
        e.id = String(Date.now()) + Math.random().toString(36).slice(2, 6); e.t = Date.now();
        const l = getHist().filter(x => x.file !== e.file);
        l.unshift(e);
        store.set('hist', JSON.stringify(l.slice(0, 20)));
        return e.id;
    }
    function histRemove(id) { store.set('hist', JSON.stringify(getHist().filter(x => x.id !== id))); renderHistory(); checkEmpty(); }
    const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
    function histCard(e) {
        const c = el('div', 'card ok');
        const top = el('div', 'top');
        const t = el('div', 't', e.title); t.title = e.title; top.appendChild(t);
        if (e.label) top.appendChild(el('span', 'badge ok qlabel', e.label));
        const s = el('div', 's', ago(e.t) + ' \u00b7 ' + path.basename(e.file));
        const acts = el('div', 'acts');
        let exists = true;
        try { exists = require('fs').existsSync(e.file); } catch (x) {}
        if (!exists) { s.textContent = 'File not found \u00b7 ' + path.basename(e.file); c.className = 'card bad'; }
        else {
            const show = r => { s.textContent = (r.ok ? '\u2713 ' : '\u2717 ') + r.msg; };
            acts.appendChild(btn('Show file', 'folder', 'mini', () => showFile(e.file)));
            acts.appendChild(btn('Import', 'download', 'mini', async () => { s.textContent = 'Importing\u2026'; show(await importToPremiere(e.file, false, !!e.audio)); }));
            acts.appendChild(btn('Add to timeline', 'layers', 'mini', async () => { s.textContent = 'Importing\u2026'; show(await importToPremiere(e.file, true, !!e.audio)); }));
        }
        const x = el('button', 'xbtn x'); x.appendChild(icon('x', 13)); x.title = 'Remove from history (the file stays on disk)'; x.onclick = () => histRemove(e.id);
        [top, s, acts, x].forEach(n => c.appendChild(n));
        return c;
    }
    // Entries whose live card is still in the queue are hidden here so nothing shows twice.
    function renderHistory() {
        const box = $('#history'); box.textContent = '';
        const live = {};
        $$('#queue .card').forEach(c => { const h = c.getAttribute('data-hid'); if (h) live[h] = 1; });
        const list = getHist().filter(e => !live[e.id]);
        $('#histhead').classList.toggle('hidden', !list.length);
        list.forEach(e => box.appendChild(histCard(e)));
    }
    $('#histclear').onclick = e => { e.preventDefault(); store.set('hist', '[]'); renderHistory(); checkEmpty(); };

    function refreshMini() {
        const m = $('#mini');
        const run = $$('#queue .card').filter(c => c.getAttribute('data-state') === 'run');
        if (!run.length || view === 'downloads') { m.classList.add('hidden'); return; }
        const known = run.filter(c => c._pct != null);
        const avg = known.length ? known.reduce((a, c) => a + c._pct, 0) / known.length : null;
        $('#mini-t').textContent = run.length + (run.length > 1 ? ' downloads' : ' download') + ' in progress' + (avg != null ? ' · ' + Math.round(avg) + '%' : '');
        $('#mini-f').style.width = (avg != null ? avg : 0) + '%';
        m.classList.toggle('ind', avg == null);
        m.classList.remove('hidden');
    }

    function addCard(title, label) {
        const q = $('#queue');
        const em = q.querySelector('.qempty'); if (em) em.remove();
        const c = el('div', 'card');
        c.setAttribute('data-state', 'run');
        const top = el('div', 'top');
        const t = el('div', 't', title), pc = el('div', 'pct', '');
        t.title = title;
        top.appendChild(t);
        if (label) top.appendChild(el('span', 'badge ok qlabel', label));
        top.appendChild(pc);
        const bar = el('div', 'bar ind'), fill = el('div', 'fill');
        bar.appendChild(fill);
        const s = el('div', 's', 'Starting…');
        const acts = el('div', 'acts');
        const x = el('button', 'xbtn x'); x.appendChild(icon('x', 13)); x.title = 'Cancel';
        [top, bar, s, acts, x].forEach(n => c.appendChild(n));
        q.insertBefore(c, q.firstChild);
        const remove = () => { c.remove(); checkEmpty(); refreshMini(); renderHistory(); };
        refreshMini();
        return {
            // p: number = determinate, -1 = busy/unknown, null = leave the bar alone
            set: (txt, p, cls) => {
                s.textContent = txt;
                if (p === -1) { bar.classList.add('ind'); pc.textContent = ''; c._pct = null; }
                else if (p != null) { bar.classList.remove('ind'); fill.style.width = p + '%'; pc.textContent = Math.round(p) + '%'; c._pct = p; }
                if (cls) {
                    c.className = 'card ' + cls;
                    c.setAttribute('data-state', cls === 'ok' || cls === 'bad' ? cls : 'run');
                }
                refreshMini();
            },
            onCancel: fn => { x.onclick = fn; },
            done: () => { bar.classList.remove('ind'); x.title = 'Remove'; x.onclick = remove; refreshMini(); },
            action: (label, fn, ic) => { acts.appendChild(btn(label, ic, 'mini', fn)); },
            tag: id => c.setAttribute('data-hid', id),
            remove: remove
        };
    }

    $('#clear').onclick = e => {
        e.preventDefault();
        $$('#queue .card').filter(c => c.getAttribute('data-state') !== 'run').forEach(c => c.remove());
        checkEmpty(); renderHistory();
    };

    function showFile(file) {
        try { exec(process.platform === 'win32' ? 'explorer.exe /select,"' + file + '"' : 'open -R "' + file + '"'); } catch (e) {}
    }

    function split(r) {
        r = String(r);
        if (/EvalScript error/i.test(r)) return ['ERR', 'Premiere script not loaded. Close and reopen the panel.'];
        const i = r.indexOf('|');
        return i < 0 ? ['ERR', r] : [r.slice(0, i), r.slice(i + 1)];
    }

    // Import into the project, then (optionally) place at the playhead.
    async function importToPremiere(file, toTl, isAudio) {
        let k, m;
        for (let i = 0; i < 12; i++) {
            [k, m] = split(await ev('vibeImport(' + JSON.stringify(file) + ')'));
            if (k !== 'WAIT') break;
            await sleep(700);
        }
        if (k === 'WAIT') return { ok: false, msg: 'Premiere is still reading the file. Press Import again in a moment.' };
        if (k !== 'OK') return { ok: false, msg: m || 'Import failed' };
        let msg = m;
        if (toTl) {
            const [tk, tm] = split(await ev('vibePlace(' + JSON.stringify(file) + ',' + !!isAudio + ')'));
            if (tk !== 'OK') return { ok: false, msg: msg + ' · not placed: ' + tm };
            msg += ' · ' + tm;
        }
        return { ok: true, msg: msg };
    }

    // At most 2 downloads run at once; the rest wait their turn (parallel yt-dlp runs trigger stalls and rate limits).
    const maxPar = () => VPerf.parallel();   // 1 on weak PCs, 2 otherwise
    let active = 0;
    const waiting = [];
    // acquire() -> {p, cancel}: a queued download can be cancelled instantly (it leaves the line and its promise rejects).
    const acquire = () => {
        let entry = null, rejFn;
        const p = new Promise((res, rej) => { rejFn = rej; if (active < maxPar()) { active++; res(); } else { entry = { res: res }; waiting.push(entry); } });
        return { p: p, cancel: () => { if (!entry) return; const i = waiting.indexOf(entry); if (i >= 0) { waiting.splice(i, 1); entry = null; rejFn(new Error('Cancelled')); } } };
    };
    const release = () => { const n = waiting.shift(); if (n) n.res(); else active--; };

    async function start(info, row, opts) {
        let label = row.kind === 'audio' ? row.fmt.toUpperCase() : (row.kind === 'best' ? (row.maxH ? row.maxH + 'p' : 'Best') : resLabel(row.height) + (row.convert ? ' H.264' : ''));
        if (row.cut) label += ' \u00b7 cut ' + VTrim.fmt(row.cut.end - row.cut.start);
        const card = addCard(info.title, label);
        if (view !== 'downloads' && !(opts && opts.quiet)) { unseen++; renderBadge(); toast('Added to downloads', 'View', () => setView('downloads')); }
        const toTl = $('#tl').checked;
        const isAudio = row.kind === 'audio';
        let file, job = null, cancelled = false, holding = false;
        const fail = m => {
            status('');
            card.set('✗ ' + m, null, 'bad');
            card.action('Retry', () => { card.remove(); start(info, row); }, 'retry');
            card.done();
        };

        let cancelRej; const cancelP = new Promise((_, rej) => { cancelRej = rej; }); cancelP.catch(() => {});
        let aq = null;
        card.onCancel(() => { cancelled = true; cancelRej(new Error('Cancelled')); if (aq) aq.cancel(); if (job) job.cancel(); });
        const queued = active >= maxPar();
        card.set(queued ? 'Queued · waiting for a free slot…' : 'Preparing…', -1);
        let encRel = null;
        const needsEnc = !!(row.convert || row.cut);
        try {
            // Only one conversion/cut at a time: two heavy ffmpeg jobs together are what makes a PC lag.
            if (needsEnc) {
                const encP = VPerf.acquireEncode(() => card.set('Queued \u00b7 waiting for another conversion\u2026', -1));
                encP.then(rel => { if (cancelled) rel(); });   // slot arrived after a cancel: hand it straight back
                encRel = await Promise.race([encP, cancelP]);
            }
            aq = acquire();
            await aq.p;
            holding = true;
            if (cancelled) throw new Error('Cancelled');
            card.set('Preparing…', -1);
            await VT.prepare({ youtube: isYT(info.url), ffmpeg: row.kind !== 'video' || row.merge || row.convert || !!row.cut }, m => { card.set(m, -1); status(m); });
            if (cancelled) throw new Error('Cancelled');
            status('');
            card.set('Connecting…', -1);
            job = VT.download({ url: info.url, row: row, outDir: $('#dir').value, cookies: $('#cookies').value },
                { onProgress: (p, txt) => card.set(txt, p) });
            file = await job.promise;
        } catch (e) {
            if (holding) { holding = false; release(); }
            if (encRel) { encRel(); encRel = null; }
            return fail(e.message);
        }
        if (holding) { holding = false; release(); }
        if (encRel) { encRel(); encRel = null; }

        card.tag(histAdd({ title: info.title, label: label, file: file, audio: isAudio }));
        card.set('Saved · importing into Premiere…', 100);
        const run = async (tl) => {
            card.set('Importing into Premiere…', 100, 'run');
            const r = await importToPremiere(file, tl, isAudio);
            card.set((r.ok ? '✓ ' : '✗ ') + r.msg, 100, r.ok ? 'ok' : 'bad');
        };
        card.action('Show file', () => showFile(file), 'folder');
        card.action('Import', () => run(false), 'download');
        card.action('Add to timeline', () => run(true), 'layers');
        card.done();
        await run(toTl);
    }

    // Subtitle download: a small queue card, same look as media downloads. Needs yt-dlp (and FFmpeg for .srt).
    async function startSub(info, track, fmt) {
        const card = addCard(info.title, track.langLabel + (track.isAuto ? ' (auto)' : '') + ' · ' + fmt.toUpperCase());
        if (view !== 'downloads') { unseen++; renderBadge(); toast('Added to downloads', 'View', () => setView('downloads')); }
        let job = null, cancelled = false;
        card.onCancel(() => { cancelled = true; if (job) job.cancel(); });
        card.set('Preparing…', -1);
        let file;
        try {
            await VT.prepare({ youtube: true, ffmpeg: fmt === 'srt' }, m => { card.set(m, -1); status(m); });
            status('');
            if (cancelled) throw new Error('Cancelled');
            card.set('Fetching subtitles…', -1);
            job = VT.downloadSubtitle({ url: info.url, lang: track.lang, isAuto: track.isAuto, format: fmt, outDir: $('#dir').value, cookies: $('#cookies').value });
            file = await job.promise;
        } catch (e) {
            status('');
            card.set('✗ ' + e.message, null, 'bad');
            card.action('Retry', () => { card.remove(); startSub(info, track, fmt); }, 'retry');
            card.done();
            return;
        }
        card.tag(histAdd({ title: info.title, label: track.lang + ' ' + fmt.toUpperCase(), file: file, audio: false }));
        card.set('✓ Saved ' + path.basename(file), 100, 'ok');
        card.action('Show file', () => showFile(file), 'folder');
        card.action('Import', async () => {
            card.set('Importing into Premiere…', 100, 'run');
            const r = await importToPremiere(file, false, false);
            card.set((r.ok ? '✓ ' : '✗ ') + r.msg, 100, r.ok ? 'ok' : 'bad');
        }, 'download');
        card.done();
    }

    // ---------- go ----------
    // ---------- playlists & channels ----------
    const fmtDur = s => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + ('0' + m).slice(-2) : m) + ':' + ('0' + x).slice(-2); };

    async function openPlaylist(url) {
        $('#home').classList.add('hidden');
        heroVisible(false);
        const d = $('#detail');
        d.classList.remove('hidden'); d.textContent = '';
        d.appendChild(btn('Back', 'back', 'back', closeDetail));
        const body = el('div'); d.appendChild(body);
        $('#main').scrollTop = 0;
        const loading = el('div', 'msg');
        const lt = el('div', null, 'Reading the playlist\u2026');
        loading.appendChild(el('span', 'spin')); loading.appendChild(lt); body.appendChild(loading);
        try {
            await VT.prepare({ youtube: true }, m => { lt.textContent = m; status(m); });
            status('');
            const pl = await VT.getPlaylist(url, { cookies: $('#cookies').value });
            body.textContent = '';
            if (!pl.entries.length) { body.appendChild(msg('No videos found in this playlist.')); return; }
            renderPlaylist(body, pl);
        } catch (e) { status(''); body.textContent = ''; body.appendChild(msg(e.message, true)); }
    }

    function renderPlaylist(body, pl) {
        const total = pl.entries.length, sel = {};
        pl.entries.forEach((e, i) => { sel[i] = true; });
        body.appendChild(el('div', 'pltitle', pl.title));
        body.appendChild(el('div', 'dmeta', total + ' videos' + (pl.channel ? ' \u00b7 ' + pl.channel : '') + (pl.capped ? ' \u00b7 showing the first ' + total + ' of ' + pl.count : '')));

        const qsel = el('select', 'plq');
        [['fast', 'Premiere-ready (H.264, fast)'], ['1080', 'Up to 1080p'], ['720', 'Up to 720p'], ['mp3', 'Audio only (MP3)']].forEach(o => { const op = el('option', null, o[1]); op.value = o[0]; qsel.appendChild(op); });
        qsel.value = store.get('plq', 'fast');
        qsel.onchange = () => store.set('plq', qsel.value);
        body.appendChild(qsel);

        const list = el('div', 'pllist');
        body.appendChild(list);
        const bar = el('div', 'plbar');
        const allBtn = btn('All', 'check', 'ghost mini');
        const cnt = el('span', 'plcnt');
        const dl = btn('Download', 'download', null);
        bar.appendChild(allBtn); bar.appendChild(cnt); bar.appendChild(dl);
        body.appendChild(bar);

        const count = () => pl.entries.reduce((a, e, i) => a + (sel[i] ? 1 : 0), 0);
        const rows = [];
        const upd = () => {
            const c = count();
            cnt.textContent = c + ' of ' + total + ' selected';
            allBtn.lastChild.textContent = c === total ? 'None' : 'All';
            dl.lastChild.textContent = c ? 'Download ' + c : 'Download';
            dl.disabled = !c;
            rows.forEach((r, i) => r.classList.toggle('on', !!sel[i]));
        };
        pl.entries.forEach((e, i) => {
            const r = el('div', 'plrow on');
            const ck = el('span', 'plck'); ck.appendChild(icon('check', 12));
            const tw = el('div', 'plth');
            if (e.thumb) { const im = document.createElement('img'); im.src = e.thumb; tw.appendChild(im); }
            if (e.duration) tw.appendChild(el('span', 'dur', fmtDur(e.duration)));
            const tx = el('div', 'pltx');
            tx.appendChild(el('div', 'rt', e.title));
            if (e.channel) tx.appendChild(el('div', 'rs', e.channel));
            r.appendChild(ck); r.appendChild(tw); r.appendChild(tx);
            r.onclick = () => { sel[i] = !sel[i]; upd(); };
            list.appendChild(r); rows.push(r);
        });
        allBtn.onclick = () => { const v = count() !== total; pl.entries.forEach((e, k) => { sel[k] = v; }); upd(); };
        dl.onclick = () => {
            const picks = pl.entries.filter((e, i) => sel[i]);
            if (!picks.length) return;
            const q = qsel.value;
            const rowFor = e => q === 'mp3' ? { kind: 'audio', fmt: 'mp3', dur: e.duration }
                : q === 'fast' ? { kind: 'best', safe: true, tag: 'best-h264', dur: e.duration }
                : { kind: 'best', safe: true, maxH: +q, tag: q + 'p', dur: e.duration };
            picks.forEach(e => start({ url: e.url, title: e.title, thumb: e.thumb, durationSec: e.duration, site: 'YouTube' }, rowFor(e), { quiet: true }));
            setView('downloads');
            toast('Added ' + picks.length + ' video' + (picks.length > 1 ? 's' : '') + ' to downloads');
        };
        upd();
    }

    function go() {
        const q = $('#q').value.trim();
        if (!q) return;
        if (/^https?:\/\//i.test(q)) {
            const p = platformOf(q);
            if (p && p.id !== platform) { platform = p.id; store.set('platform', p.id); renderChips(); renderHero(); }
            if (VT.isPlaylistUrl(q)) return openPlaylist(q);
            return openDetail(q);
        }
        if (platform === 'youtube') return search(q);
        heroVisible(true);
        showHome(msg('That is not a link. Paste a ' + curPlatform().name + ' video link.', false, 'link'));
    }

    $('#go').onclick = go;
    $('#q').addEventListener('keydown', e => {
        if (e.key === 'Enter') go();
        if (e.key === 'Escape') { $('#q').value = ''; syncSearchBox(); showHome(); }
    });
    $('#q').addEventListener('input', syncSearchBox);
    $('#qclear').onclick = () => { $('#q').value = ''; syncSearchBox(); $('#q').focus(); showHome(); };
    // Press "/" anywhere to jump to the search box.
    document.addEventListener('keydown', e => {
        if (e.key === '/' && document.activeElement !== $('#q') && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) {
            e.preventDefault(); setView('search'); $('#q').focus();
        }
    });
    // Pasting a link straight into the box opens it right away (no need to press Go).
    $('#q').addEventListener('paste', e => {
        const t = ((e.clipboardData && e.clipboardData.getData('text')) || '').trim();
        if (isUrl(t)) { e.preventDefault(); $('#q').value = t; syncSearchBox(); go(); }
    });

    // Stock library (Pexels / Pixabay / Unsplash). The module draws its own UI into #stock-root.
    try {
        VStock.init({
            $: $, el: el, icon: icon, btn: btn, store: store, fmtSize: fmtSize, toast: toast, openUrl: openUrl,
            addCard: addCard, showFile: showFile, importToPremiere: importToPremiere, addHistory: histAdd,
            getDir: () => $('#dir').value,
            noteQueued: () => { if (view !== 'downloads') { unseen++; renderBadge(); toast('Added to downloads', 'View', () => setView('downloads')); } }
        });
    } catch (e) { try { console.error('Stock init failed', e); } catch (x) {} }

    checkEmpty();
    renderHistory();
    renderChips();
    renderHero();
    showHome();
    setTimeout(() => { try { VT.autoUpdate(); } catch (e) {} }, 4000);
})();

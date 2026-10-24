// Trim: the "Cut a section" card shown in the format picker.
// A filmstrip timeline (the video thumbnail repeated) with two draggable handles, a draggable selection,
// typed start/end times, quick presets and keyboard nudging. Returns {el, active(), frac(), range(), apply(row)}.
(function () {
    // 83 -> "1:23", 3725.5 -> "1:02:05.5"
    function fmt(t) {
        t = Math.max(0, Math.round((+t || 0) * 10) / 10);
        const w = Math.floor(t), d = Math.round((t - w) * 10);
        const h = Math.floor(w / 3600), m = Math.floor((w % 3600) / 60), s = w % 60;
        return (h ? h + ':' + ('0' + m).slice(-2) : String(m)) + ':' + ('0' + s).slice(-2) + (d ? '.' + d : '');
    }

    // "5", "5.5", "1:05", "1:05.5", "1:02:03" -> seconds (NaN if not a time)
    function parse(str) {
        str = String(str).trim().replace(',', '.');
        if (!str) return NaN;
        const p = str.split(':');
        if (p.length > 3) return NaN;
        let t = 0;
        for (let i = 0; i < p.length; i++) {
            const x = p[i].trim();
            if (!/^\d+(\.\d+)?$/.test(x)) return NaN;
            t = t * 60 + parseFloat(x);
        }
        return t;
    }

    // h: { el(tag, cls, txt), icon(name, size), onCommit() }
    function create(info, h) {
        const dur = +info.durationSec || 0;
        if (dur < 2 || info.live) return { el: null, active: () => false, frac: () => 1, range: () => null, apply: r => r };

        const el = h.el, MIN = Math.min(0.5, dur);
        let a = 0, b = Math.min(dur, 15), on = false, drag = null;

        const root = el('div', 'trim');

        // ----- header (click anywhere to toggle) -----
        const head = el('div', 'trim-head');
        const ic = el('div', 'ic'); ic.appendChild(h.icon('scissors', 16));
        const tl = el('div', 'tl');
        tl.appendChild(el('div', 'tt', 'Cut a section'));
        const sub = el('div', 'ts', 'Download only the part you need');
        tl.appendChild(sub);
        const sw = el('label', 'switch');
        const cb = document.createElement('input'); cb.type = 'checkbox';
        sw.appendChild(cb); sw.appendChild(document.createElement('i'));
        head.appendChild(ic); head.appendChild(tl); head.appendChild(sw);
        head.onclick = e => { if (sw.contains(e.target)) return; cb.checked = !cb.checked; toggle(); };
        cb.onchange = toggle;
        root.appendChild(head);

        // ----- body -----
        const body = el('div', 'trim-body hidden');

        const tk = el('div', 'tk');
        const strip = el('div', 'tk-strip');
        if (info.thumb) strip.style.backgroundImage = 'url(' + JSON.stringify(info.thumb) + ')';
        const dimL = el('div', 'tk-dim l'), dimR = el('div', 'tk-dim r'), sel = el('div', 'tk-sel');
        function handle(cls, label) {
            const n = el('div', 'hd ' + cls);
            n.tabIndex = 0;
            n.setAttribute('role', 'slider');
            n.setAttribute('aria-label', label);
            const tip = el('span', 'tip', '0:00'); n.appendChild(tip);
            n._tip = tip;
            return n;
        }
        const hdA = handle('a', 'Start time'), hdB = handle('b', 'End time');
        [strip, dimL, dimR, sel, hdA, hdB].forEach(n => tk.appendChild(n));
        body.appendChild(tk);

        const scale = el('div', 'tk-scale');
        scale.appendChild(el('span', null, '0:00'));
        scale.appendChild(el('span', null, fmt(dur)));
        body.appendChild(scale);

        const ins = el('div', 'tr-inputs');
        function field(label) {
            const f = el('div', 'tf');
            f.appendChild(el('label', null, label));
            const i = document.createElement('input'); i.type = 'text'; i.spellcheck = false; i.autocomplete = 'off';
            f.appendChild(i);
            return { box: f, input: i };
        }
        const fa = field('Start'), fb = field('End');
        const len = el('div', 'tlen'); const lenB = el('b', null, '0:00'); len.appendChild(lenB); len.appendChild(el('span', null, 'clip'));
        ins.appendChild(fa.box); ins.appendChild(len); ins.appendChild(fb.box);
        body.appendChild(ins);
        const inA = fa.input, inB = fb.input;

        const pre = el('div', 'tr-pre');
        function chip(label, fn) { const c = el('button', 'mini', label); c.onclick = fn; pre.appendChild(c); }
        chip('First 10s', () => { a = 0; b = Math.min(dur, 10); commit(); });
        chip('Last 10s', () => { b = dur; a = Math.max(0, dur - 10); commit(); });
        chip('Whole video', () => { a = 0; b = dur; commit(); });
        body.appendChild(pre);

        const note = el('div', 'tr-note');
        note.appendChild(h.icon('check', 13));
        note.appendChild(el('div', null, 'Frame-accurate. Only the selected part is downloaded.'));
        body.appendChild(note);
        root.appendChild(body);

        // ----- logic -----
        const pct = t => (t / dur * 100) + '%';
        const snap = t => Math.round(t * 10) / 10;
        const setA = t => { a = Math.max(0, Math.min(snap(t), b - MIN)); };
        const setB = t => { b = Math.min(dur, Math.max(snap(t), a + MIN)); };
        function tAt(x) { const r = tk.getBoundingClientRect(); return Math.max(0, Math.min(dur, (x - r.left) / (r.width || 1) * dur)); }

        function layout() {
            dimL.style.width = pct(a);
            dimR.style.width = (100 - b / dur * 100) + '%';
            sel.style.left = pct(a); sel.style.width = ((b - a) / dur * 100) + '%';
            hdA.style.left = pct(a); hdB.style.left = pct(b);
            hdA._tip.textContent = fmt(a); hdB._tip.textContent = fmt(b);
            hdA.setAttribute('aria-valuenow', a); hdB.setAttribute('aria-valuenow', b);
            lenB.textContent = fmt(b - a);
            if (document.activeElement !== inA) inA.value = fmt(a);
            if (document.activeElement !== inB) inB.value = fmt(b);
            sub.textContent = on ? fmt(a) + ' \u2192 ' + fmt(b) + ' \u00b7 ' + fmt(b - a) + ' clip' : 'Download only the part you need';
        }
        // commit = a change is finished: refresh sizes in the format list
        function commit() { layout(); if (h.onCommit) h.onCommit(); }
        function toggle() {
            on = cb.checked;
            root.classList.toggle('on', on);
            body.classList.toggle('hidden', !on);
            commit();
        }

        function startDrag(kind, e) {
            e.preventDefault(); e.stopPropagation();
            drag = { kind: kind, x0: e.clientX, a0: a, b0: b };
            if (kind === 'a') hdA.classList.add('drag');
            if (kind === 'b') hdB.classList.add('drag');
            sel.classList.toggle('drag', kind === 'm');
        }
        hdA.addEventListener('mousedown', e => startDrag('a', e));
        hdB.addEventListener('mousedown', e => startDrag('b', e));
        sel.addEventListener('mousedown', e => startDrag('m', e));
        // click on the dimmed track: jump the nearest handle there and keep dragging it
        tk.addEventListener('mousedown', e => {
            if (e.target.classList.contains('hd') || e.target === sel) return;
            const t = tAt(e.clientX), k = Math.abs(t - a) < Math.abs(t - b) ? 'a' : 'b';
            if (k === 'a') setA(t); else setB(t);
            layout();
            startDrag(k, e);
        });
        window.addEventListener('mousemove', e => {
            if (!drag) return;
            if (drag.kind === 'a') setA(tAt(e.clientX));
            else if (drag.kind === 'b') setB(tAt(e.clientX));
            else {
                const r = tk.getBoundingClientRect(), L = drag.b0 - drag.a0;
                const na = Math.max(0, Math.min(dur - L, drag.a0 + (e.clientX - drag.x0) / (r.width || 1) * dur));
                a = snap(na); b = Math.min(dur, snap(a + L)); a = Math.max(0, snap(b - L));
            }
            layout();
        });
        window.addEventListener('mouseup', () => {
            if (!drag) return;
            drag = null;
            hdA.classList.remove('drag'); hdB.classList.remove('drag'); sel.classList.remove('drag');
            commit();
        });

        // keyboard: arrows nudge 1s, Shift = 10s, Alt = 0.1s
        function key(which) {
            return e => {
                const dir = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
                if (!dir) return;
                e.preventDefault();
                const step = (e.shiftKey ? 10 : e.altKey ? 0.1 : 1) * dir;
                if (which === 'a') setA(a + step); else setB(b + step);
                commit();
            };
        }
        hdA.addEventListener('keydown', key('a'));
        hdB.addEventListener('keydown', key('b'));

        // typed times
        function typed(which) {
            return () => {
                const t = parse(which === 'a' ? inA.value : inB.value);
                if (isNaN(t)) return layout();
                if (which === 'a') { a = Math.max(0, Math.min(snap(t), dur - MIN)); if (b < a + MIN) b = Math.min(dur, a + MIN); }
                else { b = Math.min(dur, Math.max(snap(t), MIN)); if (a > b - MIN) a = Math.max(0, b - MIN); }
                commit();
            };
        }
        [['a', inA], ['b', inB]].forEach(p => {
            p[1].addEventListener('change', typed(p[0]));
            p[1].addEventListener('keydown', e => { if (e.key === 'Enter') p[1].blur(); });
            p[1].addEventListener('focus', () => p[1].select());
        });

        layout();

        return {
            el: root,
            active: () => on,
            frac: () => (on ? (b - a) / dur : 1),
            range: () => (on ? { start: a, end: b } : null),
            // Attach the selected range (and the scaled size estimate) to a download row.
            apply: row => (on ? Object.assign({}, row, { cut: { start: a, end: b }, size: row.size ? row.size * (b - a) / dur : row.size }) : row)
        };
    }

    window.VTrim = { create: create, fmt: fmt, parse: parse };
})();

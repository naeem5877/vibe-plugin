// Download runner: real byte-based progress, stage messages, 2-stream (video+audio) aware.
(function () {
    const fs = require('fs');
    const path = require('path');
    const { spawn, execFile } = require('child_process');
    const I = window.VT._int;
    const WIN = process.platform === 'win32';

    const num = s => { const n = parseFloat(s); return isNaN(n) ? 0 : n; };
    function fmtSpeed(b) {
        if (!b) return '';
        const u = ['B/s', 'KB/s', 'MB/s', 'GB/s']; let i = 0;
        while (b >= 1024 && i < 3) { b /= 1024; i++; }
        return b.toFixed(i > 1 ? 1 : 0) + ' ' + u[i];
    }
    function fmtEta(s) {
        if (!s || s < 0) return '';
        s = Math.round(s);
        return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
    }
    function newestFile(dir) {
        let best = null, t = 0;
        fs.readdirSync(dir).forEach(n => {
            const p = path.join(dir, n);
            const s = fs.statSync(p);
            if (s.isFile() && !/\.(part|ytdl|temp)$/i.test(n) && s.mtimeMs > t) { t = s.mtimeMs; best = p; }
        });
        return best;
    }

    // o: {url,row,outDir,cookies}   cb: {onProgress(pct, text)}   pct === -1 means "busy, unknown"
    function download(o, cb) {
        fs.mkdirSync(o.outDir, { recursive: true });
        const row = o.row;
        let tag = row.kind === 'audio' ? row.fmt + (row.langTag ? ' ' + row.langTag : '') : (row.tag || 'best');
        if (row.cut) {
            const nm = t => { const x = Math.round(t); return (x >= 3600 ? Math.floor(x / 3600) + 'h' : '') + Math.floor((x % 3600) / 60) + 'm' + ('0' + (x % 60)).slice(-2) + 's'; };
            tag += ' cut ' + nm(row.cut.start) + '-' + nm(row.cut.end);
        }
        const args = I.commonArgs(o).concat([
            '--no-simulate', '--no-quiet', '--newline', '--progress', '--windows-filenames', '--ffmpeg-location', I.BIN_DIR,
            '-o', path.join(o.outDir, '%(title).100B [%(id)s] ' + tag + '.%(ext)s'),
            '--progress-template', 'download:VPP %(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s|%(progress.filename)s',
            '--print', 'after_move:VPF %(filepath)s'
        ]);

        let streams = 1;
        if (row.kind === 'audio') {
            // row.audioTrack: a chosen audio language (format id, or a language selector from the fast path)
            args.push('-f', row.audioTrack ? row.audioTrack + '/ba/b' : 'ba/b', '-x', '--audio-format', row.fmt, '--audio-quality', '0');
        } else if (row.kind === 'best') {
            // safe: prefer H.264 video + AAC audio (imports into Premiere without conversion); fall back to the overall best.
            const hh = row.maxH ? '[height<=' + row.maxH + ']' : '';   // playlist downloads cap the resolution
            const sel = row.safe
                ? 'bv*' + hh + '[vcodec^=avc1]+' + (row.audioId || 'ba[acodec^=mp4a]') + '/bv*' + hh + '[vcodec^=avc1]+ba/bv*' + hh + '+ba/b' + hh + '/b'
                : 'bv*' + hh + '+' + (row.audioId || 'ba') + '/b' + hh + '/b';
            args.push('-f', sel, '--merge-output-format', 'mp4');
            streams = 2;
        } else if (row.merge) {
            args.push('-f', row.formatId + '+' + (row.audioId || 'ba') + '/' + row.formatId + '+ba', '--merge-output-format', 'mp4');
            streams = 2;
        } else {
            args.push('-f', row.formatId);
        }
        // VP9/AV1 -> H.264 + AAC in MP4, which Premiere imports without trouble.
        // Merge + encode happen in ONE ffmpeg pass (no intermediate MKV, no second encode), and "veryfast" is ~3x quicker
        // than "fast" at similar quality. Cuts are already re-encoded to H.264 by yt-dlp, so they skip this.
        const ENC = window.VPerf.enc();   // preset/threads chosen for this PC (see perf.js)
        if (row.convert && !row.cut) {
            if (row.merge) args.push('--postprocessor-args', 'Merger+ffmpeg:' + ENC);
            else args.push('--recode-video', 'mp4', '--postprocessor-args', 'VideoConvertor:' + ENC);
        }
        if (row.cut) {
            // download only the selected part; --force-keyframes-at-cuts makes the cut frame-accurate (re-encodes to H.264/AAC)
            const hms = t => { const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t - h * 3600 - m * 60; return ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2) + ':' + (x < 10 ? '0' : '') + x.toFixed(3); };
            args.push('--download-sections', '*' + hms(row.cut.start) + '-' + hms(row.cut.end), '--force-keyframes-at-cuts', '--downloader-args', 'ffmpeg_o:' + window.VPerf.cutArgs());
        }
        args.push(o.url);

        const child = spawn(I.YTDLP, args, {
            windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
            env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' })
        });

        let file = null, errTail = '', buf = '', cancelled = false;
        let finished = 0, cur = 0, curTotal = 0, curFile = null, stage = 0, post = false;
        let lastEmit = 0, lastLine = Date.now();

        function emit(pct, text, force) {
            const t = Date.now();
            if (!force && t - lastEmit < 150) return;
            lastEmit = t;
            cb.onProgress(pct, text);
        }

        function line(l) {
            l = l.replace(/\u001b\[[0-9;]*m/g, '').trim();
            if (!l) return;
            lastLine = Date.now();

            if (l.indexOf('VPP ') === 0) {
                const p = l.slice(4).split('|');
                const fn = p.slice(5).join('|');
                if (fn !== curFile) { if (curFile) finished += cur; curFile = fn; stage++; cur = 0; curTotal = 0; }
                cur = num(p[0]);
                curTotal = num(p[1]) || num(p[2]) || curTotal;
                const expected = streams > 1 ? Math.max(row.size || 0, finished + curTotal) : (curTotal || row.size || 0);
                const pct = expected ? Math.min(99, (finished + cur) / expected * 100) : 0;
                const what = streams > 1 ? (stage <= 1 ? 'Video' : 'Audio') : 'Downloading';
                const spd = fmtSpeed(num(p[3])), eta = fmtEta(num(p[4]));
                emit(pct, what + ' · ' + Math.round(pct) + '%' + (spd ? ' · ' + spd : '') + (eta ? ' · ' + eta + ' left' : ''));
            } else if (l.indexOf('VPF ') === 0) {
                file = l.slice(4);
            } else if (l.indexOf('[Merger]') === 0) {
                post = true;
                emit(row.convert && !row.cut ? (row.dur ? 0 : -1) : 99, row.convert && !row.cut ? 'Converting to H.264\u2026' : 'Merging video + audio\u2026', true);
            } else if (/^\[(ExtractAudio|VideoConvertor)\]/.test(l)) {
                post = true;
                emit(row.convert ? (row.dur ? 0 : -1) : 99, row.convert ? 'Converting to H.264\u2026' : 'Converting\u2026', true);
            } else if (/Solving JS challenges/i.test(l)) {
                emit(-1, 'Solving YouTube challenge…', true);
            } else if (/Downloading \d+ time ranges?/i.test(l)) {
                emit(-1, 'Cutting section\u2026', true);
            } else if (/Downloading \d+ format/i.test(l)) {
                emit(-1, 'Starting download…', true);
            } else if (/^\[(?!download|info|Merger|ExtractAudio|VideoConvertor|Fixup)[^\]]+\]/.test(l)) {
                emit(-1, 'Connecting…', true);
            }
        }

        child.stdout.setEncoding('utf8');
        child.stdout.on('data', d => {
            buf += d;
            const parts = buf.split(/\r?\n|\r/);
            buf = parts.pop();
            parts.forEach(line);
        });
        child.stderr.setEncoding('utf8');
        let errBuf = '', lowered = false;
        child.stderr.on('data', d => {
            lastLine = Date.now(); errTail = (errTail + d).slice(-800);
            const total = row.cut ? row.cut.end - row.cut.start : (row.convert && row.dur ? row.dur : 0);
            if (!total) return;
            // while cutting, yt-dlp hands the work to ffmpeg, which only reports progress on stderr ("time=00:00:03.20 speed=2.1x")
            errBuf += d;
            const parts = errBuf.split(/\r|\n/); errBuf = parts.pop();
            parts.forEach(l => {
                const m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(l);
                if (!m) return;
                if (!lowered) { lowered = true; window.VPerf.lowerFfmpeg(I.BIN_DIR); }   // ffmpeg is running now: give Premiere priority
                const done = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
                const pct = Math.max(0, Math.min(99, done / Math.max(0.1, total) * 100));
                const sp = /speed=\s*([\d.]+)x/.exec(l);
                emit(pct, (row.cut ? 'Cutting' : 'Converting to H.264') + ' \u00b7 ' + Math.round(pct) + '%' + (sp ? ' \u00b7 ' + sp[1] + 'x' : '') + (sp && +sp[1] > 0 && pct > 2 && fmtEta((total - done) / +sp[1]) ? ' \u00b7 ' + fmtEta((total - done) / +sp[1]) + ' left' : ''));
            });
        });

        const watchdog = setInterval(() => {
            if (!post && Date.now() - lastLine > 45000) emit(-1, 'Waiting for the server… still trying', true);
        }, 5000);

        const promise = new Promise((resolve, reject) => {
            child.on('error', e => { clearInterval(watchdog); reject(e); });
            child.on('close', code => {
                clearInterval(watchdog);
                if (buf) line(buf);
                if (cancelled) return reject(new Error('Cancelled'));
                if (code !== 0) {
                    const errLines = errTail.split(/\r?\n/).filter(l => l && !/^WARNING/.test(l));
                    const m = errLines.pop() || ('yt-dlp exited with code ' + code);
                    return reject(new Error(m.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?/, '')));
                }
                if (!file || !fs.existsSync(file)) file = newestFile(o.outDir);
                file ? resolve(file) : reject(new Error('Download finished but the file was not found'));
            });
        });

        return {
            promise: promise,
            cancel: function () {
                cancelled = true;
                if (WIN) execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
                else child.kill('SIGTERM');
            }
        };
    }

    window.VT.download = download;

    // ---------- subtitles ----------
    // o: {url, lang, isAuto, format: 'srt'|'vtt', outDir, cookies}   -> { promise: Promise<filePath>, cancel() }
    // The caption file is always written by yt-dlp (same as the desktop app). `--write-subs` is author-uploaded tracks and
    // `--write-auto-subs` is YouTube's generated ones; passing both would write two files for one language.
    // Machine-translated languages answer HTTP 429 intermittently and the 429 clears in seconds, so it retries with backoff.
    function downloadSubtitle(o) {
        fs.mkdirSync(o.outDir, { recursive: true });
        const srt = o.format !== 'vtt';
        const args = I.commonArgs(o).concat([
            '--skip-download', '--windows-filenames', '--ffmpeg-location', I.BIN_DIR,
            o.isAuto ? '--write-auto-subs' : '--write-subs', '--sub-langs', o.lang,
            // any published caption format can be converted, so accept what the track really offers
            '--sub-format', srt ? 'vtt/srt/best' : 'vtt'
        ]);
        if (srt) args.push('--convert-subs', 'srt');
        args.push('-o', path.join(o.outDir, '%(title).100B [%(id)s].%(ext)s'), o.url);

        const ATTEMPTS = 3;
        let child = null, cancelled = false;
        const startedAt = Date.now() - 1000;     // fs mtime granularity; a file from an earlier run must not pass for this one
        const wait = ms => new Promise(r => setTimeout(r, ms));

        function attempt() {
            return new Promise((resolve, reject) => {
                child = execFile(I.YTDLP, args, { windowsHide: true, maxBuffer: 1 << 25, cwd: o.outDir,
                    env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' }) }, (err, so, se) => err ? reject(new Error(se || err.message)) : resolve());
            });
        }
        function findFresh() {
            const re = new RegExp('\\.' + o.lang.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.(srt|vtt)$', 'i');
            let best = null, t = 0;
            fs.readdirSync(o.outDir).forEach(n => {
                if (!re.test(n)) return;
                const p = path.join(o.outDir, n);
                try { const m = fs.statSync(p).mtimeMs; if (m >= startedAt && m >= t) { t = m; best = p; } } catch (e) {}
            });
            return best;
        }

        const promise = (async () => {
            for (let i = 1; i <= ATTEMPTS; i++) {
                if (cancelled) throw new Error('Cancelled');
                let stderr = '';
                try { await attempt(); }
                catch (e) {
                    if (cancelled) throw new Error('Cancelled');
                    stderr = String(e.message || '');
                    const throttled = /429|Too Many Requests/i.test(stderr);
                    if (i < ATTEMPTS) { await wait(2500 * i); continue; }
                    const detail = (stderr.split(/\r?\n/).filter(l => /ERROR/.test(l))[0] || '').replace(/^ERROR:\s*(\[[^\]]+\]\s*)?/, '').trim().slice(0, 200);
                    throw new Error(throttled ? 'YouTube is rate-limiting caption downloads right now. Wait a minute and try "' + o.lang + '" again.'
                        : 'Could not download the ' + o.lang + ' subtitles: ' + (detail || 'unknown error'));
                }
                // yt-dlp exits 0 and writes nothing when the track does not exist, so success is "a fresh file appeared".
                const found = findFresh();
                if (found) return found;
                if (i < ATTEMPTS) await wait(2500 * i);
            }
            throw new Error('No ' + o.lang + ' subtitle file was produced. YouTube may be throttling captions, try again shortly.');
        })();

        return {
            promise: promise,
            cancel: function () {
                cancelled = true;
                if (child) {
                    if (WIN) execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
                    else child.kill('SIGTERM');
                }
            }
        };
    }
    window.VT.downloadSubtitle = downloadSubtitle;
})();

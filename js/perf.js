// Perf: picks conversion settings that fit THIS PC, so Premiere stays smooth on low-, mid- and high-end machines.
//  - threads: leaves CPU cores free for Premiere and the panel (ffmpeg used every core before)
//  - preset:  faster presets on weaker CPUs
//  - one conversion/cut at a time, fewer parallel downloads on weak PCs
//  - ffmpeg runs at "below normal" priority, so Premiere always wins the CPU
//  - calmer visuals (no looping animations) on low-end machines
(function () {
    const os = require('os');
    const path = require('path');
    const { execFile } = require('child_process');
    const WIN = process.platform === 'win32';

    const cores = Math.max(1, (os.cpus() || []).length || 4);   // logical processors
    const ramGB = os.totalmem() / 1073741824;

    const PROFILES = {
        low:  { name: 'Gentle',   preset: 'superfast', crf: 21, par: 1, threads: c => Math.min(4, Math.max(1, Math.floor(c / 2))) },     // half the cores, never more than 4
        mid:  { name: 'Balanced', preset: 'veryfast',  crf: 19, par: 2, threads: c => Math.min(8, Math.max(2, Math.floor(c * 0.65))) },  // ~2/3 of the cores, max 8
        high: { name: 'Fast',     preset: 'veryfast',  crf: 18, par: 2, threads: c => Math.min(16, Math.max(2, c - 2)) },
        max:  { name: 'Maximum',  preset: 'veryfast',  crf: 18, par: 2, threads: c => Math.min(32, c) }
    };
    const MODE_TIER = { gentle: 'low', balanced: 'mid', fast: 'high', max: 'max' };

    function mode() { try { return localStorage.getItem('vp_perf') || 'auto'; } catch (e) { return 'auto'; } }
    function autoTier() {
        if (cores <= 4 || ramGB < 9) return 'low';          // an "8 GB" PC reports ~7.4-7.9 GB usable
        if (cores < 12 || ramGB < 17) return 'mid';          // a "16 GB" PC reports ~14-15.9 GB usable
        return 'high';
    }
    function tier() { const m = mode(); return m === 'auto' ? autoTier() : (MODE_TIER[m] || autoTier()); }
    function profile() {
        const t = tier(), p = PROFILES[t];
        return { tier: t, name: p.name, preset: p.preset, crf: p.crf, par: p.par, threads: p.threads(cores) };
    }

    // Full video+audio settings for VP9/AV1 -> H.264 + AAC (Premiere-friendly)
    function enc() {
        const p = profile();
        return '-c:v libx264 -preset ' + p.preset + ' -crf ' + p.crf + ' -threads ' + p.threads +
            ' -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart';
    }
    // Output args for yt-dlp's own ffmpeg call used when cutting a section
    function cutArgs() { const p = profile(); return '-preset ' + p.preset + ' -crf ' + p.crf + ' -threads ' + p.threads; }
    function parallel() { return profile().par; }

    // Only one heavy conversion/cut at a time (two together is what makes a PC lag).
    let encBusy = false;
    const encWait = [];
    function acquireEncode(onWait) {
        return new Promise(resolve => {
            const grant = () => {
                let done = false;
                resolve(() => { if (done) return; done = true; const n = encWait.shift(); if (n) n(); else encBusy = false; });
            };
            if (!encBusy) { encBusy = true; grant(); }
            else { if (onWait) onWait(); encWait.push(grant); }
        });
    }

    // Put every ffmpeg from our tools folder at "below normal" priority: Premiere keeps the CPU when both want it.
    function lowerFfmpeg(binDir) {
        try {
            const exe = path.join(binDir, WIN ? 'ffmpeg.exe' : 'ffmpeg');
            if (WIN) {
                const ps = "Get-Process -Name ffmpeg -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '" + exe.replace(/'/g, "''") +
                    "' } | ForEach-Object { $_.PriorityClass = 'BelowNormal' }";
                execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true }, () => {});
            } else {
                execFile('sh', ['-c', "renice 10 $(pgrep -f '" + exe.replace(/'/g, '') + "') >/dev/null 2>&1"], () => {});
            }
        } catch (e) {}
    }

    function info() {
        const p = profile(), auto = mode() === 'auto';
        return (auto ? 'Auto picked ' : 'Using ') + '\u201c' + p.name + '\u201d for this PC (' + cores + ' threads, ' + Math.round(ramGB) + ' GB RAM). ' +
            'Conversions use ' + p.threads + ' thread' + (p.threads > 1 ? 's' : '') + ' at low priority, so Premiere stays smooth.';
    }

    // Calmer visuals on slower PCs: no looping animations (CSS: body.lite)
    function applyUi() {
        try { document.body.classList.toggle('lite', tier() === 'low'); } catch (e) {}
    }
    function setMode(m) { try { localStorage.setItem('vp_perf', m); } catch (e) {} applyUi(); }

    window.VPerf = { mode: mode, setMode: setMode, profile: profile, enc: enc, cutArgs: cutArgs, parallel: parallel,
        acquireEncode: acquireEncode, lowerFfmpeg: lowerFfmpeg, info: info, applyUi: applyUi, cores: cores, ramGB: ramGB };
})();

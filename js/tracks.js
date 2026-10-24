// Tracks: subtitle + audio-language discovery from a yt-dlp-shaped payload (same logic as the desktop app's
// subtitles.ts / audioTracks.ts). Works for both the InnerTube fast path and a real yt-dlp --dump-single-json.
(function () {
    // Codes Intl.DisplayNames cannot name (it resolves most, but not these).
    const UNLABELLED = {
        ab: 'Abkhaz', aa: 'Afar', ba: 'Bashkir', dz: 'Dzongkha', fj: 'Fijian', gaa: 'Ga', iu: 'Inuktitut',
        kl: 'Kalaallisut', kha: 'Khasi', lua: 'Luba-Lulua', luo: 'Luo', gv: 'Manx', mfe: 'Mauritian Creole',
        new: 'Nepal Bhasa', os: 'Ossetian', pam: 'Pampanga', rn: 'Rundi', sg: 'Sango', crs: 'Cree', ss: 'Swati',
        bo: 'Tibetan', tum: 'Tumbuka', ve: 'Venda', war: 'Waray'
    };
    // Small fallback for panels whose Chromium has no Intl.DisplayNames (older CEP runtimes).
    const COMMON = {
        en: 'English', 'en-US': 'American English', 'en-GB': 'British English', es: 'Spanish', 'es-419': 'Latin American Spanish',
        fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', 'pt-BR': 'Brazilian Portuguese', ru: 'Russian',
        ja: 'Japanese', ko: 'Korean', 'zh-Hans': 'Simplified Chinese', 'zh-Hant': 'Traditional Chinese', zh: 'Chinese',
        ar: 'Arabic', hi: 'Hindi', bn: 'Bangla', tr: 'Turkish', nl: 'Dutch', pl: 'Polish', id: 'Indonesian', th: 'Thai',
        vi: 'Vietnamese', uk: 'Ukrainian', sv: 'Swedish', fa: 'Persian', ur: 'Urdu', ta: 'Tamil', te: 'Telugu'
    };
    let dn = null;
    try { dn = typeof Intl !== 'undefined' && Intl.DisplayNames ? new Intl.DisplayNames(['en'], { type: 'language' }) : null; } catch (e) { dn = null; }

    function languageLabel(lang) {
        if (!lang) return '';
        if (UNLABELLED[lang]) return UNLABELLED[lang];
        if (dn) {
            try {
                const n = dn.of(lang);
                if (n && n.toLowerCase() !== String(lang).toLowerCase()) return n;
            } catch (e) { /* not a well-formed tag */ }
        }
        return COMMON[lang] || lang;
    }

    // ---------- subtitles ----------
    // One entry per published caption track. Author-uploaded ("manual") and YouTube-generated ("auto") tracks of the
    // same language are different files, so both are listed.
    function buildSubtitleList(raw) {
        const out = [];
        function collect(dict, isAuto) {
            Object.keys(dict || {}).forEach(lang => {
                if (/live_chat/i.test(lang)) return;
                const name = languageLabel(lang);
                out.push({ key: (isAuto ? 'auto:' : 'manual:') + lang, lang: lang, langLabel: name, label: isAuto ? name + ' (auto)' : name, isAuto: isAuto });
            });
        }
        collect(raw && raw.subtitles, false);
        collect(raw && raw.automatic_captions, true);
        return out.sort((a, b) => a.langLabel.localeCompare(b.langLabel) || a.lang.localeCompare(b.lang) || (a.isAuto - b.isAuto));
    }

    // ---------- audio languages ----------
    const codecRank = a => /^mp4a/i.test(a) ? 0 : /opus/i.test(a) ? 1 : 2;      // AAC first: MP4 merge needs no re-encode
    const bitrate = f => Math.round(Number(f.abr != null ? f.abr : f.tbr) || 0);
    function isAudioOnly(f) {
        if (!f || typeof f !== 'object') return false;
        if (f.protocol && f.protocol !== 'https') return false;          // HLS variants cannot be paired with a chosen video
        if (!f.format_id || f.vcodec !== 'none') return false;
        if (!f.acodec || f.acodec === 'none') return false;
        return !!(f.language && typeof f.language === 'string');
    }
    const isOriginal = f => Number(f.language_preference) >= 0 || /\boriginal\b|\bdefault\b/i.test(String(f.format_note || ''));

    function bestFormat(formats, lang) {
        const c = formats.filter(f => isAudioOnly(f) && f.language === lang);
        let best = null;
        c.forEach(f => {
            if (!best || codecRank(f.acodec) < codecRank(best.acodec) || (codecRank(f.acodec) === codecRank(best.acodec) && bitrate(f) > bitrate(best))) best = f;
        });
        return best;
    }

    // Empty unless the video publishes MORE than one audio language (so the picker stays hidden for normal videos).
    function buildAudioTrackList(raw) {
        const formats = Array.isArray(raw && raw.formats) ? raw.formats : [];
        const seen = {}, langs = [];
        formats.filter(isAudioOnly).forEach(f => { if (!seen[f.language]) { seen[f.language] = 1; langs.push(f.language); } });
        if (langs.length < 2) return [];
        const tracks = [];
        langs.forEach(lang => {
            const f = bestFormat(formats, lang);
            if (!f) return;
            tracks.push({
                key: 'audio:' + lang, lang: lang, langLabel: languageLabel(lang), isOriginal: isOriginal(f),
                // a selector when the fast path supplied one, else the yt-dlp format id
                formatId: String(f.vibe_selector || f.format_id), ext: String(f.ext || ''), acodec: String(f.acodec || ''), abr: bitrate(f)
            });
        });
        if (tracks.length < 2) return [];
        return tracks.sort((a, b) => (Number(b.isOriginal) - Number(a.isOriginal)) || a.langLabel.localeCompare(b.langLabel));
    }

    window.VTracks = { languageLabel: languageLabel, buildSubtitleList: buildSubtitleList, buildAudioTrackList: buildAudioTrackList };
})();

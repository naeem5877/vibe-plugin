// Live check for js/innertube.js + js/tracks.js (plain Node, no Premiere needed).
//   node test-innertube.js [videoId ...]
const store = {};
global.window = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
require('./js/tracks.js');
require('./js/innertube.js');
const { VInnerTube, VTracks } = global.window;

const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['dQw4w9WgXcQ', 'DV9pVzqQPR0'];
(async () => {
    console.log('parseVideoId:', VInnerTube.parseVideoId('https://youtu.be/dQw4w9WgXcQ'), VInnerTube.parseVideoId('https://example.com/watch?v=dQw4w9WgXcQ'));
    for (const id of ids) {
        for (const pass of ['cold', 'warm']) {
            const t = Date.now();
            const raw = await VInnerTube.resolve(id);
            const ms = Date.now() - t;
            if (!raw) { console.log(`${id} [${pass}] declined after ${ms}ms`); continue; }
            const subs = VTracks.buildSubtitleList(raw), audio = VTracks.buildAudioTrackList(raw);
            console.log(`${id} [${pass}] ${ms}ms | "${raw.title}" | ${raw.duration_string} | ${raw.formats.length} formats | cat=${JSON.stringify(raw.categories)}`);
            if (pass === 'warm') {
                console.log(`   subtitles: ${subs.length} (${subs.filter(s => !s.isAuto).length} creator) e.g. ${subs.slice(0, 3).map(s => s.label).join(', ')}`);
                console.log(`   audio languages: ${audio.length ? audio.map(a => a.langLabel + (a.isOriginal ? '*' : '') + ' -> ' + a.formatId).join(' | ') : '(single track, picker hidden)'}`);
            }
        }
    }
})();

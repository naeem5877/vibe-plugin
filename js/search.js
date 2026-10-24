// Search: clone of the InnerTube "search" call (WEB client). Uses Node https so CORS never applies.
(function () {
    const https = require('https');

    function text(o) {
        if (!o) return '';
        return o.simpleText || (o.runs || []).map(r => r.text).join('');
    }

    function ytSearch(query) {
        return new Promise((resolve, reject) => {
            const body = JSON.stringify({
                context: { client: { clientName: 'WEB', clientVersion: '2.20250925.01.00', hl: 'en', gl: 'US' } },
                query: query,
                params: 'EgIQAQ==' // filter: videos only
            });
            const req = https.request({
                hostname: 'www.youtube.com',
                path: '/youtubei/v1/search?prettyPrint=false',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Origin': 'https://www.youtube.com',
                    'Accept-Language': 'en-US,en;q=0.9'
                },
                timeout: 10000
            }, res => {
                let data = '';
                res.setEncoding('utf8');
                res.on('data', c => data += c);
                res.on('end', () => {
                    try {
                        if (res.statusCode !== 200) return reject(new Error('YouTube search HTTP ' + res.statusCode));
                        const j = JSON.parse(data);
                        const sections = j.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents;
                        const out = [];
                        sections.forEach(s => {
                            ((s.itemSectionRenderer || {}).contents || []).forEach(c => {
                                const v = c.videoRenderer;
                                if (!v) return;
                                out.push({
                                    id: v.videoId,
                                    title: text(v.title),
                                    channel: text(v.ownerText),
                                    duration: text(v.lengthText) || 'LIVE',
                                    views: text(v.viewCountText),
                                    thumb: 'https://i.ytimg.com/vi/' + v.videoId + '/mqdefault.jpg',
                                    url: 'https://www.youtube.com/watch?v=' + v.videoId
                                });
                            });
                        });
                        resolve(out);
                    } catch (e) { reject(new Error('Could not read search results')); }
                });
            });
            req.on('timeout', () => { req.destroy(); reject(new Error('Search timed out')); });
            req.on('error', reject);
            req.write(body);
            req.end();
        });
    }

    window.ytSearch = ytSearch;
})();

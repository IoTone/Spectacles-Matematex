// serve.js — Static server for the reference page, plus a POST /save endpoint
// so the browser can write its measurements straight to disk.
//
//   node test/layout-conformance/serve.js [port]
//
// Then open http://localhost:8777/ in Chrome. The page renders the formulas,
// measures them, and POSTs the result to reference.json. No copy-paste.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.argv[2] || '8777', 10);
const ROOT = path.join(__dirname, 'reference'); // where index.html / katex.* / fonts live
const SAVE_TO = path.join(__dirname, 'reference.json');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
};

http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/save') {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
            fs.writeFileSync(SAVE_TO, body);
            let n = '?';
            try { n = String(JSON.parse(body).formulas.length); } catch (e) { /* ignore */ }
            console.log(`saved reference.json (${body.length} bytes, ${n} formulas)`);
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('ok');
        });
        return;
    }

    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel === '/') rel = '/index.html';
    // Resolve through the symlinked fonts/ dir too.
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('no'); return; }

    fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found: ' + rel); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
    });
}).listen(PORT, () => {
    console.log(`layout-conformance reference server on http://localhost:${PORT}/`);
    console.log('open that URL in Chrome; it will POST reference.json back here.');
});

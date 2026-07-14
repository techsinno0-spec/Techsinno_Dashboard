const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 4280;
const API_BASE = 'http://localhost:7071';
const WEB_DIR = path.join(__dirname, 'web');

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);

  if (parsed.pathname.startsWith('/api/')) {
    const proxyUrl = API_BASE + parsed.path;
    const options = url.parse(proxyUrl);
    options.method = req.method;
    options.headers = { ...req.headers, host: 'localhost:7071' };

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', () => {
      res.writeHead(502);
      res.end('API not available');
    });
    req.pipe(proxyReq);
    return;
  }

  let filePath = path.join(WEB_DIR, parsed.pathname === '/' ? 'index.html' : parsed.pathname);
  if (!fs.existsSync(filePath) && !path.extname(filePath)) filePath = path.join(WEB_DIR, 'index.html');

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`Web dashboard: http://localhost:${PORT}`));

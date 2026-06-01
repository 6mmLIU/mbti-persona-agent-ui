const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const port = Number(process.env.PORT || 4174);
const maxBodyBytes = 2 * 1024 * 1024;

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jsx': 'text/babel; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

function sendJSON(res, status, payload) {
  send(res, status, JSON.stringify(payload), {
    'Content-Type': 'application/json; charset=utf-8',
    'x-mbti-proxy': '1',
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function cleanHeaders(headers) {
  const out = {};
  Object.entries(headers || {}).forEach(([key, value]) => {
    const lower = key.toLowerCase();
    if (['host', 'connection', 'content-length', 'transfer-encoding'].includes(lower)) return;
    if (value == null || value === '') return;
    out[key] = String(value);
  });
  return out;
}

async function handleProxy(req, res) {
  if (req.method === 'GET' && req.url === '/api/llm-proxy/health') {
    send(res, 200, '{"ok":true}', {
      'Content-Type': 'application/json; charset=utf-8',
      'x-mbti-proxy': '1',
    });
    return true;
  }
  if (req.method !== 'POST' || req.url !== '/api/llm-proxy') return false;
  if (typeof fetch !== 'function') {
    sendJSON(res, 500, { error: { message: '当前 Node.js 版本缺少 fetch，请使用 Node.js 18+' } });
    return true;
  }

  try {
    const payload = JSON.parse(await readBody(req) || '{}');
    const target = new URL(payload.url);
    if (!['http:', 'https:'].includes(target.protocol)) throw new Error('接口地址必须是 HTTP/HTTPS');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 65000);
    const upstream = await fetch(target, {
      method: payload.method || 'POST',
      headers: cleanHeaders(payload.headers),
      body: payload.body || undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const text = await upstream.text();
    send(res, upstream.status, text, {
      'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      'x-mbti-proxy': '1',
    });
  } catch (err) {
    const msg = err && err.name === 'AbortError'
      ? '模型接口请求超时'
      : (err && err.message ? err.message : '模型接口请求失败');
    sendJSON(res, 502, { error: { message: msg } });
  }
  return true;
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const filePath = path.normalize(path.join(root, requested));
  if (!filePath.startsWith(root)) {
    send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain; charset=utf-8' });
    return;
  }

  fs.stat(filePath, (statErr, stat) => {
    const resolved = !statErr && stat.isDirectory() ? path.join(filePath, 'index.html') : filePath;
    fs.readFile(resolved, (err, content) => {
      if (err) {
        send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
        return;
      }
      send(res, 200, content, {
        'Content-Type': mime[path.extname(resolved).toLowerCase()] || 'application/octet-stream',
      });
    });
  });
}

const server = http.createServer(async (req, res) => {
  if (await handleProxy(req, res)) return;
  serveStatic(req, res);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`MBTI persona matrix running at http://127.0.0.1:${port}/`);
});

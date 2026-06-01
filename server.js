const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const port = Number(process.env.PORT || 4174);
const maxBodyBytes = 2 * 1024 * 1024;
const redditUserAgent = 'mbti-persona-research/1.0 (local development)';
const defaultResearchSubreddits = ['SideProject', 'startups', 'Entrepreneur', 'SaaS', 'indiehackers'];

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

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback;
}

function cleanQuery(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function cleanSubreddit(value) {
  const s = String(value || '').replace(/^r\//i, '').trim();
  return /^[A-Za-z0-9_]{2,32}$/.test(s) ? s : '';
}

function decodeEntities(value) {
  const named = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    '#39': "'",
    nbsp: ' ',
  };
  return String(value || '').replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, key) => {
    if (key[0] === '#') {
      const raw = key[1] && key[1].toLowerCase() === 'x' ? key.slice(2) : key.slice(1);
      const n = parseInt(raw, key[1] && key[1].toLowerCase() === 'x' ? 16 : 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return Object.prototype.hasOwnProperty.call(named, key) ? named[key] : m;
  });
}

function textFromXML(fragment, tag) {
  const match = String(fragment || '').match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeEntities(match[1]).trim() : '';
}

function attrFromXML(fragment, tag, attr) {
  const match = String(fragment || '').match(new RegExp(`<${tag}[^>]*\\s${attr}="([^"]+)"[^>]*>`, 'i'));
  return match ? decodeEntities(match[1]).trim() : '';
}

function stripHTML(value) {
  const once = decodeEntities(value);
  const twice = decodeEntities(once);
  return twice
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRedditRSS(xml, subreddit, source) {
  const entries = String(xml || '').match(/<entry>[\s\S]*?<\/entry>/gi) || [];
  return entries.map((entry, index) => {
    const url = attrFromXML(entry, 'link', 'href');
    const title = textFromXML(entry, 'title');
    const content = stripHTML(textFromXML(entry, 'content')).slice(0, 520);
    const author = textFromXML(entry, 'name').replace(/^\/u\//i, '');
    const publishedAt = textFromXML(entry, 'published') || textFromXML(entry, 'updated');
    if (!title || !url) return null;
    return {
      id: textFromXML(entry, 'id') || `${subreddit}-${index}`,
      title,
      excerpt: content,
      subreddit,
      author,
      publishedAt,
      url,
      score: null,
      comments: null,
      source,
    };
  }).filter(Boolean);
}

function normalizeArchivePost(post, subreddit) {
  if (!post || !post.title || !post.permalink) return null;
  return {
    id: String(post.id || post.permalink),
    title: String(post.title || '').trim(),
    excerpt: String(post.selftext || post.body || '').replace(/\s+/g, ' ').trim().slice(0, 520),
    subreddit: String(post.subreddit || subreddit || '').trim(),
    author: String(post.author || '').trim(),
    publishedAt: post.created_utc ? new Date(Number(post.created_utc) * 1000).toISOString() : '',
    url: `https://www.reddit.com${post.permalink}`,
    score: Number.isFinite(Number(post.score)) ? Number(post.score) : null,
    comments: Number.isFinite(Number(post.num_comments)) ? Number(post.num_comments) : null,
    source: 'pullpush-reddit-archive',
  };
}

async function fetchText(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': redditUserAgent,
        'Accept': 'application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
      },
      signal: controller.signal,
    });
    const text = await resp.text();
    if (!resp.ok) {
      const err = new Error(`${resp.status} ${resp.statusText}`);
      err.status = resp.status;
      err.body = text.slice(0, 180);
      throw err;
    }
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRedditRSS(subreddit, query, timeWindow) {
  const url = new URL(`https://www.reddit.com/r/${encodeURIComponent(subreddit)}/search.rss`);
  url.searchParams.set('q', query);
  url.searchParams.set('restrict_sr', '1');
  url.searchParams.set('sort', 'relevance');
  url.searchParams.set('t', timeWindow || 'month');
  const xml = await fetchText(url, 12000);
  return parseRedditRSS(xml, subreddit, 'reddit-rss');
}

async function fetchPullPush(subreddit, query, size) {
  const url = new URL('https://api.pullpush.io/reddit/search/submission/');
  url.searchParams.set('q', query);
  url.searchParams.set('subreddit', subreddit);
  url.searchParams.set('size', String(size));
  url.searchParams.set('sort', 'desc');
  url.searchParams.set('sort_type', 'score');
  const text = await fetchText(url, 12000);
  const data = JSON.parse(text);
  return Array.isArray(data && data.data)
    ? data.data.map(post => normalizeArchivePost(post, subreddit)).filter(Boolean)
    : [];
}

function dedupeItems(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = (item.url || item.title || '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function handleRedditResearch(req, res) {
  if (req.method === 'GET' && req.url === '/api/reddit-research/health') {
    sendJSON(res, 200, { ok: true, source: 'reddit-rss' });
    return true;
  }
  if (req.method !== 'POST' || req.url !== '/api/reddit-research') return false;
  if (typeof fetch !== 'function') {
    sendJSON(res, 500, { error: { message: '当前 Node.js 版本缺少 fetch，请使用 Node.js 18+' } });
    return true;
  }

  try {
    const payload = JSON.parse(await readBody(req) || '{}');
    const query = cleanQuery(payload.query);
    if (!query) throw new Error('请输入要调研的问题或关键词');
    const limit = clampNumber(payload.limit, 4, 18, 12);
    const timeWindow = ['day', 'week', 'month', 'year', 'all'].includes(payload.timeWindow)
      ? payload.timeWindow
      : 'month';
    const subreddits = Array.isArray(payload.subreddits)
      ? payload.subreddits.map(cleanSubreddit).filter(Boolean).slice(0, 8)
      : [];
    const targets = subreddits.length ? subreddits : defaultResearchSubreddits;

    const rssResults = await Promise.allSettled(targets.map(sub => fetchRedditRSS(sub, query, timeWindow)));
    const rssItems = rssResults.flatMap(result => result.status === 'fulfilled' ? result.value : []);
    const rssErrors = rssResults
      .map((result, index) => result.status === 'rejected' ? `${targets[index]}: ${result.reason && result.reason.message ? result.reason.message : '抓取失败'}` : '')
      .filter(Boolean);

    let items = dedupeItems(rssItems);
    let fallbackUsed = false;
    let archiveErrors = [];
    if (items.length < Math.min(4, limit)) {
      fallbackUsed = true;
      const archiveResults = await Promise.allSettled(targets.map(sub => fetchPullPush(sub, query, 5)));
      const archiveItems = archiveResults.flatMap(result => result.status === 'fulfilled' ? result.value : []);
      archiveErrors = archiveResults
        .map((result, index) => result.status === 'rejected' ? `${targets[index]}: ${result.reason && result.reason.message ? result.reason.message : '抓取失败'}` : '')
        .filter(Boolean);
      items = dedupeItems([...items, ...archiveItems]);
    }

    items = items.slice(0, limit);
    if (!items.length) {
      sendJSON(res, 502, {
        error: {
          message: '没有从 Reddit 抓到可用帖子，请换一个更具体的关键词再试。',
          details: [...rssErrors, ...archiveErrors].slice(0, 8),
        },
      });
      return true;
    }

    sendJSON(res, 200, {
      ok: true,
      source: fallbackUsed ? 'reddit-rss+pullpush' : 'reddit-rss',
      query,
      subreddits: targets,
      timeWindow,
      fetchedAt: new Date().toISOString(),
      total: items.length,
      items,
      warnings: [...rssErrors, ...archiveErrors].slice(0, 8),
    });
  } catch (err) {
    sendJSON(res, 502, { error: { message: err && err.message ? err.message : 'Reddit 调研抓取失败' } });
  }
  return true;
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
  if (await handleRedditResearch(req, res)) return;
  if (await handleProxy(req, res)) return;
  serveStatic(req, res);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`MBTI persona matrix running at http://127.0.0.1:${port}/`);
});

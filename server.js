const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const root = __dirname;
const port = Number(process.env.PORT || 4174);
const maxBodyBytes = 18 * 1024 * 1024;
const maxExtractBytes = 10 * 1024 * 1024;
const maxExtractChars = 24000;
const redditUserAgent = 'mbti-persona-research/1.0 (local development)';
const defaultResearchSubreddits = ['SideProject', 'startups', 'Entrepreneur', 'SaaS', 'indiehackers'];
const validResearchModes = new Set(['focused', 'global', 'custom']);
const researchLexicon = [
  {
    triggers: ['独立开发', '个人开发', '一个人', '副业', 'side project', 'indie'],
    queries: ['indie hacker pain points', 'solo founder first customers', 'side project validation', 'build in public feedback'],
    subreddits: ['SideProject', 'indiehackers', 'buildinpublic', 'EntrepreneurRideAlong', 'micro_saas'],
  },
  {
    triggers: ['老师', '教师', '备课', '课堂', '作业', '批改', '教育'],
    queries: ['teacher lesson planning workload', 'teachers grading burnout', 'classroom management tools', 'teacher admin tasks AI'],
    subreddits: ['Teachers', 'teaching', 'education', 'edtech'],
  },
  {
    triggers: ['房产', '中介', '房地产', '租房', '经纪人', '客户跟进'],
    queries: ['real estate agent client follow up', 'realtor lead management pain points', 'real estate CRM problems', 'property manager automation'],
    subreddits: ['realestate', 'realtors', 'PropertyManagement', 'RealEstateTechnology'],
  },
  {
    triggers: ['adhd', '注意力', '拖延', '专注', '效率工具'],
    queries: ['ADHD productivity app frustration', 'ADHD task management tools', 'ADHD reminders executive function', 'productivity tools pain points'],
    subreddits: ['ADHD', 'productivity', 'getdisciplined', 'Notion'],
  },
  {
    triggers: ['小企业', '小商家', '老板', '门店', '生意', '自动化'],
    queries: ['small business automation pain points', 'small business owner overwhelmed', 'business operations manual tasks', 'local business software problems'],
    subreddits: ['smallbusiness', 'Entrepreneur', 'business', 'SaaS'],
  },
  {
    triggers: ['自由职业', '接单', 'freelance', '客户报价', '发票'],
    queries: ['freelancer client management problems', 'freelance invoicing pain points', 'freelancer proposal workflow', 'freelance admin tasks'],
    subreddits: ['freelance', 'freelancers', 'Upwork', 'smallbusiness'],
  },
  {
    triggers: ['电商', '亚马逊', 'shopify', '网店', '跨境', '卖家'],
    queries: ['Shopify merchant pain points', 'ecommerce seller automation', 'Amazon seller workflow problems', 'online store customer support issues'],
    subreddits: ['shopify', 'ecommerce', 'AmazonSeller', 'Entrepreneur'],
  },
  {
    triggers: ['客服', '客户支持', '工单', '售后', '用户反馈'],
    queries: ['customer support ticket pain points', 'helpdesk workflow problems', 'customer feedback management tools', 'support automation complaints'],
    subreddits: ['CustomerSuccess', 'SaaS', 'smallbusiness', 'Entrepreneur'],
  },
  {
    triggers: ['获客', '销售', '线索', '营销', '增长', '转化'],
    queries: ['startup customer acquisition pain points', 'sales lead follow up problems', 'marketing automation pain points', 'founder first customers'],
    subreddits: ['sales', 'marketing', 'startups', 'Entrepreneur'],
  },
  {
    triggers: ['健身', '教练', '瑜伽', '训练', '私教'],
    queries: ['personal trainer client management', 'fitness coach scheduling problems', 'gym owner software pain points', 'fitness habit tracking app'],
    subreddits: ['personaltraining', 'fitness', 'gymowners', 'smallbusiness'],
  },
  {
    triggers: ['心理', '咨询', '治疗师', '心理健康', 'therapy'],
    queries: ['therapist private practice admin', 'mental health app pain points', 'therapy client notes scheduling', 'private practice software problems'],
    subreddits: ['therapists', 'psychotherapy', 'mentalhealth', 'smallbusiness'],
  },
  {
    triggers: ['写作', '内容创作', '公众号', '自媒体', '创作者', '短视频'],
    queries: ['creator workflow pain points', 'content creator planning tools', 'newsletter creator monetization', 'short form video workflow'],
    subreddits: ['content_marketing', 'NewTubers', 'CreatorEconomy', 'newsletter'],
  },
  {
    triggers: ['餐厅', '咖啡', '奶茶', '外卖', '餐饮'],
    queries: ['restaurant owner operations problems', 'cafe owner scheduling inventory', 'food business automation pain points', 'restaurant customer retention'],
    subreddits: ['restaurantowners', 'smallbusiness', 'barista', 'Entrepreneur'],
  },
  {
    triggers: ['宠物', '宠物店', '兽医', '猫', '狗'],
    queries: ['pet business owner pain points', 'veterinary clinic scheduling problems', 'pet store inventory customer management', 'pet services automation'],
    subreddits: ['pets', 'VetTech', 'smallbusiness', 'Entrepreneur'],
  },
];

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

function parseDataUrl(value) {
  const match = String(value || '').match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/);
  if (!match || !match[2]) return null;
  const type = (match[1] || 'application/octet-stream').toLowerCase();
  const buffer = Buffer.from(match[3], 'base64');
  return { type, buffer };
}

function safeUploadExt(name, type) {
  const ext = path.extname(String(name || '')).toLowerCase();
  const byType = {
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/rtf': '.rtf',
    'text/rtf': '.rtf',
    'text/plain': '.txt',
    'text/markdown': '.md',
    'text/csv': '.csv',
    'application/json': '.json',
  };
  if (/^\.[a-z0-9]{1,12}$/.test(ext)) return ext;
  return byType[String(type || '').toLowerCase()] || '.bin';
}

function isPlainTextUpload(name, type) {
  const ext = path.extname(String(name || '')).toLowerCase();
  return String(type || '').startsWith('text/') ||
    ['.txt', '.md', '.csv', '.json', '.js', '.jsx', '.ts', '.tsx', '.css', '.html', '.xml', '.yaml', '.yml', '.log'].includes(ext);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const maxOutput = options.maxOutput || 512 * 1024;
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${command} 提取超时`));
    }, options.timeout || 12000);
    let stdout = Buffer.alloc(0);
    let stderr = '';
    child.stdout.on('data', chunk => {
      if (stdout.length < maxOutput) stdout = Buffer.concat([stdout, chunk]).slice(0, maxOutput);
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString('utf8').slice(0, 1000);
    });
    child.on('error', err => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on('close', code => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout.toString('utf8').replace(/\s+\n/g, '\n').trim());
      } else {
        reject(new Error((stderr || `${command} 退出码 ${code}`).trim()));
      }
    });
  });
}

async function extractUploadText(filePath, name, type) {
  const ext = path.extname(String(name || '')).toLowerCase();
  if (isPlainTextUpload(name, type)) {
    return fs.readFileSync(filePath, 'utf8').slice(0, maxExtractChars);
  }
  if (type === 'application/pdf' || ext === '.pdf') {
    return (await runCommand('pdftotext', ['-layout', '-enc', 'UTF-8', filePath, '-'], {
      timeout: 16000,
      maxOutput: 1024 * 1024,
    })).slice(0, maxExtractChars);
  }
  if (['.doc', '.docx', '.rtf'].includes(ext) ||
      ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/rtf', 'text/rtf'].includes(type)) {
    return (await runCommand('textutil', ['-convert', 'txt', '-stdout', filePath], {
      timeout: 16000,
      maxOutput: 1024 * 1024,
    })).slice(0, maxExtractChars);
  }
  return '';
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
  if (/^u_/i.test(s)) return '';
  return /^[A-Za-z0-9_]{2,32}$/.test(s) ? s : '';
}

function uniqueStrings(values) {
  const seen = new Set();
  return values.filter(value => {
    const key = String(value || '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeResearchMode(value) {
  const mode = String(value || 'focused').toLowerCase();
  return validResearchModes.has(mode) ? mode : 'focused';
}

function hasCJK(value) {
  return /[\u3400-\u9fff]/.test(String(value || ''));
}

function includesAny(value, words) {
  const text = String(value || '').toLowerCase();
  return words.some(word => text.includes(String(word).toLowerCase()));
}

function cleanResearchStrategy(value) {
  if (!value || typeof value !== 'object') return null;
  const arr = v => Array.isArray(v) ? v.filter(Boolean).map(String) : [];
  const strategy = {
    source: value.source === 'model' ? 'model' : 'manual',
    audience: String(value.audience || '').replace(/\s+/g, ' ').trim().slice(0, 80),
    domain: String(value.domain || '').replace(/\s+/g, ' ').trim().slice(0, 80),
    problem: String(value.problem || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    rationale: String(value.rationale || '').replace(/\s+/g, ' ').trim().slice(0, 160),
    englishQueries: uniqueStrings(arr(value.englishQueries).map(cleanQuery).filter(Boolean)).slice(0, 8),
    subreddits: uniqueStrings(arr(value.subreddits).map(cleanSubreddit).filter(Boolean)).slice(0, 8),
    keywords: uniqueStrings(arr(value.keywords).map(cleanQuery).filter(Boolean)).slice(0, 12),
  };
  return strategy.englishQueries.length || strategy.subreddits.length || strategy.keywords.length ? strategy : null;
}

function lexiconHintsFor(query) {
  const matched = researchLexicon.filter(entry => includesAny(query, entry.triggers));
  return {
    queries: uniqueStrings(matched.flatMap(entry => entry.queries || [])).slice(0, 10),
    subreddits: uniqueStrings(matched.flatMap(entry => entry.subreddits || []).map(cleanSubreddit).filter(Boolean)).slice(0, 10),
  };
}

function buildQueryVariants(query, strategy) {
  const base = cleanQuery(query);
  const variants = [];
  const add = value => {
    const cleaned = cleanQuery(value);
    if (cleaned) variants.push(cleaned);
  };

  if (strategy && Array.isArray(strategy.englishQueries)) strategy.englishQueries.forEach(add);
  lexiconHintsFor(base).queries.forEach(add);

  const cjk = hasCJK(base);
  if (!cjk) add(base);

  const independent = includesAny(base, ['独立开发', '独立开发者', '个人开发', '一个人', 'solo', 'indie', 'side project']);
  const ai = includesAny(base, ['ai', '人工智能', '大模型', 'llm', 'chatgpt']);
  const revenue = includesAny(base, ['赚钱', '收入', '可见收入', '第一份', '变现', '收费', '付费', 'revenue', 'make money']);
  const saas = includesAny(base, ['saas', '小产品', 'micro saas', '软件']);
  const pain = includesAny(base, ['痛点', '抱怨', '吐槽', '问题', '效率工具', 'productivity']);
  const validate = includesAny(base, ['验证', 'mvp', '实验', '快速', 'validate']);
  const customer = includesAny(base, ['获客', '用户', '客户', '增长', 'acquisition']);
  const business = includesAny(base, ['创业', '生意', 'startup', 'business']);

  if (independent && ai && revenue) {
    add('indie hacker AI first revenue');
    add('solo founder AI make money');
    add('AI side project paying users');
    add('micro SaaS AI revenue');
  }
  if (pain) {
    add('productivity tools pain points');
    add('productivity app complaints');
    add('workflow tool frustration');
  }
  if (saas || validate) {
    add('solo founder micro SaaS validation');
    add('one person SaaS ideas');
    add('indie hacker SaaS first customers');
  }
  if (customer) {
    add('startup customer acquisition pain points');
    add('indie hacker first customers');
  }
  if (business && ai && !revenue) {
    add('AI startup ideas solo founder');
    add('AI business ideas indie hacker');
  }
  if (cjk && !variants.length) {
    add('indie hacker startup idea');
    add('solo founder SaaS pain points');
    add('AI side project validation');
  }
  if (cjk) add(base);

  return uniqueStrings(variants).slice(0, 8);
}

function inferSubredditFromUrl(url) {
  const match = String(url || '').match(/\/r\/([^/]+)\//i);
  return match ? cleanSubreddit(match[1]) : '';
}

function isRedditPostUrl(url) {
  return /\/comments\//i.test(String(url || ''));
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
    const itemSubreddit = cleanSubreddit(subreddit) || inferSubredditFromUrl(url) || 'reddit';
    return {
      id: textFromXML(entry, 'id') || `${itemSubreddit}-${index}`,
      title,
      excerpt: content,
      subreddit: itemSubreddit,
      author,
      publishedAt,
      url,
      score: null,
      comments: null,
      source,
      kind: isRedditPostUrl(url) ? 'post' : 'community',
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
    kind: 'post',
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

async function fetchGlobalRedditRSS(query, timeWindow) {
  const url = new URL('https://www.reddit.com/search.rss');
  url.searchParams.set('q', query);
  url.searchParams.set('sort', 'relevance');
  url.searchParams.set('t', timeWindow || 'month');
  const xml = await fetchText(url, 12000);
  return parseRedditRSS(xml, '', 'reddit-global-rss');
}

async function fetchPullPush(subreddit, query, size) {
  const url = new URL('https://api.pullpush.io/reddit/search/submission/');
  url.searchParams.set('q', query);
  if (subreddit) url.searchParams.set('subreddit', subreddit);
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

function onlyPostItems(items) {
  return items.filter(item => item && cleanSubreddit(item.subreddit) && (item.kind === 'post' || isRedditPostUrl(item.url)));
}

function scoreDiscoveredSubreddits(items) {
  const counts = new Map();
  items.forEach(item => {
    const sub = cleanSubreddit(item && item.subreddit);
    if (!sub || sub.toLowerCase() === 'reddit') return;
    const current = counts.get(sub) || { subreddit: sub, count: 0, score: 0 };
    current.count += 1;
    current.score += 1;
    if (defaultResearchSubreddits.some(x => x.toLowerCase() === sub.toLowerCase())) current.score += 0.75;
    if (item && Number.isFinite(Number(item.comments))) current.score += Math.min(Number(item.comments) / 80, 1.5);
    if (item && Number.isFinite(Number(item.score))) current.score += Math.min(Number(item.score) / 200, 1.5);
    counts.set(sub, current);
  });
  return Array.from(counts.values()).sort((a, b) => b.score - a.score || b.count - a.count);
}

async function runTaskBatch(tasks) {
  const settled = await Promise.allSettled(tasks.map(task => task.run()));
  const items = [];
  const errors = [];
  settled.forEach((result, index) => {
    const task = tasks[index];
    if (result.status === 'fulfilled') {
      result.value.forEach(item => items.push({ ...item, matchedQuery: task.query }));
    } else {
      const message = result.reason && result.reason.message ? result.reason.message : '抓取失败';
      errors.push(`${task.label}: ${message}`);
    }
  });
  return { items, errors };
}

async function discoverRedditCommunities(queryVariants, timeWindow) {
  const variants = queryVariants.slice(0, 3);
  const rssTasks = variants.map(query => ({
    label: `global:${query}`,
    query,
    run: () => fetchGlobalRedditRSS(query, timeWindow),
  }));
  const rss = await runTaskBatch(rssTasks);
  let items = dedupeItems(rss.items);
  let errors = rss.errors;

  if (items.length < 6) {
    const archiveTasks = variants.slice(0, 2).map(query => ({
      label: `global-archive:${query}`,
      query,
      run: () => fetchPullPush('', query, 12),
    }));
    const archive = await runTaskBatch(archiveTasks);
    items = dedupeItems([...items, ...archive.items]);
    errors = [...errors, ...archive.errors];
  }

  const discovered = scoreDiscoveredSubreddits(items).slice(0, 8);
  return { items, discovered, errors };
}

async function fetchTargetedRedditItems(targets, queryVariants, timeWindow) {
  const variants = queryVariants.slice(0, 3);
  const rssTasks = targets.flatMap(subreddit => variants.map(query => ({
    label: `${subreddit}:${query}`,
    query,
    run: () => fetchRedditRSS(subreddit, query, timeWindow),
  })));
  return runTaskBatch(rssTasks);
}

async function fetchArchiveRedditItems(targets, queryVariants) {
  const variants = queryVariants.slice(0, 2);
  const archiveTasks = targets.flatMap(subreddit => variants.map(query => ({
    label: `${subreddit}:archive:${query}`,
    query,
    run: () => fetchPullPush(subreddit, query, 5),
  })));
  return runTaskBatch(archiveTasks);
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
    const mode = normalizeResearchMode(payload.mode);
    const strategy = cleanResearchStrategy(payload.strategy);
    const lexiconHints = lexiconHintsFor(query);
    const queryVariants = buildQueryVariants(query, strategy);
    const subreddits = Array.isArray(payload.subreddits)
      ? payload.subreddits.map(cleanSubreddit).filter(Boolean).slice(0, 8)
      : [];
    let targets = mode === 'custom'
      ? subreddits
      : (subreddits.length && mode === 'focused' ? subreddits : defaultResearchSubreddits);
    if (mode === 'custom' && !targets.length) throw new Error('自定义模式至少需要输入 1 个 subreddit');

    let discoveryItems = [];
    let discoveredSubreddits = [];
    let discoveryErrors = [];
    if (mode === 'global') {
      const discovery = await discoverRedditCommunities(queryVariants, timeWindow);
      discoveryItems = discovery.items;
      discoveredSubreddits = discovery.discovered;
      discoveryErrors = discovery.errors;
      targets = uniqueStrings([
        ...(strategy ? strategy.subreddits : []),
        ...lexiconHints.subreddits,
        ...discoveredSubreddits.map(item => item.subreddit),
        ...defaultResearchSubreddits,
      ]).slice(0, 8);
    }

    const rss = await fetchTargetedRedditItems(targets, queryVariants, timeWindow);
    let items = onlyPostItems(dedupeItems(mode === 'global' ? [...rss.items, ...discoveryItems] : rss.items));
    let fallbackUsed = false;
    let archiveErrors = [];
    if (items.length < Math.min(4, limit)) {
      fallbackUsed = true;
      const archive = await fetchArchiveRedditItems(targets, queryVariants);
      archiveErrors = archive.errors;
      items = onlyPostItems(dedupeItems([...items, ...archive.items]));
    }

    items = items.slice(0, limit);
    if (!items.length) {
      sendJSON(res, 502, {
        error: {
          message: hasCJK(query)
            ? '这次没有抓到可用帖子。系统已经把中文议题扩展成英文关键词，但当前主题仍然没有稳定命中，请换成更具体的场景、人群或工具名称。'
            : '没有从 Reddit 抓到可用帖子，请换一个更具体的关键词再试。',
          details: [...discoveryErrors, ...rss.errors, ...archiveErrors].slice(0, 8),
        },
        query,
        queryVariants,
        mode,
        subreddits: targets,
        discoveredSubreddits,
        searchStrategy: strategy,
        lexiconHints,
      });
      return true;
    }

    sendJSON(res, 200, {
      ok: true,
      source: fallbackUsed ? 'reddit-rss+pullpush' : 'reddit-rss',
      query,
      queryVariants,
      mode,
      subreddits: targets,
      discoveredSubreddits,
      searchStrategy: strategy,
      lexiconHints,
      timeWindow,
      fetchedAt: new Date().toISOString(),
      total: items.length,
      items,
      warnings: [...discoveryErrors, ...rss.errors, ...archiveErrors].slice(0, 8),
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

async function handleFileExtract(req, res) {
  if (req.method === 'GET' && req.url === '/api/extract-file/health') {
    sendJSON(res, 200, { ok: true, source: 'local-extractor' });
    return true;
  }
  if (req.method !== 'POST' || req.url !== '/api/extract-file') return false;

  let tmpPath = '';
  try {
    const payload = JSON.parse(await readBody(req) || '{}');
    const parsed = parseDataUrl(payload.dataUrl);
    if (!parsed) throw new Error('上传内容格式不正确');
    if (parsed.buffer.length > maxExtractBytes) throw new Error('文件超过 10MB，请压缩或分段上传');

    const name = String(payload.name || 'upload').replace(/[^\w.\-\u4e00-\u9fa5 ]+/g, '').slice(0, 120) || 'upload';
    const type = String(payload.type || parsed.type || 'application/octet-stream').toLowerCase();
    const ext = safeUploadExt(name, type);
    tmpPath = path.join(os.tmpdir(), `mbti-upload-${crypto.randomUUID()}${ext}`);
    fs.writeFileSync(tmpPath, parsed.buffer);

    const text = await extractUploadText(tmpPath, name, type);
    sendJSON(res, 200, {
      ok: true,
      name,
      type,
      size: parsed.buffer.length,
      text,
      truncated: text.length >= maxExtractChars,
      message: text
        ? '已提取文本'
        : '已上传，但当前本地抽取器暂不支持解析这个文件类型',
    });
  } catch (err) {
    sendJSON(res, 422, {
      error: {
        message: err && err.message ? err.message : '文件解析失败',
      },
    });
  } finally {
    if (tmpPath) fs.rm(tmpPath, { force: true }, () => {});
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
  if (await handleFileExtract(req, res)) return;
  serveStatic(req, res);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`MBTI persona matrix running at http://127.0.0.1:${port}/`);
});

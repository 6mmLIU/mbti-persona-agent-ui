/* App shell — routing, ask flow, FLIP grid↔list continuity transition. */
const { useState, useEffect, useRef, useLayoutEffect } = React;
const { Icon, PersonaCard, PresetModal, HistoryView, FavoritesView } = window;

const EXAMPLE_QS = [
  '我想做一款帮助年轻人坚持记笔记的 App，有什么新点子？',
  '怎样让一场线下读书会更有吸引力？',
  '如何在三个月内学会一项新技能？',
  '给一家小咖啡馆想几个让顾客愿意复购的主意。',
];

const RESEARCH_EXAMPLE_QS = [
  '使用 AI 帮独立开发者获得可见收入，有哪些真实机会？',
  '最近 Reddit 上大家抱怨最多的效率工具痛点是什么？',
  '有什么适合一个人快速验证的 SaaS 小产品方向？',
];

const RESEARCH_SUBREDDITS = ['SideProject', 'startups', 'Entrepreneur', 'SaaS', 'indiehackers'];
const MAX_ATTACHMENTS = 8;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const RESEARCH_MODE_OPTIONS = [
  {
    id: 'focused',
    label: '精准模式',
    shortLabel: '精准',
    description: '只查独立开发者、创业和 SaaS 社区，速度最快，适合当前这个独立开发者主题。',
  },
  {
    id: 'global',
    label: '全局发现',
    shortLabel: '全局',
    description: '先全 Reddit 搜索并发现相关社区，再进入高相关社区深挖，覆盖面更可靠。',
  },
  {
    id: 'custom',
    label: '自定义',
    shortLabel: '自定义',
    description: '手动输入 subreddit，适合某个明确人群或行业，例如 smallbusiness、freelance、teachers。',
  },
];
const RESEARCH_MODE_LABELS = RESEARCH_MODE_OPTIONS.reduce((acc, item) => ({ ...acc, [item.id]: item.label }), {});

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function attachmentKind(file) {
  if (String(file.type || '').startsWith('image/')) return 'image';
  if (String(file.type || '').startsWith('text/')) return 'text';
  const ext = (file.name || '').toLowerCase().split('.').pop();
  return ['txt', 'md', 'csv', 'json', 'js', 'jsx', 'ts', 'tsx', 'css', 'html', 'xml', 'yaml', 'yml', 'log'].includes(ext)
    ? 'text'
    : 'file';
}

function attachmentLabel(att) {
  if (att.kind === 'image') return '图片';
  if (att.text) return '文本';
  return '文件';
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

async function extractAttachmentText(file, dataUrl) {
  const resp = await fetch('/api/extract-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: file.name,
      type: file.type || 'application/octet-stream',
      dataUrl,
    }),
  });
  const payload = await resp.json().catch(() => null);
  if (!resp.ok) {
    const msg = payload && payload.error && payload.error.message ? payload.error.message : '文件解析失败';
    throw new Error(msg);
  }
  return payload || {};
}

async function buildAttachment(file) {
  const kind = attachmentKind(file);
  const base = {
    id: window.uid(),
    name: file.name || '未命名文件',
    type: file.type || 'application/octet-stream',
    size: file.size || 0,
    kind,
    text: '',
    dataUrl: '',
    message: '',
  };

  if (kind === 'image') {
    if (file.size > MAX_IMAGE_BYTES) throw new Error(`${base.name} 超过 6MB，请压缩后再上传`);
    return { ...base, dataUrl: await readFileAsDataURL(file), message: '图片已作为视觉附件加入' };
  }

  if (file.size > MAX_FILE_BYTES) throw new Error(`${base.name} 超过 10MB，请压缩或拆分后再上传`);

  if (kind === 'text') {
    const text = await file.text();
    return {
      ...base,
      text: text.slice(0, 24000),
      message: text.length > 24000 ? '已读取前 24000 字' : '已读取文本',
    };
  }

  const dataUrl = await readFileAsDataURL(file);
  const extracted = await extractAttachmentText(file, dataUrl);
  return {
    ...base,
    text: String(extracted.text || '').slice(0, 24000),
    message: extracted.message || (extracted.text ? '已提取文本' : '已上传文件'),
  };
}

function stripAttachmentForHistory(att) {
  return {
    id: att.id,
    name: att.name,
    type: att.type,
    size: att.size,
    kind: att.kind,
    text: att.text ? String(att.text).slice(0, 5000) : '',
    message: att.kind === 'image' ? '图片内容仅保留在当前会话，历史中不保存 base64' : att.message,
  };
}

function stripRoundForHistory(round) {
  return {
    ...round,
    attachments: Array.isArray(round.attachments) ? round.attachments.map(stripAttachmentForHistory) : [],
  };
}

function parseCustomSubreddits(value) {
  const seen = new Set();
  return String(value || '')
    .split(/[,\s，、/]+/)
    .map(x => x.replace(/^r\//i, '').trim())
    .filter(x => /^[A-Za-z0-9_]{2,32}$/.test(x))
    .filter(x => {
      const key = x.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

function researchModeMeta(mode) {
  return RESEARCH_MODE_OPTIONS.find(item => item.id === mode) || RESEARCH_MODE_OPTIONS[0];
}

function PersonaPreview({ personas, presetName }) {
  return (
    <aside className="preview" aria-label="16 种人格预览">
      <div className="preview__head">
        <div>
          <h2 className="preview__title">思维矩阵</h2>
          <p className="preview__sub">16 个角色全部保留介绍、色系和独立视角，生成后会以同样的宽卡结构呈现。</p>
        </div>
        <span className="preview__setting"><Icon name="sliders" size={15} />{presetName || '通用设定'}</span>
      </div>

      <div className="preview-list" role="list" aria-label="16 种 MBTI 人格完整介绍">
        {personas.map((p, i) => (
          <article className="preview-row" data-tone={window.GROUPS[p.group].tone} key={p.code} role="listitem" style={{ '--i': i }}>
            <span className="tone-block" aria-hidden="true" />
            <span className="mono preview-row__mono"><b>{p.code.slice(0, 2)}</b><b>{p.code.slice(2)}</b></span>
            <div>
              <div className="preview-row__top">
                <h3>{p.name}</h3>
                <span>{p.code} · {window.GROUPS[p.group].colorName}</span>
              </div>
              <p>{p.essence}</p>
            </div>
          </article>
        ))}
      </div>
    </aside>
  );
}

function useReducedMotion() {
  const [r, setR] = useState(() => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const fn = () => setR(mq.matches);
    mq.addEventListener ? mq.addEventListener('change', fn) : mq.addListener(fn);
    return () => { mq.removeEventListener ? mq.removeEventListener('change', fn) : mq.removeListener(fn); };
  }, []);
  return r;
}

function looseJSONObject(text) {
  if (!text || typeof text !== 'string') return null;
  let raw = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const s = raw.indexOf('{');
  const e = raw.lastIndexOf('}');
  if (s === -1 || e === -1 || e <= s) return null;
  raw = raw.slice(s, e + 1);
  const repaired = raw.replace(/,\s*([}\]])/g, '$1').replace(/[\r\n]+(?=(?:[^"]*"[^"]*")*[^"]*$)/g, '');
  try { return JSON.parse(repaired); } catch (_) { return null; }
}

function noteFromRound(code, round) {
  const r = round && round.results ? round.results[code] : null;
  return r && (r.conclusion || r.thinking) ? String(r.conclusion || r.thinking).trim() : '';
}

function completePersonaNotes(notes, round) {
  const fromSummary = new Map((Array.isArray(notes) ? notes : []).map(n => [
    String(n && n.code ? n.code : '').toUpperCase(),
    String(n && n.takeaway ? n.takeaway : '').trim(),
  ]));
  return (window.PERSONAS || []).map(p => {
    const full = noteFromRound(p.code, round);
    return {
      code: p.code,
      takeaway: full || fromSummary.get(p.code) || p.essence,
    };
  });
}

function displaySummary(summary, round) {
  if (!summary) return null;
  const embedded = looseJSONObject(summary.overview);
  const summaryNotes = completePersonaNotes(summary.personaNotes, round);
  if (embedded && (embedded.headline || embedded.overview)) {
    return {
      ...summary,
      ...embedded,
      personaNotes: Array.isArray(embedded.personaNotes) && embedded.personaNotes.length >= 16
        ? completePersonaNotes(embedded.personaNotes, round)
        : summaryNotes,
    };
  }
  if (typeof summary.overview === 'string' && summary.overview.trim().startsWith('{')) {
    return { ...summary, overview: '本轮总结已整理为下方的共识、分歧、下一步和各人格保留观点。', personaNotes: summaryNotes };
  }
  return { ...summary, personaNotes: summaryNotes };
}

function toneForCode(code) {
  const p = (window.PERSONAS || []).find(x => x.code === code);
  const g = p && window.GROUPS[p.group];
  return g ? g.tone : 'blue';
}

function SummaryPanel({ summary, round }) {
  const view = displaySummary(summary, round);
  if (!view) return null;
  const notes = Array.isArray(view.personaNotes) ? view.personaNotes : [];
  return (
    <section className="summary-panel" aria-label="本轮总结">
      <div className="summary-panel__main">
        <span className="summary-panel__mark"><Icon name="spark" size={17} /></span>
        <div>
          <h3>{view.headline || '本轮总结'}</h3>
          <p>{view.overview}</p>
        </div>
      </div>
      <div className="summary-grid">
        <div>
          <span className="pcard__label">共识</span>
          <ul>{(view.agreements || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
        <div>
          <span className="pcard__label">分歧</span>
          <ul>{(view.tensions || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
        <div>
          <span className="pcard__label">下一步</span>
          <ul>{(view.nextSteps || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      </div>
      {notes.length > 0 && (
        <div className="summary-notes" aria-label="各人格保留观点">
          {notes.map(n => (
            <span key={n.code} className="summary-note" data-tone={toneForCode(n.code)}>
              <b>{n.code}</b><span>{n.takeaway}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function formatSourceDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function sourceDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch (_) {
    return '';
  }
}

function sourceKey(source) {
  if (!source) return '';
  return String(source.url || `${source.title || ''}|${source.domain || ''}`).trim().toLowerCase();
}

function normalizeRoundSource(source, index) {
  if (!source) return null;
  if (typeof source === 'string') {
    const value = source.trim();
    if (!value) return null;
    const isUrl = /^https?:\/\//i.test(value);
    return {
      title: isUrl ? (sourceDomain(value) || `网页来源 ${index + 1}`) : value,
      url: isUrl ? value : '',
      domain: isUrl ? sourceDomain(value) : '',
      snippet: '',
      personas: [],
      number: index + 1,
    };
  }
  const url = String(source.url || source.uri || source.href || '').trim();
  const domain = String(source.domain || sourceDomain(url) || '').trim();
  const title = String(source.title || source.name || domain || `网页来源 ${index + 1}`).trim();
  const snippet = String(source.snippet || source.excerpt || source.cited_text || source.summary || '').replace(/\s+/g, ' ').trim();
  if (!url && !title) return null;
  return { title, url, domain, snippet, personas: [], number: index + 1 };
}

function collectRoundSources(round) {
  const results = round && round.results ? round.results : {};
  const sources = [];
  const byKey = new Map();
  Object.entries(results).forEach(([code, result]) => {
    const list = result && Array.isArray(result.citations)
      ? result.citations
      : (result && Array.isArray(result.sources) ? result.sources : []);
    list.forEach(raw => {
      const source = normalizeRoundSource(raw, sources.length);
      const key = sourceKey(source);
      if (!source || !key) return;
      if (!byKey.has(key)) {
        byKey.set(key, source);
        sources.push(source);
      }
      const saved = byKey.get(key);
      if (code && !saved.personas.includes(code)) saved.personas.push(code);
    });
  });
  sources.forEach((source, i) => { source.number = i + 1; });
  const index = sources.reduce((acc, source) => {
    acc[sourceKey(source)] = source.number;
    return acc;
  }, {});
  return { sources, index };
}

function ResearchEvidencePanel({ research, loading, error, compact = false, mode = 'focused', customSubreddits = '' }) {
  const items = research && Array.isArray(research.items) ? research.items : [];
  const isEmpty = !loading && !error && !items.length;
  const panelMode = (research && research.mode) || mode || 'focused';
  const modeLabel = RESEARCH_MODE_LABELS[panelMode] || '调研模式';
  const targetSubreddits = research && Array.isArray(research.subreddits) && research.subreddits.length
    ? research.subreddits
    : (panelMode === 'custom' ? parseCustomSubreddits(customSubreddits) : RESEARCH_SUBREDDITS);
  const queryVariants = research && Array.isArray(research.queryVariants) ? research.queryVariants : [];
  const discovered = research && Array.isArray(research.discoveredSubreddits) ? research.discoveredSubreddits : [];
  const strategy = research && research.searchStrategy ? research.searchStrategy : null;
  const strategyLabel = strategy && strategy.source === 'model' ? '模型策略' : (research && research.lexiconHints ? '词库兜底' : '');
  const heading = loading
    ? '正在抓取 Reddit 数据'
    : (error ? '抓取遇到问题' : (isEmpty ? '等待调研数据' : 'Reddit 真实素材'));
  if (isEmpty && compact) return null;
  return (
    <section className={'research-evidence' + (compact ? ' research-evidence--compact' : '')}
             aria-label="Reddit 调研数据">
      <div className="research-evidence__head">
        <span className="research-evidence__mark"><Icon name="database" size={17} /></span>
        <div>
          <h3>{heading}</h3>
          <p>
            {loading
              ? `${modeLabel}正在搜索相关帖子，完成后会把这些素材注入 16 个人格的思考上下文。`
              : error
                ? error
                : isEmpty
                  ? `${modeLabel}会先抓取真实帖子，再交给 16 种人格继续分析。`
                  : `${modeLabel}检索「${research.query}」，抓到 ${items.length} 条帖子 · ${research.source || 'reddit-rss'}`}
          </p>
        </div>
      </div>
      {!compact && (isEmpty || error) && (
        <div className="research-empty" aria-label="当前 Reddit 社区">
          {panelMode === 'global'
            ? <span className="tag tag--plain">全 Reddit 自动发现</span>
            : targetSubreddits.map(sub => <span className="tag tag--plain" key={sub}>r/{sub}</span>)}
        </div>
      )}
      {!compact && items.length > 0 && (
        <div className="research-meta" aria-label="调研命中路径">
          <span className="tag tag--plain">模式：{modeLabel}</span>
          {strategyLabel && <span className="tag tag--strategy">{strategyLabel}</span>}
          {strategy && strategy.audience && <span className="tag tag--plain">{strategy.audience}</span>}
          {strategy && strategy.domain && <span className="tag tag--plain">{strategy.domain}</span>}
          {targetSubreddits.slice(0, 8).map(sub => <span className="tag tag--plain" key={sub}>r/{sub}</span>)}
          {queryVariants.slice(0, 5).map(q => <span className="tag tag--query" key={q}>{q}</span>)}
          {discovered.slice(0, 4).map(item => (
            <span className="tag tag--plain" key={`d-${item.subreddit}`}>发现 r/{item.subreddit}</span>
          ))}
        </div>
      )}
      {items.length > 0 && (
        <div className="research-source-list">
          {items.slice(0, compact ? 4 : 8).map((item, i) => (
            <a className="research-source" href={item.url} target="_blank" rel="noreferrer" key={`${item.url}-${i}`}>
              <span className="research-source__meta">
                r/{item.subreddit || 'reddit'}
                {item.author ? ` · u/${item.author}` : ''}
                {item.publishedAt ? ` · ${formatSourceDate(item.publishedAt)}` : ''}
              </span>
              <strong>{item.title}</strong>
              {item.excerpt && <span className="research-source__excerpt">{item.excerpt}</span>}
            </a>
          ))}
        </div>
      )}
      {loading && (
        <div className="research-source-list">
          {[0, 1, 2].map(i => (
            <div className="research-source research-source--loading" key={i}>
              <span className="skel" />
              <span className="skel" />
              <span className="skel" />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ModelSearchSidebar({ sources, round }) {
  const isRunning = round && round.status === 'running';
  return (
    <aside className="model-source-panel" aria-label="模型联网搜索来源">
      <div className="model-source-panel__head">
        <span className="model-source-panel__icon"><Icon name="search" size={17} /></span>
        <div>
          <h3>联网来源</h3>
          <p>{sources.length ? `${sources.length} 个网页资源 · 点击打开原网页` : (isRunning ? '等待模型返回网页出处' : '暂无可验证网页出处')}</p>
        </div>
      </div>
      {sources.length > 0 ? (
        <div className="model-source-list">
          {sources.map(source => {
            const body = (
              <>
                <span className="model-source__num">{source.number}</span>
                <span className="model-source__body">
                  <span className="model-source__meta">{source.domain || '网页来源'}</span>
                  <strong>{source.title}</strong>
                  {source.snippet && <span className="model-source__snippet">{source.snippet}</span>}
                </span>
                {source.url && <Icon name="external" size={15} />}
              </>
            );
            return source.url ? (
              <a className="model-source" href={source.url} target="_blank" rel="noreferrer" key={`${source.number}-${source.url}`}>
                {body}
              </a>
            ) : (
              <div className="model-source model-source--plain" key={`${source.number}-${source.title}`}>
                {body}
              </div>
            );
          })}
        </div>
      ) : (
        isRunning ? (
          <div className="model-source-empty" aria-label="来源加载中">
            {[0, 1, 2].map(i => <span className="skel" key={i} />)}
          </div>
        ) : (
          <p className="model-source-none">这轮回答没有返回可点击的网页来源。可以重试一次，或换用支持原生搜索引用的模型。</p>
        )
      )}
    </aside>
  );
}

function RoundPanel({ round, isLatest, view, gridRef, onFav, store, onRetry, onSummarize, running }) {
  const results = round.results || {};
  const doneCount = Object.values(results).filter(r => r && r.status !== 'loading').length;
  const totalCount = window.PERSONAS.length;
  const summarizing = round.summaryStatus === 'loading';
  const canSummarize = doneCount === totalCount && !running && !summarizing;
  const { sources, index: citationIndex } = collectRoundSources(round);
  return (
    <article className="round-panel" data-current={isLatest ? 'true' : 'false'}>
      <header className="round-head">
        <div>
          <span className="round-kicker">第 {round.index || 1} 轮</span>
          <h3>{round.question}</h3>
          <p>{round.status === 'running' ? `正在生成 ${doneCount}/${totalCount}` : `${doneCount}/${totalCount} 个人格已回应`}</p>
        </div>
        <button className="btn btn--ghost" type="button"
                data-loading={summarizing ? 'true' : 'false'}
                disabled={!canSummarize}
                onClick={() => onSummarize(round.id)}>
          {summarizing && <span className="btn__spin" />}
          <Icon name="spark" size={17} /><span className="btn__label">{round.summary ? '重新总结' : '总结本轮'}</span>
        </button>
      </header>

      {round.summaryStatus === 'error' && (
        <p className="round-error" role="status">总结失败：{round.summaryError || '请稍后重试'}</p>
      )}
      {round.webSearch && !round.research && (
        <div className="model-search-note" role="status">
          <Icon name="search" size={16} />
          <span>已开启模型内置联网搜索。搜索由当前模型供应商执行，不使用 Reddit 数据采集。</span>
        </div>
      )}
      <div className={'round-workspace' + (round.webSearch && !round.research ? ' round-workspace--sources' : '')}>
        <div className="round-main">
          {round.research && <ResearchEvidencePanel research={round.research} compact={true} />}
          <AttachmentTray attachments={round.attachments} compact={true} />
          {summarizing && (
            <div className="summary-panel summary-panel--loading" role="status">
              <span className="dot" />正在把 16 个人格的观点整理成可追问的上下文…
            </div>
          )}
          {round.summary && <SummaryPanel summary={round.summary} round={round} />}

          <div className="persona-grid" data-view={view} ref={isLatest ? gridRef : null}>
            {window.PERSONAS.map((p, i) => (
              <div data-flip={isLatest ? p.code : `${round.id}-${p.code}`} key={p.code}>
                <PersonaCard persona={p} state={results[p.code]} view={view}
                             index={i} citationIndex={citationIndex}
                             onFav={onFav} isFav={store.isFav} onRetry={() => onRetry(p, round.id)} />
              </div>
            ))}
          </div>
        </div>
        {round.webSearch && !round.research && (
          <ModelSearchSidebar sources={sources} round={round} />
        )}
      </div>
    </article>
  );
}

function FollowupComposer({ value, onChange, onSubmit, running, viewingHistory }) {
  return (
    <form className="followup" onSubmit={onSubmit}>
      <div>
        <span className="pcard__label">{viewingHistory ? '继续追问这条历史' : '继续追问'}</span>
        <textarea rows={2} value={value}
                  aria-label="继续追问"
                  placeholder="基于上面的总结继续问，例如：哪些方案最适合我现在立刻做？"
                  onChange={e => onChange(e.target.value)} />
      </div>
      <button className="btn btn--primary" type="submit" disabled={!value.trim() || running}
              data-loading={running ? 'true' : 'false'}>
        {running && <span className="btn__spin" />}
        <Icon name="send" size={17} /><span className="btn__label">追问并开启下一轮</span>
      </button>
    </form>
  );
}

function AttachmentTray({ attachments, onRemove, compact = false }) {
  if (!Array.isArray(attachments) || !attachments.length) return null;
  return (
    <div className={'attachment-tray' + (compact ? ' attachment-tray--compact' : '')} aria-label="已上传附件">
      {attachments.map(att => (
        <div className="attachment-pill" key={att.id || att.name}>
          <span className="attachment-pill__thumb">
            {att.kind === 'image' && att.dataUrl
              ? <img src={att.dataUrl} alt="" />
              : <Icon name={att.kind === 'image' ? 'image' : 'file'} size={17} />}
          </span>
          <span className="attachment-pill__body">
            <b>{att.name}</b>
            <small>{attachmentLabel(att)} · {formatBytes(att.size)}{att.message ? ` · ${att.message}` : ''}</small>
          </span>
          {onRemove && (
            <button type="button" className="attachment-pill__remove"
                    aria-label={`移除 ${att.name}`}
                    onClick={() => onRemove(att.id)}>
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function ResearchModeControl({ mode, onModeChange, customSubreddits, onCustomSubredditsChange }) {
  const meta = researchModeMeta(mode);
  const parsed = parseCustomSubreddits(customSubreddits);
  return (
    <div className="research-mode">
      <div className="segmented research-mode__seg" role="group" aria-label="Reddit 调研模式">
        {RESEARCH_MODE_OPTIONS.map(item => (
          <button key={item.id} type="button"
                  aria-pressed={mode === item.id}
                  onClick={() => onModeChange(item.id)}>
            {item.shortLabel}
          </button>
        ))}
      </div>
      <p>{meta.description}</p>
      {mode === 'custom' && (
        <label className="research-custom">
          <span className="pcard__label">自定义 subreddit</span>
          <input value={customSubreddits}
                 onChange={e => onCustomSubredditsChange(e.target.value)}
                 placeholder="smallbusiness, freelance, teachers, ADHD, realestate"
                 aria-label="输入自定义 subreddit" />
          <small>{parsed.length ? `将搜索 ${parsed.length} 个社区` : '用英文逗号或空格分隔，最多 8 个。'}</small>
        </label>
      )}
    </div>
  );
}

function ResearchRoute({
  value, onChange, onSubmit, onFetchOnly, loading, running, research, error,
  presetName, modelLabel, researchMode, setResearchMode, customSubreddits, setCustomSubreddits,
}) {
  const customMissing = researchMode === 'custom' && !parseCustomSubreddits(customSubreddits).length;
  const actionDisabled = !value.trim() || loading || running || customMissing;
  return (
      <section className="container research-hero" aria-labelledby="research-title">
        <div className="research-hero__copy">
          <span className="eyebrow">Reddit Research</span>
          <h1 className="research-hero__title" id="research-title">先抓真实帖子，再让 16 种人格判断。</h1>
          <p className="research-hero__sub">
            数据模式会快速搜索 Reddit 相关讨论，把真实用户的痛点、实验和反馈注入同一套人格圆桌。
            当前设定：{presetName || '无'}。当前模型：{modelLabel}。
          </p>
          <form className="research-ask" onSubmit={onSubmit}>
            <textarea className="ask__ta" rows={3} value={value}
                      aria-label="输入调研议题"
                      placeholder="输入一个需要调研的议题，例如：独立开发者如何用 AI 赚到第一份可见收入？"
                      onChange={e => onChange(e.target.value)} />
            <ResearchModeControl mode={researchMode}
                                 onModeChange={setResearchMode}
                                 customSubreddits={customSubreddits}
                                 onCustomSubredditsChange={setCustomSubreddits} />
            <div className="research-ask__actions">
              <button className="btn btn--ghost" type="button"
                      disabled={actionDisabled}
                      data-loading={loading ? 'true' : 'false'}
                      onClick={onFetchOnly}>
                {loading && <span className="btn__spin" />}
                <Icon name="database" size={17} /><span className="btn__label">只抓数据</span>
              </button>
              <button className="btn btn--primary" type="submit"
                      disabled={actionDisabled}
                      data-loading={(loading || running) ? 'true' : 'false'}>
                {(loading || running) && <span className="btn__spin" />}
                <Icon name="send" size={17} /><span className="btn__label">抓取并思考</span>
              </button>
            </div>
          </form>
          <div className="research-subs" aria-label="默认调研社区">
            {researchMode === 'global'
              ? <span className="tag tag--plain">全 Reddit 自动发现相关社区</span>
              : (researchMode === 'custom'
                ? parseCustomSubreddits(customSubreddits).map(sub => <span className="tag tag--plain" key={sub}>r/{sub}</span>)
                : RESEARCH_SUBREDDITS.map(sub => <span className="tag tag--plain" key={sub}>r/{sub}</span>))}
            {researchMode === 'custom' && !parseCustomSubreddits(customSubreddits).length && (
              <span className="tag tag--plain">等待输入社区</span>
            )}
          </div>
          <div className="chips" role="list" aria-label="调研示例">
            {RESEARCH_EXAMPLE_QS.map((q, i) => (
              <button key={i} className="chip" role="listitem" onClick={() => onChange(q)}>
                {q.length > 22 ? q.slice(0, 22) + '…' : q}
              </button>
            ))}
          </div>
        </div>
        <ResearchEvidencePanel research={research} loading={loading} error={error}
                               mode={researchMode} customSubreddits={customSubreddits} />
      </section>
  );
}

function ResultsSection({
  results, running, viewingHistory, rounds, currentRound, currentRoundIndex,
  question, doneCount, totalCount, view, changeView, showRound, roundDirection,
  gridRef, onFav, store, retryOne, summarizeRound, followupDraft, setFollowupDraft,
  runAsk, onExitHistory,
}) {
  if (!results) return null;
  const isResearch = currentRound && currentRound.mode === 'research';
  return (
    <section className="container results" aria-label={isResearch ? '数据调研回应' : '人格回应'}>
      <div className="results__bar">
        <div>
          <h2 className="results__h">
            {viewingHistory ? '历史回应' : (running ? '人格正在思考…' : (isResearch ? '数据调研回应' : '16 种人格的回应'))}
          </h2>
          <p className="results__q">
            {rounds.length > 1 && currentRound
              ? `${rounds.length} 轮对话 · 当前第 ${currentRoundIndex + 1} 轮：「${currentRound.question}」`
              : `「${question}」`}
          </p>
        </div>
        <span className="spacer" />
        {viewingHistory && (
          <button className="btn btn--quiet" onClick={onExitHistory}>
            <Icon name="close" size={16} /><span className="btn__label">退出历史</span>
          </button>
        )}
        <div className="viewtoggle" role="group" aria-label="视图切换">
          <button aria-pressed={view === 'grid'} onClick={() => changeView('grid')} aria-label="网格视图" title="网格"><Icon name="grid" size={18} /></button>
          <button aria-pressed={view === 'list'} onClick={() => changeView('list')} aria-label="列表视图" title="列表"><Icon name="list" size={18} /></button>
        </div>
      </div>

      {running && (
        <div className="runbanner" role="status">
          <span className="dot" />
          正在让每个人格独立思考 · 已完成 {doneCount} / {totalCount}
        </div>
      )}

      <div className="round-carousel" data-direction={roundDirection}>
        {rounds.length > 1 && (
          <aside className="round-switch" aria-label="轮次切换">
            <button type="button" className="round-switch__btn round-switch__btn--up"
                    onClick={() => showRound(currentRoundIndex - 1)}
                    disabled={currentRoundIndex === 0}
                    aria-label="上一轮">
              <Icon name="chevron" size={26} className="ico--up" />
            </button>
            <span className="round-switch__count" aria-live="polite">
              <b>{currentRoundIndex + 1}</b><small>/ {rounds.length}</small>
            </span>
            <button type="button" className="round-switch__btn round-switch__btn--down"
                    onClick={() => showRound(currentRoundIndex + 1)}
                    disabled={currentRoundIndex >= rounds.length - 1}
                    aria-label="下一轮">
              <Icon name="chevron" size={26} className="ico--down" />
            </button>
          </aside>
        )}
        <div className="round-viewport">
          {currentRound && (
            <RoundPanel key={currentRound.id} round={currentRound} isLatest={true}
                        view={view} gridRef={gridRef} onFav={onFav} store={store}
                        onRetry={retryOne} onSummarize={summarizeRound} running={running} />
          )}
        </div>
      </div>
      {!running && rounds.length > 0 && !viewingHistory && (
        <FollowupComposer value={followupDraft}
                          onChange={setFollowupDraft}
                          running={running}
                          onSubmit={e => {
                            e.preventDefault();
                            const next = followupDraft.trim();
                            if (!next) return;
                            setFollowupDraft('');
                            runAsk(next, {
                              append: true,
                              mode: currentRound && currentRound.mode,
                              research: currentRound && currentRound.research,
                              attachments: currentRound && currentRound.attachments,
                              webSearch: currentRound && currentRound.webSearch,
                            });
                          }} />
      )}
    </section>
  );
}

function App() {
  const store = window.useStore();
  const toast = window.useToast();
  const reduced = useReducedMotion();

  const [route, setRoute] = useState('home');        // home | research | history | favorites
  const [showPresets, setShowPresets] = useState(false);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [researchDraft, setResearchDraft] = useState('');
  const [researchMode, setResearchMode] = useState('focused');
  const [customSubreddits, setCustomSubreddits] = useState('');
  const [researchData, setResearchData] = useState(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchError, setResearchError] = useState('');
  const [question, setQuestion] = useState('');
  const [results, setResults] = useState(null);       // { CODE: {status,...} }
  const [rounds, setRounds] = useState([]);
  const [followupDraft, setFollowupDraft] = useState('');
  const [running, setRunning] = useState(false);
  const [view, setView] = useState('list');           // grid | list
  const [viewingHistory, setViewingHistory] = useState(null);
  const [activeHistoryId, setActiveHistoryId] = useState(null);
  const [activeRoundIndex, setActiveRoundIndex] = useState(0);
  const [roundDirection, setRoundDirection] = useState('next');

  const gridRef = useRef(null);
  const prevRects = useRef(null);
  const taRef = useRef(null);
  const fileInputRef = useRef(null);

  const doneCount = results ? Object.values(results).filter(r => r.status !== 'loading').length : 0;
  const totalCount = window.PERSONAS.length;
  const currentRoundIndex = rounds.length ? Math.min(activeRoundIndex, rounds.length - 1) : 0;
  const currentRound = rounds[currentRoundIndex] || null;
  const isResearchRound = currentRound && currentRound.mode === 'research';

  useEffect(() => {
    if (!rounds.length && activeRoundIndex !== 0) {
      setActiveRoundIndex(0);
    } else if (rounds.length && activeRoundIndex > rounds.length - 1) {
      setActiveRoundIndex(rounds.length - 1);
    }
  }, [rounds.length, activeRoundIndex]);

  function updateRound(id, patch) {
    setRounds(prev => prev.map(r => r.id === id ? { ...r, ...(typeof patch === 'function' ? patch(r) : patch) } : r));
  }

  function makeHistoryEntry(id, roundList) {
    const safeRounds = roundList.map(stripRoundForHistory);
    const last = safeRounds[safeRounds.length - 1];
    return {
      id,
      ts: Date.now(),
      question: safeRounds[0] ? safeRounds[0].question : '',
      latestQuestion: last ? last.question : '',
      roundCount: safeRounds.length,
      mode: last && last.mode ? last.mode : 'standard',
      research: last && last.research ? last.research : null,
      webSearch: !!(last && last.webSearch),
      presetName: store.activePresetObj ? store.activePresetObj.name : '',
      results: last ? last.results : {},
      rounds: safeRounds,
    };
  }

  async function addFiles(fileList) {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    const room = Math.max(0, MAX_ATTACHMENTS - attachments.length);
    if (!room) {
      toast(`最多上传 ${MAX_ATTACHMENTS} 个附件`, 'close');
      return;
    }
    const selected = files.slice(0, room);
    if (files.length > room) toast(`已只加入前 ${room} 个附件`, 'close');
    setAttachmentBusy(true);
    try {
      const built = [];
      for (const file of selected) {
        try {
          built.push(await buildAttachment(file));
        } catch (err) {
          toast(err && err.message ? err.message : '附件读取失败', 'close');
        }
      }
      if (built.length) {
        setAttachments(prev => [...prev, ...built].slice(0, MAX_ATTACHMENTS));
        toast(`已加入 ${built.length} 个附件`, 'paperclip');
      }
    } finally {
      setAttachmentBusy(false);
    }
  }

  function onFileChange(e) {
    addFiles(e.target.files);
    e.target.value = '';
  }

  function onPasteFiles(e) {
    const files = Array.from(e.clipboardData && e.clipboardData.files ? e.clipboardData.files : []);
    if (!files.length) return;
    e.preventDefault();
    addFiles(files);
  }

  function removeAttachment(id) {
    setAttachments(prev => prev.filter(att => att.id !== id));
  }

  function hasActionableInput(value, list) {
    return !!String(value || '').trim() || (Array.isArray(list) && list.length > 0);
  }

  async function runHomeAsk() {
    const q = draft.trim() || (attachments.length ? '请分析并整理我上传的附件。' : '');
    if (!q || running || attachmentBusy) return;
    const useModelWebSearch = !!webSearchEnabled;
    if (useModelWebSearch && !store.modelReady && !(window.LLM && window.LLM.hasBridge)) {
      toast('联网搜索需要已连接模型 API，当前会用离线示例', 'close');
    }
    if (webSearchEnabled) {
      setRoute('home');
    }
    await runAsk(q, {
      mode: 'standard',
      webSearch: useModelWebSearch,
      attachments,
    });
  }

  async function fetchResearch(qRaw, options = {}) {
    const q = (qRaw || researchDraft).trim();
    if (!q) return null;
    const mode = options.mode || researchMode;
    const customTargets = parseCustomSubreddits(options.customSubreddits != null ? options.customSubreddits : customSubreddits);
    if (mode === 'custom' && !customTargets.length) {
      const msg = '自定义模式至少需要输入 1 个 subreddit';
      setResearchError(msg);
      toast(msg, 'close');
      return null;
    }
    setResearchLoading(true);
    setResearchError('');
    try {
      let strategy = null;
      if (window.LLM && window.LLM.isConfigured && window.LLM.isConfigured(store.data.modelConfig) && window.LLM.generateResearchStrategy) {
        try {
          strategy = await window.LLM.generateResearchStrategy(q, store.activePresetObj, store.data.modelConfig, mode, customTargets);
        } catch (err) {
          toast('模型检索策略生成失败，已使用词库兜底', 'close');
        }
      }
      const resp = await fetch('/api/reddit-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          mode,
          subreddits: mode === 'custom' ? customTargets : RESEARCH_SUBREDDITS,
          strategy,
          timeWindow: 'month',
          limit: 12,
        }),
      });
      const payload = await resp.json().catch(() => null);
      if (!resp.ok || !payload || !payload.items || !payload.items.length) {
        const msg = payload && payload.error && payload.error.message
          ? payload.error.message
          : 'Reddit 调研抓取失败';
        throw new Error(msg);
      }
      setResearchData(payload);
      return payload;
    } catch (err) {
      const msg = err && err.message ? err.message : 'Reddit 调研抓取失败';
      setResearchError(msg);
      toast(msg, 'close');
      return null;
    } finally {
      setResearchLoading(false);
    }
  }

  async function runResearchAsk(e) {
    if (e) e.preventDefault();
    const q = researchDraft.trim();
    if (!q || running || researchLoading) return;
    const research = await fetchResearch(q);
    if (!research) return;
    await runAsk(q, { mode: 'research', research });
  }

  function saveConversation(id, roundList) {
    if (!id || !roundList.length || !store.saveHistoryEntry) return;
    store.saveHistoryEntry(makeHistoryEntry(id, roundList));
  }

  /* --- ask --- */
  async function runAsk(qRaw, options) {
    const q = (qRaw != null ? qRaw : draft).trim();
    if (!q || running) return;
    const append = !!(options && options.append);
    const baseRounds = append ? rounds : [];
    const previousResearch = append && baseRounds.length ? baseRounds[baseRounds.length - 1].research : null;
    const previousAttachments = append && baseRounds.length ? baseRounds[baseRounds.length - 1].attachments : [];
    const previousWebSearch = append && baseRounds.length ? !!baseRounds[baseRounds.length - 1].webSearch : false;
    const research = (options && options.research) || previousResearch || null;
    const askAttachments = (options && Array.isArray(options.attachments)) ? options.attachments : (previousAttachments || []);
    const askWebSearch = options && Object.prototype.hasOwnProperty.call(options, 'webSearch')
      ? !!options.webSearch
      : previousWebSearch;
    const mode = (options && options.mode) || (research ? 'research' : 'standard');
    const roundId = window.uid();
    const historyId = append && activeHistoryId ? activeHistoryId : window.uid();
    const nextRoundIndex = baseRounds.length;
    setActiveHistoryId(historyId);
    setRoundDirection(append ? 'next' : 'reset');
    setActiveRoundIndex(nextRoundIndex);
    setRoute(mode === 'research' ? 'research' : 'home');
    setViewingHistory(null);
    setQuestion(q);
    setRunning(true);
    const init = {};
    window.PERSONAS.forEach(p => init[p.code] = { status: 'loading' });
    setResults(init);
    const newRound = {
      id: roundId,
      index: baseRounds.length + 1,
      ts: Date.now(),
      question: q,
      results: init,
      status: 'running',
      summary: null,
      summaryStatus: 'idle',
      mode,
      research,
      webSearch: askWebSearch,
      attachments: askAttachments,
    };
    setRounds([...baseRounds, newRound]);
    if (!append) setAttachments([]);
    setTimeout(() => {
      const el = document.getElementById('results-anchor');
      if (el) window.scrollTo({ top: el.offsetTop - 80, behavior: reduced ? 'auto' : 'smooth' });
    }, 30);

    const collected = {};
    await window.LLM.askAll(window.PERSONAS, q, store.activePresetObj, store.data.modelConfig, (code, payload) => {
      collected[code] = payload;
      setResults(prev => ({ ...prev, [code]: payload }));
      updateRound(roundId, r => ({ results: { ...r.results, [code]: payload } }));
    }, 6, baseRounds, research, askAttachments, askWebSearch);
    setRunning(false);
    const finalRound = { ...newRound, results: collected, status: 'done', mode, research, webSearch: askWebSearch, attachments: askAttachments };
    const finalRounds = [...baseRounds, finalRound];
    setRounds(finalRounds);
    setActiveRoundIndex(finalRounds.length - 1);
    setResults(collected);
    saveConversation(historyId, finalRounds);
    const failed = Object.values(collected).filter(r => r.status === 'error').length;
    toast(failed
      ? `已完成，${failed} 个人格使用兜底示例`
      : (mode === 'research'
        ? `已结合 ${research && research.items ? research.items.length : 0} 条 Reddit 素材生成回应`
        : (askWebSearch
          ? '已通过模型联网搜索能力生成回应'
          : (store.modelReady ? '16 个人格已通过模型回应' : '已生成示例回应（未连接模型）'))), 'spark');
  }

  function openHistory(h) {
    const restored = h.rounds && h.rounds.length
      ? h.rounds
      : [{ id: h.id + '-r1', index: 1, ts: h.ts, question: h.question, results: h.results || {}, status: 'done' }];
    const last = restored[restored.length - 1];
    setRounds(restored);
    setRoundDirection('reset');
    setActiveRoundIndex(Math.max(restored.length - 1, 0));
    setQuestion(last.question);
    setResults(last.results);
    setViewingHistory(h);
    setActiveHistoryId(h.id);
    setResearchData(last.research || h.research || null);
    if (last.research && last.research.mode) setResearchMode(last.research.mode);
    if (last.research && last.research.mode === 'custom' && Array.isArray(last.research.subreddits)) {
      setCustomSubreddits(last.research.subreddits.join(', '));
    }
    setResearchDraft(last.question || h.latestQuestion || h.question || '');
    setResearchError('');
    setRoute(last.mode === 'research' || h.mode === 'research' ? 'research' : 'home');
    setRunning(false);
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }

  function retryOne(persona, roundId) {
    const idx = rounds.findIndex(r => r.id === roundId);
    const round = idx >= 0 ? rounds[idx] : null;
    if (!round) return;
    const previousRounds = rounds.slice(0, idx);
    updateRound(roundId, r => ({ results: { ...r.results, [persona.code]: { status: 'loading' } } }));
    if (idx === rounds.length - 1) setResults(prev => ({ ...prev, [persona.code]: { status: 'loading' } }));
    window.LLM.askPersona(persona, round.question, store.activePresetObj, store.data.modelConfig, previousRounds, round.research, round.attachments, round.webSearch).then(res => {
      const nextPayload = { status: 'done', ...res };
      const updatedRounds = rounds.map(r => r.id === roundId
        ? { ...r, results: { ...r.results, [persona.code]: nextPayload }, summary: null, summaryStatus: 'idle' }
        : r);
      setRounds(updatedRounds);
      if (idx === rounds.length - 1) setResults(prev => ({ ...prev, [persona.code]: nextPayload }));
      saveConversation(activeHistoryId, updatedRounds);
    }).catch(err => {
      const fallback = { status: 'error', _error: err.message, ...window.LLM.cannedAnswer(persona, round.question, round.research) };
      const updatedRounds = rounds.map(r => r.id === roundId
        ? { ...r, results: { ...r.results, [persona.code]: fallback }, summary: null, summaryStatus: 'idle' }
        : r);
      setRounds(updatedRounds);
      if (idx === rounds.length - 1) setResults(prev => ({ ...prev, [persona.code]: fallback }));
      saveConversation(activeHistoryId, updatedRounds);
    });
  }

  async function summarizeRound(roundId) {
    const idx = rounds.findIndex(r => r.id === roundId);
    const round = idx >= 0 ? rounds[idx] : null;
    if (!round || round.summaryStatus === 'loading') return;
    updateRound(roundId, { summaryStatus: 'loading', summaryError: '' });
    try {
      const latestRound = rounds.find(r => r.id === roundId) || round;
      const summary = await window.LLM.summarizeRound(latestRound, rounds.slice(0, idx), store.data.modelConfig);
      const updatedRounds = rounds.map(r => r.id === roundId
        ? { ...r, summary, summaryStatus: 'done', summaryError: '' }
        : r);
      setRounds(updatedRounds);
      saveConversation(activeHistoryId, updatedRounds);
      toast('本轮总结已生成', 'spark');
    } catch (err) {
      updateRound(roundId, { summaryStatus: 'error', summaryError: err.message || '总结失败' });
      toast(err.message || '总结失败', 'close');
    }
  }

  function showRound(index) {
    const next = Math.max(0, Math.min(index, rounds.length - 1));
    if (next === currentRoundIndex) return;
    setRoundDirection(next > currentRoundIndex ? 'next' : 'prev');
    setActiveRoundIndex(next);
  }

  function onFav(payload) {
    store.toggleFavorite(payload);
    toast(store.isFav(payload.key) ? '已移出收藏' : '已收藏点子', 'star');
  }

  /* --- FLIP for grid <-> list --- */
  function recordRects() {
    const map = {};
    if (gridRef.current) {
      gridRef.current.querySelectorAll('[data-flip]').forEach(el => { map[el.dataset.flip] = el.getBoundingClientRect(); });
    }
    prevRects.current = map;
  }
  function changeView(v) {
    if (v === view) return;
    if (!reduced) recordRects();
    setView(v);
  }
  useLayoutEffect(() => {
    const prev = prevRects.current;
    prevRects.current = null;
    if (!prev || reduced || !gridRef.current) return;
    const els = Array.prototype.slice.call(gridRef.current.querySelectorAll('[data-flip]'));
    const moving = [];
    els.forEach(el => {
      const last = prev[el.dataset.flip];
      if (!last) return;
      const cur = el.getBoundingClientRect();
      const dx = last.left - cur.left, dy = last.top - cur.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      moving.push(el);
    });
    if (!moving.length) return;
    // force reflow to commit the inverted positions (no rAF dependency)
    void gridRef.current.offsetWidth;
    moving.forEach(el => {
      el.style.transition = 'transform 340ms cubic-bezier(.2,.8,.2,1)';
      el.style.transform = '';
    });
    // timer-based cleanup guarantees correct final layout even if the
    // transition can't animate (e.g. paused compositor / no transitionend)
    const t = setTimeout(() => moving.forEach(el => { el.style.transition = ''; el.style.transform = ''; }), 420);
    return () => clearTimeout(t);
  }, [view, reduced]);

  /* keyboard: Cmd/Ctrl+Enter to submit */
  function onTaKey(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); runHomeAsk(); }
  }
  function autoGrow(e) {
    const t = e.target; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 180) + 'px';
    setDraft(t.value);
  }

  const preset = store.activePresetObj;

  return (
    <>
      {/* ---- App bar ---- */}
      <header className="appbar">
        <div className="container appbar__inner">
          <a className="brand" href="#" onClick={e => { e.preventDefault(); setRoute('home'); }}>
            <span className="brand__mark"><Icon name="layers" size={19} /></span>
            <span className="brand__name"><b>人格</b>思维矩阵</span>
          </a>
          <span className="spacer" />
          <nav className="nav" aria-label="主导航">
            <button className="nav__btn" aria-current={route === 'home' ? 'page' : undefined} onClick={() => setRoute('home')}>
              <Icon name="home" size={18} /><span className="nav-label">主页</span>
            </button>
            <button className="nav__btn" aria-current={route === 'research' ? 'page' : undefined} onClick={() => setRoute('research')}>
              <Icon name="database" size={18} /><span className="nav-label">数据</span>
            </button>
            <button className="nav__btn" aria-current={route === 'history' ? 'page' : undefined} onClick={() => setRoute('history')}>
              <Icon name="clock" size={18} /><span className="nav-label">历史</span>
              {store.data.history.length > 0 && <span className="nav__count">{store.data.history.length}</span>}
            </button>
            <button className="nav__btn" aria-current={route === 'favorites' ? 'page' : undefined} onClick={() => setRoute('favorites')}>
              <Icon name="bookmark" size={18} /><span className="nav-label">收藏</span>
              {store.data.favorites.length > 0 && <span className="nav__count">{store.data.favorites.length}</span>}
            </button>
          </nav>
          <button className="btn btn--ghost header-settings" onClick={() => setShowPresets(true)}
                  aria-label="设置与设定" aria-haspopup="dialog" aria-expanded={showPresets ? 'true' : 'false'} title="设置">
            <Icon name="sliders" /><span className="nav-label">设置</span>
          </button>
        </div>
      </header>

      {/* ---- Routes ---- */}
      {route === 'home' && (
        <main>
          <section className="container hero" aria-labelledby="hero-title">
            <div className="hero__copy">
              <h1 className="hero__title" id="hero-title">让十六种思维方式，一起回答你的问题。</h1>
              <p className="hero__sub">
                输入一个议题，16 种 MBTI 人格会按各自的思想特征拆解问题、输出思考方式，并给出可保存的点子。
                {store.modelReady ? ` 当前模型：${store.modelLabel}。` : ' 当前为离线示例模式。'}
              </p>

              <form className="ask" onSubmit={e => { e.preventDefault(); runHomeAsk(); }}>
                <div className="ask__main">
                  <textarea ref={taRef} className="ask__ta" rows={1} value={draft}
                            aria-label="输入你的问题"
                            placeholder="输入一个议题，让 16 种人格分别拆解。"
                            onChange={autoGrow} onKeyDown={onTaKey} onPaste={onPasteFiles} />
                  <button className="btn btn--primary ask__send" type="submit"
                          data-loading={running ? 'true' : 'false'}
                          aria-disabled={(!hasActionableInput(draft, attachments) || running || attachmentBusy) ? 'true' : 'false'}
                          disabled={!hasActionableInput(draft, attachments) || running || attachmentBusy}>
                    {running && <span className="btn__spin" />}
                    <span className="btn__label row gap-2"><Icon name="send" size={18} />{webSearchEnabled ? '联网思考' : '开始思考'}</span>
                  </button>
                </div>
                <div className="ask__tools" aria-label="输入增强工具">
                  <button className={'btn btn--ghost ask__tool' + (webSearchEnabled ? ' is-active' : '')}
                          type="button"
                          aria-pressed={webSearchEnabled}
                          disabled={running || researchLoading}
                          onClick={() => setWebSearchEnabled(v => !v)}>
                    <Icon name="search" size={16} /><span className="btn__label">联网搜索</span>
                  </button>
                  <button className="btn btn--ghost ask__tool" type="button"
                          title="上传文件或图片，也可以直接 Ctrl+V 粘贴图片"
                          data-loading={attachmentBusy ? 'true' : 'false'}
                          disabled={running || attachmentBusy}
                          onClick={() => fileInputRef.current && fileInputRef.current.click()}>
                    {attachmentBusy && <span className="btn__spin" />}
                    <Icon name="paperclip" size={16} /><span className="btn__label">上传</span>
                  </button>
                  <input ref={fileInputRef}
                         className="sr-only"
                         type="file"
                         multiple
                         accept="image/*,.txt,.md,.csv,.json,.js,.jsx,.ts,.tsx,.css,.html,.xml,.yaml,.yml,.log,.pdf,.doc,.docx,.rtf"
                         onChange={onFileChange} />
                </div>
                <AttachmentTray attachments={attachments} onRemove={removeAttachment} />
              </form>

              <div className="askmeta">
                <button className="presetchip" onClick={() => setShowPresets(true)}>
                  <Icon name="sliders" size={16} />
                  <span className="presetchip__k">当前设定</span>
                  {preset ? preset.name : '无'}
                  <span className="presetchip__edit" aria-hidden="true"><Icon name="chevDown" size={15} /></span>
                </button>
                <button className="presetchip presetchip--data" onClick={() => { setResearchDraft(draft || researchDraft); setRoute('research'); }}>
                  <Icon name="database" size={16} />
                  <span className="presetchip__k">调研模式</span>
                  数据
                </button>
                <span className={'askmeta__hint' + (running ? '' : '')}>
                  {attachmentBusy
                    ? '正在读取附件…'
                    : (running
                      ? (webSearchEnabled ? `模型联网中 ${doneCount}/${totalCount}…` : `思考中 ${doneCount}/${totalCount}…`)
                      : 'Ctrl/⌘ + Enter 发送')}
                </span>
              </div>

              {!results && (
                <div className="chips" role="list" aria-label="示例问题">
                  {EXAMPLE_QS.map((q, i) => (
                    <button key={i} className="chip" role="listitem"
                            onClick={() => { setDraft(q); if (taRef.current) { taRef.current.value = q; taRef.current.focus(); } }}>
                      {q.length > 22 ? q.slice(0, 22) + '…' : q}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <PersonaPreview personas={window.PERSONAS} presetName={preset ? preset.name : '无'} />
          </section>

          <div id="results-anchor" />

          {results && !isResearchRound && (
            <ResultsSection
              results={results} running={running} viewingHistory={viewingHistory}
              rounds={rounds} currentRound={currentRound} currentRoundIndex={currentRoundIndex}
              question={question} doneCount={doneCount} totalCount={totalCount}
              view={view} changeView={changeView} showRound={showRound} roundDirection={roundDirection}
              gridRef={gridRef} onFav={onFav} store={store} retryOne={retryOne}
              summarizeRound={summarizeRound} followupDraft={followupDraft}
              setFollowupDraft={setFollowupDraft} runAsk={runAsk}
              onExitHistory={() => { setResults(null); setRounds([]); setViewingHistory(null); setActiveHistoryId(null); setQuestion(''); }}
            />
          )}
        </main>
      )}

      {route === 'research' && (
        <main>
          <ResearchRoute
            value={researchDraft}
            onChange={setResearchDraft}
            onSubmit={runResearchAsk}
            onFetchOnly={() => fetchResearch(researchDraft)}
            loading={researchLoading}
            running={running}
            research={researchData}
            error={researchError}
            presetName={preset ? preset.name : '无'}
            modelLabel={store.modelLabel}
            researchMode={researchMode}
            setResearchMode={setResearchMode}
            customSubreddits={customSubreddits}
            setCustomSubreddits={setCustomSubreddits}
          />
          <div id="results-anchor" />
          {results && isResearchRound && (
            <ResultsSection
              results={results} running={running} viewingHistory={viewingHistory}
              rounds={rounds} currentRound={currentRound} currentRoundIndex={currentRoundIndex}
              question={question} doneCount={doneCount} totalCount={totalCount}
              view={view} changeView={changeView} showRound={showRound} roundDirection={roundDirection}
              gridRef={gridRef} onFav={onFav} store={store} retryOne={retryOne}
              summarizeRound={summarizeRound} followupDraft={followupDraft}
              setFollowupDraft={setFollowupDraft} runAsk={runAsk}
              onExitHistory={() => { setResults(null); setRounds([]); setViewingHistory(null); setActiveHistoryId(null); setQuestion(''); }}
            />
          )}
        </main>
      )}

      {route === 'history' && (
        <main className="container section">
          <div className="section__head">
            <h1 className="section__title">历史记录</h1>
            <p className="section__sub">每次提问与 16 个人格的回应都会保存在这里，点击任意一条即可回看。</p>
          </div>
          <HistoryView store={store} onOpen={openHistory} />
        </main>
      )}

      {route === 'favorites' && (
        <main className="container section">
          <div className="section__head row" style={{ alignItems: 'flex-end' }}>
            <div>
              <h1 className="section__title">收藏的点子</h1>
              <p className="section__sub">你点亮过的好点子都在这里。</p>
            </div>
            <span className="spacer" />
            {store.data.favorites.length > 0 && (
              <button className="btn btn--quiet" onClick={() => { store.clearFavorites(); toast('已清空收藏', 'trash'); }}>清空</button>
            )}
          </div>
          <FavoritesView store={store} />
        </main>
      )}

      {showPresets && <PresetModal store={store} onClose={() => setShowPresets(false)} />}
    </>
  );
}
window.App = App;

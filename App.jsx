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

function ResearchEvidencePanel({ research, loading, error, compact = false }) {
  const items = research && Array.isArray(research.items) ? research.items : [];
  const isEmpty = !loading && !error && !items.length;
  if (isEmpty && compact) return null;
  return (
    <section className={'research-evidence' + (compact ? ' research-evidence--compact' : '')}
             aria-label="Reddit 调研数据">
      <div className="research-evidence__head">
        <span className="research-evidence__mark"><Icon name="database" size={17} /></span>
        <div>
          <h3>{loading ? '正在抓取 Reddit 数据' : (isEmpty ? '等待调研数据' : 'Reddit 真实素材')}</h3>
          <p>
            {loading
              ? '正在搜索相关帖子，完成后会把这些素材注入 16 个人格的思考上下文。'
              : error
                ? error
                : isEmpty
                  ? '输入议题后，会从这些社区抓取真实帖子，再交给 16 种人格继续分析。'
                  : `检索「${research.query}」，抓到 ${items.length} 条帖子 · ${research.source || 'reddit-rss'}`}
          </p>
        </div>
      </div>
      {isEmpty && (
        <div className="research-empty" aria-label="默认 Reddit 社区">
          {RESEARCH_SUBREDDITS.map(sub => <span className="tag tag--plain" key={sub}>r/{sub}</span>)}
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

function RoundPanel({ round, isLatest, view, gridRef, onFav, store, onRetry, onSummarize, running }) {
  const results = round.results || {};
  const doneCount = Object.values(results).filter(r => r && r.status !== 'loading').length;
  const totalCount = window.PERSONAS.length;
  const summarizing = round.summaryStatus === 'loading';
  const canSummarize = doneCount === totalCount && !running && !summarizing;
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
      {round.research && <ResearchEvidencePanel research={round.research} compact={true} />}
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
                         index={i} onFav={onFav} isFav={store.isFav} onRetry={() => onRetry(p, round.id)} />
          </div>
        ))}
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

function ResearchRoute({ value, onChange, onSubmit, onFetchOnly, loading, running, research, error, presetName, modelLabel }) {
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
            <div className="research-ask__actions">
              <button className="btn btn--ghost" type="button"
                      disabled={!value.trim() || loading || running}
                      data-loading={loading ? 'true' : 'false'}
                      onClick={onFetchOnly}>
                {loading && <span className="btn__spin" />}
                <Icon name="database" size={17} /><span className="btn__label">只抓数据</span>
              </button>
              <button className="btn btn--primary" type="submit"
                      disabled={!value.trim() || loading || running}
                      data-loading={(loading || running) ? 'true' : 'false'}>
                {(loading || running) && <span className="btn__spin" />}
                <Icon name="send" size={17} /><span className="btn__label">抓取并思考</span>
              </button>
            </div>
          </form>
          <div className="research-subs" aria-label="默认调研社区">
            {RESEARCH_SUBREDDITS.map(sub => <span className="tag tag--plain" key={sub}>r/{sub}</span>)}
          </div>
          <div className="chips" role="list" aria-label="调研示例">
            {RESEARCH_EXAMPLE_QS.map((q, i) => (
              <button key={i} className="chip" role="listitem" onClick={() => onChange(q)}>
                {q.length > 22 ? q.slice(0, 22) + '…' : q}
              </button>
            ))}
          </div>
        </div>
        <ResearchEvidencePanel research={research} loading={loading} error={error} />
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
  const [researchDraft, setResearchDraft] = useState('');
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
    const last = roundList[roundList.length - 1];
    return {
      id,
      ts: Date.now(),
      question: roundList[0] ? roundList[0].question : '',
      latestQuestion: last ? last.question : '',
      roundCount: roundList.length,
      mode: last && last.mode ? last.mode : 'standard',
      research: last && last.research ? last.research : null,
      presetName: store.activePresetObj ? store.activePresetObj.name : '',
      results: last ? last.results : {},
      rounds: roundList,
    };
  }

  async function fetchResearch(qRaw) {
    const q = (qRaw || researchDraft).trim();
    if (!q) return null;
    setResearchLoading(true);
    setResearchError('');
    try {
      const resp = await fetch('/api/reddit-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          subreddits: RESEARCH_SUBREDDITS,
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
    const research = (options && options.research) || previousResearch || null;
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
    };
    setRounds([...baseRounds, newRound]);
    setTimeout(() => {
      const el = document.getElementById('results-anchor');
      if (el) window.scrollTo({ top: el.offsetTop - 80, behavior: reduced ? 'auto' : 'smooth' });
    }, 30);

    const collected = {};
    await window.LLM.askAll(window.PERSONAS, q, store.activePresetObj, store.data.modelConfig, (code, payload) => {
      collected[code] = payload;
      setResults(prev => ({ ...prev, [code]: payload }));
      updateRound(roundId, r => ({ results: { ...r.results, [code]: payload } }));
    }, 6, baseRounds, research);
    setRunning(false);
    const finalRound = { ...newRound, results: collected, status: 'done', mode, research };
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
        : (store.modelReady ? '16 个人格已通过模型回应' : '已生成示例回应（未连接模型）')), 'spark');
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
    window.LLM.askPersona(persona, round.question, store.activePresetObj, store.data.modelConfig, previousRounds, round.research).then(res => {
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
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); runAsk(); }
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

              <form className="ask" onSubmit={e => { e.preventDefault(); runAsk(); }}>
                <textarea ref={taRef} className="ask__ta" rows={1} value={draft}
                          aria-label="输入你的问题"
                          placeholder="输入一个议题，让 16 种人格分别拆解。"
                          onChange={autoGrow} onKeyDown={onTaKey} />
                <button className="btn btn--primary ask__send" type="submit"
                        data-loading={running ? 'true' : 'false'}
                        aria-disabled={(!draft.trim() || running) ? 'true' : 'false'}
                        disabled={!draft.trim() || running}>
                  {running && <span className="btn__spin" />}
                  <span className="btn__label row gap-2"><Icon name="send" size={18} />开始思考</span>
                </button>
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
                  {running ? `思考中 ${doneCount}/${totalCount}…` : 'Ctrl/⌘ + Enter 发送'}
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

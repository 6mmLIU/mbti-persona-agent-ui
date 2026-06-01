/* App shell — routing, ask flow, FLIP grid↔list continuity transition. */
const { useState, useEffect, useRef, useLayoutEffect } = React;
const { Icon, PersonaCard, PresetModal, HistoryView, FavoritesView } = window;

const EXAMPLE_QS = [
  '我想做一款帮助年轻人坚持记笔记的 App，有什么新点子？',
  '怎样让一场线下读书会更有吸引力？',
  '如何在三个月内学会一项新技能？',
  '给一家小咖啡馆想几个让顾客愿意复购的主意。',
];

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

function App() {
  const store = window.useStore();
  const toast = window.useToast();
  const reduced = useReducedMotion();

  const [route, setRoute] = useState('home');        // home | history | favorites
  const [showPresets, setShowPresets] = useState(false);
  const [draft, setDraft] = useState('');
  const [question, setQuestion] = useState('');
  const [results, setResults] = useState(null);       // { CODE: {status,...} }
  const [running, setRunning] = useState(false);
  const [view, setView] = useState('list');           // grid | list
  const [viewingHistory, setViewingHistory] = useState(null);

  const gridRef = useRef(null);
  const prevRects = useRef(null);
  const taRef = useRef(null);

  const doneCount = results ? Object.values(results).filter(r => r.status !== 'loading').length : 0;
  const totalCount = window.PERSONAS.length;

  /* --- ask --- */
  async function runAsk(qRaw) {
    const q = (qRaw != null ? qRaw : draft).trim();
    if (!q || running) return;
    setRoute('home');
    setViewingHistory(null);
    setQuestion(q);
    setRunning(true);
    const init = {};
    window.PERSONAS.forEach(p => init[p.code] = { status: 'loading' });
    setResults(init);
    setTimeout(() => {
      const el = document.getElementById('results-anchor');
      if (el) window.scrollTo({ top: el.offsetTop - 80, behavior: reduced ? 'auto' : 'smooth' });
    }, 30);

    const collected = {};
    await window.LLM.askAll(window.PERSONAS, q, store.activePresetObj, store.data.modelConfig, (code, payload) => {
      collected[code] = payload;
      setResults(prev => ({ ...prev, [code]: payload }));
    });
    setRunning(false);
    store.addHistory({
      id: window.uid(), ts: Date.now(), question: q,
      presetName: store.activePresetObj ? store.activePresetObj.name : '', results: collected,
    });
    const failed = Object.values(collected).filter(r => r.status === 'error').length;
    toast(failed
      ? `已完成，${failed} 个人格使用兜底示例`
      : (store.modelReady ? '16 个人格已通过模型回应' : '已生成示例回应（未连接模型）'), 'spark');
  }

  function openHistory(h) {
    setQuestion(h.question);
    setResults(h.results);
    setViewingHistory(h);
    setRoute('home');
    setRunning(false);
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }

  function retryOne(persona) {
    setResults(prev => ({ ...prev, [persona.code]: { status: 'loading' } }));
    window.LLM.askPersona(persona, question, store.activePresetObj, store.data.modelConfig).then(res => {
      setResults(prev => ({ ...prev, [persona.code]: { status: 'done', ...res } }));
    }).catch(err => {
      setResults(prev => ({ ...prev, [persona.code]: { status: 'error', _error: err.message, ...window.LLM.cannedAnswer(persona, question) } }));
    });
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

          {results && (
            <section className="container results" aria-label="人格回应">
              <div className="results__bar">
                <div>
                  <h2 className="results__h">
                    {viewingHistory ? '历史回应' : (running ? '人格正在思考…' : '16 种人格的回应')}
                  </h2>
                  <p className="results__q">「{question}」</p>
                </div>
                <span className="spacer" />
                {viewingHistory && (
                  <button className="btn btn--quiet" onClick={() => { setResults(null); setViewingHistory(null); setQuestion(''); }}>
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

              <div className="persona-grid" data-view={view} ref={gridRef}>
                {window.PERSONAS.map((p, i) => (
                  <div data-flip={p.code} key={p.code}>
                    <PersonaCard persona={p} state={results[p.code]} view={view}
                                 index={i} onFav={onFav} isFav={store.isFav} onRetry={retryOne} />
                  </div>
                ))}
              </div>
            </section>
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

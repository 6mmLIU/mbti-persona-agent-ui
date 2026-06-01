/* Preset manager modal, History list, Favorites grid */
const { useState, useEffect, useRef } = React;
const { Icon } = window;

function parseApiImport(text, current) {
  const raw = (text || '').trim().replace(/\\n/g, '\n');
  if (!raw) throw new Error('请先粘贴 API 配置');
  let obj = null;
  try {
    obj = JSON.parse(raw);
  } catch (_) {
    obj = {};
    raw.split(/\r?\n/).forEach(line => {
      const clean = line.trim().replace(/^export\s+/, '');
      if (!clean || clean.startsWith('#')) return;
      const idx = clean.indexOf('=');
      if (idx === -1) return;
      const key = clean.slice(0, idx).trim().toLowerCase();
      const value = clean.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (/provider|type/.test(key)) obj.provider = value;
      if (/api[_-]?key|token|secret/.test(key)) obj.apiKey = value;
      if (/base[_-]?url|endpoint|url/.test(key)) obj.endpoint = value;
      if (/model/.test(key)) obj.model = value;
    });
  }
  return {
    ...current,
    ...obj,
    provider: obj.provider || current.provider,
    apiKey: obj.apiKey || obj.key || obj.token || current.apiKey,
    endpoint: obj.endpoint || obj.baseURL || obj.baseUrl || obj.base_url || current.endpoint,
    model: obj.model || current.model,
    enabled: true,
  };
}

function PresetModal({ store, onClose }) {
  const toast = window.useToast();
  const [mode, setMode] = useState('list'); // 'list' | 'edit'
  const [draft, setDraft] = useState(null);
  const [apiDraft, setApiDraft] = useState(() => ({ ...store.data.modelConfig }));
  const [apiImport, setApiImport] = useState('');
  const [testingApi, setTestingApi] = useState(false);
  const firstRef = useRef(null);
  const providers = window.LLM_PROVIDER_TEMPLATES || [];
  const currentProvider = providers.find(p => p.id === apiDraft.provider) || providers[0];

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const startNew = () => { setDraft({ id: window.uid(), name: '', bg: '', domain: '', style: '' }); setMode('edit'); };
  const startEdit = (p) => { setDraft({ ...p }); setMode('edit'); };
  const applyProvider = (id) => {
    const p = providers.find(x => x.id === id);
    if (!p) return;
    setApiDraft(d => ({
      ...d,
      enabled: true,
      provider: p.id,
      endpoint: p.endpoint || d.endpoint,
      model: p.model || d.model,
      apiVersion: p.apiVersion || d.apiVersion || '2023-06-01',
      jsonMode: true,
    }));
  };
  const save = () => {
    const p = { ...draft, name: (draft.name || '').trim() || '未命名设定' };
    store.savePreset(p);
    toast('设定已保存', 'check');
    setMode('list');
  };
  const saveApi = () => {
    store.saveModelConfig({ ...apiDraft, enabled: true });
    toast('模型 API 已保存', 'check');
  };
  const disableApi = () => {
    store.disableModelConfig();
    setApiDraft(d => ({ ...d, enabled: false }));
    toast('已切换为离线示例模式', 'spark');
  };
  const importApi = () => {
    try {
      const parsed = parseApiImport(apiImport, apiDraft);
      setApiDraft(parsed);
      setApiImport('');
      toast('API 配置已导入，请检查后保存', 'check');
    } catch (err) {
      toast(err.message || '导入失败', 'close');
    }
  };
  const testApi = async () => {
    setTestingApi(true);
    try {
      await window.LLM.testConfig({ ...apiDraft, enabled: true });
      toast('API 测试成功', 'check');
    } catch (err) {
      toast(err.message || 'API 测试失败', 'close');
    } finally {
      setTestingApi(false);
    }
  };

  return (
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="设置与设定">
        <div className="sheet__head">
          <span className="brand__mark" style={{ width: 32, height: 32 }}><Icon name="sliders" size={18} /></span>
          <h2 className="sheet__title">{mode === 'list' ? '设置与设定' : (store.data.presets.some(p=>p.id===draft.id) ? '编辑设定' : '新建设定')}</h2>
          <button className="btn btn--icon" onClick={onClose} aria-label="关闭"><Icon name="close" /></button>
        </div>

        {mode === 'list' ? (
          <>
            <div className="sheet__body">
              <p className="section__sub" style={{ marginTop: 0, marginBottom: 16 }}>
                设定会作为背景注入给 16 个人格。选择一个作为当前生效设定，可随时编辑、保存或新建。
              </p>
              <section className="setting-block" aria-labelledby="appearance-title">
                <div>
                  <h3 id="appearance-title">外观</h3>
                  <p>主题切换收进设置里，首页只保留一个明确入口。</p>
                </div>
                <div className="segmented" role="group" aria-label="外观主题">
                  <button type="button" aria-pressed={store.data.theme === 'light'}
                          onClick={() => store.setTheme('light')}>
                    浅色
                  </button>
                  <button type="button" aria-pressed={store.data.theme === 'dark'}
                          onClick={() => store.setTheme('dark')}>
                    深色
                  </button>
                </div>
              </section>

              <section className="api-panel" aria-labelledby="api-title">
                <div className="api-panel__head">
                  <div>
                    <h3 id="api-title">模型 API</h3>
                    <p>{store.modelReady ? `已连接：${store.modelLabel}` : '未连接 API 时会使用离线示例。运行本地服务时会自动走同源代理，密钥只保存在当前浏览器。'}</p>
                  </div>
                  <span className={'api-status' + (store.modelReady ? ' is-on' : '')}>
                    <span className="dot" />{store.modelReady ? '已启用' : '示例模式'}
                  </span>
                </div>

                <div className="provider-grid" role="group" aria-label="选择模型供应商">
                  {providers.map(p => (
                    <button key={p.id} type="button" aria-pressed={apiDraft.provider === p.id}
                            onClick={() => applyProvider(p.id)}>
                      <strong>{p.name}</strong>
                      <span>{p.hint}</span>
                    </button>
                  ))}
                </div>

                <div className="form api-form">
                  <div className="form__row">
                    <label htmlFor="api-key">API Key</label>
                    <input id="api-key" className="field field--mono" type="password" value={apiDraft.apiKey || ''}
                           placeholder="sk-... / sk-ant-... / AIza..."
                           autoComplete="off"
                           onChange={e => setApiDraft(d => ({ ...d, apiKey: e.target.value }))} />
                  </div>
                  <div className="form__split">
                    <div className="form__row">
                      <label htmlFor="api-model">模型</label>
                      <input id="api-model" className="field field--mono" value={apiDraft.model || ''}
                             placeholder={currentProvider ? currentProvider.model : 'model-id'}
                             onChange={e => setApiDraft(d => ({ ...d, model: e.target.value }))} />
                    </div>
                    <div className="form__row">
                      <label htmlFor="api-max">输出上限</label>
                      <input id="api-max" className="field field--mono" type="number" min="128" max="4096" value={apiDraft.maxTokens || 700}
                             onChange={e => setApiDraft(d => ({ ...d, maxTokens: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form__row">
                    <label htmlFor="api-endpoint">接口地址 <span className="hint">OpenAI 兼容接口可填 base URL 或 /chat/completions 完整地址</span></label>
                    <input id="api-endpoint" className="field field--mono" value={apiDraft.endpoint || ''}
                           placeholder={currentProvider ? currentProvider.endpoint : 'https://...'}
                           onChange={e => setApiDraft(d => ({ ...d, endpoint: e.target.value }))} />
                  </div>
                  {apiDraft.provider === 'anthropic' && (
                    <div className="form__row">
                      <label htmlFor="api-version">Anthropic Version</label>
                      <input id="api-version" className="field field--mono" value={apiDraft.apiVersion || '2023-06-01'}
                             onChange={e => setApiDraft(d => ({ ...d, apiVersion: e.target.value }))} />
                    </div>
                  )}
                  <div className="form__split">
                    <label className="checkline">
                      <input type="checkbox" checked={apiDraft.jsonMode !== false}
                             onChange={e => setApiDraft(d => ({ ...d, jsonMode: e.target.checked }))} />
                      <span>优先请求 JSON 输出</span>
                    </label>
                    <div className="form__row">
                      <label htmlFor="api-temp">温度</label>
                      <input id="api-temp" className="field field--mono" type="number" min="0" max="2" step="0.1" value={apiDraft.temperature || 0.7}
                             onChange={e => setApiDraft(d => ({ ...d, temperature: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form__row">
                    <label htmlFor="api-import">导入 API 配置 <span className="hint">支持 JSON 或 KEY=VALUE</span></label>
                    <textarea id="api-import" className="field field--mono" rows={3} value={apiImport}
                              placeholder={'{"provider":"openai","apiKey":"sk-...","model":"gpt-4o-mini","endpoint":"https://api.openai.com/v1/chat/completions"}'}
                              onChange={e => setApiImport(e.target.value)} />
                  </div>
                </div>

                <div className="api-actions">
                  <button className="btn btn--quiet" type="button" onClick={importApi}>
                    <Icon name="copy" size={17} /><span className="btn__label">导入</span>
                  </button>
                  <span className="spacer" />
                  <button className="btn btn--quiet" type="button" onClick={disableApi}>关闭 API</button>
                  <button className="btn btn--ghost" type="button" onClick={testApi}
                          data-loading={testingApi ? 'true' : 'false'}
                          disabled={testingApi || !(apiDraft.apiKey && apiDraft.model)}>
                    {testingApi && <span className="btn__spin" />}
                    <span className="btn__label">测试连接</span>
                  </button>
                  <button className="btn btn--primary" type="button" onClick={saveApi}
                          disabled={!(apiDraft.apiKey && apiDraft.model)}>
                    保存 API
                  </button>
                </div>
              </section>

              <div className="preset-switcher">
                {store.data.presets.map(p => (
                  <div key={p.id} className="preset-opt" aria-pressed={store.data.activePreset === p.id}
                       role="button" tabIndex={0}
                       onClick={() => store.setActivePreset(p.id)}
                       onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); store.setActivePreset(p.id); } }}>
                    <span className="preset-opt__radio" />
                    <span className="preset-opt__name">
                      {p.name}
                      {p.domain ? <span style={{ color:'var(--text-3)', fontWeight:400, fontSize:13 }}> · {p.domain}</span> : null}
                    </span>
                    <button className="btn btn--icon preset-opt__edit" style={{ minHeight:36, minWidth:36 }}
                            onClick={e => { e.stopPropagation(); startEdit(p); }} aria-label={`编辑 ${p.name}`}>
                      <Icon name="edit" size={17} />
                    </button>
                    {store.data.presets.length > 1 && (
                      <button className="btn btn--icon preset-opt__del" style={{ minHeight:36, minWidth:36 }}
                              onClick={e => { e.stopPropagation(); store.deletePreset(p.id); toast('已删除设定', 'trash'); }}
                              aria-label={`删除 ${p.name}`}>
                        <Icon name="trash" size={17} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="sheet__foot">
              <button className="btn btn--primary" onClick={startNew}><Icon name="plus" size={18} /><span className="btn__label">新建设定</span></button>
              <span className="spacer" />
              <button className="btn btn--ghost" onClick={onClose}>完成</button>
            </div>
          </>
        ) : (
          <>
            <div className="sheet__body">
              <div className="form">
                <div className="form__row">
                  <label htmlFor="p-name">设定名称</label>
                  <input id="p-name" ref={firstRef} className="field" value={draft.name}
                         placeholder="例如：独立开发者 / 品牌策划 / 学生"
                         onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
                </div>
                <div className="form__row">
                  <label htmlFor="p-bg">背景设定 <span className="hint">你是谁、在做什么</span></label>
                  <textarea id="p-bg" className="field" rows={3} value={draft.bg}
                            placeholder="我是一名独立开发者，正在做一款面向年轻人的笔记 App。"
                            onChange={e => setDraft(d => ({ ...d, bg: e.target.value }))} />
                </div>
                <div className="form__row">
                  <label htmlFor="p-domain">场景 / 领域</label>
                  <input id="p-domain" className="field" value={draft.domain}
                         placeholder="产品 / 增长 / 写作 / 人生决策…"
                         onChange={e => setDraft(d => ({ ...d, domain: e.target.value }))} />
                </div>
                <div className="form__row">
                  <label htmlFor="p-style">期望产出风格 <span className="hint">想要什么样的点子</span></label>
                  <textarea id="p-style" className="field" rows={2} value={draft.style}
                            placeholder="点子要轻量、低成本、能小步快跑地验证。"
                            onChange={e => setDraft(d => ({ ...d, style: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="sheet__foot">
              <button className="btn btn--quiet" onClick={() => setMode('list')}>返回</button>
              <span className="spacer" />
              <button className="btn btn--primary" onClick={save}>
                <Icon name="check" size={18} /><span className="btn__label">保存设定</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
window.PresetModal = PresetModal;

function timeAgo(ts) {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return '刚刚';
  if (d < 3600) return Math.floor(d / 60) + ' 分钟前';
  if (d < 86400) return Math.floor(d / 3600) + ' 小时前';
  return Math.floor(d / 86400) + ' 天前';
}

function HistoryView({ store, onOpen }) {
  const { history } = store.data;
  if (!history.length) return (
    <div className="empty">
      <h3>还没有历史记录</h3>
      <p>提出第一个问题，16 种人格的回答会自动保存在这里。</p>
    </div>
  );
  return (
    <div className="hlist">
      {history.map((h, i) => (
        <article key={h.id} className="card hitem rise" style={{ animationDelay: (i*45)+'ms' }}
                 role="button" tabIndex={0} onClick={() => onOpen(h)}
                 onKeyDown={e => { if (e.key==='Enter') onOpen(h); }}>
          <div className="hitem__top">
            <span className="hitem__q">{h.question}</span>
            <Icon name="chevron" size={18} className="" />
          </div>
          <div className="hitem__meta">
            <span className="row gap-2"><Icon name="clock" size={15} />{timeAgo(h.ts)}</span>
            {h.presetName && <span className="row gap-2"><Icon name="layers" size={15} />{h.presetName}</span>}
            <span className="row gap-2"><Icon name="user" size={15} />{Object.keys(h.results || {}).length} 个人格</span>
          </div>
        </article>
      ))}
    </div>
  );
}
window.HistoryView = HistoryView;

function FavoritesView({ store }) {
  const toast = window.useToast();
  const { favorites } = store.data;
  if (!favorites.length) return (
    <div className="empty">
      <h3>收藏夹是空的</h3>
      <p>在任意点子右侧点亮 ☆，把喜欢的点子收集到这里。</p>
    </div>
  );
  return (
    <div className="favgrid">
      {favorites.map((f, i) => (
        <article key={f.key} className="card fav rise" style={{ animationDelay:(i*45)+'ms' }}>
          <span className="mono" style={{ width:40, height:40, borderRadius:11 }}>
            <b>{f.persona.slice(0,2)}</b><b>{f.persona.slice(2)}</b>
          </span>
          <div className="fav__body">
            <p className="fav__idea">{f.idea}</p>
            <p className="fav__src">来自 {f.name}（{f.persona}）</p>
          </div>
          <button className="btn btn--icon" onClick={() => { store.toggleFavorite(f); toast('已移出收藏', 'star'); }}
                  aria-label="移出收藏"><Icon name="trash" size={17} /></button>
        </article>
      ))}
    </div>
  );
}
window.FavoritesView = FavoritesView;

/* Persistence + toast. Exposes window.useStore, window.ToastHost, window.useToast */
const { useState, useEffect, useCallback, useRef, createContext, useContext } = React;
const { Icon } = window;

const LS = 'mbti_matrix_v1';
function load() {
  try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (_) { return {}; }
}
function persist(data) {
  try { localStorage.setItem(LS, JSON.stringify(data)); } catch (_) {}
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const SEED_PRESETS = [
  { id: 'seed1', name: '独立开发者', bg: '我是一名独立开发者，正在做一款面向年轻人的笔记 App。',
    domain: '产品 / 增长', style: '点子要轻量、低成本、能小步快跑地验证。' },
  { id: 'seed2', name: '中立通用', bg: '', domain: '', style: '' },
];

const DEFAULT_MODEL_CONFIG = {
  enabled: false,
  provider: 'openai',
  apiKey: '',
  endpoint: 'https://api.openai.com/v1/chat/completions',
  model: 'gpt-4o-mini',
  apiVersion: '2023-06-01',
  temperature: 0.7,
  maxTokens: 1100,
  jsonMode: true,
};

function normalizeModelConfig(config) {
  const base = { ...DEFAULT_MODEL_CONFIG, ...(config || {}) };
  const oldDeepSeekModels = new Set([
    'deepseek-chat',
    'deepseek-v4-flash',
    'deepseek-v4-flash-chat',
    'deepseek-v4-flash-reasoner',
  ]);
  if (base.provider === 'deepseek' && oldDeepSeekModels.has(base.model)) {
    base.model = 'deepseek-v4-pro';
  }
  if (base.provider === 'deepseek' && !base.endpoint) {
    base.endpoint = 'https://api.deepseek.com/chat/completions';
  }
  return base;
}

function useStore() {
  const [data, setData] = useState(() => {
    const d = load();
    return {
      theme: d.theme || 'light',
      presets: d.presets && d.presets.length ? d.presets : SEED_PRESETS,
      activePreset: d.activePreset || (d.presets && d.presets[0] ? d.presets[0].id : 'seed1'),
      modelConfig: normalizeModelConfig(d.modelConfig),
      history: d.history || [],
      favorites: d.favorites || [],
    };
  });

  useEffect(() => { persist(data); }, [data]);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', data.theme);
  }, [data.theme]);

  const api = {
    data,
    setTheme: (theme) => setData(d => ({ ...d, theme })),
    saveModelConfig: (config) => setData(d => {
      const c = normalizeModelConfig(config);
      return {
        ...d,
        modelConfig: {
          ...c,
          enabled: !!c.enabled,
          provider: c.provider || DEFAULT_MODEL_CONFIG.provider,
          apiKey: (c.apiKey || '').trim(),
          endpoint: (c.endpoint || '').trim(),
          model: (c.model || '').trim(),
          apiVersion: (c.apiVersion || DEFAULT_MODEL_CONFIG.apiVersion).trim(),
          temperature: Number(c.temperature || DEFAULT_MODEL_CONFIG.temperature),
          maxTokens: Number(c.maxTokens || DEFAULT_MODEL_CONFIG.maxTokens),
          jsonMode: c.jsonMode !== false,
        },
      };
    }),
    disableModelConfig: () => setData(d => ({ ...d, modelConfig: { ...d.modelConfig, enabled: false } })),
    setActivePreset: (id) => setData(d => ({ ...d, activePreset: id })),
    savePreset: (p) => setData(d => {
      const exists = d.presets.some(x => x.id === p.id);
      const presets = exists ? d.presets.map(x => x.id === p.id ? p : x) : [...d.presets, p];
      return { ...d, presets, activePreset: p.id };
    }),
    deletePreset: (id) => setData(d => {
      const presets = d.presets.filter(x => x.id !== id);
      const activePreset = d.activePreset === id ? (presets[0] ? presets[0].id : null) : d.activePreset;
      return { ...d, presets, activePreset };
    }),
    saveHistoryEntry: (entry) => setData(d => {
      const next = [
        entry,
        ...d.history.filter(h => h.id !== entry.id),
      ].slice(0, 40);
      return { ...d, history: next };
    }),
    addHistory: (entry) => setData(d => ({ ...d, history: [entry, ...d.history].slice(0, 40) })),
    deleteHistory: (id) => setData(d => ({ ...d, history: d.history.filter(h => h.id !== id) })),
    toggleFavorite: (fav) => setData(d => {
      const key = fav.key;
      const exists = d.favorites.some(f => f.key === key);
      return { ...d, favorites: exists ? d.favorites.filter(f => f.key !== key) : [{ ...fav }, ...d.favorites] };
    }),
    isFav: (key) => data.favorites.some(f => f.key === key),
    clearFavorites: () => setData(d => ({ ...d, favorites: [] })),
  };
  api.activePresetObj = data.presets.find(p => p.id === data.activePreset) || null;
  api.modelReady = !!(window.LLM && window.LLM.isConfigured(data.modelConfig));
  api.modelLabel = window.LLM && window.LLM.describeConfig
    ? window.LLM.describeConfig(data.modelConfig)
    : '离线示例';
  return api;
}
window.useStore = useStore;
window.uid = uid;

/* ---- Toast ---- */
const ToastCtx = createContext(null);
window.useToast = () => useContext(ToastCtx);

function ToastHost({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, icon = 'check') => {
    const id = uid();
    setToasts(t => [...t, { id, msg, icon }]);
    setTimeout(() => setToasts(t => t.map(x => x.id === id ? { ...x, leaving: true } : x)), 2700);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2950);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {toasts.map(t => (
          <div className="toast" key={t.id} data-leaving={t.leaving ? 'true' : 'false'}>
            <Icon name={t.icon} size={18} />
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
window.ToastHost = ToastHost;

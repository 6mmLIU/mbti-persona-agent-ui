/* PersonaCard — resting / loading / result states. */
const { Icon } = window;
function Monogram({ code }) {
  return (
    <span className="mono" aria-hidden="true">
      <b>{code.slice(0, 2)}</b><b>{code.slice(2)}</b>
    </span>
  );
}

function citationKey(source) {
  if (!source) return '';
  if (typeof source === 'string') return source.trim().toLowerCase();
  return String(source.url || `${source.title || ''}|${source.domain || ''}`).trim().toLowerCase();
}

function cardCitations(state, citationIndex) {
  const raw = state && Array.isArray(state.citations)
    ? state.citations
    : (state && Array.isArray(state.sources) ? state.sources : []);
  const seen = new Set();
  return raw.map((source, i) => {
    const key = citationKey(source);
    if (!key || seen.has(key)) return null;
    seen.add(key);
    if (typeof source === 'string') {
      const isUrl = /^https?:\/\//i.test(source);
      return {
        title: source,
        url: isUrl ? source : '',
        number: citationIndex && citationIndex[key] ? citationIndex[key] : i + 1,
      };
    }
    return {
      ...source,
      number: citationIndex && citationIndex[key] ? citationIndex[key] : (source.id || i + 1),
    };
  }).filter(Boolean).slice(0, 4);
}

function CitationRefs({ citations }) {
  if (!Array.isArray(citations) || !citations.length) return null;
  return (
    <span className="cite-refs" aria-label="网页引用来源">
      {citations.map(source => source.url ? (
        <a className="cite-ref" href={source.url} target="_blank" rel="noreferrer"
           title={source.title || source.domain || '打开网页来源'} key={`${source.number}-${source.url}`}>
          {source.number}
        </a>
      ) : (
        <span className="cite-ref cite-ref--plain" title={source.title || '网页来源'} key={`${source.number}-${source.title}`}>
          {source.number}
        </span>
      ))}
    </span>
  );
}

function unquoteJSONishValue(value) {
  let v = String(value || '').trim();
  if (v.startsWith('"')) v = v.slice(1);
  if (v.endsWith('"')) v = v.slice(0, -1);
  return v
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\t/g, ' ')
    .trim();
}

function extractJSONishField(text, key) {
  const raw = String(text || '');
  const match = new RegExp(`"${key}"\\s*:\\s*`).exec(raw);
  if (!match) return '';
  const start = match.index + match[0].length;
  const tail = raw.slice(start);
  const next = tail.search(/,\s*"(signature|thinking|conclusion|ideas|tags|sources|citations|references)"\s*:/);
  const value = next >= 0 ? tail.slice(0, next) : tail.replace(/\s*}\s*$/, '');
  return unquoteJSONishValue(value);
}

function cleanGeneratedText(value, key = 'conclusion') {
  const raw = String(value || '');
  const repaired = /^\s*\{/.test(raw) && /"conclusion"\s*:/.test(raw)
    ? (extractJSONishField(raw, key) || extractJSONishField(raw, 'conclusion'))
    : raw;
  return repaired
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .replace(/\s*(?:https?:\/\/[^\s"'<>，。）、)]+)\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function usefulIdeaText(value) {
  const text = cleanGeneratedText(value);
  const compact = text.replace(/\s+/g, '');
  if (compact.length <= 2) return false;
  if (/^(在|或|和|与|及|的|了|把|用|为|对|从|中|上|下|先|再|并|但|这|那)$/.test(compact)) return false;
  if (/^["'“”‘’、，。；：:,.!?！？[\](){}]+$/.test(compact)) return false;
  return /[\u4e00-\u9fa5A-Za-z0-9]/.test(compact);
}

function cleanIdeaList(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .map(item => cleanGeneratedText(item))
    .filter(item => {
      const key = item.replace(/\s+/g, '').toLowerCase();
      if (!usefulIdeaText(item) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function CitedText({ className, children, citations, field = 'conclusion' }) {
  return (
    <p className={className}>
      {cleanGeneratedText(children, field)}
      <CitationRefs citations={citations} />
    </p>
  );
}

function PersonaCard({ persona, state, view, onFav, isFav, onRetry, index, citationIndex }) {
  const g = window.GROUPS[persona.group];
  const status = state ? state.status : 'idle';
  const loading = status === 'loading';
  const done = status === 'done' || status === 'error';
  const r = done ? state : null;
  const errored = status === 'error';

  const sig   = r ? r.signature : persona.sig;
  const think = r ? r.thinking  : persona.essence;
  const conclusion = r && r.conclusion
    ? r.conclusion
    : `我的结论是：${persona.essence} 我会先按这个视角判断优先级，再把想法变成一个能马上验证的小行动。`;
  const tags  = r ? (r.tags || persona.tags) : persona.tags;
  const ideas = r ? cleanIdeaList(r.ideas || []) : [];
  const citations = cardCitations(r, citationIndex);

  return (
    <article className={'pcard' + (loading ? ' is-loading' : '')} data-view={view}
             data-tone={g.tone} style={{ '--i': index }} aria-busy={loading}>
      <span className="tone-block pcard__tone" aria-hidden="true" />
      <header className="pcard__head">
        <Monogram code={persona.code} />
        <div className="pcard__id">
          <h3 className="pcard__name">{persona.name}</h3>
          <span className="pcard__meta">{persona.code} · {g.label} · {g.colorName}</span>
        </div>
        {done && (
          <button className="btn btn--icon pcard__retry" onClick={() => onRetry(persona)}
                  title="重新生成" aria-label={`让${persona.name}重新思考`}>
            <Icon name="refresh" size={18} />
          </button>
        )}
      </header>

      <p className="pcard__sig">
        {loading ? <span className="skel" style={{ display:'block', height:14, width:'70%' }} /> : `“${sig}”`}
      </p>
      {errored && (
        <p className="pcard__error" role="status">
          接口调用失败，当前显示兜底示例。{r && r._error ? `错误：${r._error}` : ''}
        </p>
      )}

      <div className="pcard__body">
        <div className="pcard__block">
          <span className="pcard__label">人格介绍</span>
          {loading
            ? <div className="skel-lines"><span className="skel" /><span className="skel" style={{ width:'82%' }} /></div>
            : <p className="pcard__think">{persona.essence}</p>}
        </div>

        <div className="pcard__block">
          <span className="pcard__label">本次思维方式</span>
          {loading
            ? <div className="skel-lines"><span className="skel" /><span className="skel" style={{ width:'82%' }} /></div>
            : <CitedText className="pcard__think" field="thinking" citations={citations.slice(0, 2)}>{think}</CitedText>}
        </div>

        <div className="pcard__block pcard__block--conclusion">
          <span className="pcard__label">结论</span>
          {loading
            ? <div className="skel-lines"><span className="skel" /><span className="skel" /><span className="skel" style={{ width:'86%' }} /></div>
            : <CitedText className="pcard__conclusion" citations={citations}>{conclusion}</CitedText>}
        </div>

        {(loading || ideas.length > 0) && (
          <div className="pcard__block">
            <span className="pcard__label">点子</span>
            {loading ? (
              <div className="skel-lines">
                <span className="skel" /><span className="skel" style={{ width:'90%' }} /><span className="skel" style={{ width:'66%' }} />
              </div>
            ) : (
              <ul className="pcard__ideas">
                {ideas.map((idea, i) => {
                  const key = persona.code + '|' + idea;
                  const fav = isFav(key);
                  return (
                    <li key={i} className="idea" style={{ '--j': i }}>
                      <span className="idea__text">
                        {cleanGeneratedText(idea)}
                        <CitationRefs citations={i === 0 ? citations.slice(0, 2) : []} />
                      </span>
                      <button
                        className={'idea__fav' + (fav ? ' is-on' : '')}
                        onClick={() => onFav({ key, idea, persona: persona.code, name: persona.name })}
                        aria-pressed={fav}
                        aria-label={fav ? '取消收藏此点子' : '收藏此点子'}
                        title={fav ? '已收藏' : '收藏点子'}>
                        <Icon name={fav ? 'starF' : 'star'} size={17} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      <footer className="pcard__tags">
        {(loading ? [0,1,2] : tags).map((t, i) =>
          loading
            ? <span key={i} className="skel" style={{ height:24, width:54, borderRadius:999 }} />
            : <span key={i} className="tag">{t}</span>
        )}
      </footer>
    </article>
  );
}
window.PersonaCard = PersonaCard;

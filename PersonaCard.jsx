/* PersonaCard — resting / loading / result states. */
const { Icon } = window;
function Monogram({ code }) {
  return (
    <span className="mono" aria-hidden="true">
      <b>{code.slice(0, 2)}</b><b>{code.slice(2)}</b>
    </span>
  );
}

function PersonaCard({ persona, state, view, onFav, isFav, onRetry, index }) {
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
  const ideas = r ? (r.ideas || []) : [];

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
            : <p className="pcard__think">{think}</p>}
        </div>

        <div className="pcard__block pcard__block--conclusion">
          <span className="pcard__label">结论</span>
          {loading
            ? <div className="skel-lines"><span className="skel" /><span className="skel" /><span className="skel" style={{ width:'86%' }} /></div>
            : <p className="pcard__conclusion">{conclusion}</p>}
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
                      <span className="idea__text">{idea}</span>
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

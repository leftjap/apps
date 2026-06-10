/* taste — 홈(메인 추천 피드) 화면 — 영화·책 트랙 분리 */
const { useState: useSh } = React;

function Basis({ ids, onOpen }) {
  return (
    <div className="basis">
      <span className="basis__lead" aria-hidden="true">↳</span>
      <div className="basis__chips">
        {ids.map((id) => {
          const w = window.TASTE.works[id];
          if (!w) return null;
          return (
            <button key={id} className="basis__chip"
              onClick={(e) => { e.stopPropagation(); onOpen(id); }}>
              «{w.title}»
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Segmented({ value, onChange }) {
  const opts = [['all', '전체'], ['film', '영화'], ['book', '책']];
  return (
    <div className="seg" role="tablist">
      {opts.map(([k, label]) => (
        <button
          key={k}
          role="tab"
          className={'seg__btn' + (value === k ? ' is-on' : '')}
          onClick={() => onChange(k)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/* 슬림 오늘의 추천 — 영역 전체 클릭 */
function Featured({ rec, onOpen, analyzing }) {
  const w = window.TASTE.works[rec.to];
  return (
    <section className="feat" onClick={() => onOpen(rec.to)}>
      <div className="feat__eyebrow">
        <Dot /> <span>오늘의 추천</span>
        <span className="feat__kind">{w.type === 'film' ? '영화' : '책'}</span>
      </div>
      <div className="feat__body">
        <div className="feat__poster">
          <Poster work={w} w={108} rounded={10} label={false} />
        </div>
        <div className="feat__text">
          <h2 className="feat__title">{w.title}</h2>
          <span className="feat__meta">{w.sub.split(' · ').slice(-2).join(' · ')}</span>
          {analyzing ? (
            <p className="feat__reason feat__reason--pending">
              <span className="pulse" /> 새 평가를 반영해 추천을 다시 고르는 중입니다.
            </p>
          ) : (
            <p className="feat__reason">{rec.reason}</p>
          )}
          <Basis ids={rec.basis} onOpen={onOpen} />
        </div>
      </div>
    </section>
  );
}

function RecRow({ rec, onOpen }) {
  const w = window.TASTE.works[rec.to];
  return (
    <article className="rec" onClick={() => onOpen(rec.to)}>
      <div className="rec__poster">
        <Poster work={w} w={76} rounded={9} label={false} />
      </div>
      <div className="rec__text">
        <h3 className="rec__title">{w.title}</h3>
        <p className="rec__reason">{rec.reason}</p>
        <Basis ids={rec.basis} onOpen={onOpen} />
      </div>
    </article>
  );
}

function RecSkeleton() {
  return (
    <article className="rec rec--skel" aria-hidden="true">
      <div className="sk sk--poster" style={{ width: 76, height: 112 }} />
      <div className="rec__text" style={{ flex: 1 }}>
        <div className="sk sk--line" style={{ width: '34%' }} />
        <div className="sk sk--line" style={{ width: '92%', marginTop: 12 }} />
        <div className="sk sk--line" style={{ width: '72%' }} />
      </div>
    </article>
  );
}

function Track({ title, count, recs, onOpen, pending }) {
  return (
    <section className="track">
      <div className="track__head">
        <h2 className="track__h">{title}</h2>
        <span className="track__count">{count}편</span>
        {pending && (
          <span className="branches__status branches__status--on">
            <span className="pulse" /> 갱신 중…
          </span>
        )}
      </div>
      <div className="track__list">
        {pending
          ? [0, 1].map((i) => <RecSkeleton key={i} />)
          : recs.map((r) => <RecRow key={r.to} rec={r} onOpen={onOpen} />)}
      </div>
    </section>
  );
}

function Home({ onOpen, ratings, analyzing }) {
  const home = window.TASTE.home;
  const [filter, setFilter] = useSh('all');
  const ratedCount = Object.values(ratings).filter((v) => v > 0).length;
  const pending = analyzing === 'home';

  const featured = filter === 'book' ? home.heroBook : home.heroFilm;
  const showFilms = filter === 'all' || filter === 'film';
  const showBooks = filter === 'all' || filter === 'book';

  const recent = window.TASTE.recent.filter((id) => {
    const w = window.TASTE.works[id];
    return filter === 'all' || w.type === filter;
  });

  return (
    <div className="home">
      <header className="home__intro">
        <h1 className="home__greet">다음에 무엇을 볼까요</h1>
        <p className="home__note">
          지금까지 평가한 <b>{ratedCount}편</b>을 취합해 골랐습니다.
        </p>
        <Segmented value={filter} onChange={setFilter} />
      </header>

      <Featured rec={featured} onOpen={onOpen} analyzing={pending} />

      <div className="tracks">
        {showFilms && (
          <Track title="다음에 볼 영화" count={home.films.length}
            recs={home.films} onOpen={onOpen} pending={pending} />
        )}
        {showBooks && (
          <Track title="다음에 읽을 책" count={home.books.length}
            recs={home.books} onOpen={onOpen} pending={pending} />
        )}
      </div>

      <section className="recent">
        <h2 className="recent__h">최근 평가</h2>
        <div className="recent__row">
          {recent.map((id) => {
            const w = window.TASTE.works[id];
            const r = ratings[id] ?? 0;
            return (
              <button key={id} className="recent__item" onClick={() => onOpen(id)}>
                <Poster work={w} w={60} rounded={8} label={false} />
                <span className="recent__title">{w.title}</span>
                <span className="recent__stars">
                  {r > 0 && r <= 0.5 ? (
                    <span className="recent__pan">비추 0.5</span>
                  ) : (
                    <span className="recent__val">{r > 0 ? `★ ${r.toFixed(1)}` : '미평가'}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

Object.assign(window, { Home });

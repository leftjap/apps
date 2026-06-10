/* pick — 작품 상세(허브) 화면 */
function InfoRow({ label, children }) {
  return (
    <div className="inforow">
      <dt className="inforow__k">{label}</dt>
      <dd className="inforow__v">{children}</dd>
    </div>
  );
}

/* 갈래 — 이 작품에서 이어지는 다른 작품. 상세 전용 인덱스 카탈로그. */
function BranchCard({ branch, work, index, onOpen }) {
  return (
    <a className="branch" onClick={() => onOpen(branch.to)}>
      <span className="branch__index">{String(index).padStart(2, '0')}</span>
      <Poster work={work} w={48} rounded={7} label={false} />
      <div className="branch__body">
        <div className="branch__head">
          <span className="branch__title">{work.title}</span>
          <span className="branch__kind">{work.type === 'film' ? '영화' : '책'}</span>
        </div>
        <p className="branch__reason">{branch.reason}</p>
      </div>
    </a>
  );
}

function BranchSkeleton({ index }) {
  return (
    <div className="branch branch--skel" aria-hidden="true">
      <span className="branch__index">{String(index).padStart(2, '0')}</span>
      <div className="sk sk--poster" style={{ width: 48, height: 71, borderRadius: 7 }} />
      <div className="branch__body">
        <div className="sk sk--line" style={{ width: '38%' }} />
        <div className="sk sk--line" style={{ width: '90%', marginTop: 11 }} />
      </div>
    </div>
  );
}

function Detail({ work, ratings, setRating, onOpen, path, analyzing }) {
  const isFilm = work.type === 'film';
  const myRating = ratings[work.id] ?? 0;
  const branches = work.branches
    .map((b) => ({ b, w: window.PICK.works[b.to] }))
    .filter((x) => x.w);

  const pending = analyzing === work.id;

  return (
    <article className="detail">
      {/* breadcrumb / 가지를 타고 온 경로 */}
      {path.length > 1 && (
        <nav className="trail">
          {path.map((id, i) => {
            const w = window.PICK.works[id];
            const last = i === path.length - 1;
            return (
              <span key={id + i} className="trail__seg">
                {i > 0 && <span className="trail__sep">가지 →</span>}
                {last ? (
                  <span className="trail__cur">{w.title}</span>
                ) : (
                  <a className="trail__link" onClick={() => onOpen(id, i)}>{w.title}</a>
                )}
              </span>
            );
          })}
        </nav>
      )}

      <div className="detail__body">
        {/* 좌측 사이드바 — 포스터 · 정보 · 별점 (스티키) */}
        <aside className="rail">
          <Poster work={work} w={200} rounded={12} label={false} />

          <dl className="info">
            {isFilm ? (
              <>
                <InfoRow label="감독">{work.meta.director}</InfoRow>
                <InfoRow label="출연">{work.meta.cast.join(', ')}</InfoRow>
                <InfoRow label="극본">{work.meta.writer}</InfoRow>
              </>
            ) : (
              <>
                <InfoRow label="저자">{work.meta.author}</InfoRow>
                {work.meta.translator && <InfoRow label="옮김">{work.meta.translator}</InfoRow>}
                <InfoRow label="출판">{work.meta.publisher}</InfoRow>
              </>
            )}
          </dl>

          <div className="ratebox">
            <div className="ratebox__label">내 평가</div>
            <StarRating
              value={myRating}
              editable
              size={28}
              onChange={(v) => setRating(work.id, v === myRating ? 0 : v)}
            />
            {myRating > 0 && (
              <button className="ratebox__clear" onClick={() => setRating(work.id, 0)}>
                평가 지우기
              </button>
            )}
          </div>
        </aside>

        {/* 우측 — 제목 · 줄거리 · 갈래를 한 컬럼에 쌓아 공간을 채움 */}
        <div className="detail__main">
          <header className="detail__head">
            <div className="detail__kind">
              <Dot /> <span>{isFilm ? '영화' : '책'}</span>
              <span className="detail__measure">
                {isFilm ? `${work.runtime}분` : `${work.pages}쪽`}
              </span>
            </div>
            <h1 className="detail__title">{work.title}</h1>
            <p className="detail__sub">{work.sub}</p>
            <div className="detail__tags">
              {work.tags.map((t) => <Chip key={t}>{t}</Chip>)}
            </div>
          </header>

          <section className="reading">
            <h2 className="reading__h">줄거리</h2>
            <p className="reading__body">{work.summary}</p>
          </section>

          {/* 갈래 — 이 한 작품에서 이어지는 다른 작품 */}
          <section className="branches">
            <div className="branches__head">
              <h2 className="branches__h">이 작품에서 이어지는 갈래</h2>
              {pending ? (
                <span className="branches__status branches__status--on">
                  <span className="pulse" /> 평가를 반영해 다시 고르는 중…
                </span>
              ) : (
                <span className="branches__status">{branches.length}갈래</span>
              )}
            </div>
            <div className="branch-rail">
              {pending
                ? [0, 1, 2].map((i) => <BranchSkeleton key={i} index={i + 1} />)
                : branches.map(({ b, w }, i) => (
                    <BranchCard key={b.to} branch={b} work={w} index={i + 1} onOpen={onOpen} />
                  ))}
            </div>
          </section>
        </div>
      </div>
    </article>
  );
}

Object.assign(window, { Detail });

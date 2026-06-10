/* taste — 앱 셸: 라우팅 · 검색(1급) · AI 분석 연출 · Tweaks */
const { useState: useS, useEffect: useE, useRef: useR, useMemo: useM } = React;

const LS = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

/* ── 검색 오버레이 ── */
function SearchOverlay({ open, onClose, onPick }) {
  const [q, setQ] = useS('');
  const [type, setType] = useS('all');
  const inputRef = useR(null);
  useE(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);
  useE(() => { if (!open) { setQ(''); setType('all'); } }, [open]);

  const results = useM(() => {
    const term = q.trim().toLowerCase();
    let all = window.TASTE.list;
    if (type !== 'all') all = all.filter((w) => w.type === type);
    if (!term) return all.slice(0, 10);
    return all.filter((w) => {
      const hay = [w.title, w.sub, ...(w.tags || []),
        w.meta.director, w.meta.author,
        ...(w.meta.cast || [])].join(' ').toLowerCase();
      return hay.includes(term);
    });
  }, [q, type]);

  if (!open) return null;
  const opts = [['all', '전체'], ['film', '영화'], ['book', '책']];
  return (
    <div className="search-scrim" onMouseDown={onClose}>
      <div className="search" onMouseDown={(e) => e.stopPropagation()}>
        <div className="search__bar">
          <span className="search__icon" aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            className="search__input"
            placeholder="제목 · 감독 · 저자 · 출연으로 검색해 평가하기"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
          />
        </div>
        <div className="search__filter">
          <div className="seg seg--sm">
            {opts.map(([k, label]) => (
              <button key={k} className={'seg__btn' + (type === k ? ' is-on' : '')}
                onClick={() => setType(k)}>{label}</button>
            ))}
          </div>
          <span className="search__count">{results.length}건</span>
        </div>
        <div className="search__results">
          {results.length === 0 && (
            <div className="search__empty">검색 결과가 없습니다.</div>
          )}
          {results.map((w) => (
            <button key={w.id} className="sresult" onClick={() => onPick(w.id)}>
              <Poster work={w} w={36} rounded={6} label={false} />
              <div className="sresult__text">
                <span className="sresult__title">{w.title}</span>
                <span className="sresult__sub">{w.sub}</span>
              </div>
              <span className="sresult__kind">{w.type === 'film' ? '영화' : '책'}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#d97757",
  "readingFont": "sans",
  "density": "regular",
  "reasonEmphasis": "regular"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [view, setView] = useS(() => LS.get('taste.view', { name: 'home', path: [] }));
  const [ratings, setRatings] = useS(() => {
    const seed = {};
    for (const w of window.TASTE.list) if (w.rating) seed[w.id] = w.rating;
    return LS.get('taste.ratings', seed);
  });
  const [analyzing, setAnalyzing] = useS(null);
  const [searchOpen, setSearchOpen] = useS(false);
  const [menuOpen, setMenuOpen] = useS(false);
  const timer = useR(null);

  // 계정 메뉴 바깥 클릭/Esc로 닫기
  useE(() => {
    if (!menuOpen) return;
    const h = (e) => { if (!e.target.closest('.account')) setMenuOpen(false); };
    const k = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [menuOpen]);

  useE(() => LS.set('taste.view', view), [view]);
  useE(() => LS.set('taste.ratings', ratings), [ratings]);

  // ⌘K / 단축키로 검색 열기
  useE(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setSearchOpen(true);
      }
      if (e.key === '/' && !/input|textarea/i.test(document.activeElement.tagName)) {
        e.preventDefault(); setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const navTo = (id) => {
    setView({ name: 'detail', path: [id] });
    window.scrollTo({ top: 0 });
  };
  const detailOpen = (id, trailIndex) => {
    if (typeof trailIndex === 'number') {
      setView((v) => ({ name: 'detail', path: v.path.slice(0, trailIndex + 1) }));
    } else {
      setView((v) => v.path[v.path.length - 1] === id
        ? v : { name: 'detail', path: [...v.path, id] });
    }
    window.scrollTo({ top: 0 });
  };
  const goHome = () => setView({ name: 'home', path: [] });

  const setRating = (id, value) => {
    setRatings((r) => ({ ...r, [id]: value }));
    // AI 콘텐츠는 즉시 아님 — 분석 중 → 곧 도착
    setAnalyzing(view.name === 'detail' ? id : 'home');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAnalyzing(null), 2300);
  };

  const onSearchPick = (id) => { setSearchOpen(false); navTo(id); };

  const current = view.name === 'detail'
    ? window.TASTE.works[view.path[view.path.length - 1]]
    : null;

  const rootCls = [
    'app',
    `dens-${t.density}`,
    `read-${t.readingFont}`,
    `emph-${t.reasonEmphasis}`,
  ].join(' ');

  return (
    <div className={rootCls} style={{ '--accent': t.accent }}>
      <header className="topbar">
        <div className="topbar__inner">
          <button className="brand" onClick={goHome} aria-label="taste 홈">
            taste<span className="brand__dot" />
          </button>
          <button className="searchcue" onClick={() => setSearchOpen(true)}>
            <span className="searchcue__icon">⌕</span>
            <span className="searchcue__label">작품을 검색해 평가하기</span>
            <kbd className="searchcue__kbd">⌘K</kbd>
          </button>
          <div className="account">
            <button className="avatar" onClick={() => setMenuOpen((o) => !o)} aria-label="계정 메뉴">나</button>
            {menuOpen && (
              <div className="menu" role="menu">
                <div className="menu__head">
                  <span className="avatar avatar--sm">나</span>
                  <div className="menu__id">
                    <span className="menu__name">내 서재</span>
                    <span className="menu__sub">평가 {Object.values(ratings).filter((v) => v > 0).length} · 브랜치 탐색</span>
                  </div>
                </div>
                <div className="menu__sep" />
                <button className="menu__item" role="menuitem" onClick={() => setMenuOpen(false)}>평가 가져오기</button>
                <button className="menu__item" role="menuitem" onClick={() => setMenuOpen(false)}>환경설정</button>
                <div className="menu__sep" />
                <button className="menu__item menu__item--quiet" role="menuitem" onClick={() => setMenuOpen(false)}>로그아웃</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="stage">
        {view.name === 'home'
          ? <Home onOpen={navTo} ratings={ratings} analyzing={analyzing} />
          : <Detail
              work={current}
              ratings={ratings}
              setRating={setRating}
              onOpen={detailOpen}
              path={view.path}
              analyzing={analyzing}
            />}
      </main>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} onPick={onSearchPick} />

      <TweaksPanel>
        <TweakSection label="색" />
        <TweakColor label="액센트" value={t.accent}
          options={['#d97757', '#c2553a', '#788c5d', '#5b7aa6', '#9a6a8c']}
          onChange={(v) => setTweak('accent', v)} />
        <TweakSection label="타이포" />
        <TweakRadio label="읽는 본문" value={t.readingFont}
          options={['serif', 'sans']}
          onChange={(v) => setTweak('readingFont', v)} />
        <TweakRadio label="이유 강조" value={t.reasonEmphasis}
          options={['regular', 'bold']}
          onChange={(v) => setTweak('reasonEmphasis', v)} />
        <TweakSection label="레이아웃" />
        <TweakRadio label="밀도" value={t.density}
          options={['compact', 'regular', 'comfy']}
          onChange={(v) => setTweak('density', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

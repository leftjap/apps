/* pick — 공용 UI 컴포넌트. window로 export. */
const { useState } = React;

/* 포스터/표지 플레이스홀더 — 저채도 색 한 점 + 모노 라벨. 직접 그린 이미지 금지 규칙 준수. */
function Poster({ work, w = 96, ratio = 1.48, rounded = 10, label = true }) {
  const h = Math.round(w * ratio);
  const hue = work.hue ?? 40;
  const bg = `oklch(0.86 0.045 ${hue})`;
  const bg2 = `oklch(0.81 0.05 ${hue})`;
  const ink = `oklch(0.34 0.06 ${hue})`;
  const stripe =
    `repeating-linear-gradient(135deg, ${bg} 0 11px, ${bg2} 11px 22px)`;
  return (
    <div
      className={'poster' + (work.type === 'book' ? ' poster--book' : '')}
      style={{
        width: w, height: h, borderRadius: rounded,
        background: stripe, color: ink,
      }}
    >
      {work.type === 'book' && (
        <span className="poster__spine" style={{ background: `oklch(0.74 0.06 ${hue})` }} />
      )}
      <span className="poster__kind">{work.type === 'film' ? 'FILM' : 'BOOK'}</span>
      {label && <span className="poster__title">{work.title}</span>}
      <span className="poster__year">{work.year}</span>
    </div>
  );
}

/* 별점 — 0.5 단위. 0.5★ = "비추" danger로 명확히 분리. 이 앱 정체성. */
const STAR_CLIP =
  'polygon(50% 2%, 61% 35%, 97% 35%, 68% 57%, 79% 92%, 50% 71%, 21% 92%, 32% 57%, 3% 35%, 39% 35%)';

function StarRating({ value = 0, editable = false, onChange, size = 22, showValue = true }) {
  const [hover, setHover] = useState(null);
  const shown = hover != null ? hover : value;
  const isPan = shown > 0 && shown <= 0.5; // 비추
  const fillColor = isPan ? 'var(--danger)' : 'var(--gold)';

  const stars = [1, 2, 3, 4, 5].map((i) => {
    const fill = Math.max(0, Math.min(1, shown - (i - 1))) * 100;
    return (
      <div key={i} className="star" style={{ width: size, height: size }}>
        <div className="star__track" style={{ clipPath: STAR_CLIP }} />
        <div
          className="star__fill"
          style={{ clipPath: STAR_CLIP, width: `${fill}%`, background: fillColor }}
        />
        {editable && (
          <>
            <button
              className="star__hit"
              style={{ left: 0 }}
              onMouseEnter={() => setHover(i - 0.5)}
              onClick={() => onChange && onChange(i - 0.5)}
              aria-label={`${i - 0.5}점`}
            />
            <button
              className="star__hit"
              style={{ right: 0 }}
              onMouseEnter={() => setHover(i)}
              onClick={() => onChange && onChange(i)}
              aria-label={`${i}점`}
            />
          </>
        )}
      </div>
    );
  });

  return (
    <div
      className={'stars' + (isPan ? ' stars--pan' : '')}
      onMouseLeave={() => setHover(null)}
    >
      <div className="stars__row">{stars}</div>
      {showValue && (
        <div className="stars__meta">
          {shown > 0 ? (
            <>
              <span className="stars__val">{shown.toFixed(1)}</span>
              {isPan && <span className="stars__pan">비추</span>}
            </>
          ) : (
            <span className="stars__empty">{editable ? '평가하기' : '미평가'}</span>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ children, active = false, onClick, as = 'span' }) {
  const Comp = as;
  return (
    <Comp className={'chip' + (active ? ' chip--on' : '')} onClick={onClick}>
      {children}
    </Comp>
  );
}

/* 코랄 점 — 액센트는 점 단위만. */
function Dot({ size = 6 }) {
  return <span className="dot" style={{ width: size, height: size }} />;
}

Object.assign(window, { Poster, StarRating, Chip, Dot, STAR_CLIP });

// ─── Dense packed word cloud — Archimedean spiral, monotone, no rotation.
// Top 50 words. Sizes 12-78px, weights 500-800. Hand-tuned data + bbox-spiral packing.

const CLOUD_WORDS_RAW = [
 ['시간',78],['행동',54],['몰입',48],['걷기',42],['사유',38],
 ['풍경',34],['거리',32],['죽음',32],['사랑',30],['언어',28],
 ['속도',26],['습관',26],['운',24],['위험',24],['시작',23],
 ['침묵',22],['사람',21],['주의',20],['감정',20],['느림',19],
 ['기억',18],['글쓰기',17],['책임',17],['도시',16],['의지',16],
 ['공간',15],['관계',15],['일상',14],['마음',14],['새벽',13],
 ['숨',13],['빛',12],['별',12],['거울',12],['손',11],
 ['끝',11],['비',10],['길',10],['집',10],['나무',10],
 ['바람',9],['잠',9],['노래',9],['그림자',9],['호흡',9],
 ['정원',8],['강',8],['의문',8],['흔적',8],['미래',8],
];

// Approximate Korean glyph advance — Pretendard at given fontSize
// Korean chars ≈ 0.94em wide
const bboxOf = (text, fontSize) => {
 const charW = fontSize * 0.95;
 const w = text.length * charW + 4;
 const h = fontSize * 1.02 + 2;
 return [w, h];
};

const packCloud = (W, H, items) => {
 const placed = [];
 const cx = W / 2, cy = H / 2;

 for (let i = 0; i < items.length; i++) {
  const it = items[i];
  const [bw, bh] = bboxOf(it.text, it.fontSize);

  // Place biggest at center
  if (i === 0) {
   placed.push({ ...it, x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh });
   continue;
  }

  // Spiral search — seed angle from char code for stable layout
  let r = 0;
  let theta = (it.text.charCodeAt(0) * 37) % 360 * Math.PI / 180;
  const dr = 0.35, dtheta = 0.13;

  let found = false;
  for (let k = 0; k < 8000; k++) {
   const x = cx + Math.cos(theta) * r - bw / 2;
   const y = cy + Math.sin(theta) * r - bh / 2;

   if (x >= 2 && y >= 2 && x + bw <= W - 2 && y + bh <= H - 2) {
    let collides = false;
    for (let j = 0; j < placed.length; j++) {
     const p = placed[j];
     if (x < p.x + p.w && x + bw > p.x && y < p.y + p.h && y + bh > p.y) {
      collides = true;
      break;
     }
    }
    if (!collides) {
     placed.push({ ...it, x, y, w: bw, h: bh });
     found = true;
     break;
    }
   }
   theta += dtheta;
   r += dr;
  }
 }
 return placed;
};

const WordCloud = ({ W = 600, H = 520, words = CLOUD_WORDS_RAW, scale = 1 }) => {
 const items = React.useMemo(() => {
  const max = words[0][1], min = words[words.length - 1][1];
  return words.map(([text, n], i) => {
   const t = (n - min) / Math.max(1, max - min);
   const fontSize = Math.round((12 + Math.pow(t, 0.55) * 64) * scale);
   const weight = t > 0.85 ? 800 : t > 0.55 ? 700 : t > 0.25 ? 600 : 500;
   const opacity = 0.45 + t * 0.55;
   const color = t > 0.85 ? 'var(--ink-1)'
    : t > 0.55 ? 'var(--ink-1)'
    : t > 0.25 ? 'var(--ink-2)'
    : t > 0.08 ? 'var(--ink-3)' : 'var(--ink-4)';
   const ls = t > 0.7 ? '-.035em' : t > 0.4 ? '-.028em' : '-.018em';
   return { text, count: n, fontSize, weight, opacity, color, ls, rank: i };
  });
 }, [words, scale]);

 const placed = React.useMemo(() => packCloud(W, H, items), [W, H, items]);

 return (
  <div style={{ position: 'relative', width: W, height: H, fontFamily: 'var(--sans)' }}>
   {placed.map((p, i) => (
    <span key={p.text} onClick={() => window.go && window.go('word', { word: p.text })} style={{
     position: 'absolute',
     left: p.x, top: p.y,
     fontSize: p.fontSize,
     fontWeight: p.weight,
     color: p.color,
     opacity: p.opacity,
     letterSpacing: p.ls,
     lineHeight: 1,
     whiteSpace: 'nowrap',
     cursor: 'pointer',
    }}>{p.text}</span>
   ))}
  </div>
 );
};

Object.assign(window, { CLOUD_WORDS_RAW, WordCloud });

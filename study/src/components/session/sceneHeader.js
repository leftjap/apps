/**
 * sceneHeader — 콩트 단위 학습 (en 가이드 §6.2) 의 카드 위 헤더.
 *
 * 표시 (explanation.scene_* 메타에서 읽음):
 *  - scene_title (예: "Lunch Plans") — 5문장 공통
 *  - speaker 한국식 호칭 (예: "지점장") — 카드별 변경
 *  - is_stretch true 시 "stretch" 라벨 (Stage+1 어휘 사용 시각화)
 *
 * scene_id 없으면 (옛 카드 / scene 메타 미박힘) 전체 hidden — 옛 카드 호환.
 *
 * 반환: { el, update }
 *   el — 컨테이너 DOM. mount 후
 *   update({ explanation }) — 다음 카드 진입 시 호출해 메타 갱신
 */

export function createSceneHeader({ explanation } = {}) {
  const el = document.createElement('div');
  el.className = 'scene-header';
  el.style.cssText = [
    'display:flex',
    'align-items:center',
    'gap:8px',
    'padding:6px 12px',
    'background:var(--bg-elev-1, rgba(0,0,0,0.04))',
    'border-radius:6px',
    'font-size:13px',
    'color:var(--text-muted)',
    'margin-bottom:16px',
    'align-self:flex-start',
  ].join(';');

  const title = document.createElement('span');
  title.className = 'scene-title';
  title.style.cssText = 'font-weight:600;color:var(--text-strong);';

  const sep = document.createElement('span');
  sep.textContent = '·';
  sep.style.opacity = '0.5';

  const speaker = document.createElement('span');
  speaker.className = 'scene-speaker';

  const stretchBadge = document.createElement('span');
  stretchBadge.className = 'scene-stretch';
  stretchBadge.style.cssText = [
    'padding:2px 6px',
    'background:var(--amber, #c8923a)',
    'color:#fff',
    'border-radius:3px',
    'font-size:11px',
    'font-weight:500',
    'letter-spacing:0.02em',
  ].join(';');
  stretchBadge.textContent = 'stretch';

  el.append(title, sep, speaker, stretchBadge);

  function update({ explanation } = {}) {
    const scene = explanation || {};
    if (!scene.scene_id) {
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
    title.textContent = scene.scene_title || '';
    speaker.textContent = scene.speaker || '';
    stretchBadge.style.display = scene.is_stretch ? '' : 'none';
  }

  update({ explanation });

  return { el, update };
}

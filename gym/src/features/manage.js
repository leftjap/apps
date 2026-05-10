/**
 * Phase B 단계 4 — Manage 통합 셸 (운동/체중/프로필 3 탭).
 *
 * mocks/admin.html 의 inline script 가 .tab-item click → phone.dataset.tab
 * 토글 처리. 본 셸은 그 위에서 활성 탭의 데이터 바인딩 (window.gymExercisesAdmin /
 * gymWeights / gymProfile 의 render*Tab) 을 호출.
 *
 * 콘텐츠 함수만 사용. exercises-admin/weights/profile 의 별도 router 진입점 없음.
 */

const TAB_RENDERERS = Object.freeze({
  ex: () => window.gymExercisesAdmin?.renderExercisesTab?.(document),
  weight: () => window.gymWeights?.renderWeightTab?.(document),
  profile: () => window.gymProfile?.renderProfileTab?.(document),
});

/**
 * mocks/admin.html 진입 시 호출. 활성 탭 감지 + 탭 전환 시 재마운트.
 *  - data-tab 속성을 가진 .phone 컨테이너 부재 → skipped
 *  - window.gymDB 미초기화 → 콘텐츠 render 가 자체 graceful no-op (fixture 보존)
 */
export async function mountManageView() {
  if (typeof document === 'undefined') return { skipped: 'no-document' };
  const phone = document.querySelector('.phone[data-tab]');
  if (!phone) return { skipped: 'no-mounts' };

  const renderActive = async () => {
    const tab = phone.dataset.tab;
    const fn = TAB_RENDERERS[tab];
    if (!fn) return;
    try { await fn(); } catch (e) { console.error('[manage] tab render', tab, e); }
  };

  await renderActive();

  // 탭 click hook — mocks inline script 가 phone.dataset.tab 갱신 후 본 핸들러 발화.
  // 같은 element 의 두 listener 는 등록 순으로 동기 실행되지만, 안전하게 microtask 로 지연.
  document.querySelectorAll('.tab-item').forEach((el) => {
    el.addEventListener('click', () => { Promise.resolve().then(renderActive); });
  });

  return { mounted: true };
}

if (typeof window !== 'undefined') {
  window.gymManage = { mountManageView };
}

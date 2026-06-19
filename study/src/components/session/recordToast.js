/* recordToast — 발음 평가 실패 알림 (session-new · session-review 공용)
 *
 * recordErrorMessage(reason): startMicRecording.error 또는 stopAndAnalyze 결과의 fallbackReason → 사용자 메시지.
 * showRecordToast(message, ms): body 부착, 자동 제거. 동시 호출 시 직전 토스트 즉시 교체.
 */

export function recordErrorMessage(reason) {
  switch (reason) {
    case 'permission_denied':
      return '마이크 권한이 필요해요. 브라우저 설정에서 허용해주세요';
    case 'no_match':
      return '음성이 인식되지 않았어요. 다시 말해주세요';
    case 'azure_init_fail':
    case 'azure_recognize_fail':
      return '네트워크 오류. 잠시 후 다시 시도해주세요';
    case 'too_quiet':
      // Wave A.18 — 마이크가 음성을 거의 못 잡음 (특히 블루투스/에어팟). 점수 미반영 + 재시도 유도.
      return '음성이 약하게 들어왔어요. 마이크에 가까이, 또렷하게 다시 말해주세요';
    case 'incomplete_capture':
      // Wave A.19 — 문장 일부만 포착됨(completeness 낮음). 블루투스 마이크 캡처 불안정이 주원인 → 마이크 권장.
      return '문장이 끝까지 또렷하게 안 잡혔어요. 내장·유선 마이크가 더 정확해요 — 다시 말해주세요';
    default:
      return '오류가 발생했어요. 다시 시도해주세요';
  }
}

let _toastEl = null;

export function showRecordToast(message, ms = 2200) {
  if (typeof document === 'undefined') return;
  if (_toastEl) { try { _toastEl.remove(); } catch { /* noop */ } _toastEl = null; }
  const el = document.createElement('div');
  el.className = 'record-toast';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.textContent = message;
  el.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:max(16vh,80px)', 'transform:translateX(-50%)',
    'background:rgba(20,20,20,0.92)', 'color:#fff',
    'padding:10px 16px', 'border-radius:8px',
    'font-size:14px', 'line-height:1.4', 'text-align:center',
    'max-width:88vw', 'z-index:9999',
    'box-shadow:0 4px 12px rgba(0,0,0,0.2)',
    'transition:opacity 0.3s',
  ].join(';');
  document.body.appendChild(el);
  _toastEl = el;
  setTimeout(() => { if (_toastEl === el) el.style.opacity = '0'; }, ms - 300);
  setTimeout(() => { if (_toastEl === el) { try { el.remove(); } catch { /* noop */ } _toastEl = null; } }, ms);
}

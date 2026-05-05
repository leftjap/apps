// editor.js — Keep editor.js (github.com/leftjap/keep) 포팅
// floating bubble toolbar + Aa popup + heading dropdown 추가 + 향상된 copy.
// Today selector 단일화: edBody/memo-body → article.doc .doc__body[contenteditable].
// 기존 entries.js 의 editToolbar handler 와 충돌 없음 (다른 selector).

const EDITOR_BODY_SELECTOR = 'article.doc .doc__body[contenteditable]';

function getEditorBody(doc = document) {
  return doc.querySelector(EDITOR_BODY_SELECTOR);
}

function focusBody() {
  const target = getEditorBody();
  if (target) target.focus();
  return target;
}

// ─── 툴바 명령 (heading dropdown + Aa popup 공용) ───
function execCmd(cmd, val) {
  const target = focusBody();
  if (!target) return;
  if (cmd === 'formatBlock' && val) document.execCommand(cmd, false, '<' + val + '>');
  else document.execCommand(cmd, false, val || null);
}

function insertChecklist() {
  const target = focusBody();
  if (!target) return;
  // selection 이 있으면 선택 텍스트 보존 후 li 안에 삽입 (drag 후 클릭 케이스 사라짐 방지).
  // selection 이 collapsed 면 빈 체크박스 삽입 (Keep 기존 동작).
  const sel = window.getSelection();
  let selectedText = '';
  if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
    selectedText = sel.toString();
  }
  // HTML escape — 사용자 입력 텍스트가 마크업으로 해석되지 않게.
  const esc = selectedText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html =
    '<ul style="list-style:none;padding-left:0;"><li><input type="checkbox" style="margin-right:8px;transform:scale(1.2);"> ' +
    (esc || '') +
    '</li></ul>';
  document.execCommand('insertHTML', false, html);
}

// ─── Aa 팝업 (모바일/태블릿) ───
function closeLpPopup() {
  const overlay = document.getElementById('lpPopupOverlay');
  const card = document.getElementById('lpPopupCard');
  if (overlay) overlay.classList.remove('open');
  if (card) card.classList.remove('open');
}

function toggleAaMenu(e) {
  if (e && e.stopPropagation) e.stopPropagation();
  const overlay = document.getElementById('lpPopupOverlay');
  const card = document.getElementById('lpPopupCard');
  const menuEl = document.getElementById('lpPopupMenu');
  if (!overlay || !card || !menuEl) return;

  if (overlay.classList.contains('open')) {
    closeLpPopup();
    return;
  }

  menuEl.innerHTML = `
    <div class="lp-popup-menu-item" data-aa="ul"><span>리스트</span><svg viewBox="0 0 24 24"><line x1="9" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="9" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg></div>
    <div class="lp-popup-menu-item" data-aa="ol"><span>번호</span><svg viewBox="0 0 24 24"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="2" y="9" font-size="8" font-family="sans-serif" stroke="none" fill="currentColor" font-weight="700">1.</text><text x="2" y="15" font-size="8" font-family="sans-serif" stroke="none" fill="currentColor" font-weight="700">2.</text><text x="2" y="21" font-size="8" font-family="sans-serif" stroke="none" fill="currentColor" font-weight="700">3.</text></svg></div>
    <div class="lp-popup-menu-item" data-aa="check"><span>체크박스</span><svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></div>
    <div class="lp-popup-sep"></div>
    <div class="lp-popup-menu-item" data-aa="quote"><span>인용</span><svg viewBox="0 0 24 24"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg></div>
    <div class="lp-popup-menu-item" data-aa="hr"><span>구분선</span><svg viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"/></svg></div>`;

  const aaBtn = (e && (e.currentTarget || (e.target && e.target.closest && e.target.closest('.ed-aa-btn')))) || document.querySelector('.ed-aa-btn');
  if (aaBtn) {
    const btnRect = aaBtn.getBoundingClientRect();
    const isMobile = window.innerWidth <= 768;
    const cardW = isMobile ? Math.min(260, window.innerWidth - 40) : Math.min(280, window.innerWidth - 32);
    let left = btnRect.right - cardW;
    if (left < 16) left = 16;
    if (left + cardW > window.innerWidth - 16) left = window.innerWidth - cardW - 16;
    let top = btnRect.bottom + 8;
    if (top + 200 > window.innerHeight - 16) top = btnRect.top - 200 - 8;
    if (top < 16) top = 16;
    card.style.left = left + 'px';
    card.style.top = top + 'px';
    card.style.width = cardW + 'px';
  }

  overlay.classList.add('open');
  requestAnimationFrame(() => card.classList.add('open'));
}

function aaPopupAction(type) {
  closeLpPopup();
  const target = focusBody();
  if (!target) return;
  switch (type) {
    case 'ul':
      document.execCommand('insertUnorderedList');
      break;
    case 'ol':
      document.execCommand('insertOrderedList');
      break;
    case 'check':
      insertChecklist();
      break;
    case 'quote':
      document.execCommand('formatBlock', false, '<blockquote>');
      break;
    case 'hr':
      document.execCommand('insertHorizontalRule');
      break;
  }
}

// ─── 플로팅 버블 툴바 ───
let savedSelection = null;

function saveSelection() {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
    savedSelection = sel.getRangeAt(0).cloneRange();
  }
}

function restoreSelection() {
  if (!savedSelection) return;
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  try {
    sel.addRange(savedSelection);
  } catch (_) {
    /* range detached — 무시 */
  }
}

function hideFloatingToolbar() {
  const ft = document.getElementById('floatingToolbar');
  if (ft) {
    ft.classList.remove('show');
    ft.style.display = 'none';
  }
}

function checkSelection() {
  const sel = window.getSelection();
  const ft = document.getElementById('floatingToolbar');
  if (!ft) return;
  if (!sel || sel.isCollapsed || sel.toString().trim() === '') {
    hideFloatingToolbar();
    return;
  }
  const range = sel.getRangeAt(0);
  const body = getEditorBody();
  const anc = range.commonAncestorContainer;
  if (!body || !body.contains(anc)) {
    hideFloatingToolbar();
    return;
  }
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    hideFloatingToolbar();
    return;
  }

  saveSelection();
  ft.classList.add('show');
  ft.style.display = 'flex';

  const tbW = ft.offsetWidth || 220;
  const tbH = ft.offsetHeight || 38;
  const margin = 8;
  let left = rect.left + rect.width / 2 - tbW / 2;
  let top = rect.top - tbH - margin - 6;
  if (left < margin) left = margin;
  if (left + tbW > window.innerWidth - margin) left = window.innerWidth - tbW - margin;
  if (top < margin) top = rect.bottom + margin;
  ft.style.left = left + 'px';
  ft.style.top = top + 'px';
  updateFtActiveStates();
}

function updateFtActiveStates() {
  const ft = document.getElementById('floatingToolbar');
  if (!ft) return;
  ft.querySelectorAll('.ft-btn').forEach((btn) => {
    const cmd = btn.getAttribute('data-cmd');
    if (!cmd) return;
    let isActive = false;
    if (cmd === 'hiliteColor') {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        let node = sel.anchorNode;
        while (node && node !== document.body) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const bg = node.style && node.style.backgroundColor;
            if (bg && bg !== 'transparent' && bg !== '' && bg !== 'rgba(0, 0, 0, 0)') {
              isActive = true;
              break;
            }
          }
          node = node.parentNode;
        }
      }
    } else {
      try {
        isActive = document.queryCommandState(cmd);
      } catch (_) {
        isActive = false;
      }
    }
    btn.style.background = isActive ? 'rgba(255,255,255,.2)' : '';
    btn.style.color = isActive ? '#fff' : '';
  });
}

function setupFloatingToolbar() {
  const ft = document.getElementById('floatingToolbar');
  if (!ft) return;
  ft.querySelectorAll('.ft-btn').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      const cmd = this.getAttribute('data-cmd');
      const val = this.getAttribute('data-val') || null;
      if (!cmd) return;
      restoreSelection();
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const selectedText = sel.toString();
      const body = getEditorBody();

      if (cmd === 'hiliteColor') {
        let hasHighlight = false;
        let node = sel.anchorNode;
        while (node && node !== body && node !== document.body) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const bg = node.style && node.style.backgroundColor;
            if (bg && bg !== 'transparent' && bg !== '' && bg !== 'rgba(0, 0, 0, 0)') {
              hasHighlight = true;
              break;
            }
          }
          node = node.parentNode;
        }
        document.execCommand('hiliteColor', false, hasHighlight ? 'transparent' : val || '#fde68a');
      } else {
        document.execCommand(cmd, false, val);
      }

      requestAnimationFrame(() => {
        const newSel = window.getSelection();
        if (!newSel || newSel.isCollapsed) {
          if (selectedText && body) {
            const tw = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null, false);
            let found = false;
            while (tw.nextNode()) {
              const tn = tw.currentNode;
              const idx = tn.textContent.indexOf(selectedText);
              if (idx !== -1) {
                const nr = document.createRange();
                nr.setStart(tn, idx);
                nr.setEnd(tn, idx + selectedText.length);
                newSel.removeAllRanges();
                newSel.addRange(nr);
                savedSelection = nr.cloneRange();
                found = true;
                break;
              }
            }
            if (!found) hideFloatingToolbar();
          }
        } else {
          savedSelection = newSel.getRangeAt(0).cloneRange();
        }
        updateFtActiveStates();
      });
    });
  });
}

// ─── 향상된 copy (block-level newline 보존) ───
function setupCopyHandler() {
  document.addEventListener('copy', (e) => {
    const activeEl = document.activeElement;
    if (!activeEl || !activeEl.isContentEditable) return;
    if (!activeEl.closest || !activeEl.closest(EDITOR_BODY_SELECTOR.split(' ')[0])) {
      // body 외 contenteditable 은 기본 copy
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const tempDiv = document.createElement('div');
    tempDiv.appendChild(range.cloneContents());
    if (tempDiv.querySelector('img')) return; // 이미지 포함 시 기본 동작
    e.preventDefault();
    let text = '';
    function traverse(el) {
      if (el.nodeType === Node.TEXT_NODE) {
        text += el.nodeValue;
      } else if (el.nodeType === Node.ELEMENT_NODE) {
        const tag = el.tagName.toLowerCase();
        const isBlock = ['div', 'p', 'h1', 'h2', 'h3', 'li', 'blockquote', 'ul', 'ol'].includes(tag);
        if (isBlock && text.length > 0 && !text.endsWith('\n')) text += '\n';
        if (tag === 'br') text += '\n';
        for (const child of el.childNodes) traverse(child);
        if (isBlock && text.length > 0 && !text.endsWith('\n')) text += '\n';
      }
    }
    traverse(tempDiv);
    text = text.replace(/\n{3,}/g, '\n\n').trim();
    if (e.clipboardData) {
      e.clipboardData.setData('text/plain', text);
      e.clipboardData.setData('text/html', text.replace(/\n/g, '<br>'));
    }
  });
}

// ─── 전역 click/keydown — 메뉴 닫기 ───
function setupGlobalDismissHandlers() {
  document.addEventListener('mousedown', (e) => {
    const ft = document.getElementById('floatingToolbar');
    const body = getEditorBody();
    if (ft && ft.classList.contains('show')) {
      if (!ft.contains(e.target) && !(body && body.contains(e.target))) {
        hideFloatingToolbar();
      }
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideFloatingToolbar();
      closeLpPopup();
    }
  });
  // 본문에서 selection 변동 → bubble 검사 (touch / mouse / keyboard 모두 커버)
  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const anc = sel.anchorNode;
    const body = getEditorBody();
    if (!body || !anc || !body.contains(anc)) {
      hideFloatingToolbar();
      return;
    }
    // 디바운스 — 빠른 selection 변경 시 redraw 폭주 방지
    clearTimeout(setupGlobalDismissHandlers._t);
    setupGlobalDismissHandlers._t = setTimeout(checkSelection, 100);
  });
}

// ─── 이벤트 위임 (Aa popup item / heading-opt / overlay) ───
function setupDelegatedClicks() {
  document.addEventListener('click', (e) => {
    // Aa popup item
    const aaItem = e.target.closest && e.target.closest('.lp-popup-menu-item[data-aa]');
    if (aaItem) {
      const type = aaItem.dataset.aa;
      if (type) aaPopupAction(type);
      return;
    }
    // ed-aa-btn → toggle popup
    const aaBtn = e.target.closest && e.target.closest('.ed-aa-btn');
    if (aaBtn) {
      toggleAaMenu(e);
      return;
    }
    // popup overlay → close
    if (e.target.id === 'lpPopupOverlay') {
      closeLpPopup();
      return;
    }
    // editToolbar 의 특수 액션 (check / hr) — entries.js EDIT_TOOLBAR_FORMATS 미커버
    const actBtn = e.target.closest && e.target.closest('.edit-toolbar [data-editor-action]');
    if (actBtn) {
      const act = actBtn.dataset.editorAction;
      if (act === 'check' || act === 'hr') {
        e.preventDefault();
        e.stopPropagation();
        aaPopupAction(act);
      }
      return;
    }
  });
}

let _editorMounted = false;
export function mountEditorTools() {
  if (_editorMounted) return;
  if (typeof document === 'undefined') return;
  _editorMounted = true;
  setupFloatingToolbar();
  setupCopyHandler();
  setupGlobalDismissHandlers();
  setupDelegatedClicks();
}

export const Editor = {
  mountEditorTools,
  // 노출용 (테스트/디버깅)
  getEditorBody,
  toggleAaMenu,
  aaPopupAction,
  hideFloatingToolbar,
  checkSelection,
};

if (typeof window !== 'undefined') {
  window.todayEditor = Editor;
}

export default Editor;

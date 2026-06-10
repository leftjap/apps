/* AccountMenu — 헤더 우상단 계정 드롭다운 (pick 패턴 참조).
   이메일 표시 + 표시 설정(Tweaks) + 로그아웃. cue 의 기존 auth.js(getUser/signOut) 사용.
   ⚠️ getUser()는 onAuthStateChange 콜백 밖(마운트 effect)에서 호출 → auth 락 데드락 없음. */
import React, { useState, useEffect, useRef } from 'react';
import { getUser, signOut } from '../services/auth.js';

export default function AccountMenu() {
  const [email, setEmail] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    let alive = true;
    getUser().then((u) => { if (alive) setEmail(u?.email || ''); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const initial = (email[0] || '·').toUpperCase();

  return (
    <div className="acct" ref={wrapRef}>
      <button className="acct__btn" aria-label="계정 메뉴" aria-haspopup="true" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}>{initial}</button>
      {open && (
        <div className="acct__menu" role="menu">
          <div className="acct__head">
            <span className="acct__av" aria-hidden="true">{initial}</span>
            <span className="acct__email mono">{email || '로그인됨'}</span>
          </div>
          <div className="acct__sep" />
          <button className="acct__item" role="menuitem"
            onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent('cue:open-tweaks')); }}>표시 설정</button>
          <button className="acct__item acct__item--quiet" role="menuitem"
            onClick={() => { setOpen(false); signOut(); }}>로그아웃</button>
        </div>
      )}
    </div>
  );
}

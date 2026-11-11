// 제미나이 웹 임시 채팅에서 이미지를 만들고 받아 오는 도우미. navigate_page 의 initScript 로 넣는다.
window.__busy = () => [...document.querySelectorAll('button')].some((b) => (b.getAttribute('aria-label') || '').includes('생성 중지'));
window.__imgs = () => [...document.querySelectorAll('img')].filter((i) => i.naturalWidth > 300);
window.__send = async (T) => {
  const tmp = [...document.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || '').includes('임시 채팅 사용 설정'));
  if (tmp) { tmp.click(); await new Promise((r) => setTimeout(r, 900)); }
  const ed = document.querySelector('rich-textarea .ql-editor, [contenteditable="true"]');
  ed.focus();
  document.execCommand('insertText', false, T);
  await new Promise((r) => setTimeout(r, 500));
  const send = [...document.querySelectorAll('button')].find((b) => /보내기|Send/.test(b.getAttribute('aria-label') || ''));
  send?.click();
  return !!send;
};
window.__waitN = async (n) => {
  for (let k = 0; k < 100; k += 1) {
    const imgs = window.__imgs();
    if (!window.__busy() && k > 2) {
      if (imgs.length >= n && imgs.every((i) => i.complete)) return imgs.length;
      if (imgs.length < n) return `ERR ${document.body.innerText.slice(-300)}`;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return 'TIMEOUT';
};
window.__grab = () => window.__imgs().map((i) => {
  const c = document.createElement('canvas');
  c.width = i.naturalWidth; c.height = i.naturalHeight;
  c.getContext('2d').drawImage(i, 0, 0);
  return c.toDataURL('image/jpeg', 0.92);
});
window.__BASE = '이미지를 만들어 줘. Use the image you just made as the reference: the SAME person, same face, same hair, same clothes, same room, same lighting, same framing and camera. Change only the expression to completely neutral and relaxed: eyebrows at rest, eyes relaxed, mouth closed with both corners level. Photorealistic, square, no text.';
window.__P = (who, expr) => `이미지를 만들어 줘. Photorealistic documentary-style tight head-and-shoulders portrait of ${who}, sitting in a plain interview room with a light-gray wall, soft overhead light, looking straight into the camera, the face filling about half of the frame, eye level, square format. Expression: ${expr} Natural skin texture with pores, no retouching, 85mm lens, no text, no watermark.`;

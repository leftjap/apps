/* Web Push 핸들러 — generateSW 로 생성된 서비스워커에 workbox importScripts 로 주입.
 * 캐싱 로직은 건드리지 않고 push / notificationclick 만 추가 (외과적).
 * 경로는 SW scope 기준 상대 — 로컬(/) · GH_PAGES(/apps/today/) 양쪽 동작. */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || '새 알림';
  const options = {
    body: data.body || '',
    tag: data.tag || undefined,
    data: data.data || {},
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
  };
  event.waitUntil(
    (async () => {
      // userVisibleOnly 준수 — 반드시 알림 표시 (미표시 시 iOS 구독 취소됨).
      await self.registration.showNotification(title, options);
      // 앱 아이콘 배지 — WebKit 문서상 SW push 핸들러에서 setAppBadge 갱신 작동(iOS 16.4+, webkit.org/blog/14112).
      // 가시 배지는 홈화면 설치 PWA + 알림 권한 전제. 실측(Chrome 실 푸시): setAppBadge(n) 실행 성공(ok).
      try {
        if (self.navigator && self.navigator.setAppBadge) {
          const n = (await self.registration.getNotifications()).length;
          await self.navigator.setAppBadge(n);
        }
      } catch (e) {
        /* no-op */
      }
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const scope = self.registration.scope;
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of all) {
        if ('focus' in c) {
          try {
            if (self.navigator && self.navigator.clearAppBadge) await self.navigator.clearAppBadge();
          } catch (e) {
            /* no-op */
          }
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(scope);
    })(),
  );
});

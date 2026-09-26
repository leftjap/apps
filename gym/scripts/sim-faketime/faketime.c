// 시뮬 앱 전용 시계 이동 — 시작 오프셋은 FAKE_OFFSET_SEC, SIGUSR1 을 받으면 하루(86400초) 앞당긴다.
// FAKE_ADVANCE_ON_BACKGROUND 가 있으면 첫 백그라운드 전환 때 한 번 하루 앞당긴다 (XCUITest 에서 쓰려고 둔 경로).
// 벽시계(gettimeofday·time·clock_gettime(_nsec_np) 의 REALTIME)만 옮기고 애니메이션용 단조 시계는 건드리지 않는다.
#include <sys/time.h>
#include <time.h>
#include <signal.h>
#include <stdlib.h>
#include <stdint.h>
#include <CoreFoundation/CoreFoundation.h>
#define DYLD_INTERPOSE(_r,_o) __attribute__((used)) static struct{ const void* r; const void* o; } _ip_##_o \
  __attribute__((section("__DATA,__interpose"))) = { (const void*)(unsigned long)&_r, (const void*)(unsigned long)&_o };
static volatile long long g_off = 0;
static void on_usr1(int s) { (void)s; g_off += 86400; }
static int g_advanced = 0;
static void on_bg(CFNotificationCenterRef c, void* o, CFNotificationName n, const void* obj, CFDictionaryRef u) {
  if (!g_advanced) { g_advanced = 1; g_off += 86400; }   // 첫 백그라운드 전환 때 한 번만 하루 앞당김
}
__attribute__((constructor)) static void init(void) {
  const char* e = getenv("FAKE_OFFSET_SEC"); if (e) g_off = atoll(e);
  signal(SIGUSR1, on_usr1);
  if (getenv("FAKE_ADVANCE_ON_BACKGROUND"))
    CFNotificationCenterAddObserver(CFNotificationCenterGetLocalCenter(), NULL, on_bg,
      CFSTR("UIApplicationDidEnterBackgroundNotification"), NULL, CFNotificationSuspensionBehaviorDeliverImmediately);
}
static int my_gettimeofday(struct timeval* tv, void* tz) { int r = gettimeofday(tv, tz); if (tv) tv->tv_sec += g_off; return r; }
static int my_clock_gettime(clockid_t c, struct timespec* ts) { int r = clock_gettime(c, ts); if (r == 0 && ts && c == CLOCK_REALTIME) ts->tv_sec += g_off; return r; }
static uint64_t my_clock_gettime_nsec_np(clockid_t c) { uint64_t v = clock_gettime_nsec_np(c); if (c == CLOCK_REALTIME) v += (uint64_t)(g_off * 1000000000LL); return v; }
static time_t my_time(time_t* t) { time_t v = time(NULL) + (time_t)g_off; if (t) *t = v; return v; }
DYLD_INTERPOSE(my_gettimeofday, gettimeofday)
DYLD_INTERPOSE(my_clock_gettime, clock_gettime)
DYLD_INTERPOSE(my_clock_gettime_nsec_np, clock_gettime_nsec_np)
DYLD_INTERPOSE(my_time, time)

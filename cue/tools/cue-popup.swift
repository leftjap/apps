import Cocoa
import WebKit

// Cue 카드 표시 에이전트 (상주) — /tmp/cue-popup-trigger 에 상태값이 써지면 검증된 카드(WKWebView)를 띄움.
// 감지는 youtube-gate-native.sh(Automation 권한 보유)가 담당, 표시는 이 앱이 담당(창 직접 소유 → launchd/open 문제 없음).
let cardPath = "/Users/gio_c/apps/cue/tools/youtube-gate-card.html"
let triggerPath = "/tmp/cue-popup-trigger"
let logPath = "/tmp/cue-popup.log"
let flagPath = "/tmp/cue-popup-disabled"   // 존재 시 기능 OFF(잠시 끄기). 재부팅 시 자동 복귀.
let knownStates = ["독서", "글쓰기", "어학", "운동", "stale"]
// 값이 "app:<bundleID>" 면 로컬 앱 실행, 그 외는 웹 URL 오픈.
let appURLs: [String: String] = [
  "독서": "app:kr.co.millie.MillieShelf",   // 밀리의서재 (로컬 앱) — 실제 독서는 여기서
  "글쓰기": "https://leftjap.github.io/apps/today/",
  "어학": "https://leftjap.github.io/apps/study/",
  "운동": "https://leftjap.github.io/apps/cue/",
  "stale": "https://leftjap.github.io/apps/cue/",
]

func log(_ s: String) {
  let line = "\(ISO8601DateFormatter().string(from: Date())) \(s)\n"
  if let h = FileHandle(forWritingAtPath: logPath) { h.seekToEndOfFile(); h.write(line.data(using: .utf8)!); h.closeFile() }
  else { try? line.write(toFile: logPath, atomically: true, encoding: .utf8) }
}

// borderless 창은 기본 canBecomeKey=false → key 가 못 돼 AppKit 이 커서(cursor:pointer)를 갱신 안 함. 오버라이드로 key 가능하게.
final class KeyableWindow: NSWindow {
  override var canBecomeKey: Bool { true }
  override var canBecomeMain: Bool { true }
}

final class Controller: NSObject, WKScriptMessageHandler {
  var window: NSWindow?
  var web: WKWebView?
  var state = "독서"
  var closeTimer: Timer?

  func userContentController(_ u: WKUserContentController, didReceive m: WKScriptMessage) {
    guard let s = m.body as? String else { return }
    if s == "go" {
      if let u = appURLs[state] {
        if u.hasPrefix("app:") {                                    // 로컬 앱 실행
          let bid = String(u.dropFirst(4))
          if let appURL = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bid) {
            log("bridge go state=\(state) app=\(bid) at=\(appURL.path)"); NSWorkspace.shared.open(appURL)
          } else { log("bridge go state=\(state) app NOT FOUND \(bid)") }
        } else if let url = URL(string: u) {                        // 웹 URL
          log("bridge go state=\(state) open=\(u)"); NSWorkspace.shared.open(url)
        }
      } else { log("bridge go state=\(state) (no url)") }
      closeCard()
    } else { log("bridge later state=\(state)"); closeCard() }
  }

  func showCard(_ st: String) {
    if window != nil { return }            // 이미 떠 있으면 무시
    state = knownStates.contains(st) ? st : "독서"
    let screen = NSScreen.main!.frame
    let cfg = WKWebViewConfiguration()
    let ucc = WKUserContentController()
    ucc.add(self, name: "cue")
    // 시안 충실: 오버레이(바깥) 클릭으로 닫지 않음 — 닫기는 카운트다운 후 '나중에' 또는 CTA(go)만. (마찰 유지)
    let js = """
    window.cueGo = function(){ window.webkit.messageHandlers.cue.postMessage('go'); };
    window.cueLater = function(){ window.webkit.messageHandlers.cue.postMessage('later'); };
    """
    ucc.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
    cfg.userContentController = ucc
    let w = WKWebView(frame: screen, configuration: cfg)
    w.setValue(false, forKey: "drawsBackground")
    var c = URLComponents(string: "file://\(cardPath)")!
    c.queryItems = [URLQueryItem(name: "state", value: state)]
    w.load(URLRequest(url: c.url!))
    let win = KeyableWindow(contentRect: screen, styleMask: [.borderless], backing: .buffered, defer: false)
    win.isOpaque = false; win.backgroundColor = .clear; win.level = .modalPanel
    win.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
    win.contentView = w
    win.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
    self.window = win; self.web = w
    closeTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: false) { [weak self] _ in self?.closeCard() }
    log("show card state=\(state)")
  }

  func closeCard() {
    closeTimer?.invalidate(); closeTimer = nil
    window?.orderOut(nil); window = nil; web = nil
    log("close card")
  }

  func poll() {
    guard let raw = try? String(contentsOfFile: triggerPath, encoding: .utf8) else { return }
    let st = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    if st.isEmpty { return }
    try? "".write(toFile: triggerPath, atomically: true, encoding: .utf8)  // 소비(중복 방지)
    if FileManager.default.fileExists(atPath: flagPath) { return }   // 꺼짐(잠시 끄기): 소비만 하고 표시 안 함
    showCard(st)
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
  let ctrl = Controller()
  var statusItem: NSStatusItem?
  var lastDisabled: Bool?

  var disabled: Bool { FileManager.default.fileExists(atPath: flagPath) }
  func setDisabled(_ off: Bool) {
    if off { FileManager.default.createFile(atPath: flagPath, contents: nil) }
    else { try? FileManager.default.removeItem(atPath: flagPath) }
    log("popup \(off ? "OFF(사용자가 끔)" : "ON")"); refreshStatus()
  }
  @objc func toggleClicked() { setDisabled(!disabled) }
  func refreshStatus() {
    guard let btn = statusItem?.button else { return }
    let off = disabled
    if let img = NSImage(systemSymbolName: off ? "bell.slash" : "bell", accessibilityDescription: "Cue 팝업") { btn.image = img; btn.title = "" }
    else { btn.image = nil; btn.title = off ? "팝업꺼짐" : "팝업" }
    if let t = statusItem?.menu?.item(withTag: 1) { t.state = off ? .off : .on; t.title = off ? "꺼짐 — 클릭해 켜기" : "켜짐 — 클릭해 끄기" }
  }
  func setupStatusItem() {
    let si = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    let menu = NSMenu(); menu.delegate = self
    let head = NSMenuItem(title: "유튜브 진입 팝업", action: nil, keyEquivalent: ""); head.isEnabled = false
    menu.addItem(head)
    let tg = NSMenuItem(title: "켜짐", action: #selector(toggleClicked), keyEquivalent: ""); tg.target = self; tg.tag = 1
    menu.addItem(tg)
    si.menu = menu; statusItem = si; refreshStatus()
    log("status item ready button=\(si.button != nil) icon=\(si.button?.image != nil) visible=\(si.isVisible)")
  }

  func applicationDidFinishLaunching(_ n: Notification) {
    // 셀프테스트: --selftest <state> <go|later|snap> → 카드 표시 → 렌더 PNG 스냅샷 + 애니 점검 + (go/later 시)버튼 클릭 발화로 브리지 체인 검증
    let args = CommandLine.arguments
    if let i = args.firstIndex(of: "--selftest"), i + 2 < args.count {
      let st = args[i + 1], action = args[i + 2]   // action: go | later | snap
      log("selftest start state=\(st) action=\(action)")
      ctrl.showCard(st)
      Timer.scheduledTimer(withTimeInterval: 1.6, repeats: false) { [weak self] _ in
        guard let web = self?.ctrl.web else { return }
        if let win = self?.ctrl.window { log("selftest keywin canBecomeKey=\(win.canBecomeKey) isKey=\(win.isKeyWindow) appActive=\(NSApp.isActive)") }
        // 1) 네이티브 WKWebView 가 실제 렌더한 픽셀을 PNG 로 저장(컴포지터 필터 우회 화면 검증)
        web.takeSnapshot(with: WKSnapshotConfiguration()) { image, err in
          if let image = image, let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
             let png = rep.representation(using: .png, properties: [:]) {
            let p = "/tmp/cue-card-\(st).png"; try? png.write(to: URL(fileURLWithPath: p))
            log("selftest snapshot \(p) bytes=\(png.count)")
          } else { log("selftest snapshot FAILED err=\(String(describing: err))") }
        }
        // 2) WKWebView(WebKit) 내부에서 애니메이션이 실제 구동되는지 검증
        web.evaluateJavaScript("JSON.stringify({n:document.getAnimations().length,names:[...new Set(document.getAnimations().map(a=>a.animationName))].sort()})") { res, _ in
          log("selftest anims \(res.map { String(describing: $0) } ?? "nil")")
        }
        // 3) 버튼 라우팅 검증(go=CTA→앱오픈 / later=닫기). snap 이면 클릭 생략
        if action == "go" || action == "later" {
          let sel = action == "later" ? ".later" : ".cta"
          Timer.scheduledTimer(withTimeInterval: 2.0, repeats: false) { _ in   // '나중에' 3초 카운트다운 이후(force-enable 로 라우팅만 검증)
            web.evaluateJavaScript("var e=document.querySelector('\(sel)'); e.disabled=false; e.click(); 'ok'") { res, err in
              log("selftest click \(sel) res=\(String(describing: res)) err=\(err.map { String(describing: $0) } ?? "nil")")
            }
          }
        }
        Timer.scheduledTimer(withTimeInterval: 3.0, repeats: false) { _ in log("selftest done"); NSApp.terminate(nil) }
      }
      return
    }
    // CLI 토글(검증·스크립트용): --off / --on / --status
    if args.contains("--off") { setDisabled(true); NSApp.terminate(nil); return }
    if args.contains("--on") { setDisabled(false); NSApp.terminate(nil); return }
    if args.contains("--status") { print(disabled ? "off" : "on"); NSApp.terminate(nil); return }
    setupStatusItem()
    try? "".write(toFile: triggerPath, atomically: true, encoding: .utf8)  // 시작 시 트리거 비움
    log("agent started\(disabled ? " (현재 OFF)" : "")")
    Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
      guard let self = self else { return }
      self.ctrl.poll()
      if self.lastDisabled != self.disabled { self.lastDisabled = self.disabled; self.refreshStatus() }  // 외부(CLI/플래그) 변경도 메뉴 바 아이콘에 반영
    }
  }
}

extension AppDelegate: NSMenuDelegate {
  func menuWillOpen(_ menu: NSMenu) { refreshStatus() }   // 외부(CLI) 변경도 메뉴 열 때 반영
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = AppDelegate()
app.delegate = delegate
app.run()

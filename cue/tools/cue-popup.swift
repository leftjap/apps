import Cocoa
import WebKit

// Cue 카드 표시 에이전트 (상주) — /tmp/cue-popup-trigger 에 상태값이 써지면 검증된 카드(WKWebView)를 띄움.
// 감지는 youtube-gate-native.sh(Automation 권한 보유)가 담당, 표시는 이 앱이 담당(창 직접 소유 → launchd/open 문제 없음).
let cardPath = "/Users/gio_c/apps/cue/tools/youtube-gate-card.html"
let triggerPath = "/tmp/cue-popup-trigger"
let logPath = "/tmp/cue-popup.log"
let knownStates = ["독서", "글쓰기", "어학", "운동", "stale", "toast"]
let appURLs: [String: String] = [
  "독서": "https://leftjap.github.io/apps/book/",
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

final class Controller: NSObject, WKScriptMessageHandler {
  var window: NSWindow?
  var web: WKWebView?
  var state = "독서"
  var closeTimer: Timer?

  func userContentController(_ u: WKUserContentController, didReceive m: WKScriptMessage) {
    guard let s = m.body as? String else { return }
    if s == "go" {
      if let u = appURLs[state], let url = URL(string: u) { log("bridge go state=\(state) open=\(u)"); NSWorkspace.shared.open(url) }
      else { log("bridge go state=\(state) (no url)") }
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
    let js = """
    window.cueGo = function(){ window.webkit.messageHandlers.cue.postMessage('go'); };
    window.cueLater = function(){ window.webkit.messageHandlers.cue.postMessage('later'); };
    document.addEventListener('click', function(e){ if(e.target && e.target.classList && e.target.classList.contains('ov')){ window.webkit.messageHandlers.cue.postMessage('later'); } });
    """
    ucc.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
    cfg.userContentController = ucc
    let w = WKWebView(frame: screen, configuration: cfg)
    w.setValue(false, forKey: "drawsBackground")
    var c = URLComponents(string: "file://\(cardPath)")!
    c.queryItems = [URLQueryItem(name: "state", value: state)]
    w.load(URLRequest(url: c.url!))
    let win = NSWindow(contentRect: screen, styleMask: [.borderless], backing: .buffered, defer: false)
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
    showCard(st)
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
  let ctrl = Controller()
  func applicationDidFinishLaunching(_ n: Notification) {
    // 셀프테스트: --selftest <state> <go|later> → 카드 표시 후 내부 버튼 클릭 발화 → 브리지 체인 검증
    let args = CommandLine.arguments
    if let i = args.firstIndex(of: "--selftest"), i + 2 < args.count {
      let st = args[i + 1], action = args[i + 2]
      log("selftest start state=\(st) action=\(action)")
      ctrl.showCard(st)
      Timer.scheduledTimer(withTimeInterval: 2.0, repeats: false) { [weak self] _ in
        // WKWebView(WebKit) 내부에서 애니메이션이 실제 구동되는지 검증
        self?.ctrl.web?.evaluateJavaScript("JSON.stringify({n:document.getAnimations().length,names:[...new Set(document.getAnimations().map(a=>a.animationName))].sort()})") { res, _ in
          log("selftest anims \(res.map { String(describing: $0) } ?? "nil")")
        }
        let sel = action == "later" ? ".later" : ".cta"
        self?.ctrl.web?.evaluateJavaScript("document.querySelector('\(sel)').click(); 'ok'") { res, err in
          log("selftest click \(sel) res=\(String(describing: res)) err=\(err.map { String(describing: $0) } ?? "nil")")
        }
        Timer.scheduledTimer(withTimeInterval: 2.0, repeats: false) { _ in log("selftest done"); NSApp.terminate(nil) }
      }
      return
    }
    try? "".write(toFile: triggerPath, atomically: true, encoding: .utf8)  // 시작 시 트리거 비움
    log("agent started")
    Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.ctrl.poll() }
  }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = AppDelegate()
app.delegate = delegate
app.run()

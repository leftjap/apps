import Foundation
import CoreLocation

// 잠금·백그라운드에서 CoreMotion이 계속 돌도록 프로세스를 살려두는 keep-alive.
//
// [코드 밖 필수 전제 — Apple 문서 확인됨]
//  1) Signing & Capabilities > Background Modes > "Location updates" 활성화
//     (Xcode가 Info.plist에 UIBackgroundModes=location 자동 추가)
//  2) Info.plist NSLocationWhenInUseUsageDescription 문자열
//
// [정정] CLBackgroundActivitySession '생성만'으로는 백그라운드 유지가 Apple 문서로
// 보장되지 않는다(문서: "handle updates as they arrive"). 세션은 반드시 활성
// CLLocationUpdate.liveUpdates 스트림을 '실제 소비'하는 것과 함께 써야 한다.
// 즉 백그라운드에서 location을 실제로 사용한다(위치 인디케이터 표시·배터리 비용).
//
// [미검증] "location 세션 유지 → CMMotionManager deviceMotion 콜백 지속"이라는 인과는
// Apple 공식 문서로 보장되지 않는 널리 쓰이는 커뮤니티 기법이다. 실기기 백그라운드 검증 필요.
@MainActor
final class KeepAlive: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published private(set) var authorized = false

    private let manager = CLLocationManager()
    private var session: CLBackgroundActivitySession?
    private var updatesTask: Task<Void, Never>?
    private var wantAlive = false

    override init() {
        super.init()
        manager.delegate = self
    }

    func start() {
        wantAlive = true
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        }
        updateAuth()
    }

    func stop() {
        wantAlive = false
        updatesTask?.cancel()
        updatesTask = nil
        session?.invalidate()
        session = nil
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in self.updateAuth() }
    }

    private func updateAuth() {
        let s = manager.authorizationStatus
        authorized = (s == .authorizedWhenInUse || s == .authorizedAlways)
        guard wantAlive, authorized, session == nil else { return }

        // 전경에서 세션 생성 (문서: create the session while in the foreground)
        session = CLBackgroundActivitySession()

        // 필수: liveUpdates 스트림을 실제로 소비해야 백그라운드 실행이 문서상 유지됨.
        // 위치 값 자체는 버린다 — 스트림 소비가 목적(프로세스 keep-alive).
        updatesTask = Task {
            do {
                for try await _ in CLLocationUpdate.liveUpdates() {
                    if Task.isCancelled { break }
                }
            } catch {
                // 스트림 종료/에러 무시
            }
        }
    }
}

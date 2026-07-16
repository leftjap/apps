import Foundation
import CoreLocation
import RTViews

// 읽은 위치 캡처 (작업지시서 §13·§16) — 세션 시작·시간추가 시트 열림 시 1회 픽스 + 역지오코딩.
// 저장 시점에 모델이 locationProvider 로 fix 스냅샷을 읽어 세션에 부착한다.
// 비동기 확보 전/권한 거부/실패면 nil → 세션은 위치 없이 저장 (지도에 안 뜸 — 정상).
// 획득 시점: 세션 시작(§16 결정 2026-07-15) — 독서는 정적이라 시작 위치 = 읽은 위치.
@MainActor
final class LocationCapture: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var pending = false
    private(set) var fix: RTPlaceFix?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    /// 새 캡처 시작 — 이전 fix 는 폐기 (스테일 위치가 다음 세션에 붙는 것 방지)
    func capture() {
        fix = nil
        pending = true
        switch manager.authorizationStatus {
        case .notDetermined: manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways: manager.requestLocation()
        default: pending = false            // 거부 — 위치 없이 저장
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            guard self.pending else { return }
            switch self.manager.authorizationStatus {
            case .authorizedWhenInUse, .authorizedAlways: self.manager.requestLocation()
            case .notDetermined: break      // 다이얼로그 표시 중 — 다음 콜백 대기
            default: self.pending = false
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        Task { @MainActor in self.resolve(loc) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in self.pending = false }
    }

    private func resolve(_ loc: CLLocation) {
        guard pending else { return }
        pending = false
        // 좌표는 즉시 확보 — 역지오코딩(네트워크) 실패 시 좌표 그리드가 클러스터 키 폴백
        let grid = String(format: "%.3f,%.3f", loc.coordinate.latitude, loc.coordinate.longitude)
        RTDbg.p("loc: 픽스 확보 (\(grid))")
        fix = RTPlaceFix(latitude: loc.coordinate.latitude, longitude: loc.coordinate.longitude,
                         placeId: grid)
        CLGeocoder().reverseGeocodeLocation(loc) { [weak self] placemarks, _ in
            guard let p = placemarks?.first else { return }
            Task { @MainActor in
                guard let self, let cur = self.fix, cur.placeId == grid else { return }
                // 동 단위 클러스터 키. 연속 중복 제거 (서울: administrativeArea == locality "서울특별시")
                var parts: [String] = []
                for x in [p.isoCountryCode, p.administrativeArea, p.locality, p.subLocality]
                    .compactMap({ $0 }) where x != parts.last { parts.append(x) }
                self.fix = RTPlaceFix(latitude: cur.latitude, longitude: cur.longitude,
                                      placeId: parts.isEmpty ? grid : parts.joined(separator: ":"),
                                      placeName: p.subLocality ?? p.locality ?? p.administrativeArea,
                                      country: p.country)
                RTDbg.p("loc: 역지오코딩 해석 (\(self.fix?.placeName ?? "?"))")
            }
        }
    }
}

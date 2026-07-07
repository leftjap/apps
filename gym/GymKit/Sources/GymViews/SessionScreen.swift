import SwiftUI
import GymCore

// 세션 화면 — mocks/session.html .session-active 이식. "최신 디자인" = 시안 #15a 값 채택
// (헤더 링 56px·align center·gap 11 — 사용자 지적 반영. 앱의 50px/flex-start 편차 교정).
// 폰트: 실앱은 번들 Pretendard/Space Grotesk. 스캐폴딩은 시스템 폴백(.monospaced for mono).

// 상단 툴바 — grid 1fr auto 1fr, height 48 (mocks .sess-toolbar).
struct SessionToolbar: View {
    let time: String
    var body: some View {
        ZStack {
            HStack {
                Image(systemName: "house")
                    .font(.system(size: 16, weight: .regular))
                    .foregroundStyle(GY.ink3)
                    .frame(width: 40, height: 40)
                Spacer()
            }
            HStack(spacing: 8) {  // 타이머 (중앙)
                Circle().fill(GY.crailBase).frame(width: 6, height: 6)
                Text(time)
                    .font(.mono(18, 500))
                    .foregroundStyle(GY.ink2)
            }
            HStack {
                Spacer()
                Text("종료")
                    .font(.sans(14, 600))
                    .foregroundStyle(GY.ink3)
                    .padding(.leading, 14).padding(.trailing, 4).padding(.vertical, 9)
            }
        }
        .padding(.horizontal, 16)
        .frame(height: 48)
    }
}

// 타이틀 + 세션 볼륨 링 (시안 #15a 헤더: align center, gap 16 / .sv gap 11 / ring 56).
struct SessionHeader: View {
    let exName: String
    let part: String
    let volCur: String       // "4,800"
    let volTotal: String     // "8,940"
    let pct: Int             // 54
    var body: some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text(exName).font(.sans(25, 700)).tracking(-0.5)
                    .foregroundStyle(GY.ink1).lineLimit(1)
                Text(part).font(.sans(12.5, 500))
                    .foregroundStyle(GY.ink4).lineLimit(1)
            }
            Spacer(minLength: 0)
            HStack(spacing: 11) {   // .sv
                VStack(alignment: .trailing, spacing: 3) {  // .sv-text
                    Text("세션 볼륨").font(.sans(10.5, 600))
                        .tracking(0.42).foregroundStyle(GY.ink4)
                    (Text(volCur + " ").font(.mono(13, 600)).foregroundStyle(GY.ink2)
                     + Text("/ \(volTotal)kg").font(.mono(13, 500)).foregroundStyle(GY.ink4))
                        .lineLimit(1).fixedSize(horizontal: true, vertical: false)  // white-space:nowrap
                }
                ZStack {  // .ring-wrap 56
                    GymRing(size: 56, lineWidth: 4.76, progress: Double(pct) / 100,
                            track: Color(oklch: 0.92, 0.006, 60), fill: GY.cloudyBase)
                    Text("\(pct)%").font(.mono(14, 700))
                        .tracking(-0.28).foregroundStyle(GY.cloudyDeep)
                }
            }
        }
        .padding(.horizontal, 24).padding(.top, 12)
    }
}

// 상단 블록 (툴바 + 헤더) — 이번 증분 검증 대상.
public struct SessionTopBlock: View {
    public init() {}
    public var body: some View {
        VStack(spacing: 0) {
            SessionToolbar(time: "18:42")
            SessionHeader(exName: "벤치프레스", part: "가슴",
                          volCur: "4,800", volTotal: "8,940", pct: 54)
            Spacer()
        }
        .frame(width: 390, height: 200)
        .background(GY.shell)
    }
}

// 세션 화면 전체 — mocks/session.html .session-active 정합 (정적 데모 데이터).
public struct SessionScreenView: View {
    public init() {}
    public var body: some View {
        VStack(spacing: 0) {
            SessionToolbar(time: "18:42")
            SessionHeader(exName: "벤치프레스", part: "가슴",
                          volCur: "4,800", volTotal: "8,940", pct: 54)
            PrevRecordBars(
                sets: [.init(weight: 20, reps: 15, state: .done),
                       .init(weight: 40, reps: 7, state: .done),
                       .init(weight: 40, reps: 9, state: .done),
                       .init(weight: 40, reps: 7, state: .now)],
                best: (weight: 45, reps: 10))
            Spacer()
            SessionHero(weight: "65", unit: "kg", reps: "10")
            Spacer()
            ExerciseVolumeRing(
                sets: [GymSet(weight: 60, reps: 10, done: true),
                       GymSet(weight: 60, reps: 10, done: true),
                       GymSet(weight: 65, reps: 8, done: true),
                       GymSet(weight: 65, reps: 8, done: false)],
                cur: 3, pct: 67, curVol: "2,020", totVol: "3,020", overAmt: "+220")
            GymFooterRail(items: [
                .init(name: "체스트 프레스", state: .done),
                .init(name: "벤치프레스", state: .current),
                .init(name: "인클라인 덤벨 프레스", state: .upcoming),
                .init(name: "케이블 플라이", state: .upcoming),
            ])
        }
        .frame(width: 390, height: 844)
        .background(GY.shell)
    }
}

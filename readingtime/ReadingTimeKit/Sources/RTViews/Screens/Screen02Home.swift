import SwiftUI

// v8→TURN7 02 홈 (읽던 책 있음) — 스펙: 리딩타임 홈 시안 #7b.
// 흐릿한 서가 배경 앞 실물 스케일 표지. 읽기 버튼·세그먼트·카드 없음 — 홈에서 폰을 엎으면 즉시 기록.
// 탭 모드는 우하단 점선 링만. 서재=배경 탭, 기록=우측 엣지 탭, 책추가=헤더 +.
//
// 데모/라이브 이중 경로 유지 (userData==nil = 시안 데모값 = rtshot 픽셀 오라클 경로).
public struct Screen02Home: View {
    // 실데이터 스냅샷 (nil = 시안 데모 값 그대로)
    struct Live {
        let title: String
        let author: String
        let coverUrl: String
        let totalHM: String
        let count: Int
        let todayMin: Int
        let weekHM: String
        let streak: Int
        let monthLabel: String
    }

    var model: RTAppModel?
    private let live: Live?
    private let firstRun: Bool   // 하루 첫 실행 안무 (#7a) — 모션 on + 이 플래그일 때만

    public init(model: RTAppModel? = nil) {
        self.model = model
        self.firstRun = model?.playPickup ?? false
        if let m = model, m.userData != nil, let book = m.currentBook {
            self.live = Live(
                title: book.title,
                author: book.author,
                coverUrl: book.coverUrl,
                totalHM: RTAppModel.hmString(m.totalSeconds(isbn: book.isbn)),
                count: m.sessionCount(isbn: book.isbn),
                todayMin: m.todaySeconds / 60,
                weekHM: RTAppModel.hmString(m.weekSeconds),
                streak: m.streakDays,
                monthLabel: "\(Calendar(identifier: .gregorian).component(.month, from: m.now()))월")
        } else {
            self.live = nil
        }
    }

    public var body: some View {
        ZStack(alignment: .top) {
            RT.paper
            // 1. 배경 서가 (z0) — 탭 → 서재
            RTBookshelf(showSlot: true, pickup: firstRun)
                .contentShape(Rectangle())
                .onTapGesture { model?.nav(.library) }
            // 2·3·4. 헤더 + 데이터 블록 + 책 카드
            VStack(spacing: 0) {
                RTHomeHeader {
                    RTHeaderPlus()
                        .contentShape(Rectangle())
                        .onTapGesture { model?.openSheet(.addbook) }
                    RTAvatar("지")
                        .contentShape(Rectangle())
                        .onTapGesture { model?.openSheet(.settings) }
                }
                dataBlock
                    .padding(EdgeInsets(top: 26, leading: 26, bottom: 0, trailing: 26))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .rtPickupChrome(firstRun, delay: 0.55)
                    .allowsHitTesting(false)
                bookBlock
                    .padding(.top, 88)
                    .frame(maxWidth: .infinity)
                    .allowsHitTesting(false)
                Spacer(minLength: 0)
            }
            // 5. 우측 엣지 탭 (기록) — 탭 → 주간 통계
            .overlay(alignment: .topTrailing) {
                edgeTab
                    .rtPickupChrome(firstRun, delay: 1.5)
                    .offset(y: 440)
                    .contentShape(Rectangle())
                    .onTapGesture { model?.nav(.statsWeek) }
            }
            // 6. 탭 모드 링 — 탭 → 탭 세션 시작
            .overlay(alignment: .bottomTrailing) {
                tapRing
                    .rtPickupChrome(firstRun, delay: 1.62)
                    .padding(EdgeInsets(top: 0, leading: 0, bottom: 28, trailing: 24))
                    .contentShape(Circle())
                    .onTapGesture { model?.switchTap() }
            }
        }
        .frame(width: 390, height: 844)
    }

    // ── 데이터 블록 (좌측, 26pt 패딩) ──
    var dataBlock: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 7) {
                Circle().fill(RT.green).frame(width: 6, height: 6).rtBlink(duration: 2.2)
                Text("읽는 중").font(.sans(11, 700)).foregroundColor(RT.green)
            }
            Text("오늘").font(.sans(11.5, 700)).tracking(11.5 * 0.22)
                .foregroundColor(RT.muted).padding(.top, 16)
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                Text("\(live?.todayMin ?? 32)").font(.mono(64, 700)).tracking(64 * -0.04)
                    .foregroundColor(RT.ink)
                Text("분").font(.sans(22, 800)).foregroundColor(RT.body).padding(.leading, 5)
            }
            .padding(.top, 6)
            Rectangle().fill(RT.green).frame(width: 46, height: 3)
                .rtSweep(delay: firstRun ? 1.05 : 0.45, duration: 0.9)
                .padding(.top, 12)
            HStack(spacing: 0) {
                Text("이번 주 \(live?.weekHM ?? "7:26") · ").font(.mono(12, 500)).foregroundColor(RT.muted)
                Text("\(live?.streak ?? 12)일 연속").font(.mono(12, 600)).foregroundColor(RT.terra)
            }
            .padding(.top, 14)
        }
    }

    // ── 책 카드 (중앙) ──
    var bookBlock: some View {
        VStack(spacing: 0) {
            Group {
                if let live {
                    RTRemoteCover(url: live.coverUrl, size: .init(width: 150, height: 219), radius: 4.5)
                } else {
                    HomeBookCover()
                }
            }
            .shadow(color: Color(hex: 0x3A2C1C, alpha: 0.2), radius: 2.5, x: 0, y: 2)
            .shadow(color: Color(hex: 0x3A2C1C, alpha: 0.45), radius: 14, x: 0, y: 16) // 시안 0 18 30 -12 rgba(.48) 근사
            .rtPickupCover(firstRun)
            Ellipse().fill(Color(hex: 0x3A2C1C, alpha: 0.5))
                .frame(width: 104, height: 12)
                .blur(radius: 8)
                .rtFloorShadow(duration: 10)     // 부유 동기 (rtShadow8)
                .rtPickupShadow(firstRun)        // 첫 실행: 착지에 맞춰 자라 들어옴 (rtShadowIn)
                .padding(.top, 16)
            Text(live?.title ?? "몰입").font(.sans(20, 900)).tracking(20 * -0.03)
                .foregroundColor(RT.ink).padding(.top, 20).lineLimit(1)
            Text(live?.author ?? "미하이 칙센트미하이").font(.sans(12.5, 500))
                .foregroundColor(RT.muted).padding(.top, 4).lineLimit(1)
            HStack(alignment: .firstTextBaseline, spacing: 7) {
                Text(live?.totalHM ?? "4:12").font(.mono(16, 700)).tracking(16 * -0.02)
                    .foregroundColor(RT.ink)
                Text("누적 · \(live?.count ?? 8)회").font(.sans(11, 500)).foregroundColor(RT.faint)
            }
            .padding(.top, 13)
        }
    }

    // ── 우측 엣지 탭 (기록) — 좌측 3pt terra 바 + 세로쓰기 "기록" + 월 ──
    var edgeTab: some View {
        VStack(spacing: 7) {
            VStack(spacing: 2) {
                Text("기").font(.sans(11.5, 700))
                Text("록").font(.sans(11.5, 700))
            }
            .foregroundColor(RT.body)
            Text(live?.monthLabel ?? "5월").font(.mono(10, 600)).foregroundColor(RT.faint)
        }
        .padding(EdgeInsets(top: 12, leading: 11, bottom: 12, trailing: 8))   // leading 11 = 3(bar)+8
        .background(RT.surface)
        .overlay(alignment: .leading) { Rectangle().fill(RT.terra).frame(width: 3) }
        .clipShape(UnevenRoundedRectangle(topLeadingRadius: 11, bottomLeadingRadius: 11))
        .overlay(
            UnevenRoundedRectangle(topLeadingRadius: 11, bottomLeadingRadius: 11)
                .stroke(RT.hair, lineWidth: 1)
        )
        .shadow(color: Color(hex: 0x16140F, alpha: 0.18), radius: 7, x: 0, y: 6)
        .fixedSize()
    }

    // ── 탭 모드 링 (우하단) ──
    var tapRing: some View {
        Circle()
            .strokeBorder(Color(hex: 0x8C8570, alpha: 0.55),
                          style: StrokeStyle(lineWidth: 1.5, dash: [3.5, 3.5]))
            .frame(width: 46, height: 46)
            .overlay(RTIcon(RTIconPath.tapSeg, size: 15, stroke: RT.muted, lineWidth: 1.9))
    }
}

import SwiftUI
import GymCore

// 커스텀 숫자 키패드 바텀시트 (spec §6-3-2, mocks #keypadSheet 픽셀 정합).
// 오버레이 상주 방식 (§6-10 — 시트 재마운트 금지, transform/opacity 로만 노출).
struct KeypadContext: Equatable {
    var field: GymAppModel.KeypadField
    var buffer: String        // 입력 버퍼 — prefill 로 시작
    var fresh: Bool           // prefill 그대로 = 첫 키 입력 시 교체
    var pairHidesWeight: Bool // bodyweight — 무게 토글 숨김(횟수 전용)
    var setIdx: Int? = nil    // 특정 세트 편집 (§6-9 세트 행 수정) — nil 이면 현재 세트
    var unitOverride: String? = nil   // 프로필 등 field 매핑 밖 단위 ("cm"·"")
    var digitLimit: Int = 6           // 버퍼 최대 자릿수 (생년월일 8)
    var asDate: Bool = false          // YYYYMMDD 버퍼 → "YYYY.MM.DD" 점진 표시

    // 모드 세그 페어 — weight↔reps / duration↔distance.
    var pair: [(GymAppModel.KeypadField, String)] {
        (field == .duration || field == .distance)
            ? [(.duration, "시간"), (.distance, "거리")]
            : [(.weight, "무게"), (.reps, "횟수")]
    }
    var unit: String {
        if let unitOverride { return unitOverride }
        switch field {
        case .weight: return "kg"; case .reps: return "회"
        case .duration: return "분"; case .distance: return "km"
        }
    }
    var displayBuffer: String {
        asDate ? GymProfileFields.birthdateBufferDisplay(buffer)
               : (buffer.isEmpty ? "0" : buffer)
    }
}

struct KeypadSheet: View {
    let ctx: KeypadContext
    let refValue: String?                                  // "직전 N" prefill 표시값
    var bare: Bool = false                                 // 체중 입력용 — 세그·quick 없음 (mock #weightKeypadSheet)
    var title: String? = nil                               // bare 타이틀 (mock "오늘 체중" 행)
    var doneLabel: String = "완료"
    let onKey: (String) -> Void                            // "0"-"9" "." "del"
    let onQuick: (Double) -> Void                          // ±2.5/+5 (weight 만)
    let onMode: (GymAppModel.KeypadField) -> Void
    let onDone: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Capsule().fill(GY.line).frame(width: 40, height: 4).padding(.bottom, 14)
            // bare 타이틀 (mock #weightKeypadSheet 타이틀 행)
            if let title {
                Text(title).font(.sans(13, 600)).tracking(0.26).foregroundStyle(GY.ink3)
                    .padding(.bottom, 10)
            }
            // 모드 세그 (200px, sunken)
            if !bare {
                HStack(spacing: 6) {
                    ForEach(ctx.pair, id: \.0.rawValue) { (mode, label) in
                        if !(ctx.pairHidesWeight && mode == .weight) {
                            Button { onMode(mode) } label: {
                                Text(label).font(.sans(14, 600))
                                    .foregroundStyle(mode == ctx.field ? GY.ink1 : GY.ink3)
                                    .frame(maxWidth: .infinity).frame(height: 36)
                                    .background(mode == ctx.field ? GY.card : .clear,
                                                in: RoundedRectangle(cornerRadius: GY.rSm))
                            }.buttonStyle(.plain)
                        }
                    }
                }
                .padding(4).frame(width: 200)
                .background(GY.sunken, in: RoundedRectangle(cornerRadius: GY.rMd))
                .padding(.bottom, 14)
            }
            // 현재 입력값 + 캐럿 + 단위
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(ctx.displayBuffer)
                    .font(.mono(52, 500)).tracking(-1.56).foregroundStyle(GY.ink1)
                    .lineLimit(1).minimumScaleFactor(0.55)   // 생년월일 10자 오버플로 방어
                    .accessibilityIdentifier("keypad-value")
                RoundedRectangle(cornerRadius: 1).fill(GY.crailBase).frame(width: 2, height: 40)
                    .alignmentGuide(.firstTextBaseline) { d in d[.bottom] - 4 }
                Text(ctx.unit).font(.mono(17, 500)).foregroundStyle(GY.ink4)
            }
            // ref 줄 — "직전 N{unit} (· 좌우 탭존으로도 증감)"
            Group {
                if let refValue {
                    (Text("직전 ").font(.sans(12, 500)).foregroundStyle(GY.ink4)
                     + Text("\(refValue)\(ctx.unit)").font(.mono(12, 600)).foregroundStyle(GY.crailDeep)
                     + Text(ctx.field == .weight ? " · 좌우 탭존으로도 증감" : "")
                        .font(.sans(12, 500)).foregroundStyle(GY.ink4))
                } else {
                    Text(" ").font(.sans(12, 500))
                }
            }
            .padding(.top, 8)
            // 빠른 증분 (weight 만, ±원판 단위)
            if ctx.field == .weight && !bare {
                HStack(spacing: 8) {
                    quickBtn("−2.5", -2.5)
                    quickBtn("+2.5", 2.5)
                    quickBtn("+5", 5)
                }
                .padding(.top, 14)
            }
            // 그리드 3열
            let keys: [[String]] = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], [".", "0", "del"]]
            VStack(spacing: 8) {
                ForEach(keys, id: \.self) { row in
                    HStack(spacing: 8) {
                        ForEach(row, id: \.self) { k in
                            let fn = k == "." || k == "del"
                            Button { onKey(k) } label: {
                                Text(k == "del" ? "⌫" : k)
                                    .font(.mono(fn ? 20 : 23, 500))
                                    .foregroundStyle(fn ? GY.ink3 : GY.ink1)
                                    .frame(maxWidth: .infinity).frame(height: 50)
                                    .background(fn ? .clear : GY.sunken,
                                                in: RoundedRectangle(cornerRadius: GY.rMd))
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("keypad-key-\(k)")
                        }
                    }
                }
            }
            .padding(.top, 14)
            Button(action: onDone) {
                Text(doneLabel).font(.sans(16, 600)).foregroundStyle(Color(hex: 0xFBF8F2))
                    .frame(maxWidth: .infinity).frame(height: 52)
                    .background(GY.ink1, in: RoundedRectangle(cornerRadius: GY.rMd))
                    .shadow(color: Color(hex: 0x14120E).opacity(0.5), radius: 10, y: 4)
            }
            .buttonStyle(.plain).accessibilityIdentifier("keypad-done")
            .padding(.top, 12)
        }
        .padding(.top, 12).padding(.horizontal, 20).padding(.bottom, 24)
        .background {   // 시트 그림자는 배경 셰이프에만 (compositing — 내부 키 그림자 오염 방지)
            UnevenRoundedRectangle(cornerRadii: .init(topLeading: GY.rXl, topTrailing: GY.rXl))
                .fill(GY.card)
                .shadow(color: Color(hex: 0x14120E).opacity(0.4), radius: 25, y: -10)
        }
    }

    func quickBtn(_ label: String, _ delta: Double) -> some View {
        Button { onQuick(delta) } label: {
            Text(label).font(.mono(13, 600)).foregroundStyle(GY.ink2)
                .padding(.horizontal, 13).padding(.vertical, 7)
                .background(GY.card, in: Capsule())
                .overlay(Capsule().strokeBorder(GY.line, lineWidth: 1))
        }.buttonStyle(.plain)
    }
}

// 키패드 버퍼 편집 규칙 — 숫자 append(fresh 면 교체), '.' 1개 제한, del 한 자리 삭제.
enum KeypadBuffer {
    static func apply(_ key: String, to ctx: inout KeypadContext) {
        switch key {
        case "del":
            ctx.fresh = false
            if !ctx.buffer.isEmpty { ctx.buffer.removeLast() }
        case ".":
            if ctx.field == .reps || ctx.asDate { return }   // 횟수·생년월일은 정수만
            if ctx.fresh { ctx.buffer = "0"; ctx.fresh = false }
            if !ctx.buffer.contains(".") { ctx.buffer += ctx.buffer.isEmpty ? "0." : "." }
        default:
            if ctx.fresh { ctx.buffer = ""; ctx.fresh = false }
            guard ctx.buffer.count < ctx.digitLimit else { return }   // 과입력 방어
            ctx.buffer += key
        }
    }
}

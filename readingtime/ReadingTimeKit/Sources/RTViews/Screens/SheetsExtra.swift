import SwiftUI

// 시안 외 스펙 시트 3종 — 07 시트 문법(prototype sheetSettings·sheetSort·sheetBookMenu 대응).
// 픽셀 캐노니컬 아님(frames 없음): 구조·수치는 prototype/styles.css 를 따른다.

// 설정 — 이름 수정 / 밀리 연동 / 로그아웃
public struct SheetSettings: View {
    var model: RTAppModel?
    public init(model: RTAppModel? = nil) { self.model = model }

    public var body: some View {
        SheetShell {
            VStack(spacing: 0) {
                SheetHead(title: "설정", onClose: { model?.closeSheet() })
                settingRow(label: "이름", value: "지훈", valueColor: RT.ink)
                    .padding(.top, 18)
                settingRow(label: "밀리의서재", value: "연결됨", valueColor: RT.green)
                    .padding(.top, 10)
                Text("로그아웃").font(.sans(12.5, 600)).foregroundColor(Color(hex: 0xB56A55))
                    .frame(maxWidth: .infinity)
                    .padding(.top, 20)
                    .contentShape(Rectangle())
                    .onTapGesture { model?.logout() }
            }
        }
    }

    func settingRow(label: String, value: String, valueColor: Color) -> some View {
        HStack {
            Text(label).font(.sans(13, 500)).foregroundColor(RT.muted)
            Spacer()
            HStack(spacing: 7) {
                Text(value).font(.mono(13, 600)).foregroundColor(valueColor)
                ChevronRight(width: 7, height: 12, color: Color(hex: 0xC4BCA6))
            }
        }
        .padding(EdgeInsets(top: 13, leading: 15, bottom: 13, trailing: 15))
        .background(RT.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(RT.hair, lineWidth: 1))
    }
}

// 정렬 — 최근순/이름순/별점순 (현재 항목 체크)
public struct SheetSort: View {
    var model: RTAppModel?
    private let current: RTLibrarySort

    public init(model: RTAppModel? = nil) {
        self.model = model
        self.current = model?.librarySort ?? .recent
    }

    static let rows: [(RTLibrarySort, String)] = [(.recent, "최근순"), (.name, "이름순"), (.rating, "별점순")]

    public var body: some View {
        SheetShell {
            VStack(spacing: 0) {
                SheetHead(title: "정렬", onClose: { model?.closeSheet() })
                VStack(spacing: 10) {
                    ForEach(Self.rows, id: \.0) { sort, label in
                        HStack {
                            Text(label).font(.sans(13.5, 600)).foregroundColor(RT.ink)
                            Spacer()
                            if current == sort {
                                RTIcon(RTIconPath.check, size: 15, stroke: RT.green, lineWidth: 2.4)
                            }
                        }
                        .padding(EdgeInsets(top: 13, leading: 15, bottom: 13, trailing: 15))
                        .background(RT.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(RT.hair, lineWidth: 1))
                        .contentShape(Rectangle())
                        .onTapGesture { model?.setLibrarySort(sort) }
                    }
                }
                .padding(.top, 18)
            }
        }
    }
}

// ⋯ 책 메뉴 — 책 삭제
public struct SheetBookMenu: View {
    var model: RTAppModel?
    public init(model: RTAppModel? = nil) { self.model = model }

    public var body: some View {
        SheetShell {
            VStack(spacing: 0) {
                SheetHead(title: "몰입", onClose: { model?.closeSheet() })
                Text("책 삭제").font(.sans(12.5, 600)).foregroundColor(Color(hex: 0xB56A55))
                    .frame(maxWidth: .infinity)
                    .padding(.top, 20)
                    .contentShape(Rectangle())
                    .onTapGesture { model?.deleteBook() }
            }
        }
    }
}

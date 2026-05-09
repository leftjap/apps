/**
 * entries.js 단위 테스트 (Wave 11.5.2 + 11.5.2b).
 *
 * 범위:
 *   - debounce: 연속 호출 시 마지막 1회만 실행 (기존)
 *   - Entries 인터페이스 노출 (기존)
 *   - mountEntriesView no-op (기존)
 *   - 어댑터: escapeHtml / countWords / formatSavedTime / buildMockMeta / rowToMockDoc (신규)
 *   - saveArticle: createEntry / updateEntry 분기 + .save 갱신 (신규, fake-indexeddb)
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Entries,
  debounce,
  mountEntriesView,
  getOwnNaviKind,
  KIND_LABEL_PARTNER,
  __setCurrentUserForTest,
  renderRecentsFromRows,
  escapeHtml,
  countWords,
  formatSavedTime,
  buildMockMeta,
  rowToMockDoc,
  saveArticle,
  syncShareToggleFromRow,
  isEditorDirty,
  markArticleDirty,
  clearArticleDirty,
  handleRealtimeEntryChange,
  handleDeleteAction,
  handleDuplicateAction,
  handleExportAction,
  entryToExportJson,
  annotateEditToolbar,
  clearRecentsList,
  clearMainViewEmpty,
  calcCompressionDimensions,
  calcSquareCropRect,
  uploadImage,
  isHeicFile,
  convertHeicToJpeg,
  computeListStats,
  filterListRows,
  renderListView,
  isReadOnlyRow,
  renderDocFromRow,
} from './entries.js';
import { createTodayDB } from '../db/schema.js';

// ───────────────────────────────────────────────────────────────────────────
// 기존 (Wave 11.5.2)
// ───────────────────────────────────────────────────────────────────────────

describe('debounce (자동저장 800ms — spec §8)', () => {
  it('연속 호출 → 마지막 1회만 실행', async () => {
    const fn = vi.fn();
    const d = debounce(fn, 30);
    d('a');
    d('b');
    d('c');
    expect(fn).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 60));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('간격 두고 호출 → 각각 실행', async () => {
    const fn = vi.fn();
    const d = debounce(fn, 20);
    d('a');
    await new Promise((r) => setTimeout(r, 40));
    d('b');
    await new Promise((r) => setTimeout(r, 40));
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('Entries 인터페이스 노출', () => {
  it('필수 멤버 노출 (Wave 11.5.2 + 11.5.2b + share toggle + 11.5.3.3)', () => {
    const expected = [
      'ENTRY_KINDS', 'mountEntriesView', 'rebindCategoryObserver', 'debounce',
      'rowToMockDoc', 'buildMockMeta', 'formatSavedTime', 'countWords', 'escapeHtml',
      'renderRecentsFromRows', 'renderDocFromRow',
      'getCurrentKind', 'setSaveStatus', 'saveArticle', 'wrapNewArticle',
      'injectEditorStyles',
      'syncShareToggleFromRow',
      'isEditorDirty', 'markArticleDirty', 'clearArticleDirty',
      'showServerUpdateBadge', 'hideServerUpdateBadge', 'handleRealtimeEntryChange',
      // Wave 11.7.3 — navi 합집합 fetch
      'fetchEntriesForCategory',
    ];
    for (const k of expected) {
      expect(Entries, `Entries.${k} 누락`).toHaveProperty(k);
    }
  });

  it('ENTRY_KINDS 는 글쓰기 7종 (expense 제외 — 별 wave)', () => {
    expect(Entries.ENTRY_KINDS).toEqual([
      'navi', 'fiction', 'blog', 'memo',
      'soyoun_navi', 'flight_diary', 'soyoun_blog',
    ]);
  });
});

describe('mountEntriesView', () => {
  it('user 누락 시 no-op (throw 없음)', () => {
    expect(() => mountEntriesView(null)).not.toThrow();
    expect(() => mountEntriesView({})).not.toThrow();
  });
});

describe('getOwnNaviKind — 이메일 → owned navi kind 매핑 (소연 fix)', () => {
  it('leftjap → navi', () => {
    expect(getOwnNaviKind('leftjap@gmail.com')).toBe('navi');
  });
  it('causencompany (leftjap alt) → navi', () => {
    expect(getOwnNaviKind('causencompany@gmail.com')).toBe('navi');
  });
  it('soyoun → soyoun_navi', () => {
    expect(getOwnNaviKind('soyoun312@gmail.com')).toBe('soyoun_navi');
  });
  it('미매칭 / 빈 값 → default navi', () => {
    expect(getOwnNaviKind('unknown@example.com')).toBe('navi');
    expect(getOwnNaviKind(null)).toBe('navi');
    expect(getOwnNaviKind('')).toBe('navi');
  });
});

describe('renderRecentsFromRows — partner 라벨 owner_id 기반 (2026-05-05)', () => {
  const ME = '11111111-2222-3333-4444-555555555555';
  const SOYOUN = 'aeafd9a7-4094-4e7c-a621-188d6b2e336d';
  const GIO = '7bae5645-61c6-4476-9ff2-4c30a72812ff';

  function makeFakeDoc() {
    const list = {
      _html: '',
      set innerHTML(v) { this._html = v; },
      get innerHTML() { return this._html; },
    };
    return { list, doc: { getElementById: (id) => (id === 'recentsList' ? list : null) } };
  }
  afterEach(() => __setCurrentUserForTest(null));

  it('소연 (ME) 컨텍스트 — owner=GIO 글에 지오 라벨 / 본인 글 라벨 없음', () => {
    __setCurrentUserForTest({ id: SOYOUN });
    const { list, doc } = makeFakeDoc();
    renderRecentsFromRows('navi', [
      { id: 'a', title: '내 글', kind: 'soyoun_navi', owner_id: SOYOUN },
      { id: 'b', title: '지오 글', kind: 'navi', owner_id: GIO },
    ], doc);
    expect(list.innerHTML).toContain('지오</span>');
    expect(list.innerHTML).not.toContain('소연</span>');
  });

  it('지오 (ME) 컨텍스트 — owner=SOYOUN 글에 소연 라벨', () => {
    __setCurrentUserForTest({ id: GIO });
    const { list, doc } = makeFakeDoc();
    renderRecentsFromRows('navi', [
      { id: 'a', title: '내 글', kind: 'navi', owner_id: GIO },
      { id: 'b', title: '소연 글', kind: 'soyoun_navi', owner_id: SOYOUN },
      // 잔흔 케이스 — owner=소연 + kind=navi (Keep partner-sync) → 소연 라벨
      { id: 'c', title: '잔흔', kind: 'navi', owner_id: SOYOUN },
    ], doc);
    expect(list.innerHTML.match(/소연<\/span>/g)?.length).toBe(2);
    expect(list.innerHTML).not.toContain('지오</span>');
  });

  it('KIND_LABEL_PARTNER 노출 (legacy 호환)', () => {
    expect(KIND_LABEL_PARTNER).toEqual({ navi: '지오', soyoun_navi: '소연' });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Wave 11.7 — 이미지 삽입 (calcCompressionDimensions 순수 함수)
// ───────────────────────────────────────────────────────────────────────────

describe('calcCompressionDimensions — canvas 압축 dimensions', () => {
  it('maxDim 이내 → 원본 유지 (scale=1)', () => {
    expect(calcCompressionDimensions(1920, 1080, 1920)).toEqual({ tw: 1920, th: 1080, scale: 1 });
    expect(calcCompressionDimensions(800, 600, 1920)).toEqual({ tw: 800, th: 600, scale: 1 });
  });

  it('가로 장변 초과 → 가로 1920 으로 축소', () => {
    const r = calcCompressionDimensions(3840, 2160, 1920);
    expect(r.tw).toBe(1920);
    expect(r.th).toBe(1080);
    expect(r.scale).toBe(0.5);
  });

  it('세로 장변 초과 → 세로 1920 으로 축소', () => {
    const r = calcCompressionDimensions(1080, 3840, 1920);
    expect(r.tw).toBe(540);
    expect(r.th).toBe(1920);
    expect(r.scale).toBe(0.5);
  });

  it('비율 유지 (round 적용)', () => {
    const r = calcCompressionDimensions(4000, 3000, 1920);
    expect(r.tw).toBe(1920);
    expect(r.th).toBe(1440);
  });

  it('잘못된 입력 → { 0, 0, 0 }', () => {
    expect(calcCompressionDimensions(0, 100, 1920)).toEqual({ tw: 0, th: 0, scale: 0 });
    expect(calcCompressionDimensions(NaN, 100, 1920)).toEqual({ tw: 0, th: 0, scale: 0 });
    expect(calcCompressionDimensions(-100, 100, 1920)).toEqual({ tw: 0, th: 0, scale: 0 });
  });

  it('Entries.calcCompressionDimensions / compressImage 노출', () => {
    expect(typeof Entries.calcCompressionDimensions).toBe('function');
    expect(typeof Entries.compressImage).toBe('function');
  });

  it('Wave 11.7.1 — default maxDim = 1600 (Supabase 1GB 감안)', () => {
    // maxDim 생략 → 1600 적용
    expect(calcCompressionDimensions(1600, 1200)).toEqual({ tw: 1600, th: 1200, scale: 1 });
    const big = calcCompressionDimensions(3200, 2400);
    expect(big.tw).toBe(1600);
    expect(big.th).toBe(1200);
    expect(big.scale).toBe(0.5);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Wave 11.10 — 정사각 center crop (avatar 압축)
// ───────────────────────────────────────────────────────────────────────────

describe('calcSquareCropRect — 정사각 center crop source rect (Wave 11.10)', () => {
  it('가로가 더 길면 좌우 잘림 → sx 가운데, sw=sh=h', () => {
    const r = calcSquareCropRect(1600, 900);
    expect(r.sw).toBe(900);
    expect(r.sh).toBe(900);
    expect(r.sx).toBe(350); // (1600 - 900) / 2 = 350
    expect(r.sy).toBe(0);
  });

  it('세로가 더 길면 상하 잘림 → sy 가운데, sw=sh=w', () => {
    const r = calcSquareCropRect(900, 1600);
    expect(r.sw).toBe(900);
    expect(r.sh).toBe(900);
    expect(r.sx).toBe(0);
    expect(r.sy).toBe(350);
  });

  it('정사각 입력 → 변경 없음 (sx=sy=0, sw=sh=w)', () => {
    const r = calcSquareCropRect(800, 800);
    expect(r).toEqual({ sx: 0, sy: 0, sw: 800, sh: 800 });
  });

  it('홀수 차이 → Math.round 적용 (1601→900 → sx=351)', () => {
    const r = calcSquareCropRect(1601, 900);
    expect(r.sx).toBe(351);
  });

  it('잘못된 입력 → { sx:0, sy:0, sw:0, sh:0 }', () => {
    expect(calcSquareCropRect(0, 100)).toEqual({ sx: 0, sy: 0, sw: 0, sh: 0 });
    expect(calcSquareCropRect(NaN, 100)).toEqual({ sx: 0, sy: 0, sw: 0, sh: 0 });
    expect(calcSquareCropRect(-100, 100)).toEqual({ sx: 0, sy: 0, sw: 0, sh: 0 });
    expect(calcSquareCropRect(100, 0)).toEqual({ sx: 0, sy: 0, sw: 0, sh: 0 });
  });

  it('Entries.calcSquareCropRect 노출', () => {
    expect(typeof Entries.calcSquareCropRect).toBe('function');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Wave 11.8 — Supabase Storage 업로드 (phase 2)
// ───────────────────────────────────────────────────────────────────────────

describe('uploadImage — Supabase Storage 업로드 (Wave 11.8 phase 2)', () => {
  const VALID_DATAURL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2w=='; // 짧은 jpeg stub
  const USER_ID = '00000000-0000-0000-0000-000000000001';

  function makeMockSupabase({ uploadError = null, publicUrl = 'https://stub.supabase.co/storage/v1/object/public/today-entries/test.jpeg' } = {}) {
    const upload = vi.fn(async () => ({ data: { path: 'x' }, error: uploadError }));
    const getPublicUrl = vi.fn(() => ({ data: { publicUrl } }));
    const from = vi.fn(() => ({ upload, getPublicUrl }));
    return { storage: { from }, _upload: upload, _getPublicUrl: getPublicUrl, _from: from };
  }

  it('Entries.uploadImage 노출', () => {
    expect(typeof Entries.uploadImage).toBe('function');
    expect(typeof uploadImage).toBe('function');
  });

  it('invalid dataUrl (data: prefix 아님) → reason invalid_dataurl', async () => {
    const r = await uploadImage('https://example.com/x.jpg', { user_id: USER_ID, supabase: makeMockSupabase() });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('invalid_dataurl');
  });

  it('user_id 누락 → reason no_user + dataUrl 동반', async () => {
    const r = await uploadImage(VALID_DATAURL, { supabase: makeMockSupabase() });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_user');
    expect(r.dataUrl).toBe(VALID_DATAURL);
  });

  it('supabase null → reason no_supabase + dataUrl fallback', async () => {
    const r = await uploadImage(VALID_DATAURL, { user_id: USER_ID, supabase: null });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_supabase');
    expect(r.dataUrl).toBe(VALID_DATAURL);
  });

  it('happy path → ok + url + path (user_id/<uuid>.jpeg)', async () => {
    const mock = makeMockSupabase();
    const r = await uploadImage(VALID_DATAURL, { user_id: USER_ID, supabase: mock });
    expect(r.ok).toBe(true);
    expect(typeof r.url).toBe('string');
    expect(r.url).toContain('today-entries');
    expect(r.path).toMatch(new RegExp(`^${USER_ID}/[a-z0-9-]+\\.jpeg$`));
    expect(mock._from).toHaveBeenCalledWith('today-entries');
    expect(mock._upload).toHaveBeenCalledTimes(1);
  });

  it('upload error → reason upload_failed + dataUrl fallback (caller 가 사용 가능)', async () => {
    const mock = makeMockSupabase({ uploadError: { message: 'rls_violation' } });
    const r = await uploadImage(VALID_DATAURL, { user_id: USER_ID, supabase: mock });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('upload_failed');
    expect(r.dataUrl).toBe(VALID_DATAURL);
  });

  it('bucket override 가능 (opts.bucket)', async () => {
    const mock = makeMockSupabase();
    const r = await uploadImage(VALID_DATAURL, { user_id: USER_ID, bucket: 'custom-bucket', supabase: mock });
    expect(r.ok).toBe(true);
    expect(mock._from).toHaveBeenCalledWith('custom-bucket');
  });

  it('PNG dataUrl → path 확장자 png', async () => {
    const mock = makeMockSupabase();
    const PNG_DATAURL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const r = await uploadImage(PNG_DATAURL, { user_id: USER_ID, supabase: mock });
    expect(r.ok).toBe(true);
    expect(r.path).toMatch(/\.png$/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Wave 11.9 — HEIC 변환 (iPhone Safari, heic2any 동적 import)
// ───────────────────────────────────────────────────────────────────────────

describe('isHeicFile — HEIC/HEIF 검출 (Wave 11.9)', () => {
  it('image/heic type → true', () => {
    expect(isHeicFile({ type: 'image/heic', name: 'IMG_001.HEIC' })).toBe(true);
  });

  it('image/heif type → true', () => {
    expect(isHeicFile({ type: 'image/heif', name: 'pic.heif' })).toBe(true);
  });

  it('빈 type + .heic 확장자 (iOS 17+ 빈 type 케이스) → true', () => {
    expect(isHeicFile({ type: '', name: 'IMG_001.heic' })).toBe(true);
    expect(isHeicFile({ type: '', name: 'photo.HEIF' })).toBe(true);
  });

  it('일반 jpeg / png / webp → false', () => {
    expect(isHeicFile({ type: 'image/jpeg', name: 'a.jpg' })).toBe(false);
    expect(isHeicFile({ type: 'image/png', name: 'b.png' })).toBe(false);
    expect(isHeicFile({ type: 'image/webp', name: 'c.webp' })).toBe(false);
  });

  it('null/undefined → false (no throw)', () => {
    expect(isHeicFile(null)).toBe(false);
    expect(isHeicFile(undefined)).toBe(false);
    expect(isHeicFile({})).toBe(false);
  });

  it('Entries.isHeicFile / convertHeicToJpeg 노출', () => {
    expect(typeof Entries.isHeicFile).toBe('function');
    expect(typeof Entries.convertHeicToJpeg).toBe('function');
  });
});

describe('convertHeicToJpeg — heic2any wrapper (Wave 11.9)', () => {
  it('mock heic2any → 단일 Blob 반환', async () => {
    const mockBlob = new Blob(['jpeg-bytes'], { type: 'image/jpeg' });
    const mockH2a = vi.fn(async () => mockBlob);
    const file = new Blob(['heic-bytes'], { type: 'image/heic' });
    const out = await convertHeicToJpeg(file, { heic2any: mockH2a });
    expect(out).toBe(mockBlob);
    expect(mockH2a).toHaveBeenCalledWith({ blob: file, toType: 'image/jpeg', quality: 0.85 });
  });

  it('heic2any 가 Blob[] 반환 (다중 페이지 HEIF) → 첫 항목 사용', async () => {
    const blobs = [new Blob(['p1']), new Blob(['p2'])];
    const mockH2a = vi.fn(async () => blobs);
    const out = await convertHeicToJpeg(new Blob([]), { heic2any: mockH2a });
    expect(out).toBe(blobs[0]);
  });

  it('opts.quality 전달', async () => {
    const mockH2a = vi.fn(async () => new Blob([]));
    await convertHeicToJpeg(new Blob([]), { heic2any: mockH2a, quality: 0.7 });
    expect(mockH2a).toHaveBeenCalledWith(expect.objectContaining({ quality: 0.7 }));
  });

  it('file 누락 → throw no_file (no heic2any 호출)', async () => {
    const mockH2a = vi.fn();
    await expect(convertHeicToJpeg(null, { heic2any: mockH2a })).rejects.toThrow('no_file');
    expect(mockH2a).not.toHaveBeenCalled();
  });
});


// ───────────────────────────────────────────────────────────────────────────
// Wave 11.5.2b — 어댑터 (순수 함수)
// ───────────────────────────────────────────────────────────────────────────

describe('escapeHtml — XSS 방지', () => {
  it('& < > " \' 모두 엔티티 변환', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(escapeHtml(`a "b" 'c' & d`)).toBe('a &quot;b&quot; &#39;c&#39; &amp; d');
  });

  it('null/undefined → 빈 문자열', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('숫자도 문자열화', () => {
    expect(escapeHtml(42)).toBe('42');
  });
});

describe('countWords — HTML 제거 + 공백 split', () => {
  it('빈 / null → 0', () => {
    expect(countWords('')).toBe(0);
    expect(countWords(null)).toBe(0);
    expect(countWords('   ')).toBe(0);
  });

  it('plain text 단어 수', () => {
    expect(countWords('hello world')).toBe(2);
    expect(countWords('한 줄 두 단어')).toBe(4);
  });

  it('HTML 태그 제거 후 카운트', () => {
    expect(countWords('<p>한 줄</p><p>두 줄</p>')).toBe(4);
    expect(countWords('<div class="x">단어 셋 넷</div>')).toBe(3);
  });

  it('연속 공백 → 1로 정규화', () => {
    expect(countWords('a    b\nc\t\td')).toBe(4);
  });
});

describe('formatSavedTime — ISO → 표시 텍스트', () => {
  it('null/undefined/잘못된 ISO → "저장 대기"', () => {
    expect(formatSavedTime(null)).toBe('저장 대기');
    expect(formatSavedTime(undefined)).toBe('저장 대기');
    expect(formatSavedTime('not-iso')).toBe('저장 대기');
  });

  it('1분 미만 → "방금 저장됨"', () => {
    const now = new Date('2026-04-30T15:00:30Z');
    const iso = '2026-04-30T15:00:00Z';
    expect(formatSavedTime(iso, now)).toBe('방금 저장됨');
  });

  it('N분 전 (60초 ≤ x < 1시간)', () => {
    const now = new Date('2026-04-30T15:30:00Z');
    expect(formatSavedTime('2026-04-30T15:25:00Z', now)).toBe('5분 전 저장됨');
    expect(formatSavedTime('2026-04-30T14:31:00Z', now)).toBe('59분 전 저장됨');
  });

  it('같은 날 1시간 이상 → "HH:MM 자동 저장됨"', () => {
    const now = new Date('2026-04-30T20:00:00');
    const iso = new Date('2026-04-30T14:22:00').toISOString();
    expect(formatSavedTime(iso, now)).toBe('14:22 자동 저장됨');
  });

  it('다른 날 → "M월 D일 자동 저장됨"', () => {
    const now = new Date('2026-04-30T10:00:00');
    const iso = new Date('2026-04-21T15:00:00').toISOString();
    expect(formatSavedTime(iso, now)).toBe('4월 21일 자동 저장됨');
  });
});

describe('buildMockMeta — 단어수 + 자동저장 시각', () => {
  it('mocks 패턴 정합 — 단어 + sep + save span', () => {
    const now = new Date('2026-04-30T15:00:30Z');
    const row = { content: '한 둘 셋', updated_at: '2026-04-30T15:00:00Z' };
    const meta = buildMockMeta(row, now);
    expect(meta).toContain('3단어');
    expect(meta).toContain('<span class="sep">·</span>');
    expect(meta).toContain('<span class="save">방금 저장됨</span>');
  });

  it('content / updated_at 누락 → 0단어 / 저장 대기', () => {
    const meta = buildMockMeta({});
    expect(meta).toContain('0단어');
    expect(meta).toContain('저장 대기');
  });
});

describe('rowToMockDoc — Dexie row → mocks doc', () => {
  it('id / title / meta / updated_at', () => {
    const now = new Date('2026-04-30T15:00:30Z');
    const row = {
      id: 'uuid-1',
      title: '제목',
      content: '<p>본문</p>',
      updated_at: '2026-04-30T15:00:00Z',
    };
    const doc = rowToMockDoc(row, now);
    expect(doc.id).toBe('uuid-1');
    expect(doc.title).toBe('제목');
    expect(doc.updated_at).toBe('2026-04-30T15:00:00Z');
    expect(doc.meta).toContain('1단어');
  });

  it('title 누락 → "제목 없음"', () => {
    const doc = rowToMockDoc({ id: 'x', title: null });
    expect(doc.title).toBe('제목 없음');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Wave 11.5.2b — saveArticle (mock article + fake-indexeddb)
// ───────────────────────────────────────────────────────────────────────────

const OWNER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function makeMockArticle(initial = {}) {
  const dataset = { ...(initial.dataset || {}) };
  const titleEl = { textContent: initial.title || '' };
  const bodyEl = { innerHTML: initial.content || '' };
  const saveEl = { textContent: initial.save || '' };
  const article = {
    dataset,
    querySelector(sel) {
      if (sel === '.doc__h1') return titleEl;
      if (sel === '.doc__body') return bodyEl;
      if (sel === '.doc__meta .save') return saveEl;
      return null;
    },
    _saveEl: saveEl,
    _titleEl: titleEl,
    _bodyEl: bodyEl,
  };
  return article;
}

describe('isEditorDirty / markArticleDirty / clearArticleDirty — WeakSet 기반', () => {
  it('mark 후 isEditorDirty true / clear 후 false', () => {
    const article = {};
    expect(isEditorDirty(article)).toBe(false);
    markArticleDirty(article);
    expect(isEditorDirty(article)).toBe(true);
    clearArticleDirty(article);
    expect(isEditorDirty(article)).toBe(false);
  });

  it('article null/undefined → no-op + false', () => {
    expect(() => markArticleDirty(null)).not.toThrow();
    expect(() => clearArticleDirty(undefined)).not.toThrow();
    expect(isEditorDirty(null)).toBe(false);
    expect(isEditorDirty(undefined)).toBe(false);
  });
});

describe('handleRealtimeEntryChange — payload 분기 (mock document)', () => {
  function makeMockDoc(entryId) {
    const article = entryId
      ? {
          dataset: { entryId },
          remove: () => {},
          querySelector: (sel) => {
            if (sel === '.server-update-badge') return null;
            if (sel === '.doc__meta') return {
              appendChild: () => {},
            };
            return null;
          },
          // 별도 — 함수가 host doc 의 createElement 호출 가능하게
        }
      : null;
    return {
      querySelector: (sel) => (sel === '#mainView article.doc' ? article : null),
      createElement: () => ({
        className: '', textContent: '', hidden: false,
      }),
    };
  }

  it('table mismatch → applied=false', async () => {
    const r = await handleRealtimeEntryChange({ table: 'today_other' }, makeMockDoc(null));
    expect(r.applied).toBe(false);
    expect(r.reason).toBe('table_mismatch');
  });

  it('id 없음 → applied=false', async () => {
    const r = await handleRealtimeEntryChange({ table: 'today_entries', eventType: 'UPDATE' }, makeMockDoc(null));
    expect(r.applied).toBe(false);
    expect(r.reason).toBe('no_id');
  });

  it('article 없음 / 매치 X → applied=true reason=no_match', async () => {
    const r = await handleRealtimeEntryChange(
      { table: 'today_entries', eventType: 'UPDATE', new: { id: 'A' } },
      makeMockDoc(null),
    );
    expect(r.applied).toBe(true);
    expect(r.reason).toBe('no_match');
  });

  it('매치 + dirty → reason=dirty_badge (mainView reload skip)', async () => {
    const article = {
      dataset: { entryId: 'A' },
      remove: () => {},
      querySelector: () => null,
    };
    markArticleDirty(article);
    const doc = {
      querySelector: (sel) => (sel === '#mainView article.doc' ? article : null),
      createElement: () => ({ className: '', textContent: '', hidden: false }),
    };
    // doc__meta 가 없어서 showServerUpdateBadge 가 false 반환할 수도 — 단 reason=dirty_badge 자체는 매치됨
    const r = await handleRealtimeEntryChange(
      { table: 'today_entries', eventType: 'UPDATE', new: { id: 'A' } },
      doc,
    );
    expect(r.applied).toBe(true);
    expect(r.reason).toBe('dirty_badge');
    expect(r.matched).toBe(true);
    clearArticleDirty(article);
  });

  it('DELETE + 매치 → article.remove 호출', async () => {
    let removed = false;
    const article = {
      dataset: { entryId: 'A' },
      remove: () => { removed = true; },
      querySelector: () => null,
    };
    const doc = {
      querySelector: (sel) => (sel === '#mainView article.doc' ? article : null),
    };
    const r = await handleRealtimeEntryChange(
      { table: 'today_entries', eventType: 'DELETE', old: { id: 'A' } },
      doc,
    );
    expect(r.applied).toBe(true);
    expect(r.reason).toBe('delete');
    expect(r.matched).toBe(true);
    expect(removed).toBe(true);
  });
});

describe('syncShareToggleFromRow — .share 클래스 동기화 (mock element)', () => {
  it('row.is_shared truthy → .share--off 제거', () => {
    let classes = ['share', 'share--off'];
    const fakeShare = {
      classList: {
        toggle(name, force) {
          const has = classes.includes(name);
          if (force === true && !has) classes.push(name);
          else if (force === false && has) classes = classes.filter((c) => c !== name);
          else if (force === undefined) {
            if (has) classes = classes.filter((c) => c !== name);
            else classes.push(name);
          }
        },
      },
    };
    const fakeDoc = { querySelector: () => fakeShare };
    const ok = syncShareToggleFromRow({ is_shared: 1 }, fakeDoc);
    expect(ok).toBe(true);
    expect(classes).not.toContain('share--off');
  });

  it('row.is_shared falsy → .share--off 추가', () => {
    let classes = ['share'];
    const fakeShare = {
      classList: {
        toggle(name, force) {
          const has = classes.includes(name);
          if (force === true && !has) classes.push(name);
          else if (force === false && has) classes = classes.filter((c) => c !== name);
        },
      },
    };
    const fakeDoc = { querySelector: () => fakeShare };
    const ok = syncShareToggleFromRow({ is_shared: 0 }, fakeDoc);
    expect(ok).toBe(true);
    expect(classes).toContain('share--off');
  });

  it('.share element 없음 → false', () => {
    const fakeDoc = { querySelector: () => null };
    expect(syncShareToggleFromRow({ is_shared: 1 }, fakeDoc)).toBe(false);
  });
});

describe('saveArticle — Dexie create/update + .save 갱신', () => {
  beforeEach(async () => {
    const dbName = 'today_test_' + Math.random().toString(36).slice(2, 10);
    globalThis.todayDB = createTodayDB(dbName);
  });

  afterEach(async () => {
    if (globalThis.todayDB) {
      await globalThis.todayDB.delete();
      globalThis.todayDB = null;
    }
  });

  it('entryId 없음 → createEntry, dataset.entryId 갱신', async () => {
    const article = makeMockArticle({ title: '새 제목', content: '<p>새 본문</p>' });
    const user = { id: OWNER };
    const row = await saveArticle(article, user, 'navi');
    expect(row).toBeTruthy();
    expect(row.title).toBe('새 제목');
    expect(row.content).toBe('<p>새 본문</p>');
    expect(row.kind).toBe('navi');
    expect(row.owner_id).toBe(OWNER);
    expect(article.dataset.entryId).toBe(row.id);
    expect(article._saveEl.textContent).toMatch(/방금 저장됨|저장됨/);
  });

  it('entryId "new-..." → createEntry (placeholder ID 우회)', async () => {
    const article = makeMockArticle({
      title: '제목',
      content: '<p>본문</p>',
      dataset: { entryId: 'new-12345' },
    });
    const row = await saveArticle(article, { id: OWNER }, 'fiction');
    expect(row).toBeTruthy();
    expect(row.id).not.toBe('new-12345');
    expect(article.dataset.entryId).toBe(row.id);
  });

  it('실 entryId → updateEntry (id 보존, content 갱신)', async () => {
    const article = makeMockArticle({ title: '원제', content: '<p>원본</p>' });
    const user = { id: OWNER };
    const first = await saveArticle(article, user, 'navi');
    const firstId = first.id;
    expect(article.dataset.entryId).toBe(firstId);

    article._titleEl.textContent = '바뀐 제목';
    article._bodyEl.innerHTML = '<p>바뀐 본문</p>';
    const second = await saveArticle(article, user, 'navi');
    expect(second.id).toBe(firstId);
    expect(second.title).toBe('바뀐 제목');
    expect(second.content).toBe('<p>바뀐 본문</p>');
    expect(second.created_at).toBe(first.created_at);
    expect(second.updated_at >= first.updated_at).toBe(true);
  });

  it('user 없음 → null + .save 갱신 안 함', async () => {
    const article = makeMockArticle({ title: 'x', save: '저장됨' });
    const row = await saveArticle(article, null, 'navi');
    expect(row).toBeNull();
    expect(article._saveEl.textContent).toBe('저장됨');
  });

  it('알 수 없는 kind → null', async () => {
    const article = makeMockArticle({ title: 'x' });
    const row = await saveArticle(article, { id: OWNER }, 'unknown_kind');
    expect(row).toBeNull();
  });

  it('빈 title → null 저장', async () => {
    const article = makeMockArticle({ title: '   ', content: '<p>본문</p>' });
    const row = await saveArticle(article, { id: OWNER }, 'navi');
    expect(row).toBeTruthy();
    expect(row.title).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Wave 11.7.3 — navi 합집합 fetch (spec §4 L131 변경, 사용자 결정 2026-04-30)
// ───────────────────────────────────────────────────────────────────────────

describe('fetchEntriesForCategory — owner-기반 합집합 (본인 + partner.is_shared, 정렬 created_at desc)', () => {
  const OWNER = '11111111-2222-3333-4444-555555555555';
  const PARTNER = '22222222-3333-4444-5555-666666666666';

  beforeEach(async () => {
    const dbName = 'today_test_' + Math.random().toString(36).slice(2, 10);
    globalThis.todayDB = createTodayDB(dbName);
  });

  afterEach(async () => {
    if (globalThis.todayDB) {
      await globalThis.todayDB.delete();
      globalThis.todayDB = null;
    }
    __setCurrentUserForTest(null);
  });

  async function seed(entries) {
    const { Queries } = await import('../db/queries.js');
    for (const e of entries) {
      // e.owner_id 명시 시 partner / 미명시 시 OWNER (본인)
      const owner_id = e.owner_id || OWNER;
      await Queries.createEntry({ ...e, owner_id });
    }
  }

  it('본인 (개인+공유) + partner.is_shared 합집합 (created_at desc)', async () => {
    __setCurrentUserForTest({ id: OWNER, email: 'leftjap@gmail.com' });
    await seed([
      { kind: 'navi', title: '내 글 1 (개인)', is_shared: false, created_at: '2026-04-15T10:00:00Z' },
      { kind: 'navi', title: '내 글 2 (공유)', is_shared: true, created_at: '2026-04-20T10:00:00Z' },
      { kind: 'soyoun_navi', title: 'partner (공유)', is_shared: true, created_at: '2026-04-25T10:00:00Z', owner_id: PARTNER },
      { kind: 'soyoun_navi', title: 'partner (개인) — 보이지 말아야', is_shared: false, created_at: '2026-04-28T10:00:00Z', owner_id: PARTNER },
    ]);
    const list = await Entries.fetchEntriesForCategory('navi');
    expect(list.length).toBe(3);
    // created_at desc
    expect(list.map((r) => r.title)).toEqual([
      'partner (공유)',
      '내 글 2 (공유)',
      '내 글 1 (개인)',
    ]);
    expect(list.find((r) => r.title.includes('보이지 말아야'))).toBeUndefined();
  });

  it('소연 컨텍스트 — 본인 soyoun_navi + partner navi.is_shared 합집합', async () => {
    __setCurrentUserForTest({ id: OWNER, email: 'soyoun312@gmail.com' });
    await seed([
      { kind: 'soyoun_navi', title: '소연 (개인)', is_shared: false, created_at: '2026-04-15T10:00:00Z' },
      { kind: 'soyoun_navi', title: '소연 (공유)', is_shared: true, created_at: '2026-04-20T10:00:00Z' },
      { kind: 'navi', title: 'partner (공유)', is_shared: true, created_at: '2026-04-25T10:00:00Z', owner_id: PARTNER },
      { kind: 'navi', title: 'partner (개인) — 보이지 말아야', is_shared: false, created_at: '2026-04-10T10:00:00Z', owner_id: PARTNER },
    ]);
    const list = await Entries.fetchEntriesForCategory('navi');
    expect(list.length).toBe(3);
    expect(list.find((r) => r.title.includes('보이지 말아야'))).toBeUndefined();
  });

  it('navi/soyoun_navi 외 kind — listEntries 그대로', async () => {
    __setCurrentUserForTest({ id: OWNER, email: 'leftjap@gmail.com' });
    await seed([
      { kind: 'fiction', title: '단편 1', is_shared: false, created_at: '2026-04-15T10:00:00Z' },
      { kind: 'fiction', title: '단편 2', is_shared: true, created_at: '2026-04-20T10:00:00Z' },
      { kind: 'navi', title: '내 navi (포함되면 안 됨)', is_shared: true, created_at: '2026-04-25T10:00:00Z' },
    ]);
    const list = await Entries.fetchEntriesForCategory('fiction');
    expect(list.length).toBe(2);
    expect(list.every((r) => r.kind === 'fiction')).toBe(true);
  });

  it('빈 DB → []', async () => {
    expect(await Entries.fetchEntriesForCategory('navi')).toEqual([]);
    expect(await Entries.fetchEntriesForCategory('soyoun_navi')).toEqual([]);
    expect(await Entries.fetchEntriesForCategory('memo')).toEqual([]);
  });

  it('소연 owner 잔흔 (kind=navi, is_shared=false) — partner 면 제외, 본인이면 mine 으로 포함', async () => {
    __setCurrentUserForTest({ id: OWNER, email: 'soyoun312@gmail.com' });
    await seed([
      { kind: 'soyoun_navi', title: '05.01. 나성', is_shared: false, created_at: '2026-05-01T10:00:00Z' },
      { kind: 'soyoun_navi', title: '04.29.la', is_shared: false, created_at: '2026-04-29T10:00:00Z' },
      // partner owner 의 navi (is_shared=false) — 제외되어야
      { kind: 'navi', title: 'partner 잔흔 (개인) — 보이지 말아야', is_shared: false, created_at: '2026-04-15T10:00:00Z', owner_id: PARTNER },
      // 본인 owner 의 navi 잔흔 — owner=user 라 mine 으로 포함됨 (실 production 의 owner=소연 + kind=navi 케이스)
      { kind: 'navi', title: '본인 owner 잔흔 (개인)', is_shared: false, created_at: '2026-04-10T10:00:00Z' },
    ]);
    const list = await Entries.fetchEntriesForCategory('navi');
    expect(list.length).toBe(3);
    expect(list.find((r) => r.title.includes('보이지 말아야'))).toBeUndefined();
    expect(list.map((r) => r.title)).toContain('본인 owner 잔흔 (개인)');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Wave 11.5.8 — 에디터 ⋯ 메뉴 (사본 / 내보내기 / 글 삭제) Dexie wiring
// ───────────────────────────────────────────────────────────────────────────

describe('entryToExportJson — pure 직렬화', () => {
  it('필수 필드 직렬화', () => {
    const json = entryToExportJson({
      id: 'abc',
      kind: 'navi',
      title: '제목',
      content: '<p>본문</p>',
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-30T12:00:00Z',
    });
    const obj = JSON.parse(json);
    expect(obj).toEqual({
      id: 'abc',
      kind: 'navi',
      title: '제목',
      content: '<p>본문</p>',
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-30T12:00:00Z',
    });
  });

  it('null/undefined 입력 → 안전한 기본값', () => {
    const obj = JSON.parse(entryToExportJson(null));
    expect(obj).toEqual({
      id: '',
      kind: '',
      title: '',
      content: '',
      created_at: null,
      updated_at: null,
    });
  });
});

describe('handleDeleteAction — softDeleteEntry + DOM 정리', () => {
  const OWNER = '11111111-2222-3333-4444-555555555555';
  let createdId;

  beforeEach(async () => {
    const dbName = 'today_test_' + Math.random().toString(36).slice(2, 10);
    globalThis.todayDB = createTodayDB(dbName);
    const { Queries } = await import('../db/queries.js');
    const row = await Queries.createEntry({
      owner_id: OWNER,
      kind: 'navi',
      title: '삭제 대상',
      content: '<p>본문</p>',
    });
    createdId = row.id;
  });

  afterEach(async () => {
    if (globalThis.todayDB) {
      await globalThis.todayDB.delete();
      globalThis.todayDB = null;
    }
  });

  it('article 의 entryId 로 softDeleteEntry 호출 + deleted_at 마킹', async () => {
    const article = {
      dataset: { entryId: createdId },
      remove: vi.fn(),
    };
    const mockDoc = {
      querySelector: () => null,
      getElementById: () => null,
    };
    const r = await handleDeleteAction(article, mockDoc);
    expect(r.ok).toBe(true);
    expect(r.id).toBe(createdId);
    expect(article.remove).toHaveBeenCalledTimes(1);
    const { Queries } = await import('../db/queries.js');
    const row = await Queries.getEntry(createdId);
    expect(row.deleted_at).toBeTruthy();
  });

  it('미저장 글 (entryId.startsWith new-) → reason=unsaved + remove 호출 안 함', async () => {
    const article = {
      dataset: { entryId: 'new-1234567890' },
      remove: vi.fn(),
    };
    const mockDoc = { querySelector: () => null, getElementById: () => null };
    const r = await handleDeleteAction(article, mockDoc);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('unsaved');
    expect(article.remove).not.toHaveBeenCalled();
  });

  it('파트너 공유 글 (data-read-only=1) → reason=read_only + softDeleteEntry 호출 0회', async () => {
    const article = {
      dataset: { readOnly: '1', entryId: createdId },
      remove: vi.fn(),
    };
    const mockDoc = { querySelector: () => null, getElementById: () => null };
    const r = await handleDeleteAction(article, mockDoc);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('read_only');
    expect(article.remove).not.toHaveBeenCalled();
    // Dexie 변경 없음 — 원본 row 의 deleted_at 가 그대로 null
    const { Queries } = await import('../db/queries.js');
    const row = await Queries.getEntry(createdId);
    expect(row.deleted_at).toBeFalsy();
  });
});

describe('handleDuplicateAction — getEntry → createEntry 복제', () => {
  const OWNER = '11111111-2222-3333-4444-555555555555';
  let createdId;

  beforeEach(async () => {
    const dbName = 'today_test_' + Math.random().toString(36).slice(2, 10);
    globalThis.todayDB = createTodayDB(dbName);
    const { Queries } = await import('../db/queries.js');
    const row = await Queries.createEntry({
      owner_id: OWNER,
      kind: 'navi',
      title: '원본 글',
      content: '<p>원본 본문</p>',
      is_shared: true,
    });
    createdId = row.id;
  });

  afterEach(async () => {
    if (globalThis.todayDB) {
      await globalThis.todayDB.delete();
      globalThis.todayDB = null;
    }
  });

  it('원본 → 사본 생성 (제목 끝 "(사본)" + kind 유지 + content 동일)', async () => {
    // node 환경 — mock doc 전달 (renderDocFromRow + getCurrentKind 가 doc.querySelector 만 사용)
    const mockView = { innerHTML: '' };
    const mockDoc = {
      getElementById: (id) => (id === 'mainView' ? mockView : null),
      querySelector: () => null,
    };
    const article = { dataset: { entryId: createdId } };
    const r = await handleDuplicateAction(article, { id: OWNER }, mockDoc);
    expect(r.ok).toBe(true);
    expect(r.copy.title).toBe('원본 글 (사본)');
    expect(r.copy.kind).toBe('navi');
    expect(r.copy.content).toBe('<p>원본 본문</p>');
    expect(r.copy.id).not.toBe(createdId);
    const { Queries } = await import('../db/queries.js');
    const all = await Queries.listEntries('navi');
    expect(all.length).toBe(2);
  });

  it('user 없음 → reason=no_user', async () => {
    const mockDoc = { getElementById: () => null, querySelector: () => null };
    const article = { dataset: { entryId: createdId } };
    const r = await handleDuplicateAction(article, null, mockDoc);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_user');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 별 wave A — edit-toolbar B/I/U/S annotate
// ───────────────────────────────────────────────────────────────────────────

describe('annotateEditToolbar — 별 wave A', () => {
  it('4 button 에 data-format 부여 + idempotent', () => {
    const buttons = {
      '.et-btn--bold': { dataset: {} },
      '.et-btn--italic': { dataset: {} },
      '.et-btn--underline': { dataset: {} },
      '[title="취소선"]': { dataset: {} },
    };
    const fakeToolbar = {
      querySelector: (sel) => buttons[sel] || null,
    };
    const fakeDoc = {
      getElementById: (id) => (id === 'editToolbar' ? fakeToolbar : null),
    };
    const c1 = annotateEditToolbar(fakeDoc);
    expect(c1).toBe(4);
    expect(buttons['.et-btn--bold'].dataset.format).toBe('bold');
    expect(buttons['.et-btn--italic'].dataset.format).toBe('italic');
    expect(buttons['.et-btn--underline'].dataset.format).toBe('underline');
    expect(buttons['[title="취소선"]'].dataset.format).toBe('strikeThrough');
    // 두 번째 호출 → 모두 이미 부여됐으므로 0
    const c2 = annotateEditToolbar(fakeDoc);
    expect(c2).toBe(0);
  });

  it('editToolbar 미존재 → 0', () => {
    const fakeDoc = { getElementById: () => null };
    expect(annotateEditToolbar(fakeDoc)).toBe(0);
  });

  it('일부 button 만 매치 → count = 매치된 만큼', () => {
    const bold = { dataset: {} };
    const italic = { dataset: {} };
    const fakeToolbar = {
      querySelector: (sel) => {
        if (sel === '.et-btn--bold') return bold;
        if (sel === '.et-btn--italic') return italic;
        return null; // underline / strikethrough 미존재
      },
    };
    const fakeDoc = { getElementById: () => fakeToolbar };
    const c = annotateEditToolbar(fakeDoc);
    expect(c).toBe(2);
    expect(bold.dataset.format).toBe('bold');
    expect(italic.dataset.format).toBe('italic');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Wave 11.5.11 — fixture clear (recents + mainView empty state)
// ───────────────────────────────────────────────────────────────────────────

describe('clearRecentsList / clearMainViewEmpty — Wave 11.5.11', () => {
  it('clearRecentsList — recentsList.innerHTML 비움', () => {
    const list = { innerHTML: '<div>fixture</div>' };
    const fakeDoc = { getElementById: (id) => (id === 'recentsList' ? list : null) };
    const ok = clearRecentsList(fakeDoc);
    expect(ok).toBe(true);
    expect(list.innerHTML).toBe('');
  });

  it('clearRecentsList — recentsList 미존재 → false', () => {
    const fakeDoc = { getElementById: () => null };
    expect(clearRecentsList(fakeDoc)).toBe(false);
  });

  it('clearRecentsList — doc=null → false', () => {
    expect(clearRecentsList(null)).toBe(false);
  });

  it('clearMainViewEmpty — empty-state HTML 주입 + label escape', () => {
    const view = { innerHTML: '' };
    const fakeDoc = { getElementById: (id) => (id === 'mainView' ? view : null) };
    const ok = clearMainViewEmpty('단편', fakeDoc);
    expect(ok).toBe(true);
    expect(view.innerHTML).toContain('class="empty-state"');
    expect(view.innerHTML).toContain('단편');
    expect(view.innerHTML).toContain('을(를) 시작하세요');
  });

  it('clearMainViewEmpty — XSS escape', () => {
    const view = { innerHTML: '' };
    const fakeDoc = { getElementById: () => view };
    clearMainViewEmpty('<script>x</script>', fakeDoc);
    expect(view.innerHTML).not.toContain('<script>');
    expect(view.innerHTML).toContain('&lt;script&gt;');
  });

  it('clearMainViewEmpty — label 없음 → 기본 "글쓰기"', () => {
    const view = { innerHTML: '' };
    const fakeDoc = { getElementById: () => view };
    clearMainViewEmpty('', fakeDoc);
    expect(view.innerHTML).toContain('글쓰기');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// spec §5.0 — 전체 목록 뷰 (computeListStats / filterListRows / renderListView)
// ───────────────────────────────────────────────────────────────────────────

describe('computeListStats — 합계/연/월/단어/원고지/공유', () => {
  const NOW = new Date('2026-04-15T12:00:00Z');
  const userId = 'u-self';
  const partnerId = 'u-partner';

  it('빈 배열 → 0 처리', () => {
    expect(computeListStats([], userId, NOW)).toEqual({
      total: 0, thisYear: 0, thisMonth: 0, words: 0, sheets: 0, shared: 0, sharedSoyeon: 0,
    });
  });

  it('연/월 카운트 + 단어/원고지 합산', () => {
    const rows = [
      { id: 'a', owner_id: userId, content: '<p>한국어 단어 두개입니다 추가</p>', created_at: '2026-04-10T01:00:00Z', is_shared: 1 },
      { id: 'b', owner_id: userId, content: '<p>여섯 개의 단어 가 들어 있다</p>', created_at: '2026-02-01T01:00:00Z', is_shared: 0 },
      { id: 'c', owner_id: userId, content: '<p>지난해 작성된 글입니다</p>', created_at: '2025-12-01T01:00:00Z', is_shared: 0 },
      { id: 'd', owner_id: partnerId, content: '<p>파트너 공유</p>', created_at: '2026-04-12T01:00:00Z', is_shared: 1 },
    ];
    const s = computeListStats(rows, userId, NOW);
    expect(s.total).toBe(4);
    expect(s.thisYear).toBe(3);
    expect(s.thisMonth).toBe(2);
    expect(s.shared).toBe(2);
    expect(s.sharedSoyeon).toBe(1);
    expect(s.words).toBeGreaterThan(0);
    expect(s.sheets).toBeGreaterThanOrEqual(0);
  });

  it('created_at 잘못된 값 → year/month 카운트 skip, total 만 증가', () => {
    const rows = [{ id: 'x', owner_id: userId, content: '', created_at: 'not-a-date', is_shared: 0 }];
    const s = computeListStats(rows, userId, NOW);
    expect(s.total).toBe(1);
    expect(s.thisYear).toBe(0);
    expect(s.thisMonth).toBe(0);
  });

  it('파트너 글이지만 is_shared=0 → sharedSoyeon 미카운트', () => {
    const rows = [{ id: 'p', owner_id: partnerId, content: '', created_at: '2026-04-01T00:00:00Z', is_shared: 0 }];
    expect(computeListStats(rows, userId, NOW).sharedSoyeon).toBe(0);
  });
});

describe('filterListRows — all/shared/soyeon 분기', () => {
  const userId = 'u-self';
  const partnerId = 'u-partner';
  const rows = [
    { id: 'a', owner_id: userId, is_shared: 1 },
    { id: 'b', owner_id: userId, is_shared: 0 },
    { id: 'c', owner_id: partnerId, is_shared: 1 },
    { id: 'd', owner_id: partnerId, is_shared: 0 },
  ];

  it('all → 전체 반환', () => {
    expect(filterListRows(rows, 'all', userId).map((r) => r.id)).toEqual(['a','b','c','d']);
  });
  it('shared → is_shared truthy 만', () => {
    expect(filterListRows(rows, 'shared', userId).map((r) => r.id)).toEqual(['a','c']);
  });
  it('soyeon → 파트너 owner + is_shared', () => {
    expect(filterListRows(rows, 'soyeon', userId).map((r) => r.id)).toEqual(['c']);
  });
  it('null/undefined rows → 빈 배열', () => {
    expect(filterListRows(null, 'all', userId)).toEqual([]);
    expect(filterListRows(undefined, 'shared', userId)).toEqual([]);
  });
});

describe('renderListView — #mainView .doc-list 마크업 + 통계/필터/행', () => {
  it('#mainView 부재 → false', () => {
    const fakeDoc = { getElementById: () => null };
    expect(renderListView('navi', [], fakeDoc)).toBe(false);
  });

  it('navi + 행 1건 → .doc-list 마크업 + 제목/단어/원고지 노출 + 소연 라벨', () => {
    __setCurrentUserForTest({ id: '7bae5645-61c6-4476-9ff2-4c30a72812ff' }); // 지오
    const view = { innerHTML: '' };
    const fakeDoc = { getElementById: (id) => (id === 'mainView' ? view : null) };
    const rows = [
      {
        id: 'aaaaaaaa-1111-2222-3333-444444444444',
        owner_id: 'aeafd9a7-4094-4e7c-a621-188d6b2e336d', // 소연 (partner)
        title: '소연이 쓴 글',
        content: '<p>본문 일부 텍스트 입니다 한참을 미뤄둔 글</p>',
        created_at: '2026-04-10T00:00:00Z',
        is_shared: 1,
      },
    ];
    renderListView('navi', rows, fakeDoc);
    expect(view.innerHTML).toContain('class="doc-list"');
    expect(view.innerHTML).toContain('data-list-kind="navi"');
    expect(view.innerHTML).toContain('소연이 쓴 글');
    expect(view.innerHTML).toContain('doc-list__share');
    expect(view.innerHTML).toContain('소연');
    expect(view.innerHTML).toContain('단어');
    expect(view.innerHTML).toContain('매');
    expect(view.innerHTML).toContain('전체');
    expect(view.innerHTML).toContain('공유된 글');
    expect(view.innerHTML).toContain('소연이 공유한 글');
    __setCurrentUserForTest(null);
  });

  it('opts.filter="shared" → is_shared=0 행은 본문에서 빠짐', () => {
    __setCurrentUserForTest({ id: 'u-self' });
    const view = { innerHTML: '' };
    const fakeDoc = { getElementById: () => view };
    const rows = [
      { id: 'r1', owner_id: 'u-self', title: '공유함', content: '', created_at: '2026-04-01T00:00:00Z', is_shared: 1 },
      { id: 'r2', owner_id: 'u-self', title: '비공개야', content: '', created_at: '2026-04-02T00:00:00Z', is_shared: 0 },
    ];
    renderListView('memo', rows, fakeDoc, { filter: 'shared' });
    expect(view.innerHTML).toContain('공유함');
    expect(view.innerHTML).not.toContain('비공개야');
    __setCurrentUserForTest(null);
  });

  it('XSS — title/excerpt escape 처리', () => {
    __setCurrentUserForTest({ id: 'u-self' });
    const view = { innerHTML: '' };
    const fakeDoc = { getElementById: () => view };
    renderListView('memo', [
      { id: 'x', owner_id: 'u-self', title: '<script>x</script>', content: '<p><script>y</script></p>', created_at: '2026-04-01T00:00:00Z', is_shared: 0 },
    ], fakeDoc);
    expect(view.innerHTML).not.toContain('<script>x</script>');
    expect(view.innerHTML).toContain('&lt;script&gt;x&lt;/script&gt;');
    __setCurrentUserForTest(null);
  });
});

describe('Entries.getActiveMainView / exitListView — public API 노출', () => {
  it('Entries 객체에 신규 함수 노출 확인', () => {
    expect(typeof Entries.computeListStats).toBe('function');
    expect(typeof Entries.filterListRows).toBe('function');
    expect(typeof Entries.renderListView).toBe('function');
    expect(typeof Entries.enterListView).toBe('function');
    expect(typeof Entries.exitListView).toBe('function');
    expect(typeof Entries.getActiveMainView).toBe('function');
    expect(typeof Entries.isReadOnlyRow).toBe('function');
  });
});

describe('renderListView — kind 별 chip 표시 분기', () => {
  beforeEach(() => __setCurrentUserForTest({ id: 'u-self' }));
  afterEach(() => __setCurrentUserForTest(null));

  it('navi → chips 영역 노출', () => {
    const view = { innerHTML: '' };
    renderListView('navi', [], { getElementById: () => view });
    expect(view.innerHTML).toContain('doc-list__chips');
    expect(view.innerHTML).toContain('소연이 공유한 글');
  });

  it('soyoun_navi → chips 영역 노출', () => {
    const view = { innerHTML: '' };
    renderListView('soyoun_navi', [], { getElementById: () => view });
    expect(view.innerHTML).toContain('doc-list__chips');
  });

  it('fiction → chips 영역 미노출', () => {
    const view = { innerHTML: '' };
    renderListView('fiction', [], { getElementById: () => view });
    expect(view.innerHTML).not.toContain('doc-list__chips');
    expect(view.innerHTML).not.toContain('공유된 글');
  });

  it('blog / memo → chips 영역 미노출', () => {
    for (const k of ['blog', 'memo']) {
      const view = { innerHTML: '' };
      renderListView(k, [], { getElementById: () => view });
      expect(view.innerHTML).not.toContain('doc-list__chips');
    }
  });
});

describe('isReadOnlyRow — 파트너 글 분기', () => {
  it('owner_id 본인 → false', () => {
    expect(isReadOnlyRow({ owner_id: 'me' }, 'me')).toBe(false);
  });
  it('owner_id 파트너 → true', () => {
    expect(isReadOnlyRow({ owner_id: 'other' }, 'me')).toBe(true);
  });
  it('owner_id 누락 → false', () => {
    expect(isReadOnlyRow({}, 'me')).toBe(false);
  });
  it('userId 없음 → false', () => {
    expect(isReadOnlyRow({ owner_id: 'other' }, null)).toBe(false);
  });
});

describe('renderDocFromRow — 파트너 글 read-only 마크업', () => {
  beforeEach(() => __setCurrentUserForTest({ id: '7bae5645-61c6-4476-9ff2-4c30a72812ff' }));
  afterEach(() => __setCurrentUserForTest(null));

  it('본인 글 → contenteditable 살아있음 + read-only 라벨 미노출', () => {
    const view = { innerHTML: '' };
    const fakeDoc = { getElementById: () => view, querySelector: () => null };
    renderDocFromRow(
      { id: 'r1', owner_id: '7bae5645-61c6-4476-9ff2-4c30a72812ff', title: '내 글', content: '<p>본문</p>' },
      fakeDoc,
    );
    expect(view.innerHTML).toContain('contenteditable');
    expect(view.innerHTML).toContain('data-read-only=""');
    expect(view.innerHTML).not.toContain('읽기 전용');
  });

  it('파트너 글 → contenteditable 제거 + 메타 "{이름} 작성 · 읽기 전용"', () => {
    const view = { innerHTML: '' };
    const fakeDoc = { getElementById: () => view, querySelector: () => null };
    renderDocFromRow(
      { id: 'r2', owner_id: 'aeafd9a7-4094-4e7c-a621-188d6b2e336d', title: '소연 글', content: '<p>본문</p>' },
      fakeDoc,
    );
    expect(view.innerHTML).toContain('data-read-only="1"');
    expect(view.innerHTML).toContain('읽기 전용');
    expect(view.innerHTML).toContain('소연');
    const h1Tag = view.innerHTML.match(/<h1[^>]*>/)?.[0] || '';
    const bodyTag = view.innerHTML.match(/<div class="doc__body"[^>]*>/)?.[0] || '';
    expect(h1Tag).not.toContain('contenteditable');
    expect(bodyTag).not.toContain('contenteditable');
  });
});

describe('saveArticle — read-only 보호', () => {
  it('article.dataset.readOnly === "1" → null (저장 skip)', async () => {
    const article = {
      dataset: { readOnly: '1', entryId: 'r-readonly' },
      querySelector: () => ({ textContent: '', innerHTML: '' }),
    };
    const r = await saveArticle(article, { id: 'me' }, 'navi');
    expect(r).toBe(null);
  });
});

describe('syncShareToggleFromRow — 파트너 글 share 토글 숨김 클래스', () => {
  beforeEach(() => __setCurrentUserForTest({ id: 'me' }));
  afterEach(() => __setCurrentUserForTest(null));

  it('본인 글 → share--readonly 미부여', () => {
    const cls = new Set();
    const el = { classList: { toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); } } };
    syncShareToggleFromRow({ owner_id: 'me', is_shared: 1 }, { querySelector: () => el });
    expect(cls.has('share--readonly')).toBe(false);
  });

  it('파트너 글 → share--readonly 부여', () => {
    const cls = new Set();
    const el = { classList: { toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); } } };
    syncShareToggleFromRow({ owner_id: 'partner', is_shared: 1 }, { querySelector: () => el });
    expect(cls.has('share--readonly')).toBe(true);
  });
});

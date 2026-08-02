#!/usr/bin/env python3
"""원본 md → 어구록 결정적 생성기.
규칙(확정):
- 책 경계 = bounds_final.json (검증 완료 111개) + 파일머리 3개
- 버리는 줄: 책 제목 줄·쪽번호 줄(^[\d\s.,]+$)·aside 태그·<br>·<!-- -->·수평선·탭 라벨·이미지 전용 줄
- 새 어구록 시작(텍스트는 유지): #헤딩, 볼드 단독 줄, 짧은(정규화 40자 이하) 평문 고아줄 중 문장꼴로 안 끝나는 것
- 그 외 줄은 현재 어구록에 이어붙임(\n\n)
- 줄 변환: escape 해제, {.attr} 제거, 링크→텍스트, 이미지 제거, '> ' 마커 제거, ** 강조 제거
"""
import json,re,sys,os
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from norm import norm

BASE='/Users/gio_c/cowork/docs/서재/archive/'
FILES=['서재_어구록_100권.md','서재_어구록_15권.md','서재_어구록_2026년.md']
HEAD_REF={'서재_어구록_100권.md':'book_003','서재_어구록_15권.md':'book_090','서재_어구록_2026년.md':'book_099'}
T2R={'신경 끄기의 기술':'book_001','일류의 조건':'book_004','제3의 부의 원칙':'book_005','나태한 완벽주의자':'book_006',
'몰입 (확장판)':'book_007','부자들의 개인 도서관':'book_008','돈은 사람의 마음을 어떻게 움직이는가':'book_009',
'부를 부르는 50억 독서법':'book_010','나는 카지노에서 투자를 배웠다':'book_011','돈의 본능':'book_012','돈의 심리학':'book_013',
'부의 골든타임':'book_014','랜덤워크 투자수업':'book_015','회복탄력성':'book_016','취향은 어떻게 계급이 되는가':'book_017',
'이야기의 탄생':'book_018','우리는 글쓰기를 너무 심각하게 생각하지':'book_019','1년 안에 부자 되는 법':'book_020',
'아주 보통의 행복':'book_022','비참할 땐 스피노자':'book_023','인간 본성의 법칙':'book_024','분노사회':'book_025',
'미루기의 천재들':'book_026','자제력 수업':'book_027','생각 실험':'book_028','결단':'book_029','FBI 관찰의 기술':'book_030',
'선량한 차별주의자':'book_031','다크호스':'book_032','희망 버리기의 기술':'book_033','모던 로맨스':'book_034',
'나는 미디어 조작자다':'book_035','당신이 옳다':'book_036','조이 오브 워크':'book_037','내 주위에는 왜 멍청이가 많을까':'book_038',
'행복의 기원':'book_039','각자도생':'book_040','내 인생 구하기':'book_041','우리는 달에 가기로 했다':'book_042',
'5가지 절대 법칙':'book_043','삶의 끝에서 비로소 깨닫게 되는 것들':'book_044','공부하는 뇌':'book_045','티핑 포인트':'book_046',
'미안함에 대하여_홍세화':'book_047','성취하는 뇌':'book_048','스토리: 흥행하는 글쓰기':'book_049','진실의 흑역사':'book_050',
'린치핀':'book_051','관종의 조건':'book_052','한번이라도 모든 걸 걸어본 적 있나?':'book_053',
'이런 세상에서 지혜롭게 산다는 것':'book_054','타인을 읽는 말':'book_055','건강하게 나이 든다는 것':'book_056',
'위대한 시크릿':'book_057','슈퍼팬':'book_058','질서 너머':'book_059','투자 시프트':'book_060','에이펙스 스피릿':'book_061',
'인간 욕망의 법칙':'book_062','마음챙김이 일상이 되면 달라지는 것들':'book_063','평생 걱정없이 사는 법':'book_064',
'생각이 너무 많은 서른 살에게':'book_065','가진 돈을 몽땅 써라':'book_066','부자의 사고법':'book_067','부를 설계하다':'book_068',
'사장으로 견딘다는 것':'book_069','나는내가좋은엄마인줄알았습니다':'book_070','회복력 수업':'book_071','페어플레이어':'book_072',
'바른 마음':'book_073','어른의 문답법':'book_074','사랑하지 않으면 아프다':'book_075','뉴 컨피던스':'book_076',
'도파민네이션':'book_077','최선의 고통':'book_078','컬러의 방':'book_079','스틱':'book_080','성장할 수 있는 용기':'book_081',
'12가지 인생의 법칙':'book_082','세이노의 가르침':'book_083','클루지':'book_084','빠르게 실패하기':'book_085',
'생각이 너무 많은 어른들을 위한 심리학':'book_086','거인의 노트':'book_087','에디톨로지':'book_088','더 마인드':'book_089',
'당신이 이제껏 참아온 그것, 알레르기입니다':'book_092','루틴의 힘':'book_093','아주 작은 반복의 힘':'book_094',
'열두 발자국':'book_095','마인드 박스':'book_096','마인드셋':'book_097','사냥하는 남자 채집하는 여자':'book_098',
'나는 왜 꾸물거릴까?':'book_100','어떻게 살 것인가':'book_101','당신은 설명서도 읽지 않고 인생을 살고 있다':'book_102',
'빨모쌤의 라이브 영어회화':'book_103','홍세화 - 결':'book_104','돈 말고 무엇을 갖고 있는가':'book_105',
'밀가루만 끊어도 100가지 병을 막을 수 있다':'book_106','부자들의 지식창고에는 뭔가 특별한 것이 있다':'book_107',
'왜 그들만 부자가 되는가':'book_108','굿 라이프':'book_109','아주 작은 습관의 힘':'book_110',
'생각하라 그리고 부자가 되어라':'book_111','예술가는 절대로 굶어죽지 않는다':'book_112','이기는 창업':'book_113',
'피로 세포':'book_114','우리의 몸이 말을 할 수 있다면':'book_115','과식의 심리학':'book_116'}

HARD_DROP=[re.compile(p) for p in [
    r'^[\d\s,]+$',                       # 쪽번호 (점 없는 숫자만 — '5.' 같은 목록 카운터 잔재와 구분)
    r'aside\\?>',                        # \<aside\> 태그 (블록 경계)
    r'^_{3,}$', r'^-{3,}$',               # 수평선
    r'^탭\s*\d+$',
]]
SOFT_DROP=[re.compile(p) for p in [
    r'^\\?<br\\?>$', r'^<!--\s*-->$',   # 인라인 잔재 — 경계 아님
    r'^\d+\.\s*$',                       # 노션 목록 카운터 잔재 '5.  '
    r'^-?\s*•?\s*\\+$',                  # '- •\' / '\'
    r'^\\?\*+$',                          # '\**'
    r'^!\\?\[',                           # 이미지 전용
]]
HEAD1=re.compile(r'^\s*#{1,6}\s*(.*)$')
BOLDONLY=re.compile(r'^\s*\\?\*\\?\*(.+?)\\?\*\\?\*\s*$')
FINAL=re.compile(r'[.!?…다요"\'”’)»%]\s*$')

def clean(line):
    s=line.strip()
    s=re.sub(r'\{\.[a-zA-Z-]+\}','',s)
    s=re.sub(r'!\\?\[[^\]]*\\?\]\([^)]*\)','',s)          # 이미지
    for _ in range(3):
        s=re.sub(r'\[([^\[\]]*)\]\(([^)]*)\)',r'\1',s)     # 링크
        s=re.sub(r'\[([^\[\]]*)\]\[[^\]]*\]',r'\1',s)
    s=re.sub(r'\\(.)',r'\1',s)                             # escape 해제
    s=re.sub(r'^\s*>\s?','',s)                             # blockquote 마커
    s=s.replace('**','')
    s=re.sub(r'\[|\]','',s)
    return s.strip()

def hard_drop(s): return any(p.search(s) for p in HARD_DROP)
def soft_drop(s): return any(p.search(s) for p in SOFT_DROP)
def is_drop(s): return hard_drop(s) or soft_drop(s)

def generate():
    B=json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'bounds.json'),encoding='utf-8'))
    out=[]   # [(ref, file, start_line, text)]
    for f in FILES:
        lines=open(BASE+f,encoding='utf-8').read().split('\n')
        bounds={ln-1:t for ln,t in B[f]}
        ref=HEAD_REF[f]
        cur=[]; cur_start=None
        def flush():
            nonlocal cur,cur_start
            if cur:
                text='\n\n'.join(cur)
                if len(norm(text))>0: out.append((ref,f,cur_start,text))
            cur=[]; cur_start=None
        for i,raw in enumerate(lines):
            if i in bounds:
                flush(); ref=T2R[bounds[i]]; continue
            s=raw.strip()
            if not s: continue
            if hard_drop(s): flush(); continue
            if soft_drop(s): continue
            m=HEAD1.match(s)
            if m:
                flush(); c=clean(m.group(1))
                if c: cur=[c]; cur_start=i+1
                continue
            m=BOLDONLY.match(s)
            if m:
                flush(); c=clean(m.group(1))
                if c: cur=[c]; cur_start=i+1
                continue
            c=clean(s)
            if not c: continue
            # 짧은 평문 고아줄 (list 아님, 문장꼴 아님) → 새 어구록 시작
            if len(norm(c))<=40 and not FINAL.search(c) and not re.match(r'^(-|\d+\.|•)\s',s):
                if cur and re.search(r'[고며도만나서와과에은는을를]$',c):
                    cur.append(c); continue
                flush(); cur=[c]; cur_start=i+1
                continue
            is_item=bool(re.match(r'^(\d+\.|-|•)\s',c))
            if is_item and cur and not re.match(r'^(\d+\.|-|•)\s',cur[-1]):
                flush(); cur=[c]; cur_start=i+1; continue
            if not cur: cur_start=i+1
            cur.append(c)
        flush()
    return out

if __name__=='__main__':
    out=generate()
    from collections import Counter
    c=Counter(r for r,_,_,_ in out)
    print(f'총 {len(out)}건 / 책 {len(c)}권')
    json.dump([[r,f,ln,t] for r,f,ln,t in out],open('generated.json','w',encoding='utf-8'),ensure_ascii=False)
    for ref in ['book_109','book_001','book_101']:
        print(f'\n=== {ref} ({c[ref]}건) 처음 5건 ===')
        k=0
        for r,f,ln,t in out:
            if r==ref:
                k+=1; print(f'  #{k} L{ln}: {t[:100].replace(chr(10)," ⏎ ")}')
                if k>=5: break

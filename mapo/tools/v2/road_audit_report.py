"""Compile per-section tables and a static review index from the evidence."""
import csv,json,math,os
from collections import Counter
from pathlib import Path
from statistics import median

def values(r):
    paint=[p[1]-p[0] for p in r['matches']]
    curb=[x for x in r['curb_delta'] if x is not None]
    foot=[b-a for a,b in r['sidewalk'] if a is not None and b is not None]
    return paint,curb,foot
def rounded(v):
    return round(v,3) if v is not None else None
def mx(g):
    return rounded(max(map(abs,g))) if g else None
def med(g):
    return rounded(median(map(abs,g))) if g else None
def collect(rs):
    paints,curbs,paths=[],[],[]
    for r in rs:
        a,b,c=values(r);paints.extend(a);curbs.extend(b);paths.extend(c)
    return paints,curbs,paths
def status(r):
    pa,cu,si=values(r)
    return dict(mark=bool(pa),curb=bool(cu),curb_pair=len(cu)==2,walk=bool(si),lane=r['count_read'])
def mismatch(r):
    model, photo=r['lane_model'],r['lane_photo']
    if not model or not photo:return None
    c1,c2=model['counts'],photo['counts']
    total=lambda xs:sum(x for x in xs if x is not None)
    if None not in c1+c2:return c1!=c2
    return total(c1)!=total(c2)

def reason(r, manual, limits):
    limitMark,limitCurb,limitWalk=limits
    m=manual.get(r['id'])
    if m and 'cause' in m: return m['cause']
    pa,cu,si=values(r)
    if not any((pa,cu,si,r['count_read'])):
        return '⑤ 복층 판독 보류' if r['grade_mixed'] else '⑤ 사진 미판독'
    if len(cu)==2 and abs(cu[0])>limitCurb and abs(cu[1])>limitCurb and cu[0]*cu[1]>0 and abs(cu[0]-cu[1])<1.2 and pa and median(map(abs,pa))<limitMark:
        return '② 면·선 상대 위치 후보'
    if r['inferred_walk_m']>1 and any(abs(x)>limitCurb for x in cu):
        return '③ 보충 면 영향 후보'
    if any(abs(x)>limitCurb for x in cu) or any(abs(x)>limitMark for x in pa) or any(abs(x)>limitWalk for x in si) or mismatch(r):
        return '모름 · 추가 판독'
    return '경보 없음 · 판독된 항목만'
def priority(r):
    pa,cu,si=values(r)
    if not (pa or cu or si):return 0
    return round((mx(cu) or 0)+(mx(si) or 0)*.45+(mx(pa) or 0)*1.2+(2 if mismatch(r) else 0),3)
def widths(a):
    if not a:return None
    return round(a[1]-a[0],2)
def totals(r, manual, limits):
    model,photo=r['lane_model'],r['lane_photo']
    def minwidth(a):
        return min(a['widths'],default=None) if a else None
    p,c,s=values(r)
    return dict(cause=reason(r,manual,limits),rank=priority(r),manual=manual.get(r['id']),id=r['id'],road=r['road'],chain=r['chain'],d=r['d'],
        xy=[round(x,2) for x in r['xy']],heading=round(math.degrees(r['heading']),3),width=r['w'],height=r['h'],
        reference=r['reference'],kind=r['kind'],feature=r['extra'],
        lane_model=model['counts'] if model else None,lane_photo=photo['counts'] if photo else None,
        photo_widths=photo['widths'] if photo else None,model_widths=model['widths'] if model else None,
        min_lane_model=minwidth(model),min_lane_photo=minwidth(photo),paired_inner_lanes=r['internal_width_pairs'],
        lane_mismatch=mismatch(r), paint_median=med(p),paint_max=mx(p),paint_signed=[rounded(x) for x in p],
        marks_photo=r['peaks_photo'],marks_model=r['marks_model'],matches=r['matches'],mark_read=r['mark_read'],
        photo_extra=r['photo_extra_candidates'],model_extra=r['model_extra_candidates'],
        road_width_model=widths(r['road_model']),road_width_photo=widths(r['road_photo']),
        curb_max=mx(c),curb_signed=r['curb_delta'],
        edge_model=model['edgeGaps'] if model else None,edge_photo=photo['edgeGaps'] if photo else None,
        sidewalk=r['sidewalk'],walk_delta=[round(x,2) for x in s],
        centerline_photo=r['centerline_photo'],centerline_model=r['centerline_model'],
        median_width_model=widths(r['median_model']),median_width_photo=widths(r['median_photo']),
        bus_lane_lines_photo=r['bus_lane_photo'],bus_lane_lines_model=r['bus_lane_model'],platform_model=r['platform'],
        model_a4_spans=r['a4_model'],stop_and_crossing=r['longitudinal'],
        guides=r['guides_as_lanes_candidates'],narrow_gaps=r['narrow_paint_gaps'],read=status(r),
        multi_grade=r['grade_mixed'],deck=r['deck_in_view'],a2_at_heights=r['height'],grade_crossings_in_strip=r['grade_crossings_in_strip'],
        inferred_walk=r['inferred_walk_m'],missing_tiles=r['missing_tiles'],hatch_faces=r['hatch_faces'])

def aggregate(label,rs):
    p,c,f=collect(rs)
    n=len(rs)
    counts=Counter(k for r in rs for k,v in status(r).items() if v)
    return dict(road=label,sections=n,not_read=sum(not any(status(r).values()) for r in rs),
        lane_read=counts['lane'],lane_dir_read=sum(bool(r['lane_photo'] and r['lane_photo']['counts'][1] is not None)
                                                for r in rs),
        lane_mismatch=sum(mismatch(r) is True for r in rs),
        marks_read=counts['mark'],curbs_read=counts['curb'],curbs_both=counts['curb_pair'],sidewalk_read=counts['walk'],
        mark_median=med(p),mark_max=mx(p),curb_median=med(c),curb_max=mx(c),sidewalk_median=med(f),sidewalk_max=mx(f),
        curb_top_signed=rounded(median([r['curb_delta'][0] for r in rs if r['curb_delta'][0] is not None]))
                    if any(r['curb_delta'][0] is not None for r in rs) else None,
        curb_bottom_signed=rounded(median([r['curb_delta'][1] for r in rs if r['curb_delta'][1] is not None]))
                    if any(r['curb_delta'][1] is not None for r in rs) else None,
        photo_extra=sum(len(r['photo_extra_candidates'] or []) for r in rs),
        model_extra=sum(len(r['model_extra_candidates'] or []) for r in rs),
        guides=sum(bool(r['guides_as_lanes_candidates']) for r in rs),mixed=sum(bool(r['grade_mixed']) for r in rs),
        missing_tiles=sum(bool(r['missing_tiles']) for r in rs),mark_pairs=len(p),curb_sides=len(c),walk_sides=len(f))

def table(rows,path):
    with path.open('w') as f:
        csvw=csv.DictWriter(f,fieldnames=list(rows[0]),delimiter='\t',lineterminator='\n')
        csvw.writeheader()
        for r in rows:
            line={k:json.dumps(v,ensure_ascii=False,separators=(',',':')) if isinstance(v,(list,dict)) else v for k,v in r.items()}
            csvw.writerow(line)

def report(root,manual_path=None,before=None):
    rows=[json.loads(line) for line in (root/'sections.ndjson').open()]
    independent=json.loads(manual_path.read_text()) if manual_path else {}
    base_rows=[r for r in rows if r['reference']]
    def q90(values):
        data=sorted(map(abs,values))
        return data[math.ceil(len(data)*.9)-1] if data else 0
    limits=tuple(max(limit,q90(data)) for limit,data in zip((.71,1.,1.),collect(base_rows)))
    roads={}
    for row in rows:
        roads.setdefault(row['road'],[]).append(row)
    totals_by_road=[aggregate(name,items) for name,items in roads.items()]
    base=aggregate('기준 범위',base_rows) if base_rows else None
    table([*([base] if base else []),*totals_by_road],root/'roads.tsv')
    extracted=[totals(row,independent,limits) for row in rows]
    table(extracted,root/'sections.tsv')
    missing=sorted({tuple(tile) for row in rows for tile in row['missing_tiles']})
    (root/'missing-tiles.json').write_text(json.dumps(missing)+'\n')
    ordered=sorted(extracted,key=lambda row:-row['rank'])
    keys=('id','road','chain','d','xy','width','height','reference','kind','rank','cause','manual',
          'lane_model','lane_photo','lane_mismatch','paired_inner_lanes','paint_median','paint_max',
          'road_width_model','road_width_photo','curb_signed','sidewalk','photo_extra','model_extra','guides',
          'multi_grade','a2_at_heights','median_width_model','median_width_photo','deck','bus_lane_lines_photo',
          'bus_lane_lines_model','platform_model','min_lane_model','min_lane_photo','edge_model','edge_photo',
          'stop_and_crossing','hatch_faces')
    compact=[{k:len(row[k]) if k=='guides' else row[k] for k in keys} for row in extracted]
    summary=dict(baseline=base,all=aggregate('전체',rows),roads=totals_by_road,
                 causes=dict(Counter(row['cause'] for row in extracted)),
                 high=[row['id'] for row in ordered[:10]],limits=limits,
                 before=os.path.relpath(before,root) if before else None,
                 cameraPair=bool(before and (before/'shots/approach-400.png').is_file()
                                 and (root/'shots/approach-400.png').is_file()),
                 extraFiles=[f for f in ('manual.tsv','manual-roads.tsv','sidewalk.tsv','multilevel.tsv',
                                        'perspective/pixels.tsv','contrast-pixels.tsv') if (root/f).is_file()],
                 visual_priority=[row['id'] for row in extracted if (row['manual'] or {}).get('compare')])
    (root/'report.json').write_text(json.dumps({**summary,'sections':compact},ensure_ascii=False,separators=(',',':'))+'\n')
    (root/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
    (root/'index.html').write_text(Path(__file__).with_name('road_audit_index.html').read_text())

"""Transverse and longitudinal readings. Missing or ambiguous readings stay null."""
import math
from collections import defaultdict
import numpy as np
import shapely as s
from shapely.geometry import LineString,Point
from shapely.strtree import STRtree
from road_audit_raster import PIXELS

EDGE={'505','515'}
LANE={'501','503','504','506'}
KINDS={'501':'중앙선','503':'차선','504':'버스전용','505':'길가장자리','506':'진로변경제한',
       '515':'주정차','525':'유도선','530':'정지선','535':'자전거','599':'기타'}

def limits(geom,g):
    return [[min(g.metre(x,y)[1] for x,y in part.coords),max(g.metre(x,y)[1] for x,y in part.coords)]
            for part in s.get_parts(geom.intersection(g.cross)) if part.geom_type=='LineString' and part.length>.02]

def marks(patch,g):
    output=[]
    for i in patch.path_index.query(g.cross,predicate='intersects'):
        path=patch.paths[i]
        kind,sub,ink,id=patch.metas[i]
        for p in s.get_parts(path.intersection(g.cross)):
            if p.geom_type!='Point':continue
            u=path.project(p)
            a=path.interpolate(max(0,u-1))
            b=path.interpolate(min(path.length,u+1))
            ab,bb=g.metre(a.x,a.y),g.metre(b.x,b.y)
            da,db=bb[0]-ab[0],bb[1]-ab[1]
            if abs(da)<1.7*abs(db) and kind!='530':continue
            output.append(dict(y=g.metre(p.x,p.y)[1],kind=kind,id=id,ink=ink['width'],dash=ink['dash'],color=ink['color']))
    return sorted(output,key=lambda r:r['y'])

def aux(patch,g,road):
    center=Point(g.xy)
    stops=[]
    for i in patch.path_index.query(g.zone,predicate='intersects'):
        if patch.metas[i][0]!='530':continue
        local=patch.paths[i].intersection(g.zone)
        if local.is_empty:continue
        p=local.centroid
        x,y=g.metre(p.x,p.y)
        if abs(x)>15 or (road and (y<road[0]-1 or y>road[1]+1)):continue
        bounds=[g.metre(*p) for chunk in s.get_parts(local) if chunk.geom_type=='LineString' for p in chunk.coords]
        if bounds:
            stops.append((x,min(p[1] for p in bounds),max(p[1] for p in bounds),patch.metas[i][3]))
    crosses=[]
    for p in patch.crosses.get(g.zone):
        x,y=g.metre(p.centroid.x,p.centroid.y)
        if abs(x)>15 or (road and not road[0]-1<=y<=road[1]+1):continue
        bounds=[g.metre(*q) for q in p.exterior.coords]
        if p.area>7:
            crosses.append((x,min(p[1] for p in bounds),max(p[1] for p in bounds),p.area,min(p[0] for p in bounds),max(p[0] for p in bounds)))
    return stops,crosses

def bracket(widths, positions):
    if not widths:return None
    if not positions:
        containing=[r for r in widths if r[0]<=0<=r[1]]
        return containing[0] if containing else None
    needed=[r for r in widths if any(r[0]-.8<=p<=r[1]+.8 for p in positions)]
    if not needed: return None
    lim=[min(x[0] for x in needed),max(x[1] for x in needed)]
    if len(positions)>=2 and (lim[0]>min(positions)+1 or lim[1]<max(positions)-1):return None
    return lim if lim[1]-lim[0]>4 else None

def a2_for(row,g):
    positions=[]
    for i in AX[row['road']][1].query(g.cross,predicate='intersects'):
        p,line,raw=AX[row['road']][0][i]
        if p['linktype']=='1':continue
        for at in s.get_parts(line.intersection(g.cross)):
            if at.geom_type!='Point':continue
            u=line.project(at)
            a=line.interpolate(max(0,u-3)); b=line.interpolate(min(line.length,u+3))
            da,db=g.metre(b.x,b.y)[0]-g.metre(a.x,a.y)[0],g.metre(b.x,b.y)[1]-g.metre(a.x,a.y)[1]
            if abs(da)<1.45*abs(db) or abs(g.metre(at.x,at.y)[1])>g.h/2-1:continue
            alt=None
            if all(len(x)>2 for x in raw):
                lengths=[0.]
                for x,y in zip(line.coords,line.coords[1:]):lengths.append(lengths[-1]+math.dist(x,y))
                alt=float(np.interp(u,lengths,[xyz[2] for xyz in raw]))
            positions.append(dict(y=g.metre(at.x,at.y)[1],direction=0 if da>0 else 1,type=p['linktype'],id=p['id'],Z=alt))
    return sorted(positions,key=lambda r:r['y'])

def collapse(values,delta=.7):
    groups=[]
    for val in sorted(values,key=lambda p:p['y']):
        if not groups or val['y']-groups[-1][-1]['y']>delta:groups.append([])
        groups[-1].append(val)
    return [{**max(g,key=lambda p:p.get('score',0)), 'y':float(np.mean([p['y'] for p in g]))} for g in groups]

def median_split(a2,paint,road):
    if road is None:return None
    cuts=[(a,b) for a,b in zip(a2,a2[1:]) if a['direction']!=b['direction'] and b['y']-a['y']>.45]
    if not cuts:return None
    middle=sum(road)/2
    a,b=min(cuts,key=lambda pair:abs((pair[0]['y']+pair[1]['y'])/2-middle))
    center=(a['y']+b['y'])/2
    y=[m['y'] for m in paint if m['kind']=='501' and a['y']-.5<m['y']<b['y']+.5]
    return dict(center=float(np.mean(y)) if y else center,bin=[a['y'],b['y']],
                direction=[a['direction'],b['direction']],marks=y)

def readings(points,edges,split,median):
    if edges is None or edges[1]-edges[0]<3.8:return None
    values=[edges[0],*[p['y'] for p in points if edges[0]+.55<p['y']<edges[1]-.55],edges[1]]
    if median:
        values+=list(median)
    values=sorted(set(values))
    widths=[]
    for a,b in zip(values,values[1:]):
        if not 2.05<=b-a<=5.4:continue
        m=(a+b)/2
        if median and median[0]+.15<m<median[1]-.15:continue
        widths.append([a,b])
    if split is None:
        by=[len(widths),None]
    else:
        by=[sum((a+b)/2 < split for a,b in widths),sum((a+b)/2 >= split for a,b in widths)]
    return {'counts':by,'widths':[round(b-a,2) for a,b in widths],
            'edgeGaps':[round(values[1]-values[0],2),round(values[-1]-values[-2],2)],
            'intervals':widths}

def shift(x,n):
    if n<0:return np.r_[x[:1].repeat(-n,axis=0),x[:n]]
    if n>0:return np.r_[x[n:],x[-1:].repeat(n,axis=0)]
    return x

def smooth(x,w):
    return sum(shift(x,i) for i in range(-(w//2),w//2+1))/(2*(w//2)+1)

def match(paint,photo,tolerance=1.15):
    candidates=[(abs(a['y']-b['y']),i,j) for i,a in enumerate(paint) for j,b in enumerate(photo)
               if abs(a['y']-b['y'])<=tolerance]
    used1=set();used2=set();pairs=[]
    for d,i,j in sorted(candidates):
        if i in used1 or j in used2:continue
        used1.add(i);used2.add(j)
        pairs.append([paint[i]['y'],photo[j]['y'],paint[i]['kind']])
    return pairs,[x for i,x in enumerate(paint) if i not in used1],[x for i,x in enumerate(photo) if i not in used2]

def photo_curb(arr,gray,g,edge,side):
    if edge is None:return None
    means=smooth(arr.mean(axis=1),5)
    y=np.arange(len(means))/PIXELS-g.h/2
    # Looking from centre outwards: start and end on opposite sides of the
    # curb. Require a broad, persistent color step instead of a thin stripe.
    outside=(shift(means,8*side)+shift(means,13*side)+shift(means,18*side))/3
    inside=(shift(means,-5*side)+shift(means,-9*side)+shift(means,-13*side))/3
    d=np.linalg.norm(outside-inside,axis=1)/math.sqrt(3)
    breadth=(outside.mean(axis=1)-inside.mean(axis=1))
    candidates=np.flatnonzero((abs(y-edge)<=4.5)&(d>12)&(outside.mean(axis=1)>55)&(inside.mean(axis=1)>35))
    if not len(candidates):return None
    candidates=candidates[(candidates>=20)&(candidates<len(y)-20)]
    if not len(candidates):return None
    local = np.linalg.norm(shift(means,3)-shift(means,-3),axis=1)/math.sqrt(3)
    weights=.65*d+.75*local+np.maximum(0,breadth)*.1
    i=int(max(candidates,key=lambda i:weights[i]))
    alternatives=[j for j in candidates if abs(j-i)>14 and weights[j]>=.9*weights[i]]
    if alternatives:return None
    a,b=i-side*9,i+side*10
    support=float(np.mean(np.abs(gray[b,:]-gray[a,:])>=8))
    if support<.62:return None
    return {'y':float(y[i]),'weight':float(weights[i]),'support':support}

def photo_lines(arr,gray,g,road):
    if road is None:return []
    y=np.arange(len(gray))/PIXELS-g.h/2
    centre=gray
    adjusted=centre-(shift(centre,7)+shift(centre,-7))/2
    reflect=smooth(adjusted.mean(axis=1),3)
    hits=smooth(np.mean(adjusted>12,axis=1),3)
    cand=[]
    for i in range(6,len(y)-6):
        pos=y[i]
        if not road[0]+.38<=pos<=road[1]-.38:continue
        if reflect[i]<5.7 or hits[i]<.165 or reflect[i]<max(reflect[i-3:i+4]):continue
        if float(np.percentile(gray[i],85))<89:continue
        # High-saturation broad vegetation/car reflections do not count as
        # white/yellow/blue road paint. Test only bright ridge pixels.
        selected=arr[i,adjusted[i]>10]
        if len(selected)<20:continue
        r,gr,b=np.median(selected,axis=0)
        color='white' if max(r,gr,b)-min(r,gr,b)<34 else (
            'yellow' if min(r,gr)-b>12 and r>=gr-9 else
            'blue' if min(gr,b)>1.06*r and b>=gr-8 else 'ambiguous')
        if color=='ambiguous':continue
        cand.append(dict(y=float(pos), score=float(reflect[i]),hits=float(hits[i]),color=color))
    return collapse(cand,.63)

def sidewalk_frontage(arr,gray,g,road,walks,buildings,probe):
    spans=[]
    for side,i in [(-1,0),(1,1)]:
        curb=road[i] if road else None
        if curb is None:
            spans.append([None,None]);continue
        choices=sorted((abs(curb-v),v) for interval in walks for v in interval if 1.15<(v-curb)*side<16)
        # Prefer the contiguous paved polygon that starts at this curb.
        continuous=next((ab for ab in walks if min(abs(ab[0]-curb),abs(ab[1]-curb))<.8
                         and (ab[0]<curb if side<0 else ab[1]>curb)),None)
        outer=continuous[i] if continuous else None
        building=next((v for v in sorted([ab[1-i] for ab in buildings],key=lambda v:abs(v-curb))
                       if (v-curb)*side>1.15),None)
        if outer is not None and building is not None and abs(building-curb)<abs(outer-curb):outer=building
        d=abs(outer-curb) if outer is not None and 1.1<abs(outer-curb)<15 else None
        found=photo_curb(arr,gray,g,outer,side) if d and probe[i] else None
        p=abs(found['y']-probe[i]['y']) if found and (found['y']-probe[i]['y'])*side>1.1 else None
        spans.append([round(d,2) if d else None,round(p,2) if p is not None else None])
    return spans

def longitudinal(arr,g,stops,crosses):
    gray=arr.mean(axis=2)
    data=[]
    for x,lo,hi,*rest in stops:
        if hi-lo<2.5:continue
        select=gray[max(0,round((lo+g.h/2+.25)*PIXELS)):round((hi+g.h/2-.25)*PIXELS)]
        if select.size<100:continue
        profile=select.mean(axis=0)
        ridge=profile-(shift(profile,7)+shift(profile,-7))/2
        pos=round((x+g.w/2)*PIXELS)
        ids=np.arange(max(12,pos-38),min(len(profile)-12,pos+39))
        if not len(ids):continue
        i=ids[np.argmax(ridge[ids])]
        if ridge[i]>12 and np.mean((select[:,i]>(select[:,i-7]+select[:,i+7])/2+9))>.48:
            data.append(dict(kind='정지선',model=round(x,2),photo=round(i/PIXELS-g.w/2,2),
                             delta=round(i/PIXELS-g.w/2-x,2),feature=rest[0]))
        else:data.append(dict(kind='정지선',model=round(x,2),photo=None,delta=None,feature=rest[0]))
    for x,lo,hi,area,start,end in crosses:
        # A zebra's white stripes make a longitudinal bright interval across
        # several transverse phases. Its two edges must both be visible.
        if hi-lo<3 or not 1.5<=end-start<=8:continue
        patch=gray[round((lo+g.h/2+.35)*PIXELS):round((hi+g.h/2-.35)*PIXELS)]
        if not patch.size:continue
        center=round((x+g.w/2)*PIXELS); half=max(7,round((end-start)*PIXELS/2))
        signal=np.percentile(patch,85,axis=0)-np.percentile(patch,30,axis=0)
        options=[]
        for i in range(center-35,center+36):
            a,b=i-half,i+half
            if a<15 or b+15>len(signal):continue
            inside=float(np.median(signal[a:b]))
            outside=(float(np.mean(signal[a-12:a]))+float(np.mean(signal[b:b+12])))/2
            options.append((inside-outside,i,inside))
        best=max(options,default=(0,center,0))
        dx=best[1]/PIXELS-g.w/2-x
        data.append(dict(kind='횡단보도',model=round(x,2),photo=round(x+dx,2) if best[0]>13 and best[2]>28 else None,
                         delta=round(dx,2) if best[0]>13 and best[2]>28 else None))
    return data

def configure(rows, grade_crosses):
    global AX, GRADE, GRADE_TREE
    AX={}
    GRADE=grade_crosses
    GRADE_TREE=STRtree([Point(x,y) for x,y,*_ in GRADE])
    for name,v in rows.items():
        prepared=[(p,LineString(x),raw) for p,x,raw in v]
        AX[name]=(prepared,STRtree([line for _,line,_ in prepared]))

def inspect(row,g,m,photo,missing):
    # Model curb at the shared boundary of the visible road/deck and paving.
    rd=s.union_all([x.intersection(g.zone) for x in m.road.get(g.zone)+m.decks.get(g.zone)])
    wa=s.union_all([x.intersection(g.zone) for x in m.walk.get(g.zone)])
    wa0=s.union_all([x.intersection(g.zone) for x in m.rawwalk.get(g.zone)])
    rawrd=s.union_all([x.intersection(g.zone) for x in m.road.get(g.zone)])
    visible=rd.difference(wa)
    limits_road=limits(visible,g)
    lim_walk=limits(wa,g)
    raw_walk=limits(wa0,g)
    a2=a2_for(row,g)
    road=bracket(limits_road,[x['y'] for x in a2])
    if road and max(abs(road[0]),abs(road[1]))>g.h/2-2:road=None
    paint=marks(m,g)
    stairs=[a for a in a2 if a['Z'] is not None]
    median=median_split(a2,paint,road)
    center=median['center'] if median else None
    median_face=next((span for span in lim_walk if road and span[0]>road[0]+1 and span[1]<road[1]-1
                           and span[1]-span[0]>.65 and abs(sum(span)/2-(center or 0))<8),None)
    grade_hits=[]
    for i in GRADE_TREE.query(g.zone,predicate='intersects'):
        x,z,id1,h1,id2,h2=GRADE[i]
        a,b=g.metre(x,z)
        if abs(a)<=8 and (road is None or road[0]-2<=b<=road[1]+2):
            grade_hits.append((id1,round(h1,2),id2,round(h2,2),round(a,2),round(b,2)))
    heights=' / '.join(f"{x['id']} {x['Z']:.1f}m" for x in stairs)
    if grade_hits:
        heights+=' · 교차 '+', '.join(f'{a} {b:.1f}m / {c} {d:.1f}m' for a,b,c,d,*_ in grade_hits)
    elevated=bool(grade_hits) or any(abs(a['Z']-b['Z'])>2.5 and abs(a['y']-b['y'])<6
                 for i,a in enumerate(stairs) for b in stairs[i+1:])
    lane_model=collapse([p for p in paint if p['kind'] in LANE and road and
                       road[0]+.35 < p['y'] < road[1]-.35 and
                       not (median_face and median_face[0]+.55<p['y']<median_face[1]-.55)])
    geometrical=readings(lane_model,road,center,median_face)
    full=np.asarray(photo,dtype=np.float32)
    mid=g.w*PIXELS//2
    arr=full[:,mid-8*PIXELS:mid+8*PIXELS]
    gray=arr.mean(axis=2)
    # No model-derived substitutions into missing photo fields.
    blocked=bool(missing or elevated or np.mean(gray<40)>.36)
    curbs=[photo_curb(arr,gray,g,road[i],-1 if i==0 else 1) for i in range(2)] if road and not blocked else [None,None]
    photo_edges=[x['y'] for x in curbs] if all(curbs) and curbs[1]['y']-curbs[0]['y']>=3.8 else None
    search=photo_edges or ([road[0]-.5,road[1]+.5] if road else None)
    detected=photo_lines(arr,gray,g,search) if not blocked else []
    med_candidates=[p for p in detected if p['color']=='yellow' and (median['bin'][0]-.6<=p['y']<=median['bin'][1]+.6
                        if median else abs(p['y'])<4)]
    photo_center=float(np.mean([p['y'] for p in med_candidates])) if med_candidates else None
    if photo_center is None and median and len(median['marks'])==1:
        mid_peak=[p for p in detected if abs(p['y']-median['marks'][0])<.65]
        if len(mid_peak)==1: photo_center=mid_peak[0]['y']
    median_photo=None
    if median_face and not blocked:
        edges=[photo_curb(arr,gray,g,y,side) for y,side in zip(median_face,[1,-1])]
        if all(edges) and edges[1]['y']-edges[0]['y']>.65:
            median_photo=[x['y'] for x in edges]
    lane_photo=[p for p in detected if (not photo_edges or photo_edges[0]+.55<p['y']<photo_edges[1]-.55) and
                not (median_photo and median_photo[0]+.55<p['y']<median_photo[1]-.55)]
    pairs,candidate_extra,candidate_missing=match(lane_model,lane_photo)
    # A line count needs a readable cross-section instead of an isolated
    # peak. Arrows and turning guides at the junction are left for image review.
    through_photo=readings(lane_photo,photo_edges,photo_center,median_photo)
    continuous= (through_photo and sum(through_photo['widths']) >= .76*(photo_edges[1]-photo_edges[0]
                    -(median_photo[1]-median_photo[0] if median_photo else 0)))
    crosses_here=any(q.distance(Point(g.xy))<3 for q in m.crosses.get(g.zone))
    photo_marks_read=bool(not blocked and len(pairs)>=max(1,math.ceil(len(lane_model)*.49)) and
                          not crosses_here and len(lane_photo)>=1)
    photo_count_read=bool(photo_marks_read and continuous and through_photo and
                         (not median_face or median_photo))
    internal_pairs=[]
    ordered=sorted(pairs)
    for (a,x,k),(b,y,l) in zip(ordered,ordered[1:]):
        if not 2.05<=b-a<=5.4 or not 2.05<=y-x<=5.4:continue
        if any(a+.1<q['y']<b-.1 for q in lane_model) or any(x+.1<q['y']<y-.1 for q in lane_photo):continue
        internal_pairs.append([round(b-a,2),round(y-x,2)])
    sidewalk=sidewalk_frontage(arr,gray,g,road,lim_walk,limits(s.union_all(m.buildings.get(g.zone)),g),curbs)
    delta=[round(c['y']-road[i],2) if c else None for i,c in enumerate(curbs)] if road else [None,None]
    aux0=aux(m,g,road)
    longitudinal_data=longitudinal(full,g,*aux0) if aux0 and not blocked else []
    looks_extra=[p for p in paint if p['kind'] in {'525','599'} and road and
                 road[0]+1<p['y']<road[1]-1]
    bands=[(a['y'],b['y'],a['kind'],b['kind']) for a,b in zip(paint,paint[1:]) if
           road and road[0]+.4<a['y']<b['y']<road[1]-.4 and 0.52<b['y']-a['y']<2.6]
    infer_intervals=s.difference(wa,wa0).intersection(g.cross)
    inferred=sum(x.length for x in s.get_parts(infer_intervals) if x.geom_type=='LineString')
    inferred_patch=wa.difference(wa0).area
    raw_width=bracket(limits(rawrd,g),[x['y'] for x in a2])
    result={**row,'missing_tiles':missing,'road_model':road,'road_photo':photo_edges,'photo_curb_evidence':curbs,
        'a4_model':limits(s.union_all(m.a4.get(g.zone)),g),
        'curb_delta':delta,'road_raw':raw_width,'sidewalk':sidewalk,'median_model':median_face,'median_photo':median_photo,
        'centerline_model':median['marks'] if median else [],'centerline_photo':[p['y'] for p in med_candidates],
        'bus_lane_model':sum(p['kind']=='504' for p in paint),'bus_lane_photo':sum(p['color']=='blue' for p in detected) if photo_marks_read else None,
        'platform':row['kind']=='승강장','model_a2_lanes':a2,'grade_mixed':elevated,'height':heights,
        'deck_in_view':bool(m.decks.get(g.zone)), 'grade_crossings_in_strip':grade_hits, 'marks_model':paint,'peaks_photo':detected,
        'matches':pairs if photo_marks_read else [],'internal_width_pairs':internal_pairs if photo_marks_read else [],'photo_extra_candidates':candidate_missing if photo_marks_read else None,
        'model_extra_candidates':candidate_extra if photo_marks_read else None,
        'lane_model':geometrical,'lane_photo':through_photo if photo_count_read else None,
        'mark_read':photo_marks_read,'count_read':photo_count_read,'crosses_center':crosses_here,
        'longitudinal':longitudinal_data,'hatch_faces':len(m.zones.get(g.zone)),'guides_as_lanes_candidates':looks_extra,'narrow_paint_gaps':bands,
        'inferred_walk_m':round(inferred,3),'inferred_walk_patch_m2':round(inferred_patch,3)}
    curb=visible.boundary.difference(g.zone.boundary.buffer(.02))
    return result,curb

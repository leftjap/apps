"""Draw equal-scale VWorld, baked-model and alignment panels."""
import math
from functools import lru_cache

import numpy as np
import shapely as s
from PIL import Image, ImageDraw
from shapely.geometry import LineString, Point, Polygon
from shapely.strtree import STRtree
from area import MAPO, asset, read_asset
from bake_aerial_ground import SCALE, mercator

PIXELS=10
WMTS_PIXELS=2**19*256
NATIVE=2*math.pi*SCALE/WMTS_PIXELS
CACHE=MAPO/'tools/raw/aerial/19'


def floor(rows):
    for outer,*holes in rows:
        if len(outer)<4:
            continue
        for part in s.get_parts(s.make_valid(Polygon(outer,[r for r in holes if len(r)>=4]))):
            if part.geom_type == 'Polygon' and part.area:
                yield part

def rgb(col):
    linear=np.array([int(col[i:i+2],16)/255 for i in (0,2,4)])
    return tuple(np.rint(np.where(linear<=.0031308,linear*12.92,1.055*linear**(1/2.4)-.055)*255).astype(int))

class Grid:
    def __init__(self,row):
        self.xy=row['xy']
        self.w,self.h=row['w'],row['h']
        self.size=(self.w*PIXELS,self.h*PIXELS)
        x,z=self.xy
        self.c=math.cos(row['heading']); self.s=math.sin(row['heading'])
        self.corners=[self.world(a,b) for a,b in [(-self.w/2,-self.h/2),(self.w/2,-self.h/2),
                      (self.w/2,self.h/2),(-self.w/2,self.h/2)]]
        self.zone=Polygon(self.corners)
        self.cross=LineString([self.world(0,-self.h/2),self.world(0,self.h/2)])
    def world(self,a,b):
        return self.xy[0]+a*self.c-b*self.s,self.xy[1]+a*self.s+b*self.c
    def metre(self,x,z):
        a,b=x-self.xy[0],z-self.xy[1]
        return self.c*a+self.s*b,-self.s*a+self.c*b
    def pixel(self,x,z):
        a,b=self.metre(x,z)
        return (a+self.w/2)*PIXELS,(b+self.h/2)*PIXELS

@lru_cache(maxsize=420)
def tile(x,y):
    file=CACHE/f'{y}/{x}.jpeg'
    if file.is_file():
        with Image.open(file) as p:
            return p.convert('RGB')
    return None

def aerial(grid,area):
    lon,lat=area['frame']['origin']
    ox=(lon+180)/360*WMTS_PIXELS
    oz=(1-mercator(lat)/math.pi)/2*WMTS_PIXELS
    pairs=[(x/NATIVE+ox,z/NATIVE+oz) for x,z in grid.corners]
    xs=[a for a,b in pairs]; ys=[b for a,b in pairs]
    x0,x1=math.floor(min(xs)/256),math.floor(max(xs)/256)
    y0,y1=math.floor(min(ys)/256),math.floor(max(ys)/256)
    pixels=Image.new('RGB',((x1-x0+1)*256,(y1-y0+1)*256),(36,29,45))
    absent=[]
    for x in range(x0,x1+1):
        for y in range(y0,y1+1):
            image=tile(x,y)
            if image is None: absent.append((x,y))
            else:pixels.paste(image,((x-x0)*256,(y-y0)*256))
    a,b=pairs[0]
    c,s=grid.c/(PIXELS*NATIVE),grid.s/(PIXELS*NATIVE)
    return pixels.transform(grid.size,Image.Transform.AFFINE,(c,-s,a-x0*256,s,c,b-y0*256),
                            Image.Resampling.BICUBIC),absent

class Polys:
    def __init__(self,geoms):
        self.geoms=list(geoms); self.tree=STRtree(self.geoms)
    def get(self,zone):
        return [self.geoms[i] for i in self.tree.query(zone,predicate='intersects')]
    def draw(self,image,grid,color,outline=False,width=1):
        geoms=self.get(grid.zone)
        if not geoms:return
        mask=None
        if outline:
            draw=ImageDraw.Draw(image)
        else:
            mask=Image.new('L',grid.size)
            draw=ImageDraw.Draw(mask)
        for geom in geoms:
            if outline:
                for boundary in [geom.exterior,*geom.interiors]:
                    draw.line([grid.pixel(*p) for p in boundary.coords],fill=color,width=width)
            else:
                bounds=geom.bounds
                local = geom.intersection(grid.zone) if (bounds[2]-bounds[0]>160 or bounds[3]-bounds[1]>160) else geom
                for f in s.get_parts(local):
                    if f.geom_type!='Polygon':continue
                    draw.polygon([grid.pixel(*p) for p in f.exterior.coords],fill=255)
                    for hole in f.interiors:
                        draw.polygon([grid.pixel(*p) for p in hole.coords],fill=0)
        if mask is not None:image.paste(color,mask=mask)

best=lambda names,parts:[p for r in names for p in parts(r)]
class Map:
    def __init__(self,area,include_detail=True):
        a=read_asset(area,'-a')
        raw=read_asset(area)
        built=read_asset(area,'-buildings')
        detail_path=asset(area,'-road-paint')
        if area['output'].get('gzip'):
            detail_path=detail_path.with_suffix('.json.gz')
        detail=read_asset(area,'-road-paint') if include_detail and detail_path.is_file() else {}
        self.zones=Polys(floor(best(detail.get('zones',[]),lambda row:row['faces'])))
        self.hatch_layers=[
            (Polys(floor(best([row for row in detail.get('zones',[]) if row['yellow']==yellow],
                              lambda row:row['stripes']))),rgb(color))
            for yellow,color in [(True,'ebc75e'),(False,'f9f2db')]
        ]
        self.hatch_layers.append((Polys(floor(best(detail.get('symbols',[]),lambda row:row['faces']))),rgb('f9f2db')))
        domain='paint' not in a
        f=a['floor']
        self.road=Polys(floor(f['road']))
        self.walk=Polys(floor(f['walk']+f['islands']+best(f['a4'],lambda r:r['faces'])))
        self.rawwalk=Polys(floor(raw['floor']['walk']+raw['floor']['islands']+
                               best(raw['floor']['a4'],lambda r:r['faces'])))
        self.a4=Polys(floor(best(raw['floor']['a4'],lambda r:r['faces'])))
        self.decks=Polys(floor(best([r for r in a.get('decks',[]) if r['kind']!='보도교'],lambda r:r['faces'])))
        self.crosses=Polys(floor(best(a['crossings'],lambda r:r['faces'])))
        self.buildings=Polys(floor(best(built['buildings'],lambda r:r['faces'])))
        self.base=floor(a.get('land',built.get('ground',[])))
        self.layers=[(Polys(self.base),rgb('a8a093')),(Polys(floor(a.get('parks',[]))),rgb('829369')),
                     (Polys(floor(a.get('water',[]))),rgb('54879b')),(Polys(floor(built['parking'])),rgb('87837d')),
                     (self.road,rgb('535e69')),(self.decks,rgb('535e69')),(self.walk,rgb('e0c9a8')),
                     (Polys(floor(best([g for g in a['crossings'] if g['stripes']],lambda r:r['faces']))),rgb('6b827e')),
                     (Polys(floor(best([g for g in a['crossings'] if not g['stripes']],lambda r:r['faces']))),rgb('9eada4')),
                     (Polys(floor(best(a['crossings'],lambda r:r['stripes']))),rgb('fbf2d9')),
                     (Polys(floor(best(a['bicycles'],lambda r:r['faces']))),rgb('619188'))]
        self.paths=[]; self.metas=[]
        painted=[[] for _ in range(4)]
        if domain:
            from aerial_paint import footprint
        for mark in a['lines']:
            for path in mark['paths']:
                if len(path)<2:continue
                self.paths.append(LineString(path)); self.metas.append((mark['kind'],mark['type'],mark['ink'],mark['id']))
                if domain:
                    i=mark['ink']
                    painted[i['color']].extend(footprint(path,i['width'],0,i['dash']))
        self.path_index=STRtree(self.paths)
        if not domain:
            for row in a['paint']: painted[row['color']]=list(floor(row['faces']))
        self.layers.extend(self.hatch_layers)
        self.layers.extend((Polys(polys),rgb(col)) for polys,col in zip(painted,['a5a9ab','ebc75e','f9f2db','679bf9']))
        self.layers.append((self.buildings,rgb('827f77')))

    def render(self,photo,grid,curbs):
        model=Image.new('RGB',grid.size,(11,13,17))
        for layer,col in self.layers:layer.draw(model,grid,col)
        overlay=photo.copy()
        self.buildings.draw(overlay,grid,(245,245,245),True,1)
        self.zones.draw(overlay,grid,(255,165,84),True,1)
        self.crosses.draw(overlay,grid,(255,222,0),True,2)
        draw=ImageDraw.Draw(overlay)
        for i in self.path_index.query(grid.zone,predicate='intersects'):
            color=(255,43,226) if self.metas[i][0]=='530' else (100,204,255)
            draw.line([grid.pixel(*p) for p in self.paths[i].coords],fill=color,width=2)
        for geom in s.get_parts(curbs):
            if geom.geom_type=='LineString':
                draw.line([grid.pixel(*p) for p in geom.coords],fill=(255,58,52),width=2)
        return model,overlay

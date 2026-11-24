import manifest from '../../tools/v2/areas/hapjeong.json' with { type: 'json' };
import { groundPoint, tileAtGround } from './map.ts';

type Point = [number, number];
type Bounds = [number, number, number, number];

export type SurveyView = {
  id: string;
  title: string;
  at: Point;
  width: number;
  tilt?: number;
  mode: 'photo' | 'paths' | 'floors';
};

export type SurveyArea = {
  id: string;
  title: string;
  window: Bounds;
  station?: string | null;
  output: { directory: string; stem: string };
  photo: { centerLonLat: Point; tileRadius: number } | { bounds: Bounds };
  views: {
    display: SurveyView[];
    simulation: SurveyView[];
    overview?: SurveyView;
    default: string;
    replayDefault: string;
  };
  combinedByDefault?: boolean;
  replay: { enabled?: boolean; people?: boolean; busName: string; busIntervals?: number[]; axisNames: string[]; signalLabel: string;
    boundaryTrips?: { intervalSeconds: number; passengerWarmupSeconds: number;
      stationShare?: number; passengersPerBus?: number; softLimit?: number; validateJunctionExit?: boolean } };
  galleries?: Partial<Record<'base' | 'combined' | 'replay', { url: string; label: string }>>;
};

export const hapjeongArea = manifest as unknown as SurveyArea;

export function photoTiles(photo: SurveyArea['photo']) {
  if ('bounds' in photo) {
    const [x0, z0, x1, z1] = photo.bounds;
    return [tileAtGround(x0, z0), tileAtGround(x1, z1)];
  }
  const { x, y } = tileAtGround(...groundPoint(photo.centerLonLat));
  const r = photo.tileRadius;
  return [{ x: x - r, y: y - r }, { x: x + r, y: y + r }];
}

import manifest from '../../tools/v2/areas/hapjeong.json' with { type: 'json' };

type Point = [number, number];
type Bounds = [number, number, number, number];

export type SurveyView = {
  id: string;
  title: string;
  at: Point;
  width: number;
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
  replay: { enabled?: boolean; busName: string; axisNames: string[]; signalLabel: string };
  galleries?: Partial<Record<'base' | 'combined' | 'replay', { url: string; label: string }>>;
};

export const hapjeongArea = manifest as unknown as SurveyArea;

import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoadOverlay, ROAD_OVERLAY_ASSETS } from '../src/aerial/road-overlay.ts';

const data = readFileSync(new URL('../public/data/v2/seogyo-ground.json', import.meta.url), 'utf8');

afterEach(() => vi.unstubAllGlobals());

describe('the Seogyo road comparison', () => {
  it('uses one coordinate asset for road and overlay and keeps a separate hand trace', async () => {
    const fetchGround = vi.fn(async () => new Response(data));
    vi.stubGlobal('fetch', fetchGround);
    const overlay = createRoadOverlay(() => {});
    expect(overlay.state()).toBe('ready');
    expect(overlay.group.children).toHaveLength(0);

    overlay.setMode('road');
    await vi.waitFor(() => expect(overlay.state()).toBe('ready'));
    expect(fetchGround).toHaveBeenCalledWith(expect.stringMatching(/\/data\/v2\/seogyo-ground\.json$/));
    const [road] = overlay.group.children;
    expect(road.visible).toBe(true);
    expect(road.children.length).toBeGreaterThan(0);

    overlay.setMode('overlay');
    await vi.waitFor(() => expect(overlay.state()).toBe('ready'));
    const [, comparison] = overlay.group.children;
    expect(comparison.visible).toBe(true);
    expect(road.visible).toBe(false);
    expect(fetchGround).toHaveBeenCalledTimes(1);

    overlay.setMode('photo');
    expect(overlay.group.children.filter(group => group.visible)).toHaveLength(0);
    expect(ROAD_OVERLAY_ASSETS.hand).toBe('data/v2/seogyo-lines.svg');
  });

  it('loads calibrated, rule-only and corridor geometry into separate layers', async () => {
    const fetchGround = vi.fn(async () => new Response(data));
    vi.stubGlobal('fetch', fetchGround);
    const overlay = createRoadOverlay(() => {});
    for (const [variant, asset] of [
      ['calibrated', 'seogyo-ground.json'], ['rules', 'seogyo-rules.json'], ['corridor', 'yanghwa-ground.json'],
    ] as const) {
      overlay.setMode('overlay', 'seogyo', variant);
      await vi.waitFor(() => expect(overlay.state()).toBe('ready'));
      expect(fetchGround).toHaveBeenLastCalledWith(expect.stringContaining(asset));
      expect(overlay.group.children.filter(layer => layer.visible)).toHaveLength(1);
    }
  });

  it('exposes only related omitted arrows at their source positions in overlay mode', async () => {
    const original = JSON.parse(data);
    const response = vi.fn(async () => new Response(data));
    vi.stubGlobal('fetch', response);
    const overlay = createRoadOverlay(() => {});
    expect(overlay.omissions()).toEqual([]);
    overlay.setMode('overlay');
    await vi.waitFor(() => expect(overlay.state()).toBe('ready'));

    const rows = original.arrowInventory.omitted.filter((a: { reason: string }) => a.reason === 'lane-already-assigned');
    expect(overlay.omissions().map(o => o.id)).toEqual(rows.map((a: {id: string}) => a.id));
    expect(overlay.omissions()[0]).toMatchObject({
      id: rows[0].id, sourceAt: rows[0].sourceAt, kind: rows[0].kind,
      adopted: { id: rows[0].of, kind: original.arrows.find((a: {id: string}) => a.id === rows[0].of).kind },
    });

    overlay.setMode('road');
    expect(overlay.omissions()).toEqual([]);
    await vi.waitFor(() => expect(overlay.state()).toBe('ready'));
    expect(overlay.omissions()).toEqual([]);
    overlay.setMode('photo');
    expect(overlay.omissions()).toEqual([]);
  });

  it('shows every unassigned corridor arrow at its source with no adopted arrow', async () => {
    const corridor = readFileSync(new URL('../public/data/v2/yanghwa-ground.json', import.meta.url), 'utf8');
    const { arrowInventory } = JSON.parse(corridor);
    const expected = arrowInventory.omitted
      .filter((row: { reason: string }) => ['lane-already-assigned', 'lane-kind-conflict', 'no-lane'].includes(row.reason));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(corridor)));
    const overlay = createRoadOverlay(() => {});

    overlay.setMode('overlay', 'seogyo', 'corridor');
    await vi.waitFor(() => expect(overlay.state()).toBe('ready'));
    expect(overlay.omissions().map(row => row.id)).toEqual(expected.map((row: { id: string }) => row.id));
    const unassigned = overlay.omissions().filter(row => row.reason === 'no-lane');
    expect(unassigned).toHaveLength(25);
    expect(unassigned).toEqual(expected.filter((row: { reason: string }) => row.reason === 'no-lane'));
    expect(unassigned.every(row => row.adopted === undefined)).toBe(true);

    overlay.setMode('road', 'seogyo', 'corridor');
    await vi.waitFor(() => expect(overlay.state()).toBe('ready'));
    expect(overlay.omissions()).toEqual([]);
    overlay.setMode('photo', 'seogyo', 'corridor');
    expect(overlay.omissions()).toEqual([]);
  });

  it('keeps an earlier JSON response hidden when the viewer returns to the photo', async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    const loaded = vi.fn();
    const overlay = createRoadOverlay(loaded);
    overlay.setMode('overlay');
    overlay.setMode('photo');
    finish(new Response(data));
    await vi.waitFor(() => expect(loaded).toHaveBeenCalledTimes(1));
    expect(overlay.state()).toBe('ready');
    expect(overlay.group.children).toHaveLength(1);
    expect(overlay.group.children[0].visible).toBe(false);
  });
});

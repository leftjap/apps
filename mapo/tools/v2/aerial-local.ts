import { readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { photoTiles, type SurveyArea } from '../../src/aerial/survey-area.ts';
import type { Plugin } from 'vite';
import { AERIAL_DEV_ORIGIN, AERIAL_DEV_PORT, groundPoint, PILOT_SITES, tileAtGround, vworldTileUrl } from '../../src/aerial/map.ts';

const prefix = '/apps/mapo/__aerial/';
const areaDirectory = new URL('./areas/', import.meta.url);
const surveyTiles = readdirSync(areaDirectory).filter(name => name.endsWith('.json')).flatMap(name => {
  const photo: SurveyArea['photo'] | undefined = JSON.parse(readFileSync(new URL(name, areaDirectory), 'utf8')).photo;
  return photo ? [photoTiles(photo)] : [];
});
const centres = Object.values(PILOT_SITES).map(site => tileAtGround(...groundPoint(site)));

type LocalRequest = { host?: string; remote?: string; site?: string; path: string };

export function allowedTile({ host, remote, site, path }: LocalRequest) {
  if (host !== `localhost:${AERIAL_DEV_PORT}` || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote ?? '')) return null;
  if (site !== 'same-origin') return null;
  const parts = /^\/(\d{6})\/(\d{6})\.jpeg$/.exec(path);
  if (!parts) return null;
  const [, row, col] = parts;
  const tile = { x: Number(col), y: Number(row) };
  const pilot = centres.some(c => Math.abs(c.x - tile.x) <= 5 && Math.abs(c.y - tile.y) <= 5);
  const survey = surveyTiles.some(([first, last]) =>
    tile.x >= first.x && tile.x <= last.x && tile.y >= first.y && tile.y <= last.y);
  return pilot || survey ? tile : null;
}

export function localAerial(): Plugin {
  let key: string | undefined;
  return {
    name: 'mapo-local-aerial',
    apply: 'serve',
    configureServer(server) {
      try {
        key = parseEnv(readFileSync(join(homedir(), '.config/mapo/.env'), 'utf8')).VWORLD_API_KEY;
      } catch {
        return; // The manual key form works on fresh checkouts.
      }
      server.middlewares.use(prefix, async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        const path = req.url ?? '';
        const baseTile = /^\/base\/\d{6}\/\d{6}\.png$/.test(path);
        const tile = allowedTile({
          host: req.headers.host, remote: req.socket.remoteAddress,
          site: String(req.headers['sec-fetch-site']),
          path: baseTile ? path.slice('/base'.length).replace(/\.png$/, '.jpeg') : path,
        });
        if (!key || !tile || req.method !== 'GET') {
          res.writeHead(403).end();
          return;
        }
        try {
          const satellite = vworldTileUrl(key, tile);
          const url = baseTile ? satellite.replace('/Satellite/', '/Base/').replace(/\.jpeg$/, '.png') : satellite;
          const contentType = baseTile ? 'image/png' : 'image/jpeg';
          const upstream = await fetch(url, {
            headers: { Referer: `${AERIAL_DEV_ORIGIN}/apps/mapo/aerial.html` },
            redirect: 'error', signal: AbortSignal.timeout(10_000),
          });
          if (!upstream.ok || !upstream.headers.get('content-type')?.startsWith(contentType)) {
            res.writeHead(502).end();
            return;
          }
          const bytes = Buffer.from(await upstream.arrayBuffer());
          res.writeHead(200, { 'Content-Type': contentType }).end(bytes);
        } catch {
          res.writeHead(502).end();
        }
      });
    },
    transformIndexHtml(_html, ctx) {
      if (key && ctx.filename.endsWith('/aerial.html')) {
        return [{ tag: 'meta', attrs: { name: 'local-aerial-tiles', content: prefix } }];
      }
    },
  };
}

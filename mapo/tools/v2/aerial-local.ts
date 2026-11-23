import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import type { Plugin } from 'vite';
import { groundPoint, PILOT_SITES, tileAtGround, vworldTileUrl } from '../../src/aerial/map.ts';

const prefix = '/apps/mapo/__aerial/';
const centres = Object.values(PILOT_SITES).map(site => tileAtGround(...groundPoint(site)));

type LocalRequest = { host?: string; remote?: string; site?: string; path: string };

export function allowedTile({ host, remote, site, path }: LocalRequest) {
  if (host !== 'localhost:5197' || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote ?? '')) return null;
  if (site !== 'same-origin') return null;
  const parts = /^\/(\d{6})\/(\d{6})\.jpeg$/.exec(path);
  if (!parts) return null;
  const [, row, col] = parts;
  const tile = { x: Number(col), y: Number(row) };
  return centres.some(c => Math.abs(c.x - tile.x) <= 5 && Math.abs(c.y - tile.y) <= 5) ? tile : null;
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
        const tile = allowedTile({
          host: req.headers.host, remote: req.socket.remoteAddress,
          site: String(req.headers['sec-fetch-site']), path: req.url ?? '',
        });
        if (!key || !tile || req.method !== 'GET') {
          res.writeHead(403).end();
          return;
        }
        try {
          const upstream = await fetch(vworldTileUrl(key, tile), {
            headers: { Referer: 'http://localhost:5197/apps/mapo/aerial.html' },
            redirect: 'error', signal: AbortSignal.timeout(10_000),
          });
          if (!upstream.ok || !upstream.headers.get('content-type')?.startsWith('image/jpeg')) {
            res.writeHead(502).end();
            return;
          }
          const bytes = Buffer.from(await upstream.arrayBuffer());
          res.writeHead(200, { 'Content-Type': 'image/jpeg' }).end(bytes);
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

import { describe, expect, it } from 'vitest';
import { allowedTile } from '../tools/v2/aerial-local';

const request = { host: 'localhost:5198', remote: '::1', site: 'same-origin', path: '/203057/446982.jpeg' };

describe('local aerial preview', () => {
  it('allows tiles around the two pilot cameras from the local page', () => {
    expect(allowedTile(request)).toEqual({ x: 446982, y: 203057 });
    expect(allowedTile({ ...request, path: '/203063/446975.jpeg' })).toEqual({ x: 446975, y: 203063 });
  });

  it('allows tiles covered by a survey area photo window', () => {
    expect(allowedTile({ ...request, path: '/203050/446976.jpeg' })).toEqual({ x: 446976, y: 203050 });
  });

  it('rejects other sites, non-loopback clients, and unrelated tile requests', () => {
    for (const change of [
      { host: 'other.example:5198' }, { host: 'localhost:5197' }, { remote: '192.168.1.1' }, { site: 'cross-site' },
      { path: '/203057/100.jpeg' }, { path: '/203057/446982.jpeg?url=other' },
    ]) expect(allowedTile({ ...request, ...change })).toBeNull();
  });
});

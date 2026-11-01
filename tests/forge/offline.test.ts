/// <reference types="node" />
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync, ChildProcess } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localIconSvg } from '../../src/utils/localIcons';
import { playableImages } from '../../src/game/pipes/playableImages';
import { ImageItem, ImageServiceType, ImageType } from '../../src/types';

/** Every icon name the app passes to <WaIcon>/<wa-icon> must be bundled. */
function iconNamesInSource(dir: string): Set<string> {
  const names = new Set<string>();
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      const p = join(d, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|ts)$/.test(p)) {
        const src = readFileSync(p, 'utf8');
        if (!/WaIcon|wa-icon/.test(src)) continue;
        for (const m of src.matchAll(
          /<(?:WaIcon|wa-icon)[^>]*?name=\{?'([a-z0-9-]+)'/g
        ))
          names.add(m[1]);
        for (const m of src.matchAll(
          /name=\{[^}]*\?\s*'([a-z0-9-]+)'\s*:\s*'([a-z0-9-]+)'/g
        )) {
          names.add(m[1]);
          names.add(m[2]);
        }
        for (const m of src.matchAll(
          /name=\$\{[^}]*\?\s*'([a-z0-9-]+)'\s*:\s*'([a-z0-9-]+)'/g
        )) {
          names.add(m[1]);
          names.add(m[2]);
        }
        for (const m of src.matchAll(
          /setIcon\('([a-z0-9-]+)'\)|useState\('([a-z0-9-]+)'\)/g
        ))
          names.add(m[1] ?? m[2]);
      }
    }
  };
  walk(dir);
  return names;
}

describe('bundled icons (no CDN)', () => {
  it('finds the icons used across the app', () => {
    const names = iconNamesInSource(join(__dirname, '../../src'));
    expect(names.size).toBeGreaterThan(15);
    for (const expected of [
      'upload',
      'ban',
      'check',
      'compress',
      'expand',
      'angle-down',
    ])
      expect(names).toContain(expected);
  });
  it('every solid icon name used in the source resolves locally', () => {
    const regularOnly = new Set(['square', 'circle', 'circle-dot']);
    const missing = [...iconNamesInSource(join(__dirname, '../../src'))].filter(
      n => !regularOnly.has(n) && !localIconSvg(n)
    );
    expect(missing).toEqual([]);
  });
  it('outline (regular) toggle icons are bundled', () => {
    for (const n of ['square', 'square-check', 'circle', 'circle-dot'])
      expect(localIconSvg(n, 'classic', 'regular')).toMatch(/^<svg /);
  });
  it('brand logos are left to the CDN in the online build', () => {
    expect(localIconSvg('github', 'brands')).toBeUndefined();
  });
});

describe('offline media filter', () => {
  const item = (id: string, service: ImageServiceType): ImageItem => ({
    id,
    service,
    type: ImageType.image,
    thumbnail: '',
    preview: '',
    full: '',
    source: '',
  });
  const items = [
    item('a', ImageServiceType.local),
    item('b', ImageServiceType.e621),
    item('c', ImageServiceType.local),
  ];
  it('keeps only device media in the offline build', () => {
    expect(playableImages(items, true).map(i => i.id)).toEqual(['a', 'c']);
  });
  it('keeps everything in the online build', () => {
    expect(playableImages(items, false)).toHaveLength(3);
    expect(playableImages(undefined, true)).toEqual([]);
  });
});

const hasPython = spawnSync('python3', ['--version']).status === 0;

describe.skipIf(!hasPython)('offline launcher server (serve.py)', () => {
  const port = 5300 + Math.floor(Math.random() * 400);
  const base = `http://127.0.0.1:${port}`;
  let dir: string;
  let proc: ChildProcess;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'forge-offline-'));
    cpSync(join(__dirname, '../../offline/serve.py'), join(dir, 'serve.py'));
    mkdirSync(join(dir, 'app/assets'), { recursive: true });
    writeFileSync(
      join(dir, 'app/index.html'),
      '<!doctype html><title>app</title>'
    );
    writeFileSync(join(dir, 'app/assets/main.js'), 'console.log(1)');
    writeFileSync(join(dir, 'secret.txt'), 'outside the app folder');
    proc = spawn('python3', [join(dir, 'serve.py'), '--no-open'], {
      env: { ...process.env, FORGE_OFFLINE_PORT: String(port) },
      stdio: 'ignore',
    });
    for (let i = 0; i < 50; i++) {
      try {
        await fetch(base + '/');
        return;
      } catch {
        await new Promise(r => setTimeout(r, 100));
      }
    }
    throw new Error('serve.py did not start');
  });

  afterAll(() => {
    proc?.kill();
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves app routes through index.html', async () => {
    const r = await fetch(base + '/forge/history/abc');
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('<title>app</title>');
  });
  it('serves JavaScript with a module-compatible MIME type', async () => {
    const r = await fetch(base + '/assets/main.js');
    expect(r.headers.get('content-type')).toMatch(/^text\/javascript/);
  });
  it('404s missing files instead of returning the app', async () => {
    expect((await fetch(base + '/assets/missing.js')).status).toBe(404);
  });
  it('never serves files outside the app folder', async () => {
    for (const path of [
      '/../secret.txt',
      '/..%2Fsecret.txt',
      '/%2e%2e/secret.txt',
      '/../serve.py',
    ]) {
      const r = await fetch(base + path);
      expect(await r.text()).not.toContain('outside the app folder');
      expect(r.status).not.toBe(500);
    }
  });
});

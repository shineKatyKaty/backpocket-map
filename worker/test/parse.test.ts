import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseEntityList } from '../src/parse';

const here = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(join(here, 'fixture.txt'), 'utf8');
const { places } = parseEntityList(raw);

describe('parseEntityList (合成フィクスチャ)', () => {
  it('ヘッダを除いた3件を取り出す', () => {
    expect(places.length).toBe(3);
  });

  it('名前・メモ・座標が取れる', () => {
    const m = places.find((p) => p.name === '喫茶マドラグ');
    expect(m).toBeTruthy();
    expect(m!.note).toContain('静か');
    expect(m!.lat).toBeCloseTo(35.0116, 3);
    expect(m!.lng).toBeCloseTo(135.7681, 3);
    expect(m!.needsReview).toBe(false);
  });

  it('16進CIDを10進に変換し gmaps URL を生成する', () => {
    const m = places.find((p) => p.name === '喫茶マドラグ')!;
    expect(m.id).toMatch(/^\d+:\d+$/);
    expect(m.cidNumber).toMatch(/^\d+$/);
    expect(m.gmapsUrl).toBe(`https://maps.google.com/?cid=${m.cidNumber}`);
  });

  it('メモが無い場所は note=null', () => {
    const m = places.find((p) => p.name === '東京ソラマチ')!;
    expect(m.note).toBeNull();
  });
});

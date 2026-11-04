import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseEntityList } from '../src/parse';

const here = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(join(here, 'fixture.txt'), 'utf8');
const { places } = parseEntityList(raw);

// フィクスチャは実構造を模した架空データ（個人情報は含まない）
describe('parseEntityList (実getlist構造の合成フィクスチャ)', () => {
  it('2件取り出す', () => {
    expect(places.length).toBe(2);
  });

  it('名前・メモ・座標・住所（entry[1]内）', () => {
    const p = places.find((x) => x.name === 'サンプル喫茶 ABC');
    expect(p).toBeTruthy();
    expect(p!.note).toBe('テスト用メモ');
    expect(p!.lat).toBeCloseTo(35.6812, 4);
    expect(p!.lng).toBeCloseTo(139.7671, 4);
    expect(p!.address).toContain('千代田区');
    expect(p!.savedAt).toBe(1700000000);
    expect(p!.needsReview).toBe(false);
  });

  it('CID配列→id/cidNumber と gmaps URL', () => {
    const p = places.find((x) => x.name === 'サンプル喫茶 ABC')!;
    expect(p.id).toBe('4000000000000000000:6000000000000000000');
    expect(p.cidNumber).toBe('6000000000000000000');
    expect(p.gmapsUrl).toBe('https://maps.google.com/?cid=6000000000000000000');
  });

  it('負のCIDは符号なし64bitへ変換', () => {
    const p = places.find((x) => x.name === 'サンプル菓子店 XYZ')!;
    // 2^64 - 5000000000000000000 = 13446744073709551616
    expect(p.cidNumber).toBe('13446744073709551616');
    expect(p.gmapsUrl).toBe('https://maps.google.com/?cid=13446744073709551616');
  });

  it('空文字のメモ・住所は null', () => {
    const p = places.find((x) => x.name === 'サンプル菓子店 XYZ')!;
    expect(p.note).toBeNull();
    expect(p.address).toBeNull();
  });
});

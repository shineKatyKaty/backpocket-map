import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseEntityList } from '../src/parse';

const here = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(join(here, 'fixture.txt'), 'utf8');
const { places } = parseEntityList(raw);

describe('parseEntityList (実getlist構造の合成フィクスチャ)', () => {
  it('2件取り出す', () => {
    expect(places.length).toBe(2);
  });

  it('名前・メモ・座標・住所（entry[1]内）', () => {
    const p = places.find((x) => x.name === 'HEARTH SMOKED GRILL')!;
    expect(p).toBeTruthy();
    expect(p.note).toBe('パンケーキ');
    expect(p.lat).toBeCloseTo(35.7282633, 5);
    expect(p.lng).toBeCloseTo(139.7127774, 5);
    expect(p.address).toContain('豊島区');
    expect(p.savedAt).toBe(1737301670);
    expect(p.needsReview).toBe(false);
  });

  it('CID配列→id/cidNumber と gmaps URL', () => {
    const p = places.find((x) => x.name === 'HEARTH SMOKED GRILL')!;
    expect(p.id).toBe('6924440549153798161:6281874222301889412');
    expect(p.cidNumber).toBe('6281874222301889412');
    expect(p.gmapsUrl).toBe('https://maps.google.com/?cid=6281874222301889412');
  });

  it('負のCIDは符号なし64bitへ変換', () => {
    const p = places.find((x) => x.name === 'パティスリーミムラ')!;
    expect(p.cidNumber).toBe('12624902513078476726');
    expect(p.gmapsUrl).toBe('https://maps.google.com/?cid=12624902513078476726');
  });

  it('空文字のメモ・住所は null', () => {
    const p = places.find((x) => x.name === 'パティスリーミムラ')!;
    expect(p.note).toBeNull();
    expect(p.address).toBeNull();
  });
});

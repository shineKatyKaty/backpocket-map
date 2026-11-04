import Fuse from 'fuse.js';
import type { Place } from './types';

/**
 * 表記ゆれ吸収: 全角半角(NFKC)・大小文字・カタカナ→ひらがな を統一。
 * 例: 「ｷｯｻ」「キッサ」「ＫＩＳＳＡ」→ いずれも "きっさ"/"kissa" 系に寄せる。
 */
export function normalize(s: string): string {
  if (!s) return '';
  let t = s.normalize('NFKC').toLowerCase();
  t = t.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  return t.trim();
}

interface IndexDoc {
  id: string;
  name: string;
  kana: string;
  note: string;
  tags: string;
  address: string;
}

export function buildFuse(places: Place[]): Fuse<IndexDoc> {
  const docs: IndexDoc[] = places.map((p) => ({
    id: p.id,
    name: normalize(p.name),
    kana: normalize(p.name_kana ?? ''),
    note: normalize(p.note ?? ''),
    tags: p.tags.map(normalize).join(' '),
    address: normalize(p.address ?? ''),
  }));
  return new Fuse(docs, {
    keys: [
      { name: 'name', weight: 2 },
      { name: 'kana', weight: 2 },
      { name: 'tags', weight: 1.5 },
      { name: 'note', weight: 1 },
      { name: 'address', weight: 1 },
    ],
    threshold: 0.4, // タイプミス許容
    ignoreLocation: true,
    includeScore: true,
  });
}

/** キーワードで並べ替え済みの結果を返す。空クエリなら元の並びのまま。 */
export function runSearch(fuse: Fuse<IndexDoc>, places: Place[], query: string): Place[] {
  const q = normalize(query);
  if (!q) return places;
  const ranked = fuse.search(q);
  const order = new Map<string, number>();
  ranked.forEach((r, i) => order.set(r.item.id, i));
  return places.filter((p) => order.has(p.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}

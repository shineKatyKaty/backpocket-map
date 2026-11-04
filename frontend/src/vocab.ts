/** タグ語彙（大/小カテゴリ）。API /tags から取得、未接続時は既定値。 */
export interface Vocabulary {
  bigs: string[];
  smallsByBig: Record<string, string[]>;
}

/** 設計書「大カテゴリと初期の小カテゴリ」。サンプル/オフライン時のフォールバック。 */
export const DEFAULT_VOCAB: Vocabulary = {
  bigs: ['飲食', 'ショップ', '見学', '体験', 'その他'],
  smallsByBig: {
    飲食: ['ラーメン', '喫茶店', 'コーヒー', 'カフェ', '居酒屋', 'パン'],
    ショップ: ['書店', '雑貨', '古着', '文具'],
    見学: ['美術館', '博物館', '寺社', '建築', '公園'],
    体験: ['温泉', 'ワークショップ', 'アクティビティ'],
    その他: ['地名・エリア'],
  },
};

/** タグ名が属する大カテゴリ（大カテゴリ名そのものなら自身） */
export function bigOfTag(vocab: Vocabulary, tag: string): string | null {
  if (vocab.bigs.includes(tag)) return tag;
  for (const b of vocab.bigs) {
    if ((vocab.smallsByBig[b] ?? []).includes(tag)) return b;
  }
  return null;
}

/** 場所のタグ配列から、該当する大カテゴリの集合 */
export function placeBigs(vocab: Vocabulary, tags: string[]): string[] {
  const set = new Set<string>();
  for (const t of tags) {
    const b = bigOfTag(vocab, t);
    if (b) set.add(b);
  }
  return [...set];
}

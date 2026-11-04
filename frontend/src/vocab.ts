/** タグ語彙（大/小カテゴリ）。API /tags から取得、未接続時は既定値。 */
export interface Vocabulary {
  bigs: string[];
  smallsByBig: Record<string, string[]>;
}

/** 大カテゴリの色（ピンの色分け・凡例に使う） */
export const BIG_CATEGORY_COLOR: Record<string, string> = {
  飲食: '#e4572e', // オレンジ赤
  ショップ: '#2a9d8f', // 緑
  見学: '#4a6fa5', // 青
  体験: '#9b5de5', // 紫
  その他: '#9aa5b1', // グレー
};
export const DEFAULT_BIG_COLOR = '#9aa5b1';

/** タグ配列から代表の大カテゴリ色を返す */
export function colorForTags(vocab: Vocabulary, tags: string[]): string {
  const big = placeBigs(vocab, tags)[0];
  return (big && BIG_CATEGORY_COLOR[big]) || DEFAULT_BIG_COLOR;
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

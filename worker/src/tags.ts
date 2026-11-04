/**
 * タグ自動生成（Gemini）と所要時間の既定値。
 * 設計書「タグ・所要時間・興味度」:
 *  - 固定語彙から大/小カテゴリを選ばせ、表記ゆれを防ぐ
 *  - 所要時間は 小→大 の順で既定値を引く
 *  - 興味度は自動では決めない（既定「中」）
 * Gemini は新規場所の取り込み時に1回だけ呼ぶ（sync.ts から）。
 */
import type { Env } from './types';

/** 所要時間(分)の既定値。小カテゴリ優先、無ければ大カテゴリ。 */
const SMALL_DURATION: Record<string, number> = {
  ラーメン: 30,
};
const BIG_DURATION: Record<string, number> = {
  飲食: 60,
  ショップ: 45,
  見学: 90,
  体験: 120,
  その他: 0, // 未設定扱い
};

/** 大カテゴリ・小カテゴリから所要時間(分)を決める。未設定は null */
export function durationFor(big: string | null, smalls: string[]): number | null {
  for (const s of smalls) {
    if (s in SMALL_DURATION) return SMALL_DURATION[s];
  }
  if (big && big in BIG_DURATION) {
    const d = BIG_DURATION[big];
    return d > 0 ? d : null;
  }
  return null;
}

export interface Vocabulary {
  /** 大カテゴリ名の一覧 */
  bigs: string[];
  /** 大カテゴリ名 -> 小カテゴリ名の配列 */
  smallsByBig: Record<string, string[]>;
  /** 小カテゴリ名 -> tag_id（place_tags 挿入用） */
  smallId: Record<string, number>;
  /** 大カテゴリ名 -> tag_id */
  bigId: Record<string, number>;
}

/** tags テーブルから語彙を読み込む */
export async function loadVocabulary(env: Env): Promise<Vocabulary> {
  const rows = await env.DB.prepare(
    `SELECT t.id, t.name, t.level, p.name AS parent FROM tags t
       LEFT JOIN tags p ON p.id = t.parent_id`
  ).all<{ id: number; name: string; level: string; parent: string | null }>();

  const vocab: Vocabulary = { bigs: [], smallsByBig: {}, smallId: {}, bigId: {} };
  for (const r of rows.results ?? []) {
    if (r.level === '大') {
      vocab.bigs.push(r.name);
      vocab.bigId[r.name] = r.id;
      vocab.smallsByBig[r.name] ??= [];
    }
  }
  for (const r of rows.results ?? []) {
    if (r.level === '小' && r.parent) {
      (vocab.smallsByBig[r.parent] ??= []).push(r.name);
      vocab.smallId[r.name] = r.id;
    }
  }
  return vocab;
}

export interface TagInput {
  id: string;
  name: string;
  note: string | null;
}
export interface TagAssignment {
  big: string | null;
  smalls: string[];
}

/** Gemini に渡すプロンプト（純関数・テスト対象） */
export function buildTagPrompt(vocab: Vocabulary, places: TagInput[]): string {
  const vocabLines = vocab.bigs
    .map((b) => `- ${b}: ${(vocab.smallsByBig[b] ?? []).join('、') || '(小カテゴリなし)'}`)
    .join('\n');
  const items = places
    .map((p, i) => `${i + 1}. id=${p.id} 名前「${p.name}」メモ「${p.note ?? ''}」`)
    .join('\n');
  return [
    'あなたは店舗・施設の分類器です。各場所に、下の語彙から大カテゴリ1つと小カテゴリ0〜3個を割り当ててください。',
    '必ず語彙内の表記のみを使い、小カテゴリはその大カテゴリに属するものだけを選ぶこと。',
    '当てはまる小カテゴリが無ければ smalls は空配列、判断できなければ big は「その他」。',
    '',
    '# 語彙（大: 小,小,...）',
    vocabLines,
    '',
    '# 場所',
    items,
    '',
    '# 出力',
    'JSON配列のみ。各要素は {"id": string, "big": string, "smalls": string[]}。説明文は不要。',
  ].join('\n');
}

/** Gemini 応答テキストから割り当てを取り出す（純関数・テスト対象） */
export function parseGeminiTags(text: string): Map<string, TagAssignment> {
  const out = new Map<string, TagAssignment>();
  let jsonText = text.trim();
  // ```json ... ``` のコードフェンスを剥がす
  const fence = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) jsonText = fence[1].trim();
  // 先頭の配列部分だけを抽出
  const start = jsonText.indexOf('[');
  const end = jsonText.lastIndexOf(']');
  if (start >= 0 && end > start) jsonText = jsonText.slice(start, end + 1);

  let arr: unknown;
  try {
    arr = JSON.parse(jsonText);
  } catch {
    return out;
  }
  if (!Array.isArray(arr)) return out;
  for (const el of arr) {
    if (!el || typeof el !== 'object') continue;
    const o = el as Record<string, unknown>;
    if (typeof o.id !== 'string') continue;
    const big = typeof o.big === 'string' && o.big ? o.big : null;
    const smalls = Array.isArray(o.smalls)
      ? o.smalls.filter((s): s is string => typeof s === 'string')
      : [];
    out.set(o.id, { big, smalls });
  }
  return out;
}

/** 語彙に照らして割り当てを正規化（語彙外を除去し、小は大に属するものだけ残す） */
export function sanitizeAssignment(
  vocab: Vocabulary,
  a: TagAssignment
): TagAssignment {
  const big = a.big && vocab.bigs.includes(a.big) ? a.big : null;
  const allowed = big ? new Set(vocab.smallsByBig[big] ?? []) : new Set<string>();
  const smalls = a.smalls.filter((s) => allowed.has(s)).slice(0, 3);
  return { big, smalls };
}

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Gemini を呼んでタグを割り当てる。失敗時は空マップ（同期は継続）。 */
export async function generateTags(
  env: Env,
  vocab: Vocabulary,
  places: TagInput[]
): Promise<Map<string, TagAssignment>> {
  if (!env.GEMINI_API_KEY || places.length === 0) return new Map();
  const model = env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  const prompt = buildTagPrompt(vocab, places);
  try {
    const res = await fetch(
      `${GEMINI_ENDPOINT}/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        }),
      }
    );
    if (!res.ok) return new Map();
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const raw = parseGeminiTags(text);
    const clean = new Map<string, TagAssignment>();
    for (const [id, a] of raw) clean.set(id, sanitizeAssignment(vocab, a));
    return clean;
  } catch {
    return new Map();
  }
}

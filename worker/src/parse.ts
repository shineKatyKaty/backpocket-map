/**
 * Google マップ 共有リストの非公式エンドポイント
 *   /maps/preview/entitylist/getlist
 * が返す生データ（XSSI プレフィックス付きのネスト配列）を場所の配列に変換する。
 *
 * ──────────────────────────────────────────────────────────────────────────
 * 【重要】インデックスの前提と、実データでの確定について
 * 設計書では各エントリについて「メモ=index 3 / 座標=index 1 の中 / 保存日時=index 9(UNIX秒)」
 * と確認されている。ただし name / CID / place_id の正確な位置までは固定できていないため、
 * このパーサは「ドキュメント化されたインデックス」＋「ブロック内の深さ優先探索」で
 * 耐性を持たせている。推測で補った箇所は needsReview=true を立てる。
 *
 * 実データ（iPhone 回線で取得した getlist 応答）を worker/test/fixture.json に
 * 置き換えて `npm test` を通せば、下の ENTRY_INDEX を実データに合わせて固定できる。
 * ──────────────────────────────────────────────────────────────────────────
 */
import type { ParsedPlace } from './types';

/** 設計書で確認済みのエントリ内インデックス */
const ENTRY_INDEX = {
  detail: 1, // 座標・CID 等を含むブロック
  name: 2, // 表示名（文字列のことが多い）
  note: 3, // メモ
  savedAt: 9, // 保存日時(UNIX秒)
} as const;

/** 日本の緯度経度のおおよその範囲（lat/lng の順序判定のヒント） */
const JP_LAT = [20, 46] as const;
const JP_LNG = [120, 154] as const;

/** XSSI プレフィックス `)]}'` を剥がして JSON.parse する */
export function stripAndParse(raw: string): unknown {
  let text = raw.trim();
  if (text.startsWith(")]}'")) {
    const nl = text.indexOf('\n');
    text = nl >= 0 ? text.slice(nl + 1) : text.replace(/^\)\]\}'/, '');
  }
  return JSON.parse(text);
}

/** ツリーを深さ優先で走査（配列のみ降りる。Google の生データは配列ネスト） */
function* walk(node: unknown): Generator<unknown> {
  yield node;
  if (Array.isArray(node)) {
    for (const child of node) yield* walk(child);
  }
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function inRange(v: number, lo: number, hi: number): boolean {
  return v >= lo && v <= hi;
}

/** エントリらしさ: index9 がUNIX秒っぽい数値で、index1 が配列 */
function isEntry(e: unknown): e is unknown[] {
  if (!Array.isArray(e) || e.length <= ENTRY_INDEX.savedAt) return false;
  const ts = e[ENTRY_INDEX.savedAt];
  const detail = e[ENTRY_INDEX.detail];
  const tsOk = isFiniteNumber(ts) && ts > 1_000_000_000 && ts < 2_000_000_000;
  return tsOk && Array.isArray(detail);
}

/** 生データから、最もエントリらしい要素を多く含む配列を採用する */
export function findEntries(root: unknown): unknown[][] {
  let best: unknown[][] = [];
  for (const node of walk(root)) {
    if (Array.isArray(node)) {
      const entries = node.filter(isEntry) as unknown[][];
      if (entries.length > best.length) best = entries;
    }
  }
  return best;
}

/** ブロック内から緯度経度ペアを探す。Japan 範囲を手掛かりに lat/lng の順序を補正 */
function findCoords(
  block: unknown
): { lat: number; lng: number; review: boolean } | null {
  let fallback: { lat: number; lng: number; review: boolean } | null = null;
  for (const node of walk(block)) {
    if (!Array.isArray(node)) continue;
    for (let i = 0; i + 1 < node.length; i++) {
      const a = node[i];
      const b = node[i + 1];
      if (!isFiniteNumber(a) || !isFiniteNumber(b)) continue;
      if (a === 0 && b === 0) continue;
      // (lat, lng) 順
      if (inRange(a, JP_LAT[0], JP_LAT[1]) && inRange(b, JP_LNG[0], JP_LNG[1])) {
        return { lat: a, lng: b, review: false };
      }
      // (lng, lat) 順 → 入れ替え
      if (inRange(a, JP_LNG[0], JP_LNG[1]) && inRange(b, JP_LAT[0], JP_LAT[1])) {
        return { lat: b, lng: a, review: false };
      }
      // 日本外: 一応 lat∈[-90,90], lng∈[-180,180] を満たす最初のペアを保留
      if (
        !fallback &&
        inRange(a, -90, 90) &&
        inRange(b, -180, 180) &&
        (Math.abs(a) > 0.1 || Math.abs(b) > 0.1)
      ) {
        fallback = { lat: a, lng: b, review: true };
      }
    }
  }
  return fallback;
}

const DEC_CID = /^(\d{3,}):(\d{3,})$/;
const HEX_CID = /^0x([0-9a-f]+):0x([0-9a-f]+)$/i;
const PLACE_ID = /^ChI[A-Za-z0-9_-]{10,}$/;

/** CID（"数値:数値"）を探す。16進ペア 0x..:0x.. は10進へ変換 */
function findCid(entry: unknown): { id: string; cidNumber: string } | null {
  for (const node of walk(entry)) {
    if (typeof node !== 'string') continue;
    const dec = node.match(DEC_CID);
    if (dec) return { id: `${dec[1]}:${dec[2]}`, cidNumber: dec[2] };
    const hex = node.match(HEX_CID);
    if (hex) {
      try {
        const a = BigInt('0x' + hex[1]).toString();
        const b = BigInt('0x' + hex[2]).toString();
        return { id: `${a}:${b}`, cidNumber: b };
      } catch {
        /* 変換不能なら無視 */
      }
    }
  }
  return null;
}

/** place_id（ChIJ…）を探す */
function findPlaceId(entry: unknown): string | null {
  for (const node of walk(entry)) {
    if (typeof node === 'string' && PLACE_ID.test(node)) return node;
  }
  return null;
}

/** ブロック内から表示名らしい文字列を拾う（URL/CID/placeId/座標表記を除外） */
function findNameFallback(block: unknown): string | null {
  let best: string | null = null;
  for (const node of walk(block)) {
    if (typeof node !== 'string') continue;
    const s = node.trim();
    if (!s) continue;
    if (s.startsWith('http') || s.startsWith('//')) continue;
    if (DEC_CID.test(s) || HEX_CID.test(s) || PLACE_ID.test(s)) continue;
    if (/^[\d.,\s:+-]+$/.test(s)) continue; // 数値・座標のみ
    if (!best || s.length > best.length) best = s;
  }
  return best;
}

function buildGmapsUrl(
  cidNumber: string | null,
  lat: number | null,
  lng: number | null
): string {
  if (cidNumber) return `https://maps.google.com/?cid=${cidNumber}`;
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  return 'https://www.google.com/maps';
}

/** 1 エントリを ParsedPlace に変換 */
export function parseEntry(entry: unknown[]): ParsedPlace | null {
  const detail = entry[ENTRY_INDEX.detail];
  let review = false;

  const cid = findCid(entry);
  const coords = findCoords(detail ?? entry);
  if (!coords) review = true;

  // 名前: 規定インデックス → ブロック内フォールバック
  let name: string | null = null;
  const nameAt = entry[ENTRY_INDEX.name];
  if (typeof nameAt === 'string' && nameAt.trim()) {
    name = nameAt.trim();
  } else {
    name = findNameFallback(detail ?? entry);
    if (name) review = true;
  }
  if (!name) return null; // 名前が取れないエントリは捨てる

  const noteAt = entry[ENTRY_INDEX.note];
  const note = typeof noteAt === 'string' && noteAt.trim() ? noteAt.trim() : null;

  const tsAt = entry[ENTRY_INDEX.savedAt];
  const savedAt = isFiniteNumber(tsAt) ? Math.trunc(tsAt) : null;

  const cidNumber = cid?.cidNumber ?? null;
  const lat = coords?.lat ?? null;
  const lng = coords?.lng ?? null;

  // CID が取れない場合は name+座標から安定IDを生成（needsReview）
  let id = cid?.id ?? null;
  if (!id) {
    id = `noCid:${name}:${lat ?? ''},${lng ?? ''}`;
    review = true;
  }
  if (coords?.review) review = true;

  return {
    id,
    cidNumber,
    name,
    lat,
    lng,
    note,
    placeId: findPlaceId(entry),
    savedAt,
    gmapsUrl: buildGmapsUrl(cidNumber, lat, lng),
    needsReview: review,
  };
}

export interface ParseResult {
  places: ParsedPlace[];
  /** 解析に使ったエントリ数（デバッグ用） */
  entryCount: number;
}

/** getlist 生データ（文字列）→ 場所配列。CID 重複は後勝ちで除去 */
export function parseEntityList(raw: string): ParseResult {
  const root = stripAndParse(raw);
  const entries = findEntries(root);
  const byId = new Map<string, ParsedPlace>();
  for (const e of entries) {
    const p = parseEntry(e);
    if (p) byId.set(p.id, p);
  }
  return { places: [...byId.values()], entryCount: entries.length };
}

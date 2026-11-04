/**
 * Google マップ 共有リストの非公式エンドポイント
 *   /maps/preview/entitylist/getlist
 * が返す生データ（XSSI プレフィックス付きのネスト配列）を場所の配列に変換する。
 *
 * 実データ（2026-11 時点, hl=ja）で確認したエントリ構造（16要素配列）:
 *   entry[1]        … 詳細ブロック
 *     entry[1][4]   … 住所（空文字あり）
 *     entry[1][5]   … [null,null,lat,lng]
 *     entry[1][6]   … [cid前半, cid後半]（10進文字列。後半は符号付き→?cid= 用に符号なし64bit化）
 *     entry[1][7]   … feature id（"/g/..." 等）
 *   entry[2]        … 名前
 *   entry[3]        … メモ（空文字あり）
 *   entry[9]        … [保存日時(UNIX秒), ナノ秒]
 * 位置が多少ずれても動くよう、既知インデックス優先＋ブロック内探索のフォールバックを持つ。
 */
import type { ParsedPlace } from './types';

/** エントリ直下のインデックス */
const IDX = { detail: 1, name: 2, note: 3, saved: 9 } as const;
/** 詳細ブロック(entry[1])内のインデックス */
const DIDX = { address: 4, coords: 5, cid: 6, featureId: 7 } as const;

/** 日本の緯度経度のおおよその範囲（座標フォールバック時の順序判定） */
const JP_LAT = [20, 46] as const;
const JP_LNG = [120, 154] as const;

export function stripAndParse(raw: string): unknown {
  let text = raw.trim();
  if (text.startsWith(")]}'")) {
    const nl = text.indexOf('\n');
    text = nl >= 0 ? text.slice(nl + 1) : text.replace(/^\)\]\}'/, '');
  }
  return JSON.parse(text);
}

function* walk(node: unknown): Generator<unknown> {
  yield node;
  if (Array.isArray(node)) for (const child of node) yield* walk(child);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function inRange(v: number, lo: number, hi: number): boolean {
  return v >= lo && v <= hi;
}

/** エントリらしさ: 長さ十分・entry[1] が配列・entry[2] が非空文字列（＝名前） */
function isEntry(e: unknown): e is unknown[] {
  if (!Array.isArray(e) || e.length < 10) return false;
  return Array.isArray(e[IDX.detail]) && typeof e[IDX.name] === 'string' && (e[IDX.name] as string).trim().length > 0;
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

/** 符号付き10進を符号なし64bit10進へ（?cid= はunsigned） */
function toUnsigned64(v: unknown): string | null {
  try {
    return BigInt.asUintN(64, BigInt(String(v).trim())).toString();
  } catch {
    return null;
  }
}

/** [a,b] の2要素（大きな整数）からCIDを作る */
function cidFromPair(pair: unknown): { id: string; cidNumber: string } | null {
  if (!Array.isArray(pair) || pair.length < 2) return null;
  const a = toUnsigned64(pair[0]);
  const b = toUnsigned64(pair[1]);
  if (!a || !b) return null;
  if (a.length < 15 && b.length < 15) return null; // CIDは十分大きい
  return { id: `${a}:${b}`, cidNumber: b };
}

/** 既知位置→ブロック内探索でCIDペアを探す */
function findCid(detail: unknown, entry: unknown): { id: string; cidNumber: string } | null {
  if (Array.isArray(detail)) {
    const direct = cidFromPair(detail[DIDX.cid]);
    if (direct) return direct;
  }
  for (const node of walk(entry)) {
    const c = cidFromPair(node);
    if (c) return c;
  }
  return null;
}

/** 詳細ブロックから座標を探す。既知位置→Japan範囲で順序補正したフォールバック */
function findCoords(detail: unknown): { lat: number; lng: number; review: boolean } | null {
  if (Array.isArray(detail)) {
    const c = detail[DIDX.coords];
    if (Array.isArray(c) && isFiniteNumber(c[2]) && isFiniteNumber(c[3])) {
      return { lat: c[2], lng: c[3], review: false };
    }
  }
  let fallback: { lat: number; lng: number; review: boolean } | null = null;
  for (const node of walk(detail)) {
    if (!Array.isArray(node)) continue;
    for (let i = 0; i + 1 < node.length; i++) {
      const a = node[i];
      const b = node[i + 1];
      if (!isFiniteNumber(a) || !isFiniteNumber(b) || (a === 0 && b === 0)) continue;
      if (inRange(a, JP_LAT[0], JP_LAT[1]) && inRange(b, JP_LNG[0], JP_LNG[1])) return { lat: a, lng: b, review: false };
      if (inRange(a, JP_LNG[0], JP_LNG[1]) && inRange(b, JP_LAT[0], JP_LAT[1])) return { lat: b, lng: a, review: false };
      if (!fallback && inRange(a, -90, 90) && inRange(b, -180, 180) && (Math.abs(a) > 0.1 || Math.abs(b) > 0.1)) {
        fallback = { lat: a, lng: b, review: true };
      }
    }
  }
  return fallback;
}

const DEC_CID = /^-?\d{3,}:-?\d{3,}$/;
const PLACE_ID = /^(ChI[A-Za-z0-9_-]{10,}|\/g\/[A-Za-z0-9_]+)$/;

function findNameFallback(block: unknown): string | null {
  let best: string | null = null;
  for (const node of walk(block)) {
    if (typeof node !== 'string') continue;
    const s = node.trim();
    if (!s || s.startsWith('http') || s.startsWith('//') || s.startsWith('/g/')) continue;
    if (DEC_CID.test(s) || /^[\d.,\s:+-]+$/.test(s)) continue;
    if (!best || s.length > best.length) best = s;
  }
  return best;
}

/** feature id（entry[1][7] の "/g/..." または ChIJ…）を拾う */
function findFeatureId(detail: unknown): string | null {
  if (Array.isArray(detail) && typeof detail[DIDX.featureId] === 'string') {
    const s = (detail[DIDX.featureId] as string).trim();
    if (PLACE_ID.test(s)) return s;
  }
  return null;
}

/** 保存日時: entry[9] は [秒, ナノ秒] の配列、または数値 */
function extractSavedAt(v: unknown): number | null {
  const n = Array.isArray(v) ? v[0] : v;
  if (isFiniteNumber(n) && n > 1_000_000_000 && n < 2_000_000_000) return Math.trunc(n);
  return null;
}

function buildGmapsUrl(cidNumber: string | null, lat: number | null, lng: number | null): string {
  if (cidNumber) return `https://maps.google.com/?cid=${cidNumber}`;
  if (lat != null && lng != null) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  return 'https://www.google.com/maps';
}

export function parseEntry(entry: unknown[]): ParsedPlace | null {
  const detail = entry[IDX.detail];
  let review = false;

  let name: string | null = null;
  const nameAt = entry[IDX.name];
  if (typeof nameAt === 'string' && nameAt.trim()) name = nameAt.trim();
  else {
    name = findNameFallback(detail ?? entry);
    if (name) review = true;
  }
  if (!name) return null;

  const noteAt = entry[IDX.note];
  const note = typeof noteAt === 'string' && noteAt.trim() ? noteAt.trim() : null;

  const addrAt = Array.isArray(detail) ? detail[DIDX.address] : null;
  const address = typeof addrAt === 'string' && addrAt.trim() ? addrAt.trim() : null;

  const coords = findCoords(detail);
  if (!coords) review = true;
  if (coords?.review) review = true;
  const lat = coords?.lat ?? null;
  const lng = coords?.lng ?? null;

  const cid = findCid(detail, entry);
  const cidNumber = cid?.cidNumber ?? null;

  let id = cid?.id ?? null;
  if (!id) {
    id = `noCid:${name}:${lat ?? ''},${lng ?? ''}`;
    review = true;
  }

  return {
    id,
    cidNumber,
    name,
    lat,
    lng,
    note,
    address,
    placeId: findFeatureId(detail),
    savedAt: extractSavedAt(entry[IDX.saved]),
    gmapsUrl: buildGmapsUrl(cidNumber, lat, lng),
    needsReview: review,
  };
}

export interface ParseResult {
  places: ParsedPlace[];
  entryCount: number;
}

/** getlist 生データ（文字列）→ 場所配列。CID重複は後勝ちで除去 */
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

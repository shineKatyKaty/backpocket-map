/**
 * 保存リスト検索マップ API (Phase 1)
 *   GET  /health            稼働確認
 *   GET  /places            有効な場所一覧（フロントが起動時に取得）
 *   POST /sync              iPhoneショートカットからの同期受け口
 *   GET  /sync/last         直近の同期結果（取り込み画面の履歴用）
 *
 * 認証: /sync は X-Sync-Secret ヘッダが SYNC_SECRET と一致すること。
 *       /places は Cloudflare Access を前提（本API自体はCORS GETを許可）。
 */
import type { Env, PlaceDTO } from './types';
import { parseEntityList } from './parse';
import { applySync, sha256 } from './sync';

const SEP = '\u001f'; // group_concat 区切り（名前と衝突しない制御文字）

function cors(env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Sync-Secret, X-List-Id, X-List-Name, X-Share-Url',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data: unknown, env: Env, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(env) },
  });
}

/** タイミング差を抑えた文字列一致 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function getPlaces(env: Env): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT p.id, p.name, p.name_kana, p.lat, p.lng, p.address, p.note,
            p.gmaps_url, p.place_id, p.duration_auto, p.duration_manual,
            p.interest, p.visited, p.needs_review, p.saved_at,
            (SELECT group_concat(l.name, '${SEP}') FROM place_lists pl
               JOIN lists l ON l.id = pl.list_id WHERE pl.place_id = p.id) AS list_names,
            (SELECT group_concat(t.name, '${SEP}') FROM place_tags pt
               JOIN tags t ON t.id = pt.tag_id WHERE pt.place_id = p.id) AS tag_names
       FROM places p
      WHERE p.archived = 0
      ORDER BY p.saved_at DESC`
  ).all<Record<string, unknown>>();

  const places: PlaceDTO[] = (rows.results ?? []).map((r) => {
    const manual = r.duration_manual as number | null;
    const auto = r.duration_auto as number | null;
    const split = (s: unknown) => (typeof s === 'string' && s ? s.split(SEP) : []);
    return {
      id: r.id as string,
      name: r.name as string,
      name_kana: (r.name_kana as string) ?? null,
      lat: (r.lat as number) ?? null,
      lng: (r.lng as number) ?? null,
      address: (r.address as string) ?? null,
      note: (r.note as string) ?? null,
      gmaps_url: (r.gmaps_url as string) ?? null,
      place_id: (r.place_id as string) ?? null,
      duration: manual ?? auto ?? null,
      interest: (r.interest as '高' | '中' | '低') ?? '中',
      visited: !!r.visited,
      needs_review: !!r.needs_review,
      saved_at: (r.saved_at as number) ?? null,
      lists: split(r.list_names),
      tags: split(r.tag_names),
    };
  });

  return json({ places, count: places.length }, env);
}

async function postSync(req: Request, env: Env): Promise<Response> {
  const secret = req.headers.get('X-Sync-Secret') ?? '';
  if (!env.SYNC_SECRET || !safeEqual(secret, env.SYNC_SECRET)) {
    return json({ error: 'unauthorized' }, env, 401);
  }

  const bodyText = await req.text();
  if (!bodyText.trim()) return json({ error: 'empty body' }, env, 400);

  // body が {raw, listId, listName, shareUrl} の JSON ならそこから、
  // そうでなければ body 全体を getlist 生データとみなす。
  let raw = bodyText;
  let listId = req.headers.get('X-List-Id') ?? 'want-to-go';
  let listName = req.headers.get('X-List-Name') ?? 'Want to go';
  let shareUrl = req.headers.get('X-Share-Url');
  const ct = req.headers.get('Content-Type') ?? '';
  if (ct.includes('application/json')) {
    try {
      const obj = JSON.parse(bodyText) as Record<string, unknown>;
      if (typeof obj.raw === 'string') raw = obj.raw;
      if (typeof obj.listId === 'string') listId = obj.listId;
      if (typeof obj.listName === 'string') listName = obj.listName;
      if (typeof obj.shareUrl === 'string') shareUrl = obj.shareUrl;
    } catch {
      // JSON でなければ raw 扱いのまま続行
    }
  }

  let parsed;
  try {
    parsed = parseEntityList(raw);
  } catch (e) {
    await env.DB.prepare(
      `INSERT INTO sync_runs (payload_hash, list_id, ok, note) VALUES (?, ?, 0, ?)`
    )
      .bind(null, listId, `parse error: ${(e as Error).message}`)
      .run();
    return json({ error: 'parse failed', detail: (e as Error).message }, env, 422);
  }

  if (parsed.places.length === 0) {
    return json(
      { error: 'no places parsed', entryCount: parsed.entryCount, hint: 'getlist の形式が変わった可能性。fixture を更新して ENTRY_INDEX を確認。' },
      env,
      422
    );
  }

  const payloadHash = await sha256(raw);
  const result = await applySync(env, {
    places: parsed.places,
    listId,
    listName,
    shareUrl: shareUrl ?? null,
    payloadHash,
    entryCount: parsed.entryCount,
  });

  return json({ ok: true, hash: payloadHash, ...result }, env);
}

async function getLastSync(env: Env): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT ran_at, list_id, added, updated, archived, total, ok, note
       FROM sync_runs ORDER BY id DESC LIMIT 1`
  ).first();
  return json({ last: row ?? null }, env);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const { pathname } = url;

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(env) });
    }

    try {
      if (req.method === 'GET' && pathname === '/health') {
        return json({ ok: true, ts: Date.now() }, env);
      }
      if (req.method === 'GET' && pathname === '/places') {
        return getPlaces(env);
      }
      if (req.method === 'GET' && pathname === '/sync/last') {
        return getLastSync(env);
      }
      if (req.method === 'POST' && pathname === '/sync') {
        return postSync(req, env);
      }
      return json({ error: 'not found' }, env, 404);
    } catch (e) {
      return json({ error: 'internal', detail: (e as Error).message }, env, 500);
    }
  },
};

/**
 * 保存リスト検索マップ API (Phase 1 + 2)
 *   GET    /health              稼働確認
 *   GET    /places              有効な場所一覧（フロントが起動時に取得）
 *   PATCH  /places/:id          興味度/所要時間(手動)/訪問済み を更新
 *   POST   /places/:id/tags     手動タグ追加 {name} or {tagId}
 *   DELETE /places/:id/tags/:tagId  手動タグ削除
 *   PATCH  /lists/:id           リスト一括設定 {interest}
 *   GET    /tags                タグ語彙（フィルタ/編集用）
 *   POST   /routes              移動時間（Routes APIプロキシ）
 *   POST   /sync                iPhoneショートカットからの同期受け口
 *   GET    /sync/last           直近の同期結果（取り込み画面の履歴用）
 *
 * 認証: /sync は X-Sync-Secret ヘッダが SYNC_SECRET と一致すること。
 *       読み取り/編集系は Cloudflare Access を前提（本APIはCORSを許可）。
 */
import type { Env, PlaceDTO } from './types';
import { parseEntityList } from './parse';
import { applySync, sha256 } from './sync';
import { loadVocabulary } from './tags';
import { computeTravelTimes, validateRoutesRequest } from './routes';

const SEP = '\u001f'; // group_concat 区切り（名前と衝突しない制御文字）

function cors(env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': (env.ALLOW_ORIGIN || '*').replace(/\/+$/, ''),
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** PATCH /places/:id  興味度/手動所要時間/訪問済み を更新（自動値は触らない） */
async function patchPlace(req: Request, env: Env, id: string): Promise<Response> {
  const body = await readJson(req);
  const sets: string[] = [];
  const vals: unknown[] = [];

  if ('interest' in body) {
    const v = body.interest;
    if (v !== '高' && v !== '中' && v !== '低') return json({ error: 'bad interest' }, env, 400);
    sets.push('interest = ?');
    vals.push(v);
  }
  if ('duration_manual' in body) {
    const v = body.duration_manual;
    if (v !== null && (typeof v !== 'number' || v < 0)) return json({ error: 'bad duration' }, env, 400);
    sets.push('duration_manual = ?');
    vals.push(v);
  }
  if ('visited' in body) {
    sets.push('visited = ?');
    vals.push(body.visited ? 1 : 0);
  }
  if (sets.length === 0) return json({ error: 'no fields' }, env, 400);

  sets.push("updated_at = datetime('now')");
  vals.push(id);
  const res = await env.DB.prepare(`UPDATE places SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...vals)
    .run();
  if (!res.meta.changes) return json({ error: 'not found' }, env, 404);
  return json({ ok: true, id }, env);
}

/** POST /places/:id/tags  手動タグ追加 {name} or {tagId} */
async function addTag(req: Request, env: Env, id: string): Promise<Response> {
  const body = await readJson(req);
  let tagId: number | null = typeof body.tagId === 'number' ? body.tagId : null;

  if (tagId == null && typeof body.name === 'string' && body.name.trim()) {
    const name = body.name.trim();
    const found = await env.DB.prepare(`SELECT id FROM tags WHERE name = ?`)
      .bind(name)
      .first<{ id: number }>();
    if (found) {
      tagId = found.id;
    } else {
      // 語彙に無い名前は 小カテゴリ(親なし)の手動タグとして作る
      const ins = await env.DB.prepare(
        `INSERT INTO tags (name, level, parent_id) VALUES (?, '小', NULL)`
      )
        .bind(name)
        .run();
      tagId = Number(ins.meta.last_row_id);
    }
  }
  if (tagId == null) return json({ error: 'name or tagId required' }, env, 400);

  await env.DB.prepare(
    `INSERT OR REPLACE INTO place_tags (place_id, tag_id, source) VALUES (?, ?, 'manual')`
  )
    .bind(id, tagId)
    .run();
  return json({ ok: true, tagId }, env);
}

/** DELETE /places/:id/tags/:tagRef  タグ除去（tagRef は tag_id かタグ名） */
async function removeTag(env: Env, id: string, tagRef: string): Promise<Response> {
  let tagId = Number(tagRef);
  if (!Number.isFinite(tagId)) {
    const found = await env.DB.prepare(`SELECT id FROM tags WHERE name = ?`)
      .bind(tagRef)
      .first<{ id: number }>();
    if (!found) return json({ ok: true }, env); // 該当なしでも成功扱い
    tagId = found.id;
  }
  await env.DB.prepare(`DELETE FROM place_tags WHERE place_id = ? AND tag_id = ?`)
    .bind(id, tagId)
    .run();
  return json({ ok: true }, env);
}

/** PATCH /lists/:id  リスト一括設定 {interest} */
async function patchList(req: Request, env: Env, id: string): Promise<Response> {
  const body = await readJson(req);
  const v = body.interest;
  if (v !== '高' && v !== '中' && v !== '低') return json({ error: 'bad interest' }, env, 400);
  const res = await env.DB.prepare(
    `UPDATE places SET interest = ?, updated_at = datetime('now')
      WHERE id IN (SELECT place_id FROM place_lists WHERE list_id = ?)`
  )
    .bind(v, id)
    .run();
  return json({ ok: true, updated: res.meta.changes ?? 0 }, env);
}

/** GET /tags  語彙 */
async function getTags(env: Env): Promise<Response> {
  const vocab = await loadVocabulary(env);
  return json({ vocab }, env);
}

/** POST /routes  移動時間 */
async function postRoutes(req: Request, env: Env): Promise<Response> {
  if (!env.ROUTES_API_KEY) return json({ error: 'routes unavailable' }, env, 503);
  const parsed = validateRoutesRequest(await readJson(req));
  if (!parsed) return json({ error: 'bad request' }, env, 400);
  try {
    const results = await computeTravelTimes(env, parsed);
    return json({ results, mode: parsed.mode }, env);
  } catch (e) {
    return json({ error: 'routes failed', detail: (e as Error).message }, env, 502);
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const { pathname } = url;

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(env) });
    }

    // APP_SECRET 設定時: /health と /sync 以外は Pages Function 経由（X-App-Secret）必須。
    // 直叩き（素の読み書き）を拒否する。/sync は自前の X-Sync-Secret で守る。
    if (env.APP_SECRET && pathname !== '/health' && pathname !== '/sync') {
      const token = req.headers.get('X-App-Secret') ?? '';
      if (!safeEqual(token, env.APP_SECRET)) return json({ error: 'unauthorized' }, env, 401);
    }

    const seg = pathname.split('/').filter(Boolean).map((s) => decodeURIComponent(s));
    const m = req.method;

    try {
      if (m === 'GET' && pathname === '/health') return json({ ok: true, ts: Date.now() }, env);
      if (m === 'GET' && pathname === '/places') return getPlaces(env);
      if (m === 'GET' && pathname === '/tags') return getTags(env);
      if (m === 'GET' && pathname === '/sync/last') return getLastSync(env);
      if (m === 'POST' && pathname === '/sync') return postSync(req, env);
      if (m === 'POST' && pathname === '/routes') return postRoutes(req, env);

      // /places/:id ...
      if (seg[0] === 'places' && seg[1]) {
        const id = seg[1];
        if (m === 'PATCH' && seg.length === 2) return patchPlace(req, env, id);
        if (m === 'POST' && seg[2] === 'tags' && seg.length === 3) return addTag(req, env, id);
        if (m === 'DELETE' && seg[2] === 'tags' && seg[3]) return removeTag(env, id, seg[3]);
      }
      // /lists/:id
      if (seg[0] === 'lists' && seg[1] && m === 'PATCH' && seg.length === 2) {
        return patchList(req, env, seg[1]);
      }

      return json({ error: 'not found' }, env, 404);
    } catch (e) {
      return json({ error: 'internal', detail: (e as Error).message }, env, 500);
    }
  },
};

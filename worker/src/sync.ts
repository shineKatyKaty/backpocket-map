/**
 * 差分同期。設計書「同期・非機能要件」:
 *   新規: payload にあって DB に無い → 追加
 *   更新: 両方にある → name / note / リスト所属 のみ更新（手動値は保持）
 *   削除: DB(対象リスト)にあって payload に無い → 即削除せず archived=1
 * 手動値 (interest / duration_manual / visited / 手動タグ) は一切触らない。
 */
import type { Env, ParsedPlace } from './types';

export interface SyncResult {
  added: number;
  updated: number;
  archived: number;
  total: number;
  skipped?: boolean;
  entryCount?: number;
}

/** payload のSHA-256（前回と同一なら処理スキップ用） */
export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function ensureList(env: Env, listId: string, listName: string, shareUrl: string | null) {
  await env.DB.prepare(
    `INSERT INTO lists (id, name, share_url) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, share_url = excluded.share_url`
  )
    .bind(listId, listName, shareUrl)
    .run();
}

export async function applySync(
  env: Env,
  opts: {
    places: ParsedPlace[];
    listId: string;
    listName: string;
    shareUrl: string | null;
    payloadHash: string;
    entryCount: number;
  }
): Promise<SyncResult> {
  const { places, listId, listName, shareUrl, payloadHash, entryCount } = opts;

  // 同一ハッシュが直近で成功していればスキップ
  const last = await env.DB.prepare(
    `SELECT payload_hash FROM sync_runs WHERE ok = 1 ORDER BY id DESC LIMIT 1`
  ).first<{ payload_hash: string }>();
  if (last?.payload_hash === payloadHash) {
    const total =
      (await env.DB.prepare(`SELECT COUNT(*) AS c FROM places WHERE archived = 0`).first<{ c: number }>())
        ?.c ?? 0;
    return { added: 0, updated: 0, archived: 0, total, skipped: true, entryCount };
  }

  await ensureList(env, listId, listName, shareUrl);

  // 対象リストに現在ひも付く（アーカイブ含む）既存IDを取得
  const existingRows = await env.DB.prepare(
    `SELECT p.id AS id, p.archived AS archived
       FROM places p JOIN place_lists pl ON pl.place_id = p.id
      WHERE pl.list_id = ?`
  )
    .bind(listId)
    .all<{ id: string; archived: number }>();
  const existing = new Map<string, number>();
  for (const r of existingRows.results ?? []) existing.set(r.id, r.archived);

  const incomingIds = new Set(places.map((p) => p.id));
  let added = 0;
  let updated = 0;
  let archived = 0;

  const stmts: D1PreparedStatement[] = [];

  for (const p of places) {
    const known = existing.has(p.id);
    const alsoInDb = known
      ? true
      : !!(await env.DB.prepare(`SELECT 1 FROM places WHERE id = ?`).bind(p.id).first());

    if (alsoInDb) {
      // 更新: name / note のみ（手動値・座標は保持）。アーカイブ復活も行う。
      stmts.push(
        env.DB
          .prepare(
            `UPDATE places
                SET name = ?, note = ?, gmaps_url = COALESCE(gmaps_url, ?),
                    place_id = COALESCE(place_id, ?), saved_at = COALESCE(saved_at, ?),
                    archived = 0, updated_at = datetime('now')
              WHERE id = ?`
          )
          .bind(p.name, p.note, p.gmapsUrl, p.placeId, p.savedAt, p.id)
      );
      updated++;
    } else {
      // 新規
      stmts.push(
        env.DB
          .prepare(
            `INSERT INTO places
               (id, cid_number, name, lat, lng, note, gmaps_url, place_id, needs_review, saved_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            p.id,
            p.cidNumber,
            p.name,
            p.lat,
            p.lng,
            p.note,
            p.gmapsUrl,
            p.placeId,
            p.needsReview ? 1 : 0,
            p.savedAt
          )
      );
      added++;
    }
    // リスト所属（多対多）
    stmts.push(
      env.DB
        .prepare(`INSERT OR IGNORE INTO place_lists (place_id, list_id) VALUES (?, ?)`)
        .bind(p.id, listId)
    );
  }

  // 削除判定: 対象リストにあって今回の payload に無い → archived=1
  for (const [id, wasArchived] of existing) {
    if (!incomingIds.has(id) && wasArchived === 0) {
      stmts.push(
        env.DB
          .prepare(`UPDATE places SET archived = 1, updated_at = datetime('now') WHERE id = ?`)
          .bind(id)
      );
      archived++;
    }
  }

  stmts.push(
    env.DB
      .prepare(
        `INSERT INTO sync_runs (payload_hash, list_id, added, updated, archived, total, ok, note)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
      )
      .bind(payloadHash, listId, added, updated, archived, places.length, `entries=${entryCount}`)
  );

  await env.DB.batch(stmts);

  const total =
    (await env.DB.prepare(`SELECT COUNT(*) AS c FROM places WHERE archived = 0`).first<{ c: number }>())
      ?.c ?? 0;

  return { added, updated, archived, total, entryCount };
}

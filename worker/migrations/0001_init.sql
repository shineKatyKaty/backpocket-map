-- 保存リスト検索マップ 初期スキーマ
-- 設計書「データモデル」に対応。手動編集値(interest/duration_manual/visited/手動タグ)は
-- 再取り込みで上書きしないよう自動値と別カラムに持つ。

-- 場所（中心テーブル）
CREATE TABLE IF NOT EXISTS places (
  id             TEXT PRIMARY KEY,                 -- CID "数値:数値" を流用
  cid_number     TEXT,                             -- CID 後半。maps.google.com/?cid= に使う
  name           TEXT NOT NULL,
  name_kana      TEXT,                             -- 読み（ひらがな）。曖昧検索用（Phase2で付与）
  lat            REAL,
  lng            REAL,
  address        TEXT,                             -- 逆ジオコーディング（任意・Phase2）
  pref           TEXT,                             -- 都道府県
  city           TEXT,                             -- 市区町村
  note           TEXT,                             -- リスト保存時のコメント
  gmaps_url      TEXT,                             -- Googleマップに戻るリンク
  place_id       TEXT,                             -- Google Place ID（取れれば）
  duration_auto  INTEGER,                          -- 所要時間(分) 自動
  duration_manual INTEGER,                         -- 所要時間(分) 手動（表示はこちら優先）
  interest       TEXT NOT NULL DEFAULT '中'
                 CHECK (interest IN ('高','中','低')),
  visited        INTEGER NOT NULL DEFAULT 0,       -- 訪問済み(boolean)
  needs_review   INTEGER NOT NULL DEFAULT 0,       -- 座標/CID解決が不確実
  archived       INTEGER NOT NULL DEFAULT 0,       -- Googleで削除済み（即削除せずアーカイブ）
  saved_at       INTEGER,                          -- リスト保存日時(UNIX秒)
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Googleマップのリスト
CREATE TABLE IF NOT EXISTS lists (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  share_url  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 1つの場所が複数リストに属せる
CREATE TABLE IF NOT EXISTS place_lists (
  place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  list_id  TEXT NOT NULL REFERENCES lists(id)  ON DELETE CASCADE,
  PRIMARY KEY (place_id, list_id)
);

-- タグ語彙（大/小カテゴリ）。小カテゴリは大カテゴリを parent_id に持つ
CREATE TABLE IF NOT EXISTS tags (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL UNIQUE,
  level     TEXT NOT NULL CHECK (level IN ('大','小')),
  parent_id INTEGER REFERENCES tags(id)
);

-- 場所×タグ。自動付与(auto)と手動付与(manual)を区別
CREATE TABLE IF NOT EXISTS place_tags (
  place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  source   TEXT NOT NULL DEFAULT 'auto' CHECK (source IN ('auto','manual')),
  PRIMARY KEY (place_id, tag_id)
);

-- 同期履歴（ハッシュ一致での重複処理スキップ・取り込み履歴表示に使う）
CREATE TABLE IF NOT EXISTS sync_runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ran_at       TEXT NOT NULL DEFAULT (datetime('now')),
  payload_hash TEXT,
  list_id      TEXT,
  added        INTEGER NOT NULL DEFAULT 0,
  updated      INTEGER NOT NULL DEFAULT 0,
  archived     INTEGER NOT NULL DEFAULT 0,
  total        INTEGER NOT NULL DEFAULT 0,
  ok           INTEGER NOT NULL DEFAULT 1,
  note         TEXT
);

CREATE INDEX IF NOT EXISTS idx_places_archived ON places(archived);
CREATE INDEX IF NOT EXISTS idx_place_lists_list ON place_lists(list_id);
CREATE INDEX IF NOT EXISTS idx_place_tags_place ON place_tags(place_id);

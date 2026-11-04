-- タグ初期語彙（設計書「タグ・所要時間・興味度」）。
-- Phase1 では未使用だが、Phase2 の自動タグ付けで語彙を固定するため先に投入しておく。
-- D1 は巨大な compound SELECT を弾くため、スカラサブクエリ付きの多値 INSERT で入れる。

-- 大カテゴリ
INSERT OR IGNORE INTO tags (name, level, parent_id) VALUES
  ('飲食',     '大', NULL),
  ('ショップ', '大', NULL),
  ('見学',     '大', NULL),
  ('体験',     '大', NULL),
  ('その他',   '大', NULL);

-- 小カテゴリ（親を名前で引いて紐づけ）
INSERT OR IGNORE INTO tags (name, level, parent_id) VALUES
  ('ラーメン',       '小', (SELECT id FROM tags WHERE name = '飲食'     AND level = '大')),
  ('喫茶店',         '小', (SELECT id FROM tags WHERE name = '飲食'     AND level = '大')),
  ('コーヒー',       '小', (SELECT id FROM tags WHERE name = '飲食'     AND level = '大')),
  ('カフェ',         '小', (SELECT id FROM tags WHERE name = '飲食'     AND level = '大')),
  ('居酒屋',         '小', (SELECT id FROM tags WHERE name = '飲食'     AND level = '大')),
  ('パン',           '小', (SELECT id FROM tags WHERE name = '飲食'     AND level = '大')),
  ('書店',           '小', (SELECT id FROM tags WHERE name = 'ショップ' AND level = '大')),
  ('雑貨',           '小', (SELECT id FROM tags WHERE name = 'ショップ' AND level = '大')),
  ('古着',           '小', (SELECT id FROM tags WHERE name = 'ショップ' AND level = '大')),
  ('文具',           '小', (SELECT id FROM tags WHERE name = 'ショップ' AND level = '大')),
  ('美術館',         '小', (SELECT id FROM tags WHERE name = '見学'     AND level = '大')),
  ('博物館',         '小', (SELECT id FROM tags WHERE name = '見学'     AND level = '大')),
  ('寺社',           '小', (SELECT id FROM tags WHERE name = '見学'     AND level = '大')),
  ('建築',           '小', (SELECT id FROM tags WHERE name = '見学'     AND level = '大')),
  ('公園',           '小', (SELECT id FROM tags WHERE name = '見学'     AND level = '大')),
  ('温泉',           '小', (SELECT id FROM tags WHERE name = '体験'     AND level = '大')),
  ('ワークショップ', '小', (SELECT id FROM tags WHERE name = '体験'     AND level = '大')),
  ('アクティビティ', '小', (SELECT id FROM tags WHERE name = '体験'     AND level = '大')),
  ('地名・エリア',   '小', (SELECT id FROM tags WHERE name = 'その他'   AND level = '大'));

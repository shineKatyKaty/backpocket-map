-- タグ初期語彙（設計書「タグ・所要時間・興味度」）。
-- Phase1 では未使用だが、Phase2 の自動タグ付けで語彙を固定するため先に投入しておく。

-- 大カテゴリ
INSERT OR IGNORE INTO tags (name, level, parent_id) VALUES
  ('飲食',     '大', NULL),
  ('ショップ', '大', NULL),
  ('見学',     '大', NULL),
  ('体験',     '大', NULL),
  ('その他',   '大', NULL);

-- 小カテゴリ（親を名前で引いて紐づけ）
INSERT OR IGNORE INTO tags (name, level, parent_id)
SELECT v.name, '小', p.id FROM (
  SELECT 'ラーメン'   AS name, '飲食'     AS parent UNION ALL
  SELECT '喫茶店',        '飲食' UNION ALL
  SELECT 'コーヒー',      '飲食' UNION ALL
  SELECT 'カフェ',        '飲食' UNION ALL
  SELECT '居酒屋',        '飲食' UNION ALL
  SELECT 'パン',          '飲食' UNION ALL
  SELECT '書店',          'ショップ' UNION ALL
  SELECT '雑貨',          'ショップ' UNION ALL
  SELECT '古着',          'ショップ' UNION ALL
  SELECT '文具',          'ショップ' UNION ALL
  SELECT '美術館',        '見学' UNION ALL
  SELECT '博物館',        '見学' UNION ALL
  SELECT '寺社',          '見学' UNION ALL
  SELECT '建築',          '見学' UNION ALL
  SELECT '公園',          '見学' UNION ALL
  SELECT '温泉',          '体験' UNION ALL
  SELECT 'ワークショップ','体験' UNION ALL
  SELECT 'アクティビティ','体験' UNION ALL
  SELECT '地名・エリア',  'その他'
) v
JOIN tags p ON p.name = v.parent AND p.level = '大';

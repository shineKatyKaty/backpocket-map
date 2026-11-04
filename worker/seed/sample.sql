-- ローカル確認用シード（任意）。`npm run seed:local` で投入。
-- 本番には投入しない。実データはショートカット同期で入る。
INSERT OR IGNORE INTO lists (id, name) VALUES ('want-to-go', 'Want to go');

INSERT OR IGNORE INTO places (id, cid_number, name, lat, lng, note, gmaps_url, interest, saved_at)
VALUES
 ('1:1001','1001','喫茶マドラグ',35.0116,135.7681,'静かで作業しやすい。朝が空いてる','https://maps.google.com/?cid=1001','中',1719800000),
 ('1:1002','1002','自家製麺 うえまち',34.6937,135.5023,'行列覚悟。土曜昼','https://maps.google.com/?cid=1002','高',1720500000),
 ('1:1003','1003','東京ソラマチ',35.7100,139.8107,NULL,'https://maps.google.com/?cid=1003','中',1721000000);

INSERT OR IGNORE INTO place_lists (place_id, list_id) VALUES
 ('1:1001','want-to-go'),('1:1002','want-to-go'),('1:1003','want-to-go');

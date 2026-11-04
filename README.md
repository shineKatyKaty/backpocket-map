# backpocket-map（保存リスト検索マップ）

Googleマップの保存リストを取り込み、地図とリストで横断検索する個人用 PWA。
設計書「保存リスト検索マップ 設計書」の **Phase 1（ショートカット同期の受け口＋地図＋リスト表示＋曖昧検索）** を実装したもの。

```
backpocket-map/
├─ frontend/   React + Vite + PWA（地図・リスト・曖昧検索）
└─ worker/     Cloudflare Workers + D1（同期受け口・読み取りAPI）
```

データの流れ:

```
iPhoneショートカット ──POST /sync──▶ Worker ──▶ D1(SQLite)
                                                   │
フロントエンド(PWA) ◀──GET /places────────────────┘
```

> Phase 1 の範囲。タグ自動生成(Gemini)・所要時間/興味度の編集・条件フィルタの本格版・移動時間(Routes API)・意味検索は Phase 2/3。
> スキーマとUIには将来分のカラム/枠を入れてあるが、ロジックは未実装。

---

## 0. 前提

- Node.js 20 以上（未導入ならインストール）。確認: `node -v`
- 取得済み: Google Cloud（Maps JS / Places(New) / Routes 有効化、ブラウザ用APIキー）、Cloudflare アカウント、Gemini キー、この GitHub リポジトリ

---

## 1. Worker（バックエンド）

```bash
cd worker
npm install
```

D1 を作成し、出力された `database_id` を `wrangler.toml` に貼る:

```bash
npx wrangler d1 create backpocket-map
```

マイグレーション適用（ローカル / 本番）:

```bash
npm run migrate:local
npm run migrate:remote
```

同期シークレットを設定:

```bash
# ローカル: worker/.dev.vars を作る（.dev.vars.example をコピー）
# 本番:
npx wrangler secret put SYNC_SECRET
```

ローカル起動（任意でサンプル投入）:

```bash
npm run seed:local   # 動作確認用のダミー3件（任意）
npm run dev          # http://127.0.0.1:8787
```

パーサのテスト:

```bash
npm test
```

デプロイ:

```bash
npm run deploy
```

### API

| メソッド | パス          | 用途 |
| --- | --- | --- |
| GET | `/health`      | 稼働確認 |
| GET | `/places`      | 有効な場所一覧（フロントが起動時に取得） |
| GET | `/sync/last`   | 直近の同期結果 |
| POST | `/sync`       | ショートカットからの同期（要 `X-Sync-Secret`） |

### POST /sync の仕様（iPhoneショートカット用）

- ヘッダ `X-Sync-Secret: <SYNC_SECRET>`（必須）
- ボディは次のどちらか:
  - **生データそのまま**（`getlist` の応答本文）を text で送る。リストは既定で `want-to-go` / `Want to go`。
    別リストなら `X-List-Id` / `X-List-Name` / `X-Share-Url` ヘッダで上書き。
  - **JSON**: `{ "raw": "<getlist応答>", "listId": "...", "listName": "...", "shareUrl": "..." }`
- 応答: `{ ok, hash, added, updated, archived, total, entryCount }`
  - 前回と同一データ（ハッシュ一致）なら `skipped: true` で処理省略
  - 解析0件なら 422（`getlist` の形式変化の可能性 → 下記パーサ注意）

差分の扱い（設計書どおり）: **新規=追加 / 更新=name・note・リスト所属のみ（手動値は保持）/ 削除=即削除せず `archived=1`**。
`interest`・`duration_manual`・`visited`・手動タグは再取り込みで一切上書きしない。

---

## 2. Frontend（PWA）

```bash
cd frontend
npm install
cp .env.example .env.local   # 値を記入
npm run dev                  # http://localhost:5173
```

`.env.local`:

- `VITE_GOOGLE_MAPS_API_KEY` … ブラウザ用キー（localhost 制限）
- `VITE_GOOGLE_MAPS_MAP_ID` … AdvancedMarker 用。未設定なら `DEMO_MAP_ID`
- `VITE_API_BASE` … Worker のURL。**未設定ならバンドルのサンプルデータで動く**（キー無しでもリスト＆検索は確認可能）

ビルド / デプロイ（Cloudflare Pages）:

```bash
npm run build     # dist/ を生成
# Pages のビルド設定: build command = npm run build, output = frontend/dist
```

### 画面（Phase 1）

- 上部: 検索欄＋チップ（興味度 高のみ / 未訪問のみ）
- PC: 左=結果リスト / 右=地図。行ホバーでピン強調、クリックで詳細。
- スマホ: 全画面地図＋ボトムシート（ハンドルで peek / half / full 切替）
- 曖昧検索: name・読み・メモ・タグ・住所を対象。全角半角/カタカナ→ひらがな を正規化し、Fuse.js でタイプミス許容（「きっさ」→喫茶、「ぶっくおふ」→BOOKOFF）
- 詳細: カテゴリ・滞在目安・メモ・住所・保存日と「Googleマップで開く」

---

## 3. パーサについて（重要）

`worker/src/parse.ts` は `getlist` 生データを解析する。設計書で確認済みの
**メモ=index 3 / 座標=index 1 の中 / 保存日時=index 9** を基準に、name・CID・place_id は
ブロック内の深さ優先探索で補完し、推測で補った場所は `needs_review=1` を立てる。

**実データで確定させる手順**（精度を上げたいとき）:

1. iPhone 回線で取得した本物の `getlist` 応答を `worker/test/fixture.txt` に置き換える
2. `cd worker && npm test` で取れ方を確認
3. ずれていれば `parse.ts` 冒頭の `ENTRY_INDEX` を実データに合わせて固定する

---

## 4. 次にやること

- iPhoneショートカット作成（`/sync` ができたので接続可能）。オートメーション「Googleマップを閉じたとき」起動＋手動の「今すぐ同期」
- 確認用 Worker `list-check` は不要になったら削除
- Phase 2: タグ自動生成(Gemini)、所要時間/興味度の編集、条件フィルタ、移動時間(Routes API)、差分再取り込みUI
- Phase 3: PWAオフライン強化、意味検索（埋め込みベクトル）

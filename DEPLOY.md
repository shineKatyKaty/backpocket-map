# デプロイ手順書（Cloudflare）

本番は **Worker（API+D1）を先に** 上げ、次に **Pages（フロント）**、最後に **iPhoneショートカット** の順。
`$` で始まる行はターミナルで実行するコマンド。`<...>` は自分の値に置き換える。
Cloudflare アカウントでの操作が必要な箇所は **【要あなたの操作】** と書く。

前提: Node.js / Wrangler は導入済み（`npx wrangler --version` が動く）。作業ディレクトリは
`D:\documentD\project\backpocket-map`。

---

## A. Worker（API + D1）を本番へ

### A-1. Wrangler でログイン 【要あなたの操作】
```bash
cd D:/documentD/project/backpocket-map/worker
npx wrangler login
```
ブラウザが開くので Cloudflare にログインして許可。`Successfully logged in` が出ればOK。

### A-2. D1 を本番に作成し、ID を wrangler.toml に貼る 【要あなたの操作】
```bash
npx wrangler d1 create backpocket-map
```
出力の `database_id = "xxxxxxxx-...."` をコピーし、`worker/wrangler.toml` の
`database_id = "REPLACE_WITH_YOUR_D1_DATABASE_ID"` を置き換える。
（※ すでに Cloud 側で作成済みなら `npx wrangler d1 list` で ID を確認して貼るだけ）

### A-3. 本番 D1 にスキーマを適用
```bash
npx wrangler d1 migrations apply backpocket-map --remote
```
`0001_init` と `0002_seed_tags` が ✅ になればOK（タグ語彙もここで入る）。

### A-4. シークレットを登録 【要あなたの操作】
```bash
npx wrangler secret put SYNC_SECRET      # 長いランダム文字列を入力
npx wrangler secret put GEMINI_API_KEY   # Google AI Studio のキー
npx wrangler secret put ROUTES_API_KEY   # Google Routes 用キー
```
各コマンドで値の入力を求められる。`GEMINI_MODEL` は wrangler.toml の変数にあるので登録不要。
（`SYNC_SECRET` は後で iPhone ショートカットにも同じ値を入れる。控えておく）

### A-5. デプロイ
```bash
npx wrangler deploy
```
`https://backpocket-map-api.<あなたのサブドメイン>.workers.dev` が表示される。**このURLを控える**。

### A-6. 動作確認
```bash
curl https://backpocket-map-api.<サブドメイン>.workers.dev/health
curl https://backpocket-map-api.<サブドメイン>.workers.dev/places
```
`/health` が `{"ok":true,...}`、`/places` が `{"places":[],"count":0}`（まだ空）ならOK。

### A-7. Cloudflare Access で本人のみに制限 【要あなたの操作】
**保護は「Pages（フロント）」だけに掛ける。APIワーカーには掛けない**
（掛けると iPhone の `/sync` とフロントのAPI取得が壊れる）。手順は B 節のあと、
下記 **E. Pages を Access で保護** を参照。

---

## B. Frontend（PWA）を Cloudflare Pages へ

### B-1. Pages プロジェクトを作成（Git連携） 【要あなたの操作】
Cloudflare ダッシュボード → Workers & Pages → Create → Pages →
Connect to Git → リポジトリ `backpocket-map` を選択。

### B-2. ビルド設定
- Production branch: `main`
- Framework preset: なし（None）
- Build command: `cd frontend && npm install && npm run build`
- Build output directory: `frontend/dist`

### B-3. 環境変数（Settings → Environment variables → Production）【要あなたの操作】
| 変数 | 値 |
| --- | --- |
| `VITE_GOOGLE_MAPS_API_KEY` | 地図用ブラウザキー |
| `VITE_GOOGLE_MAPS_MAP_ID`  | （任意）Map ID。無ければ未設定でOK |
| `VITE_API_BASE` | A-5 の Worker URL（例 `https://backpocket-map-api.xxx.workers.dev`） |

設定後、Deployments → Retry deployment で反映。本番URL `https://<project>.pages.dev` が出る。

### B-4. Worker の CORS 許可を Pages URL に変更
`worker/wrangler.toml` の `ALLOW_ORIGIN` を `https://<project>.pages.dev` に変更して再デプロイ:
```bash
cd D:/documentD/project/backpocket-map/worker
npx wrangler deploy
```

### B-5. Google APIキーの制限にドメイン追加 【要あなたの操作】
Google Cloud Console → 認証情報 → ブラウザキーの「ウェブサイトの制限」に
`https://<project>.pages.dev/*` を追加（localhost はそのまま残す）。

### B-6. 動作確認
`https://<project>.pages.dev` を開く。Access を入れていれば認証後、地図とリストが出る。
右上に「サンプル」バッジが出なければ Worker と繋がっている。

---

## C. iPhone ショートカット（同期の入口）

共有リストの `getlist` 応答を iPhone の回線で取得し、本番 `/sync` に POST する。
（Worker は本文をそのまま生データとして解析し、新規分に Gemini でタグを付ける）

### 事前に用意するもの
- **getlist の取得URL**：共有リストを開いたときに内部で呼ばれる
  `.../maps/preview/entitylist/getlist?...` のURL。最初の検証で使ったものを再利用。
  （再取得する場合：PCのChromeで共有リストを開く→F12→Networkタブ→`getlist`で絞り込み→
  リロード→該当リクエストを右クリック→Copy→Copy URL）
- **SYNC_SECRET**：`wrangler secret put SYNC_SECRET` で登録した値
- **Worker URL**：`https://backpocket-map-api.shinshinkaty.workers.dev`

### ショートカットの中身（Shortcuts アプリで新規作成）
名前：例「保存マップ同期」

1. **URLの内容を取得**（Get Contents of URL）
   - URL：用意した **getlist の取得URL**
   - 方法：GET
   - （もし空やエラーになる場合のみ、ヘッダに `User-Agent: Mozilla/5.0` を足す）
2. **入力からテキストを取得**（Get Text from Input）
   - 入力：手順1の「URLの内容」
   - ※ getlist応答は先頭に `)]}'` が付く“JSONもどき”なので、ここで必ずテキスト化する
3. **URLの内容を取得**（Get Contents of URL）
   - URL：`https://backpocket-map-api.shinshinkaty.workers.dev/sync`
   - 方法：POST
   - ヘッダ：
     - `X-Sync-Secret` = あなたの SYNC_SECRET
     - `Content-Type` = `text/plain`
   - 本文：**テキスト** を選び、手順2の「テキスト」を挿入
4. **通知を表示**（Show Notification）
   - 内容：手順3の「URLの内容」（`{"ok":true,"added":..,"updated":..,"archived":..}` が出れば成功）

### 自動実行（オートメーション）
- Shortcuts →「オートメーション」→ 個人用を作成 → **App** → アプリに「Googleマップ」、
  タイミング「**閉じたとき**」→ この「保存マップ同期」を実行 →「実行の前に尋ねる」をオフ。

### アプリから「今すぐ同期」（任意）
- フロントに `shortcuts://run-shortcut?name=保存マップ同期` へのリンクを置けば、
  アプリ内ボタンからショートカットを起動できる（iOSのみ）。

### 確認
同期が通ると本番 `/places` に場所が増え、新規分は `tags` が付く：
```bash
curl https://backpocket-map-api.shinshinkaty.workers.dev/places
curl https://backpocket-map-api.shinshinkaty.workers.dev/sync/last
```
> 注意：`/sync` に Access をかけるとショートカットが弾かれる。Access は Pages 側だけに。

---

## D. 日常運用
- バックアップ: `npx wrangler d1 export backpocket-map --remote --output backup.sql` を定期的に。
- 仕様変更で取得が壊れたら、本物の `getlist` 応答を `worker/test/fixture.txt` に入れて
  `npm test` → ずれていれば `worker/src/parse.ts` の `ENTRY_INDEX` を調整。
- 以後は main にマージするたび Pages が自動で再デプロイ（Worker は `wrangler deploy` を手動 or CIで）。

## E. Pages を Access で保護（自分だけ開ける）

`backpocket-map.pages.dev` にログイン保護を掛ける。APIワーカーには掛けない。

1. ダッシュボード左メニュー **Zero Trust** を開く（初回はチーム名を決めて Free プランを選択）。
2. **Settings → Authentication → Login methods** に **One-time PIN**（メールOTP）があることを確認
   （無ければ追加）。これで「メールに届くコードでログイン」になる。
3. **Access → Applications → Add an application → Self-hosted**。
4. サブタイプ **パブリックDNS（Public hostname）** を選び、
   - Application name：`保存マップ`
   - Session Duration：`1 week`（長めにすると再ログインが減る）
   - Application domain / Public hostname：`backpocket-map.pages.dev`
5. **ポリシー**：
   - Policy name：`myself`／Action：`Allow`
   - Include：Selector **Emails** ＝ `あなたのメールアドレス`
6. 残りはデフォルトで「次へ／保存」。
7. 確認：シークレットウィンドウで `https://backpocket-map.pages.dev` を開く→Cloudflareの
   ログイン画面→メール入力→届いたコードを入力→アプリが開く。自分以外は弾かれる。

> ショートカットは Worker を直接叩くので Access の影響を受けず、同期は動き続ける。

## トラブルシュート
- フロントが「サンプル」のまま → `VITE_API_BASE` 未設定か、Worker の `ALLOW_ORIGIN` が Pages URL と不一致（CORS）。
- 地図が出ない → `VITE_GOOGLE_MAPS_API_KEY` 未設定、またはキーのドメイン制限に Pages URL 未追加。
- タグが付かない → `GEMINI_API_KEY` 未登録、またはモデル名。現行の有効モデルは `gemini-3.5-flash-lite`。
- `/routes` が 503 → `ROUTES_API_KEY` 未登録。502 → キーの Routes API 制限/課金設定。

# 追加機能 設計書 v2

Nov 5, 2026 · @katy

## 概要

既存の「保存リスト検索マップ」に、以下5点を追加する。

1. **モバイルUI**：検索タグ（フィルタ）を折りたたみ、リストのボトムシートを「1行の厚さ」まで下げられるようにして、地図を広く見せる
2. **ピンの上に名前**を表示（PC/スマホ）
3. **ピンの色を大カテゴリで色分け**（PC/スマホ）
4. **リストの滞在時間を営業時間に差し替え**、営業中かどうかを文字色で表す
5. （可能なら）**リスト右に各場所の画像**

分類すると、**1〜3 はフロントだけ（API費用ゼロ）**、**4・5 は Google Places API が必要（課金あり）**。そこで3フェーズに分ける。

| フェーズ | 内容 | 依存/費用 |
| --- | --- | --- |
| **v2-a** | 1 モバイルUI / 2 ピン名ラベル / 3 ピン色=大カテゴリ | フロントのみ・費用なし |
| **v2-b** | 4 営業時間＋営業中判定 | Places API (New)・課金／スキーマ変更 |
| **v2-c** | 5 画像（任意） | Places Photo・課金／画像キャッシュ |

対象ファイル（既存）：
`frontend/src/components/{MapView,FilterBar,ResultList,SearchBar}.tsx`、`frontend/src/App.tsx`、
`frontend/src/{vocab,filters,api}.ts`、`frontend/src/styles.css`、
`worker/src/{index,sync,places}.ts`（places は新規）、`worker/migrations/0003_*.sql`（新規）。

---

## v2-a. フロントだけで完結する3点

### 1. モバイルUI（フィルタ折りたたみ＋リスト1行）

**目的**：スマホで地図が上下に挟まれてほぼ見えない問題を解消。

**仕様**
- 検索欄の下のフィルタ群（カテゴリチップ・各セレクト・トグル）を、スマホでは**既定で折りたたむ**。検索欄の右に「絞り込み ▾」ボタンを置き、押した時だけ展開。
- ボトムシートの最小段（peek）を**「ハンドル＋1行」**の高さまで下げられるようにする。段階は `peek(1行) / half / full` の3つを維持し、peek でほぼ地図全面にする。
- フィルタを畳むとトップバーが低くなり、地図の可視領域がさらに広がる。

**実装手順**
1. `FilterBar.tsx`：`open: boolean` と `onToggle` を受け取り、`open=false` の間は中身を非表示にする（`className={filtersOpen ? '' : 'collapsed'}`）。
2. `SearchBar.tsx`（または App ヘッダ）：検索欄の行に「絞り込み」トグルボタンを追加。アクティブなフィルタ数のバッジも出すと分かりやすい（`hasActiveFilters` を利用）。
3. `App.tsx`：`filtersOpen` state を追加。スマホ初期値 `false`、PC は常時表示（CSSで出し分け）。
4. `styles.css`：
   - `@media (max-width:768px) { .filterbar.collapsed { display:none } }`
   - `.sheet-peek` の `transform` を「ハンドル＋1行」が見える高さに調整（例 `translateY(calc(100% - 92px))` を実測で詰める）。
   - 折りたたみ時にトップバー高さが縮むので、`.list-pane` の `height` 計算（現 `70vh`）はそのままでOK。

**確認**：スマホ幅で初期表示時、フィルタが畳まれ地図が広い／ハンドルを押すと peek→half→full と切り替わり、peek で1行だけ見える。

### 2. ピンの上に名前ラベル

**目的**：地図上でどの店か一目で分かるようにする。

**仕様**
- マーカーを「名前ラベル＋ピン」の縦積みにする（ラベルはピンの上、白背景・角丸・小さめ）。
- 84件すべてに常時出すと混雑するので、**ズーム閾値**（例 `zoom >= 14`）か**選択/ホバー時**のみラベルを表示。クラスタ時（低ズーム）はラベル非表示（クラスタの件数バッジが出る）。

**実装手順**
1. `MapView.tsx`：`<Pin>` 単体の代わりに、`AdvancedMarker` の子に独自HTMLを描く：
   ```tsx
   <AdvancedMarker position={...} onClick={...}>
     <div className="marker">
       {showLabel && <div className="marker-label">{p.name}</div>}
       <Pin background={color} borderColor="#fff" glyphColor="#fff" scale={...}/>
     </div>
   </AdvancedMarker>
   ```
2. `showLabel` は `zoom >= 14 || active` で決める。ズームは `useMap()` の map から `map.getZoom()` を state 化（`map.addListener('zoom_changed', ...)`）。
3. `styles.css`：`.marker{display:flex;flex-direction:column;align-items:center}` と `.marker-label{...白背景・角丸・font-size 11px・白縁・影・max-width 省略}`。

**注意**：ラベルの `pointerEvents` を `none` にしてクリックはピンに通す。クラスタ利用時、ラベル付きマーカーでも `MarkerClusterer` はそのまま動く（中身がHTMLでも可）。

### 3. ピンの色＝大カテゴリ

**目的**：色で種類が分かるようにする（現在は興味度で色分け）。

**仕様**
- 色は**大カテゴリ**で割り当て。興味度は**ピンの大きさ**で表す（高=大）に役割変更。
- 色割り当て（案）：

  | 大カテゴリ | 色 |
  | --- | --- |
  | 飲食 | `#e4572e`（オレンジ赤） |
  | ショップ | `#2a9d8f`（緑） |
  | 見学 | `#4a6fa5`（青） |
  | 体験 | `#9b5de5`（紫） |
  | その他 | `#9aa5b1`（グレー） |

- 1場所が複数の大カテゴリに該当する場合は**代表1つ**（`placeBigs(vocab, tags)[0]`）。
- 地図の隅に**凡例**（色→カテゴリ名）を小さく出す。

**実装手順**
1. `vocab.ts` か新規 `categoryColor.ts` に `BIG_CATEGORY_COLOR: Record<string,string>` を定義。
2. `MapView.tsx` に `vocab` を prop で渡し、`const big = placeBigs(vocab, p.tags)[0] ?? 'その他'; const color = BIG_CATEGORY_COLOR[big]`。興味度は `scale`（高=1.3 等）に。
3. 凡例コンポーネント `MapLegend` を地図右下に重ねる（任意）。

---

## v2-b. 営業時間＋営業中判定（Places API）

### 目的
リストの「滞在 ◯分」を**営業時間**に差し替え、**営業中か**を文字色で示す（営業中=緑、営業時間外=グレー/赤）。

### データ取得の方針
getlist に営業時間は含まれないため **Google Places API (New)** で取得する（Places API (New) は有効化済み）。

- **解決と取得を1コールで**：各場所について Places **Text Search**（`places:searchText`）を、`textQuery=店名`＋`locationBias`（保存座標の周辺円）で呼び、フィールドマスクに
  `places.id, places.regularOpeningHours, places.businessStatus, places.photos` を指定。
  → これで **place_id・曜日別営業時間・営業状態・写真参照** がまとめて取れる（E でも使う）。
- 取得は **Worker 側**（鍵をブラウザに出さない）。新規 `worker/src/places.ts` に実装。
- **いつ取るか**：`/sync` の新規場所に対してまとめて取得（Gemini タグ付けと同じタイミング）。
  失敗しても同期は継続（営業時間なしで登録、後で再取得）。営業時間は変化が遅いので**月1程度の再取得**で十分。
- **鍵**：`PLACES_API_KEY`（Worker secret）。Places API (New) を許可した、サーバ用キー（IP制限 or 無制限）。

### 営業中かどうかの判定
- D1 には**曜日別の営業時間（periods）**を保存し、**営業中/営業時間外はクライアント側で現在時刻と照合して判定**する（再取得不要・常に最新。祝日は簡易対応で考慮外）。
- `regularOpeningHours.periods` は `{open:{day,hour,minute}, close:{day,hour,minute}}` の配列。これを D1 に JSON で保存。
- クライアント（新規 `frontend/src/hours.ts`）：
  - `isOpenNow(periods, now)`：今の曜日・時刻が周期内か判定（日跨ぎ営業に注意）。
  - `todayLabel(periods, now)`：今日の営業時間帯（例「11:00–20:00」）や「24時間」「定休日」を返す。

### 表示（リスト）
- `ResultList.tsx`：`滞在 ◯分`（`row-dur`）を**削除**し、営業時間行を追加。
  - 文字色：営業中=緑（`--open`）、営業時間外=グレー（`--closed`）、データなし=非表示。
  - 例：`営業中・11:00–20:00`（緑） / `営業時間外・本日 定休`（グレー）。
- 詳細シートにも同様に営業時間を出す。所要時間（滞在）は詳細では残してもよい（編集UIは据え置き or 撤去は好みで）。

### スキーマ変更（`0003_places_hours.sql`）
```sql
ALTER TABLE places ADD COLUMN place_id_resolved TEXT;   -- Places APIで解決した place_id(ChIJ…)
ALTER TABLE places ADD COLUMN opening_hours TEXT;        -- regularOpeningHours.periods のJSON
ALTER TABLE places ADD COLUMN business_status TEXT;      -- OPERATIONAL / CLOSED_TEMPORARILY 等
ALTER TABLE places ADD COLUMN photo_ref TEXT;            -- 代表写真の resource name（v2-c用）
ALTER TABLE places ADD COLUMN places_fetched_at TEXT;    -- 最終取得日時（再取得判定）
```
`GET /places` の返却（`index.ts`）に `opening_hours`（配列）/`business_status` を追加。フロントの `Place` 型にも追加。

### 実装手順
1. マイグレーション `0003` を作成し、ローカル/本番へ `wrangler d1 migrations apply`。
2. `worker/src/places.ts`：`fetchPlaceInfo(env, {name, lat, lng})` → Text Search 1コール → `{placeId, openingHours, businessStatus, photoRef}`。
3. `sync.ts`：新規場所ループで `fetchPlaceInfo` を呼び、`places` に保存（Gemini と同様 try/catch で非致命）。
4. `index.ts` `GET /places`：`opening_hours`・`business_status` を返す。
5. フロント `hours.ts`（`isOpenNow`/`todayLabel`、ユニットテスト付き）。
6. `ResultList.tsx`／`DetailSheet.tsx`：滞在時間→営業時間（色付き）に差し替え。
7. `styles.css`：`--open`（緑）/`--closed`（グレー）を定義。

### コスト・注意
- Places **Text Search（Enterprise+Atmosphere SKU：openingHours/photos を含むため上位SKU）**は1コールの単価が高め。84件×初回＋新規分のみ。**必ずD1にキャッシュ**し、`places_fetched_at` で再取得を月1程度に制限。
- Google Cloud でクォータ上限と予算アラートを設定。
- 祝日・臨時休業は `regularOpeningHours` に出ないことがある（`currentOpeningHours` を使えば当日反映されるが取得が重い）。まずは regular で割り切る。

---

## v2-c. リスト右に画像（任意）

### 目的
各行の右に店のサムネイルを出す。

### 方針
- 写真参照は v2-b の Text Search で得た `places.photos[0].name`（`photo_ref`）を流用（追加コールなし）。
- 画像URLは **Places Photo API**：`https://places.googleapis.com/v1/{photo_ref}/media?maxWidthPx=120`。ただし**鍵が必要＝ブラウザに出せない**ので、**Worker 経由でプロキシ＋キャッシュ**する。
  - 新規エンドポイント `GET /photo/:placeId`（`/api/photo/...` 経由でAccess下）：
    1. D1 から `photo_ref` を引く
    2. Places Photo へサーバ鍵で取得
    3. `Cache-Control: public, max-age=2592000` を付けて返す。さらに Cloudflare の `caches.default` or **R2** に保存して課金を抑える
- フロント `ResultList.tsx`：行右に `<img loading="lazy" src="/api/photo/{id}">`。**IntersectionObserver / `loading=lazy`** で表示分だけ取得。

### コスト・注意
- Place Photo は**取得ごとに課金**。84サムネイル初回＝84リクエスト。**キャッシュ必須**（Cache API か R2 推奨。R2 なら2回目以降ほぼ無料）。
- 画像が無い場所はプレースホルダ表示。
- まずキャッシュ設計（R2バケット）を決めてから着手。費用対効果が合わなければ**見送り可**。

---

## 実装順序（おすすめ）

1. **v2-a**（費用ゼロ・すぐ体感改善）：モバイル折りたたみ → ピン名 → ピン色。小さめのPRで。
2. **v2-b**：先に Google Cloud で Places API (New) のクォータ/予算を設定 → `PLACES_API_KEY` を secret 登録 → マイグレーション0003 → Worker 取得 → フロント表示。
3. **v2-c**：R2 バケット用意（または Cache API のみ）→ `/photo` プロキシ → 遅延読み込み。

各フェーズは独立してデプロイ可能。v2-a はいつでも入れられる。

## 未決事項
- [ ] ピン名ラベルの表示条件：ズーム閾値（14?）か、選択時のみか。実機で混雑具合を見て決定。
- [ ] 営業中判定に祝日を考慮するか（まずは考慮しない）。
- [ ] 画像キャッシュを R2 にするか Cache API だけにするか（コストで判断）。
- [ ] 興味度の新しい見せ方：ピンの大きさだけで足りるか、縁取りも足すか。
- [ ] Places Text Search の名寄せ精度（同名店・移転）。`locationBias` 半径と、取得後に座標が大きく違えば `needs_review` を立てる等の安全策。

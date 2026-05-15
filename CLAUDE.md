# ラボメン図鑑 プロジェクト説明書

このファイルは Claude が新しいセッションを開くたびに自動で読む「プロジェクトの説明書」です。
**最終更新：2026-05-16（R2マイグレーション完了後）**

---

## 🏗️ プロジェクト構成（4つの場所）

```
【1】このパソコン（作業場）
    C:\Users\ke007\.claude\projects\rabomenzukan\

【2】GitHub（設計図の保管庫）
    https://github.com/ke007007/rabomenzukan

【3】Cloudflare Pages（本番・公開中のサイト）
    https://webapp-2-8qy.pages.dev
    Cloudflare Pagesプロジェクト名: webapp-2

【4】Cloudflare R2（画像・PDFファイル倉庫）★2026-05-16 新規導入
    バケット名: rabomenzukan-files
    公開URL: https://pub-c0cad8122f834ed6b7d2d3282fcd34c3.r2.dev
```

---

## 📁 主要ファイルの役割

| ファイル / フォルダ | 役割 |
|---|---|
| `public/static/app.js` | フロントエンドのメインコード（ここを編集する） |
| `src/index.tsx` | バックエンドAPI（Hono）+ スキーマmigration（ここを編集する） |
| `public/static/pdfjs/` | PDF.js ライブラリ（PDFサムネイル生成用、Gitに含まれる） |
| `scripts/copy-pdfjs.mjs` | ビルド前に PDF.js を node_modules → public へコピー |
| `scripts/migrate-base64-to-r2.mjs` | 既存Base64画像をR2に移すスクリプト（再実行可能） |
| `dist/` | ビルド後の完成品（**Gitに含まれない・自動生成**） |
| `wrangler.jsonc` | Cloudflare の設定（R2/D1/var）← **これが優先される** |
| `wrangler.json` | jsoncと同内容（一部ツール用） |
| `wrangler.toml` | jsoncと同内容（互換のため） |
| `backup/` | 本番DBのバックアップ（**Git除外・ローカルのみ**） |
| `ROLLBACK.md` | 緊急時の復旧手順書（非エンジニアでも読める） |

> ⚠️ **wrangler 設定は jsonc/json/toml の3ファイルが揃っている**。R2 や D1 を追加するときは **3つ全部更新** すること（特に `wrangler.jsonc` が優先される）。

---

## 🗄️ データベース（D1）

> ⚠️ **絶対に削除・上書きしないこと！**

| 項目 | 値 |
|---|---|
| DB名 | `webapp-production` |
| DB ID | `3f9e4129-6d5e-4948-8808-2927bf458caf` |
| 種類 | Cloudflare D1（SQLiteベース） |
| 主テーブル | `members`、`tags`、`member_tags`、`core_values` |
| 画像/PDFカラム | `image_url`、`intro_image1`、`intro_image2`、`profile_pdf_url`、`profile_pdf_thumb_url` |

### スキーマ自動マイグレーション
`src/index.tsx` の `ensureSchema()` が `/api/*` リクエスト時に「カラムがなかったら追加する」を自動実行。本番でも自動で適用されるので、新カラム追加は単にコードに足すだけでOK。

---

## 📦 ファイルストレージ（R2）

### 仕組み
- 画像・PDFファイルは **R2 に直接アップロード**、D1 には URL のみ保存
- `/api/upload` エンドポイントが multipart 受信 → R2 put → URL を返す
- 公開URL: `https://pub-c0cad8122f834ed6b7d2d3282fcd34c3.r2.dev/{prefix}/{uuid}.{ext}`
- prefix: `avatar/`、`intro/`、`pdf/`、`pdf-thumb/`、`misc/`

### ローカル開発時の挙動
- `wrangler pages dev` で R2 は **ローカル emulation**（実R2と独立）
- `/api/upload` は localhost からのリクエストを検出すると、URL を `http://localhost:8788/r2/...` に書き換える
- `/r2/*` ルートが R2 バケット（local or remote）からファイルを配信
- これにより、本番R2にゴミを残さずローカル動作確認できる

### 課金安全装置（4種、Cloudflare通知）
1. **請求予算アラート**: $1 で通知 ← 最強の最終防衛
2. **R2 Storage**: 5 GB（無料枠の50%）で通知
3. **R2 Class A Operations**: 50万回（無料枠の50%）で通知
4. **R2 Class B Operations**: 500万回（無料枠の50%）で通知

普段の使い方なら無料枠の数百〜数千倍の余裕。アラートが鳴ったら異常事態。

---

## 💻 ローカル開発の手順

### 1. dev サーバー起動
```bash
npm run build
./node_modules/.bin/wrangler pages dev dist --port 8788 --local --binding R2_PUBLIC_URL=http://localhost:8788/r2
```
→ ブラウザで http://localhost:8788

> 💡 `--binding R2_PUBLIC_URL=http://localhost:8788/r2` を渡すと、アップロード後のURLがローカル経由になり、画像表示までローカルで完結する。

### 2. コードを変更したら
`public/static/app.js` や `src/` を編集 → 毎回ビルドが必要：
```bash
npm run build
```
→ wrangler が自動 reload → ブラウザを Ctrl+Shift+R

### 3. PDF.js の更新（稀）
`npm install pdfjs-dist@latest` した後、自動で `public/static/pdfjs/` にコピーされる（`build` スクリプトに組み込み済み）。

---

## 🚀 本番へのデプロイ手順（必ずこの順番で！）

```
① コードを編集・ローカルで動作確認

② GitHub に保存
   git add .
   git commit -m "変更内容のメモ"
   git push

③ 本番に反映 ← ⚠️ これを忘れると本番は変わらない
   npm run build
   ./node_modules/.bin/wrangler pages deploy dist --project-name webapp-2 \
     --commit-dirty=true --commit-message="your message in english"

④ 本番サイト https://webapp-2-8qy.pages.dev で動作確認
```

> **ポイント:** GitHub push だけでは本番は変わらない。`wrangler pages deploy` まで実行して初めて反映。
> **OAuth:** wrangler deploy の初回は OAuth が必要 → オーナーのターミナルで実行が必要（Claude の非対話Bashだと止まる）。

---

## 🛡️ 安全装置と緊急時の戻し方

### バックアップ
- **`backup/db_backup_BEFORE_R2_20260515.sql`** (43 MB)：R2移行直前の完全スナップショット
- 取得コマンド: `wrangler d1 export webapp-production --remote --output=backup/db_backup_xxxx.sql`

### ロールバック手順
**[ROLLBACK.md](./ROLLBACK.md)** に症状別の対処を記載：
- 手順1: フロントだけ revert（数分）
- 手順2: R2機能ごと無効化
- 手順3: D1 を完全復元（最終手段）
- 手順4: R2 を一旦切り離す

### 緊急時の鉄則
- 慌てて `git reset --hard` や `rm -rf` を打たない
- ROLLBACK.md を読みながら一歩ずつ
- 自信がなければ何もせず Claude を呼ぶ

---

## 🛠️ よくあるトラブル

### ブラウザに変更が反映されない
→ `npm run build` を実行したか確認
→ ブラウザを Ctrl+Shift+R でハード再読み込み

### `wrangler pages dev` で R2 バインディングが認識されない
→ wrangler.jsonc に R2 設定があるか確認
→ wrangler.toml に書いても効かない（**jsonc が優先**される）
→ wrangler.jsonc に `r2_buckets` と `vars` を追記

### アップロードが HTTP 500 で失敗する
→ 画像が巨大すぎる場合：`resizeImageToDataUrl()` が動いてるか確認（フロント側で512/1280pxにリサイズ）
→ R2バインディングが env に渡ってない場合：上記の wrangler.jsonc を確認

### `--r2 FILES` CLI フラグだけだと動かない
→ wrangler 4.40 のクセで「リスト表示はされるが env に渡らない」
→ `wrangler.jsonc` の `r2_buckets` 経由で設定するのが正解

### デプロイ時に「Invalid commit message」エラー
→ Cloudflare Pages が git の日本語メッセージで失敗するケース
→ `--commit-message="english message"` を明示的に渡せばOK

### ローカルDBのインポートがハングする
→ 本番DBバックアップは画像データが残ってるとまだ重い（43MB）
→ 純粋なテストなら `backup/db_backup_no_images.sql` を使う（0.2MB）
→ インポート前に `.wrangler/state/v3/d1/` を削除してリセット

---

## 🏛️ 技術スタック（2026-05-16 現在）

| 項目 | 技術 |
|---|---|
| フレームワーク | Hono（バックエンド）+ バニラJS（フロントエンド） |
| ビルドツール | Vite + `@hono/vite-build/cloudflare-pages` |
| DBツール | Wrangler CLI（4.40.0、4.92.0 が最新） |
| ホスティング | Cloudflare Pages |
| DB | Cloudflare D1（SQLite） |
| ファイルストレージ | **Cloudflare R2**（オブジェクトストレージ）★ |
| PDF描画 | **pdfjs-dist 5.7.284**（自前バンドル、CDN不使用）★ |

★ 2026-05-16 のR2移行で追加

---

## 📝 直近の変更履歴

### 2026-05-16
- **R2 移行プロジェクト完了**
  - R2バケット `rabomenzukan-files` 作成（APAC、公開URL有効）
  - 課金アラート4種を Cloudflare 通知に設定
  - `/api/upload` エンドポイント実装
  - `/r2/*` プロキシ実装（local dev でも実画像表示が動く）
  - PDF.js を `npm install pdfjs-dist` で導入
  - **PDFアップロード時に1ページ目を自動サムネイル化** → R2に保存
  - 詳細ページでPDFを表紙画像つき表示
  - 既存63件のBase64画像を R2 にマイグレーション（**失敗0**）
  - `/api/members` のレスポンスサイズが **37MB → 159KB（230倍軽量化）**
- 完全DBバックアップ取得（`backup/db_backup_BEFORE_R2_20260515.sql`）
- ROLLBACK.md 作成

### 2026-05-15
- 画像自動リサイズ機能（Canvas API、アバター512px / 自己紹介1280px）
- Google Drive 共有URLの自動正規化（`lh3.googleusercontent.com` 形式に変換）
- 画像読み込み失敗時の onError フォールバック（`imgWithFallback`）
- 井筒シン / 鴨志田 沙織 の画像データ手動修正

---

## 🔑 重要なファイル参照リンク

- フロント全体: `public/static/app.js`
  - 画像/PDFアップロードヘルパー: `uploadBlobToR2()`、`resizeImageToDataUrl()`、`renderPdfFirstPageToJpeg()`、`loadPdfJs()`
  - URL正規化: `normalizeImageUrl()`、`imgWithFallback()`
- バックエンド: `src/index.tsx`
  - スキーマ: `ensureSchema()`
  - アップロード API: `app.post('/api/upload', ...)`
  - R2プロキシ: `app.get('/r2/*', ...)`
- ロールバック: `ROLLBACK.md`
- マイグレーション再実行: `node scripts/migrate-base64-to-r2.mjs --help`

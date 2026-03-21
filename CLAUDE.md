# ラボメン図鑑 プロジェクト説明書

このファイルは Claude が新しいセッションを開くたびに自動で読む「プロジェクトの説明書」です。

---

## 🏗️ プロジェクト構成（3つの場所）

```
【1】このパソコン（作業場）
    C:\Users\ke007\.claude\projects\rabomenzukan\

【2】GitHub（設計図の保管庫）
    https://github.com/ke007007/rabomenzukan

【3】Cloudflare（本番・公開中のサイト）
    https://webapp-2-8qy.pages.dev
    Cloudflare Pagesプロジェクト名: webapp-2
```

---

## 📁 主要ファイルの役割

| ファイル | 役割 |
|---|---|
| `public/static/app.js` | フロントエンドのメインコード（ここを編集する） |
| `src/` | バックエンドAPIのコード（ここを編集する） |
| `dist/` | ビルド後の完成品（**Gitに含まれない・自動生成される**） |
| `wrangler.toml` | Cloudflare の設定ファイル |
| `backup/` | 本番DBのバックアップ |

---

## 🗄️ データベース（D1）

> ⚠️ **絶対に削除・上書きしないこと！**

| 項目 | 値 |
|---|---|
| DB名 | `webapp-production` |
| DB ID | `3f9e4129-6d5e-4948-8808-2927bf458caf` |
| 種類 | Cloudflare D1（SQLiteベースのサーバーレスDB） |

---

## 💻 ローカル開発の手順

### 1. ローカルサーバーを起動する
```bash
npm run build
./node_modules/.bin/wrangler pages dev dist
```
→ ブラウザで http://localhost:8788 を開いて確認できる

### 2. コードを変更したら
`public/static/app.js` や `src/` を編集した後、毎回ビルドが必要：
```bash
npm run build
```
→ その後ブラウザをCtrl+Shift+Rでリロードして確認

---

## 🚀 本番へのデプロイ手順（必ずこの順番で！）

```
① コードを編集・ローカルで動作確認

② GitHub に保存（設計図を保管庫に送る）
   git add .
   git commit -m "変更内容のメモ"
   git push

③ 本番に反映（完成品をCloudflareに届ける）← ⚠️ これを忘れると本番は変わらない！
   npm run build
   ./node_modules/.bin/wrangler pages deploy dist --project-name webapp-2

④ 本番サイト https://webapp-2-8qy.pages.dev で動作確認
```

> **ポイント:** GitHub push だけでは本番は変わらない。`wrangler pages deploy` まで実行して初めて本番に反映される。

---

## 🛠️ よくあるトラブル

### ブラウザに変更が反映されない
→ `npm run build` を実行したか確認する（`public/static/app.js` を編集しただけでは反映されない）
→ ブラウザを Ctrl+Shift+R でハード再読み込みする

### ローカルDBのインポートがハングする
→ 本番DBバックアップ（32MB）は画像データが含まれていて重すぎる
→ `backup/db_backup_no_images.sql`（0.2MB・画像なし軽量版）を使う
→ インポート前に `.wrangler/state/v3/d1/` フォルダを削除してリセットする

---

## 🏛️ 技術スタック

| 項目 | 技術 |
|---|---|
| フレームワーク | Hono（バックエンド）+ バニラJS（フロントエンド） |
| ビルドツール | Vite + `@hono/vite-build/cloudflare-pages` |
| DBツール | Wrangler CLI（バージョン4.40.0） |
| ホスティング | Cloudflare Pages |
| DB | Cloudflare D1 |
| 画像保存 | Base64テキストとしてD1に保存 |

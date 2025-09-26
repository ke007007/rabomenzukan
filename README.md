# ラボメン図鑑（Cloudflare Pages + Hono + D1）

## 概要
- 目的: ラボメンのプロフィール管理（一覧/詳細/編集/対話）、相関図、ワードクラウドの可視化を、API駆動＋D1永続化で提供
- スタック: Cloudflare Pages + Hono、D1(SQLite) 永続化、Tailwind CSS/CDN、Font Awesome/CDN、vanilla JS SPA(hash routing)、D3.js v7(ESM)
- 特記事項: SVG描画の安定化（viewBoxフォールバック、ResizeObserver+rAF、zoom identity、getBBoxオートフィット、SVG NS、xlink:href、defs/clipPath）

## 現状の公開（サンドボックス）
- Dev URL: https://3000-iww0m0oza24fft701yra3-6532622b.e2b.dev
  - 一覧: `#/`
  - 追加: `#/add`
  - 編集: `#/edit/:id`
  - 詳細: `#/member/:id`
  - 対話（コアバリュー収集）: `#/dialogue`
  - 相関図: `#/correlation`（初期はリンク非表示／タグ選択で出現、カテゴリ別色: sky=興味, blue=関わり, emerald=活動エリア）
  - ワードクラウド: `#/core-values`（重なり回避、ズーム/ドラッグ対応）

## 完了した主要機能
- フロント完全API駆動化
  - state.tags: {interest, involvement, area} をAPIからロード
  - state.loading で簡易ローディング表示
  - init() → api.refreshAll() 実行（失敗時はseedにフォールバック）
  - TagInput: 既存タグ候補（API）＋Enterで新規追加
  - Form: create/update/delete をAPI化
  - Dialogue: コアバリューの追加/削除をAPI化
- 相関図
  - 初期リンク非表示→タグ選択で表示
  - カテゴリ別リンク色/太さ、ツールチップ、凡例
  - 名前ラベル、アバターのプレースホルダ
  - PNG出力は削除（要望反映）
- ワードクラウド
  - forceCollideによる重なり回避、ズーム/ドラッグ
  - デバッグ枠はデフォルト非表示、PNG出力は削除
- 一覧/詳細/編集
  - preferredName の簡潔表示、モバイル最適化、アバター混在
  - 編集フォームに画像推奨サイズ注釈
  - 活動エリアタグ（都道府県/エリア/海外）対応

## API（Hono）
- GET /api/members
  - 返却: members（interestTags/involvementTags/areaTags/coreValuesTags を整形済み）
- POST /api/members
  - body: { id?, name, preferredName, imageUrl, occupation, whyLab, whatToDo, interestTags[], involvementTags[], areaTags[] }
- PUT /api/members/:id
- DELETE /api/members/:id
  - 安全策として member_tags/core_values を先に削除
- POST /api/member/:id/core-values
  - body: { value, author }
- DELETE /api/member/:id/core-values?value=...&author=...
- GET /api/tags?category=interest|involvement|area

## データモデル（D1）
- members(id TEXT PK, name, preferred_name, image_url, occupation, why_lab, what_to_do, created_at)
- tags(id INTEGER PK, name TEXT, category TEXT CHECK IN('interest','involvement','area'), UNIQUE(name,category))
- member_tags(member_id TEXT, tag_id INTEGER, PK(member_id,tag_id))
- core_values(id INTEGER PK, member_id TEXT, value TEXT, author TEXT, created_at)
- インデックス: idx_member_tags_member, idx_member_tags_tag, idx_tags_category, idx_core_values_member

## ローカル開発（サンドボックスと同等）
1) 依存関係取得
```
npm install
```
2) D1マイグレーション＋シード（ローカル）
```
npm run db:migrate:local
npm run db:seed   # 2回目以降はUNIQUE制約エラーに注意（重複投入防止）
```
3) ビルド
```
npm run build
```
4) 起動（PM2 + wrangler pages dev）
```
pm2 start ecosystem.config.cjs
# 以降、PM2でログ確認:
pm2 logs --nostream
```
- ecosystem.config.cjs は `--d1=webapp-production --local --persist-to .wrangler` を使用（ローカルDBを固定）

## デプロイ（Cloudflare Pages）
- 事前に Cloudflare API Token を設定（本環境では Deploy タブから）
- 本番デプロイ例
```
npm run deploy
# もしくはプロジェクト名指定
npm run deploy:prod
```

## 動作確認チェックリスト（E2E）
- CRUD: 追加→一覧反映→編集→詳細→削除
- タグ候補: 既存タグから選択＋Enterで新規追加
- 相関図: タグを選択すると共通タグでリンク表示（色/太さ/ツールチップ/凡例）
- ワードクラウド: コアバリュー追加/削除の反映、重なり回避
- 活動エリアタグ: 一覧/詳細/編集/相関図に反映

## 開発メモ
- Debugオーバーレイ: Shift + D でトグル or `#/path?debug=1`
- CDNのTailwindは本番非推奨。Pages本番化時はビルド導入検討

## スクリプト一覧
- `npm run build` / `npm run preview` / `npm run deploy`
- DB: `npm run db:migrate:local` / `npm run db:seed` / `npm run db:reset` / `npm run db:console:local`

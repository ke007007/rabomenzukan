# 🚨 緊急時ロールバック手順書

このファイルは「R2導入後、何かおかしくなった時に **完全に元の状態に戻す** ための手順」です。

オーナー（非エンジニア）が一人でも対処できるよう、コピペで実行できるコマンド形式で記述しています。

---

## 📅 バックアップ取得履歴

| 日付 | ファイル | サイズ | 内容 |
|---|---|---|---|
| 2026-05-15 | `backup/db_backup_BEFORE_R2_20260515.sql` | 43 MB | **R2導入直前**の完全バックアップ。83人分・画像Base64含む全データ |
| 2026-03-20 | `backup/db_backup_remote_20260320.sql` | 33 MB | 古いバックアップ（保管用） |

---

## 🩹 症状別 対処マップ

### 症状A：本番サイトを開いてもメンバー一覧が出ない / エラー画面

**まず試す**: ブラウザを Ctrl+Shift+R でハードリロード

直らなければ → 「[手順1] フロントを直前のコミットに戻す」へ

### 症状B：画像が壊れアイコン（broken image）で表示される

→ 「[手順1] フロントを直前のコミットに戻す」を試す

戻して直れば原因はフロント。直らなければ → 「[手順2] R2機能ごと無効化」

### 症状C：保存しようとすると「保存に失敗しました」

→ ブラウザのDevTools（F12）→ Networkタブ → 失敗してるリクエストのstatusを確認
- 500: バックエンド/D1の問題 → 「[手順1] フロントを直前のコミットに戻す」
- 413: ペイロード過大 → 画像サイズが大きすぎる（クライアント側リサイズ機能が動いていない可能性）

### 症状D：データが消えてる / メンバーが少ない / 中身がおかしい

→ **これが一番怖いやつ**。冷静に「[手順3] バックアップからD1完全復元」へ

### 症状E：R2のファイルが見えない・アクセスできない

→ R2バケットの公開設定 or CORS設定の問題。「[手順4] R2を一旦切り離す」

---

## [手順1] フロントを直前のコミットに戻す（最も軽い対処）

GitHub と Cloudflare Pages の状態を、R2導入前のコミット `6971d40` に戻します。
**DBには一切触れません**。

```bash
# 1. 現状を確認
git log --oneline -10

# 2. R2導入前のコミット (6971d40) に戻す
git revert HEAD --no-edit
# ↑ または直接そのコミットにrevertする
# git checkout 6971d40 -- public/static/app.js src/index.tsx wrangler.toml

# 3. ビルドして本番にデプロイ
npm run build
./node_modules/.bin/wrangler pages deploy dist --project-name webapp-2 --commit-dirty=true --commit-message="rollback to pre-R2 state"
```

**所要時間: 3〜5分**

---

## [手順2] R2機能を全部無効化（手順1で直らなかった場合）

R2に関係するコミットを全部巻き戻して、画像Base64保存方式に完全に戻します。

```bash
# 1. R2導入前のコミットIDを確認
# 6971d40 = "fix(image): auto-resize uploaded images to fit Cloudflare D1 row limit"
# これより後がR2関連のコミット

# 2. 強制的にそのコミット状態に戻す（注意：それ以降の変更は失われる）
git reset --hard 6971d40

# 3. リモート（GitHub）にも反映
git push --force-with-lease origin main

# 4. ビルド・デプロイ
npm run build
./node_modules/.bin/wrangler pages deploy dist --project-name webapp-2 --commit-dirty=true --commit-message="full rollback to pre-R2"
```

**所要時間: 5分**
**注意**: 手順実行後はR2導入関連のコミットがGitHubから消えます。

---

## [手順3] バックアップからD1完全復元（最終手段）

D1のデータが壊れた・消えた時の最終手段。**画像も含めて 2026-05-15 時点の状態に完全に戻ります**。

⚠️ この手順は、それ以降に登録・編集された新規データが失われます。

```bash
# 1. 念のため現在の状態をバックアップ（壊れていてもOK）
./node_modules/.bin/wrangler d1 export webapp-production --remote --output=backup/db_emergency_before_restore_$(date +%Y%m%d).sql

# 2. バックアップから復元（数分かかります）
./node_modules/.bin/wrangler d1 execute webapp-production --remote --file=backup/db_backup_BEFORE_R2_20260515.sql

# 3. 復元できたか確認
./node_modules/.bin/wrangler d1 execute webapp-production --remote --command="SELECT COUNT(*) FROM members"
# → 83 が返れば成功
```

**所要時間: 10〜15分**

---

## [手順4] R2を一旦切り離す（R2側だけの問題のとき）

```bash
# wrangler.toml のR2バインディング行をコメントアウト
# (具体的な行は wrangler.toml を直接編集)

# ビルド・デプロイ
npm run build
./node_modules/.bin/wrangler pages deploy dist --project-name webapp-2 --commit-dirty=true --commit-message="disable R2 temporarily"
```

R2に格納されたファイルは消えません。あとで R2 を再度有効化すればまた使えます。

---

## 🆘 困ったら

1. 上記の手順で対応できなさそう、または怖い場合は **何もしないで助けを呼ぶ** のが正解
2. 慌てて削除コマンドや `--force` を打たない
3. 一旦深呼吸して、現状をスクリーンショットで保存しておく

---

## 📋 R2 関連コミット履歴（追記していく）

> 作業が進むごとにここに追記します

- (まだなし — これからの作業)

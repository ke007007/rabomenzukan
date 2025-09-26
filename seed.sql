-- Seed members (ids are strings)
INSERT INTO members (id, name, preferred_name, image_url, occupation, why_lab, what_to_do, created_at) VALUES
  ('1', '山田 太郎', 'たろう', '', 'コミュニティ運営 / DX支援', '多様な人と学び合う場を作りたい', '相互学習の仕組みづくりを実験', datetime('now')),
  ('2', '佐藤 花子', 'はな', '', '農業 / アート', '地域に根差した実践を広げたい', '虹ファームの仲間を増やす', datetime('now')),
  ('3', '鈴木 一郎', 'いちろう', '', '教育支援 / 文化企画', '学びの土壌を広げたい', '文化×教育のプロジェクトを立ち上げる', datetime('now')),
  ('4', '高橋 真由', 'まゆ', '', '組織開発 / コミュニティ', '実験と検証の場を作る', 'コミュニティの評価指標づくり', datetime('now')),
  ('5', '田中 健', 'けん', '', '音楽 / テクノロジー', 'テクノロジーで表現を拡張したい', '音楽×AIのセッション', datetime('now'));

-- Seed tags (interest)
INSERT OR IGNORE INTO tags (name, category) VALUES
  ('組織開発','interest'),('教育','interest'),('音楽','interest'),('農業','interest'),('サステナビリティ','interest'),('文化','interest'),('コミュニティ','interest'),('テクノロジー','interest');

-- Seed tags (involvement)
INSERT OR IGNORE INTO tags (name, category) VALUES
  ('ラボ運営','involvement'),('メンター','involvement'),('参加者','involvement');

-- Seed tags (area)
INSERT OR IGNORE INTO tags (name, category) VALUES
  ('京都','area'),('関西','area'),('千葉','area'),('関東','area'),('東京','area'),('大阪','area'),('海外/バンコク','area');

-- Relations (member_tags)
-- helper to look up tag ids by name+category
WITH
  t AS (SELECT id, name, category FROM tags)
INSERT OR IGNORE INTO member_tags (member_id, tag_id)
SELECT '1', id FROM t WHERE (name, category) IN (('組織開発','interest'),('教育','interest'),('音楽','interest'),('ラボ運営','involvement'),('メンター','involvement'),('京都','area'),('関西','area'));

WITH t AS (SELECT id, name, category FROM tags)
INSERT OR IGNORE INTO member_tags (member_id, tag_id)
SELECT '2', id FROM t WHERE (name, category) IN (('農業','interest'),('サステナビリティ','interest'),('文化','interest'),('参加者','involvement'),('千葉','area'),('関東','area'));

WITH t AS (SELECT id, name, category FROM tags)
INSERT OR IGNORE INTO member_tags (member_id, tag_id)
SELECT '3', id FROM t WHERE (name, category) IN (('教育','interest'),('文化','interest'),('音楽','interest'),('メンター','involvement'),('参加者','involvement'),('東京','area'),('関東','area'));

WITH t AS (SELECT id, name, category FROM tags)
INSERT OR IGNORE INTO member_tags (member_id, tag_id)
SELECT '4', id FROM t WHERE (name, category) IN (('組織開発','interest'),('サステナビリティ','interest'),('コミュニティ','interest'),('ラボ運営','involvement'),('大阪','area'),('関西','area'));

WITH t AS (SELECT id, name, category FROM tags)
INSERT OR IGNORE INTO member_tags (member_id, tag_id)
SELECT '5', id FROM t WHERE (name, category) IN (('音楽','interest'),('テクノロジー','interest'),('教育','interest'),('参加者','involvement'),('海外/バンコク','area'));

-- Core values
INSERT INTO core_values (member_id, value, author, created_at) VALUES
  ('1', '挑戦', 'けいた', datetime('now')),
  ('1', 'つながり', 'けいた', datetime('now')),
  ('2', '共創', 'けいた', datetime('now')),
  ('2', '誠実', 'Aさん', datetime('now')),
  ('3', '挑戦', 'Bさん', datetime('now')),
  ('3', '共創', 'Bさん', datetime('now')),
  ('4', '学び', 'Cさん', datetime('now')),
  ('4', '誠実', 'Cさん', datetime('now')),
  ('5', '探究', 'Dさん', datetime('now')),
  ('5', 'つながり', 'Dさん', datetime('now'));

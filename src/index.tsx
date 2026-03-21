import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

// Bindings type for D1
type Bindings = { DB: D1Database }

const app = new Hono<{ Bindings: Bindings }>()

// CORS for API (safe even if same-origin)
app.use('/api/*', cors())

// Serve static assets from public/
app.use('/static/*', serveStatic({ root: './public' }))

// ---------- Ensure schema (dev/preview safety) ----------
const ensureSchema = async (db: D1Database) => {
  // Add new columns if not exist (SQLite doesn't support IF NOT EXISTS for columns)
  for (const col of ['intro_image1 TEXT', 'intro_image2 TEXT', 'youtube_url1 TEXT', 'youtube_url2 TEXT']) {
    try { await db.prepare(`ALTER TABLE members ADD COLUMN ${col}`).run() } catch (_) {}
  }
  // Create tables and indexes if they do not exist (idempotent)
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      preferred_name TEXT,
      image_url TEXT,
      occupation TEXT,
      why_lab TEXT,
      what_to_do TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('interest','involvement','area')),
      UNIQUE(name, category)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS member_tags (
      member_id TEXT NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (member_id, tag_id),
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS core_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id TEXT NOT NULL,
      value TEXT NOT NULL,
      author TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_member_tags_member ON member_tags(member_id)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_member_tags_tag ON member_tags(tag_id)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_tags_category ON tags(category)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_core_values_member ON core_values(member_id)`),
  ])
}

// Run ensureSchema for all API routes (no-op if already migrated)
app.use('/api/*', async (c, next) => { try { await ensureSchema(c.env.DB) } catch (_) {} return next() })

// ---------- API: Members & Tags (D1) ----------

// GET /api/members - list with grouped tags and core values
app.get('/api/members', async (c) => {
  const db = c.env.DB
  // Fetch members
  const membersRes = await db.prepare(
    `SELECT id, name, preferred_name as preferredName, image_url as imageUrl, occupation, why_lab as whyLab, what_to_do as whatToDo, created_at,
            facebook_url as facebookUrl, instagram_url as instagramUrl, x_url as xUrl, website_url1 as websiteUrl1, website_url2 as websiteUrl2
     FROM members
     ORDER BY created_at DESC`
  ).all()
  const members = (membersRes.results || []) as any[]
  if (members.length === 0) return c.json([])
  const ids = members.map((m) => m.id)

  // Tags for these members
  const tagsRes = await db.prepare(
    `SELECT mt.member_id as memberId, t.name, t.category
     FROM member_tags mt
     JOIN tags t ON t.id = mt.tag_id
     WHERE mt.member_id IN (${ids.map(() => '?').join(',')})`
  ).bind(...ids).all()
  const tagsRows = (tagsRes.results || []) as any[]

  // Core values
  const cvRes = await db.prepare(
    `SELECT id, member_id as memberId, value, author, created_at
     FROM core_values
     WHERE member_id IN (${ids.map(() => '?').join(',')})`
  ).bind(...ids).all()
  const cvRows = (cvRes.results || []) as any[]

  // Group
  const byMemberTags = new Map<string, { interest: string[]; involvement: string[]; area: string[] }>()
  tagsRows.forEach((r) => {
    const g = byMemberTags.get(r.memberId) || { interest: [], involvement: [], area: [] }
    if (r.category === 'interest') g.interest.push(r.name)
    else if (r.category === 'involvement') g.involvement.push(r.name)
    else if (r.category === 'area') g.area.push(r.name)
    byMemberTags.set(r.memberId, g)
  })

  const byMemberCV = new Map<string, { value: string; author: string }[]>()
  cvRows.forEach((r) => {
    const arr = byMemberCV.get(r.memberId) || []
    arr.push({ value: r.value, author: r.author })
    byMemberCV.set(r.memberId, arr)
  })

  const out = members.map((m) => {
    const t = byMemberTags.get(m.id) || { interest: [], involvement: [], area: [] }
    return {
      id: m.id,
      name: m.name,
      preferredName: m.preferredName || '',
      imageUrl: m.imageUrl || '',
      occupation: m.occupation || '',
      whyLab: m.whyLab || '',
      whatToDo: m.whatToDo || '',
      interestTags: t.interest,
      involvementTags: t.involvement,
      areaTags: t.area,
      coreValuesTags: byMemberCV.get(m.id) || [],
      created_at: m.created_at,
      facebookUrl: m.facebookUrl || '',
      instagramUrl: m.instagramUrl || '',
      xUrl: m.xUrl || '',
      websiteUrl1: m.websiteUrl1 || '',
      websiteUrl2: m.websiteUrl2 || '',
    }
  })
  return c.json(out)
})

// GET /api/members/:id/detail - fetch heavy fields only for detail page
app.get('/api/members/:id/detail', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  const row = await db.prepare(
    `SELECT intro_image1, intro_image2, youtube_url1, youtube_url2 FROM members WHERE id = ?`
  ).bind(id).first<any>()
  if (!row) return c.json(null, 404)
  return c.json({
    introImage1: row.intro_image1 || '',
    introImage2: row.intro_image2 || '',
    youtubeUrl1: row.youtube_url1 || '',
    youtubeUrl2: row.youtube_url2 || '',
  })
})

// POST /api/members - create member with tags
app.post('/api/members', async (c) => {
  const db = c.env.DB
  const body = await c.req.json()
  const id = body.id || crypto.randomUUID()
  const now = new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO members (id, name, preferred_name, image_url, occupation, why_lab, what_to_do, created_at, facebook_url, instagram_url, x_url, website_url1, website_url2, intro_image1, intro_image2, youtube_url1, youtube_url2)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      body.name || '',
      body.preferredName || '',
      body.imageUrl || '',
      body.occupation || '',
      body.whyLab || '',
      body.whatToDo || '',
      now,
      body.facebookUrl || '',
      body.instagramUrl || '',
      body.xUrl || '',
      body.websiteUrl1 || '',
      body.websiteUrl2 || '',
      body.introImage1 || '',
      body.introImage2 || '',
      body.youtubeUrl1 || '',
      body.youtubeUrl2 || '',
    )
    .run()

  // Upsert tags and relations
  const applyTags = async (names: string[] = [], category: string) => {
    for (const name of Array.from(new Set(names))) {
      await db.prepare(`INSERT OR IGNORE INTO tags (name, category) VALUES (?, ?)`).bind(name, category).run()
      const tr = await db.prepare(`SELECT id FROM tags WHERE name = ? AND category = ?`).bind(name, category).first<any>()
      if (tr?.id != null) {
        await db.prepare(`INSERT OR IGNORE INTO member_tags (member_id, tag_id) VALUES (?, ?)`).bind(id, tr.id).run()
      }
    }
  }
  await applyTags(body.interestTags, 'interest')
  await applyTags(body.involvementTags, 'involvement')
  await applyTags(body.areaTags, 'area')

  return c.json({ ok: true, id })
})

// PUT /api/members/:id - update member and replace tags
app.put('/api/members/:id', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  const body = await c.req.json()
  await db
    .prepare(
      `UPDATE members SET name=?, preferred_name=?, image_url=?, occupation=?, why_lab=?, what_to_do=?, facebook_url=?, instagram_url=?, x_url=?, website_url1=?, website_url2=?, intro_image1=?, intro_image2=?, youtube_url1=?, youtube_url2=? WHERE id=?`
    )
    .bind(
      body.name || '',
      body.preferredName || '',
      body.imageUrl || '',
      body.occupation || '',
      body.whyLab || '',
      body.whatToDo || '',
      body.facebookUrl || '',
      body.instagramUrl || '',
      body.xUrl || '',
      body.websiteUrl1 || '',
      body.websiteUrl2 || '',
      body.introImage1 || '',
      body.introImage2 || '',
      body.youtubeUrl1 || '',
      body.youtubeUrl2 || '',
      id,
    )
    .run()
  // Replace tags
  await db.prepare(`DELETE FROM member_tags WHERE member_id = ?`).bind(id).run()
  const applyTags = async (names: string[] = [], category: string) => {
    for (const name of Array.from(new Set(names))) {
      await db.prepare(`INSERT OR IGNORE INTO tags (name, category) VALUES (?, ?)`).bind(name, category).run()
      const tr = await db.prepare(`SELECT id FROM tags WHERE name = ? AND category = ?`).bind(name, category).first<any>()
      if (tr?.id != null) {
        await db.prepare(`INSERT OR IGNORE INTO member_tags (member_id, tag_id) VALUES (?, ?)`).bind(id, tr.id).run()
      }
    }
  }
  await applyTags(body.interestTags, 'interest')
  await applyTags(body.involvementTags, 'involvement')
  await applyTags(body.areaTags, 'area')
  return c.json({ ok: true })
})

// DELETE /api/members/:id - delete member (cascade)
app.delete('/api/members/:id', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  // Ensure cleanup of relations and core values as D1 may not enforce FK cascades
  await db.batch([
    db.prepare(`DELETE FROM member_tags WHERE member_id = ?`).bind(id),
    db.prepare(`DELETE FROM core_values WHERE member_id = ?`).bind(id),
    db.prepare(`DELETE FROM members WHERE id = ?`).bind(id),
  ])
  return c.json({ ok: true })
})

// Core values operations
app.post('/api/member/:id/core-values', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  const body = await c.req.json()
  await db
    .prepare(`INSERT INTO core_values (member_id, value, author, created_at) VALUES (?, ?, ?, ?)`)
    .bind(id, body.value || '', body.author || '', new Date().toISOString())
    .run()
  return c.json({ ok: true })
})

app.delete('/api/member/:id/core-values', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  const { value, author } = Object.fromEntries(new URL(c.req.url).searchParams)
  await db.prepare(`DELETE FROM core_values WHERE member_id=? AND value=? AND author=?`).bind(id, value || '', author || '').run()
  return c.json({ ok: true })
})

// GET /api/tags?category=interest|involvement|area&usedOnly=1
app.get('/api/tags', async (c) => {
  const db = c.env.DB
  const url = new URL(c.req.url)
  const category = url.searchParams.get('category')
  const usedOnly = url.searchParams.get('usedOnly') === '1'
  let stmt: string
  let bind: any[] = []
  if (usedOnly) {
    stmt = `SELECT t.id, t.name, t.category
            FROM tags t
            WHERE ${category ? 't.category = ? AND ' : ''}
                  EXISTS (SELECT 1 FROM member_tags mt WHERE mt.tag_id = t.id)`
    if (category) bind.push(category)
  } else {
    stmt = `SELECT id, name, category FROM tags${category ? ' WHERE category = ?' : ''}`
    if (category) bind.push(category)
  }
  const res = await db.prepare(stmt).bind(...bind).all()
  return c.json(res.results || [])
})

// ---------- SPA entry ----------
app.get('/*', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>ラボメン図鑑</title>
        <meta name="description" content="ラボメンのプロフィール閲覧・管理と可視化ツール" />
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <link href="/static/style.css" rel="stylesheet" />
      </head>
      <body class="bg-gray-50 text-gray-800">
        <div id="root"></div>
        <script type="module" src="/static/app.js"></script>
      </body>
    </html>
  `)
})

export default app

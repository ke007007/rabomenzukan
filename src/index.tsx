import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

// Bindings type for D1 + R2 + vars
type Bindings = {
  DB: D1Database
  FILES: R2Bucket
  R2_PUBLIC_URL: string
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS for API (safe even if same-origin)
app.use('/api/*', cors())

// Serve static assets from public/
app.use('/static/*', serveStatic({ root: './public' }))

// Proxy any file out of the R2 bucket. Primarily useful in local development where
// the r2.dev public host points at a different bucket than the local emulation.
// In production we serve R2 directly via the r2.dev URL for speed, but keeping this
// route lets it work as a fallback.
app.get('/r2/*', async (c) => {
  const key = c.req.path.replace(/^\/r2\//, '')
  if (!key) return c.notFound()
  const obj = await c.env.FILES.get(key)
  if (!obj) return c.notFound()
  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  headers.set('etag', obj.httpEtag)
  headers.set('cache-control', 'public, max-age=3600')
  return new Response(obj.body, { headers })
})

// ---------- Ensure schema (dev/preview safety) ----------
const ensureSchema = async (db: D1Database) => {
  // Add new columns if not exist (SQLite doesn't support IF NOT EXISTS for columns)
  for (const col of ['intro_image1 TEXT', 'intro_image2 TEXT', 'youtube_url1 TEXT', 'youtube_url2 TEXT', 'profile_pdf_url TEXT', 'profile_pdf_thumb_url TEXT']) {
    try { await db.prepare(`ALTER TABLE members ADD COLUMN ${col}`).run() } catch (_) {}
  }
  // improvement_requests: add likes counter if absent
  try { await db.prepare(`ALTER TABLE improvement_requests ADD COLUMN likes INTEGER NOT NULL DEFAULT 0`).run() } catch (_) {}
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
    db.prepare(`CREATE TABLE IF NOT EXISTS improvement_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      submitter TEXT NOT NULL DEFAULT '匿名のラボメン',
      status TEXT NOT NULL DEFAULT 'new',
      likes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS improvement_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      commenter TEXT NOT NULL DEFAULT '匿名のラボメン',
      body TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (request_id) REFERENCES improvement_requests(id) ON DELETE CASCADE
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_improvement_comments_req ON improvement_comments(request_id)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_improvement_requests_status ON improvement_requests(status)`),
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
    `SELECT intro_image1, intro_image2, youtube_url1, youtube_url2, profile_pdf_url, profile_pdf_thumb_url FROM members WHERE id = ?`
  ).bind(id).first<any>()
  if (!row) return c.json(null, 404)
  return c.json({
    introImage1: row.intro_image1 || '',
    introImage2: row.intro_image2 || '',
    youtubeUrl1: row.youtube_url1 || '',
    youtubeUrl2: row.youtube_url2 || '',
    profilePdfUrl: row.profile_pdf_url || '',
    profilePdfThumbUrl: row.profile_pdf_thumb_url || '',
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
      `INSERT INTO members (id, name, preferred_name, image_url, occupation, why_lab, what_to_do, created_at, facebook_url, instagram_url, x_url, website_url1, website_url2, intro_image1, intro_image2, youtube_url1, youtube_url2, profile_pdf_url, profile_pdf_thumb_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      body.profilePdfUrl || '',
      body.profilePdfThumbUrl || '',
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
      `UPDATE members SET name=?, preferred_name=?, image_url=?, occupation=?, why_lab=?, what_to_do=?, facebook_url=?, instagram_url=?, x_url=?, website_url1=?, website_url2=?, intro_image1=?, intro_image2=?, youtube_url1=?, youtube_url2=?, profile_pdf_url=?, profile_pdf_thumb_url=? WHERE id=?`
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
      body.profilePdfUrl || '',
      body.profilePdfThumbUrl || '',
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

// POST /api/upload - upload a file to R2 and return its public URL
// Body: multipart/form-data with 'file' field; optional 'type' field (avatar | intro | pdf)
app.post('/api/upload', async (c) => {
  try {
    if (!c.env.FILES) {
      return c.json({ error: 'R2 binding (FILES) is not configured' }, 500)
    }
    if (!c.env.R2_PUBLIC_URL) {
      return c.json({ error: 'R2_PUBLIC_URL is not configured' }, 500)
    }

    let form: FormData
    try {
      form = await c.req.formData()
    } catch (e: any) {
      return c.json({ error: 'failed to parse multipart body', detail: e?.message || String(e) }, 400)
    }

    const file = form.get('file')
    const type = String(form.get('type') || 'misc')
    if (!file || typeof file === 'string') {
      return c.json({ error: 'no file field in form data' }, 400)
    }
    // File or Blob — both have .size, .type, .stream()
    const f = file as any
    const fileSize = typeof f.size === 'number' ? f.size : 0
    const fileType = typeof f.type === 'string' ? f.type : ''
    const fileName = typeof f.name === 'string' ? f.name : ''

    const MAX_BYTES = 20 * 1024 * 1024
    if (fileSize > MAX_BYTES) return c.json({ error: 'file too large (>20MB)' }, 413)

    const allowedPrefixes = new Set(['avatar', 'intro', 'pdf', 'pdf-thumb', 'misc'])
    const prefix = allowedPrefixes.has(type) ? type : 'misc'

    const nameParts = fileName.split('.')
    let ext = nameParts.length > 1 ? nameParts.pop()!.toLowerCase().replace(/[^a-z0-9]/g, '') : ''
    if (!ext) {
      if (fileType === 'image/jpeg') ext = 'jpg'
      else if (fileType === 'image/png') ext = 'png'
      else if (fileType === 'image/webp') ext = 'webp'
      else if (fileType === 'application/pdf') ext = 'pdf'
      else ext = 'bin'
    }

    const key = `${prefix}/${crypto.randomUUID()}.${ext}`
    try {
      // Use arrayBuffer for broader compatibility (stream() can hit issues in some runtimes)
      const buf = await f.arrayBuffer()
      await c.env.FILES.put(key, buf, {
        httpMetadata: { contentType: fileType || 'application/octet-stream' },
      })
    } catch (e: any) {
      return c.json({ error: 'failed to write to R2', detail: e?.message || String(e), key }, 500)
    }

    // In local dev the file is in the local R2 emulation and the public r2.dev URL
    // points at a different (real) bucket, so serve via the /r2/* proxy instead.
    const reqUrl = new URL(c.req.url)
    const isLocal = reqUrl.hostname === 'localhost' || reqUrl.hostname === '127.0.0.1'
    const publicBase = isLocal ? `${reqUrl.origin}/r2` : c.env.R2_PUBLIC_URL
    const url = `${publicBase.replace(/\/$/, '')}/${key}`
    return c.json({ ok: true, url, key, size: fileSize, contentType: fileType })
  } catch (e: any) {
    return c.json({ error: 'unexpected error', detail: e?.message || String(e), stack: e?.stack || '' }, 500)
  }
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

// ---------- API: Improvement Requests (ねえねえポスト) ----------

const ALLOWED_STATUSES = new Set(['new', 'in_progress', 'done', 'wontfix'])
const MAX_TEXT_LEN = 4000
const MAX_NAME_LEN = 80

const clamp = (s: any, max: number) => {
  if (typeof s !== 'string') return ''
  const t = s.trim()
  return t.length > max ? t.slice(0, max) : t
}

// GET /api/improvements - list all requests with comment counts
app.get('/api/improvements', async (c) => {
  const db = c.env.DB
  const res = await db.prepare(
    `SELECT r.id, r.title, r.body, r.submitter, r.status, r.likes, r.created_at, r.updated_at,
            (SELECT COUNT(*) FROM improvement_comments c WHERE c.request_id = r.id) as comment_count
     FROM improvement_requests r
     ORDER BY
       CASE r.status WHEN 'new' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'done' THEN 2 ELSE 3 END,
       r.updated_at DESC`
  ).all()
  return c.json(res.results || [])
})

// GET /api/improvements/:id - detail with comments
app.get('/api/improvements/:id', async (c) => {
  const db = c.env.DB
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400)
  const req = await db.prepare(
    `SELECT id, title, body, submitter, status, likes, created_at, updated_at FROM improvement_requests WHERE id = ?`
  ).bind(id).first<any>()
  if (!req) return c.json({ error: 'not found' }, 404)
  const commentsRes = await db.prepare(
    `SELECT id, request_id, commenter, body, created_at FROM improvement_comments WHERE request_id = ? ORDER BY created_at ASC`
  ).bind(id).all()
  return c.json({ ...req, comments: commentsRes.results || [] })
})

// POST /api/improvements/:id/like - increment like counter
app.post('/api/improvements/:id/like', async (c) => {
  const db = c.env.DB
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400)
  const exists = await db.prepare(`SELECT id FROM improvement_requests WHERE id = ?`).bind(id).first<any>()
  if (!exists) return c.json({ error: 'not found' }, 404)
  await db.prepare(`UPDATE improvement_requests SET likes = likes + 1 WHERE id = ?`).bind(id).run()
  const row = await db.prepare(`SELECT likes FROM improvement_requests WHERE id = ?`).bind(id).first<any>()
  return c.json({ ok: true, likes: row?.likes ?? 0 })
})

// DELETE /api/improvements/:id/like - decrement like counter (floor at 0)
app.delete('/api/improvements/:id/like', async (c) => {
  const db = c.env.DB
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400)
  const exists = await db.prepare(`SELECT id FROM improvement_requests WHERE id = ?`).bind(id).first<any>()
  if (!exists) return c.json({ error: 'not found' }, 404)
  await db.prepare(`UPDATE improvement_requests SET likes = MAX(likes - 1, 0) WHERE id = ?`).bind(id).run()
  const row = await db.prepare(`SELECT likes FROM improvement_requests WHERE id = ?`).bind(id).first<any>()
  return c.json({ ok: true, likes: row?.likes ?? 0 })
})

// POST /api/improvements - create
app.post('/api/improvements', async (c) => {
  const db = c.env.DB
  const body = await c.req.json().catch(() => ({}))
  const title = clamp(body.title, 200)
  const text = clamp(body.body, MAX_TEXT_LEN)
  const submitter = clamp(body.submitter, MAX_NAME_LEN) || '匿名のラボメン'
  if (!title) return c.json({ error: 'title is required' }, 400)
  const now = new Date().toISOString()
  const res = await db.prepare(
    `INSERT INTO improvement_requests (title, body, submitter, status, created_at, updated_at) VALUES (?, ?, ?, 'new', ?, ?)`
  ).bind(title, text, submitter, now, now).run()
  const id = (res.meta as any)?.last_row_id
  return c.json({ ok: true, id })
})

// PATCH /api/improvements/:id - update status (and optionally title/body)
app.patch('/api/improvements/:id', async (c) => {
  const db = c.env.DB
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400)
  const body = await c.req.json().catch(() => ({}))
  const exists = await db.prepare(`SELECT id FROM improvement_requests WHERE id = ?`).bind(id).first<any>()
  if (!exists) return c.json({ error: 'not found' }, 404)

  const fields: string[] = []
  const binds: any[] = []
  if (typeof body.status === 'string') {
    if (!ALLOWED_STATUSES.has(body.status)) return c.json({ error: 'invalid status' }, 400)
    fields.push('status = ?'); binds.push(body.status)
  }
  if (typeof body.title === 'string') {
    const t = clamp(body.title, 200)
    if (!t) return c.json({ error: 'title cannot be empty' }, 400)
    fields.push('title = ?'); binds.push(t)
  }
  if (typeof body.body === 'string') {
    fields.push('body = ?'); binds.push(clamp(body.body, MAX_TEXT_LEN))
  }
  if (typeof body.submitter === 'string') {
    const s = clamp(body.submitter, MAX_NAME_LEN) || '匿名のラボメン'
    fields.push('submitter = ?'); binds.push(s)
  }
  if (fields.length === 0) return c.json({ error: 'no fields to update' }, 400)
  fields.push('updated_at = ?'); binds.push(new Date().toISOString())
  binds.push(id)
  await db.prepare(`UPDATE improvement_requests SET ${fields.join(', ')} WHERE id = ?`).bind(...binds).run()
  return c.json({ ok: true })
})

// DELETE /api/improvements/:id - delete request (and cascade comments)
app.delete('/api/improvements/:id', async (c) => {
  const db = c.env.DB
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400)
  await db.batch([
    db.prepare(`DELETE FROM improvement_comments WHERE request_id = ?`).bind(id),
    db.prepare(`DELETE FROM improvement_requests WHERE id = ?`).bind(id),
  ])
  return c.json({ ok: true })
})

// POST /api/improvements/:id/comments - add a comment
app.post('/api/improvements/:id/comments', async (c) => {
  const db = c.env.DB
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400)
  const body = await c.req.json().catch(() => ({}))
  const text = clamp(body.body, MAX_TEXT_LEN)
  const commenter = clamp(body.commenter, MAX_NAME_LEN) || '匿名のラボメン'
  if (!text) return c.json({ error: 'body is required' }, 400)
  const exists = await db.prepare(`SELECT id FROM improvement_requests WHERE id = ?`).bind(id).first<any>()
  if (!exists) return c.json({ error: 'not found' }, 404)
  const now = new Date().toISOString()
  await db.prepare(
    `INSERT INTO improvement_comments (request_id, commenter, body, created_at) VALUES (?, ?, ?, ?)`
  ).bind(id, commenter, text, now).run()
  await db.prepare(`UPDATE improvement_requests SET updated_at = ? WHERE id = ?`).bind(now, id).run()
  return c.json({ ok: true })
})

// DELETE /api/improvements/:reqId/comments/:cid - delete a comment
app.delete('/api/improvements/:reqId/comments/:cid', async (c) => {
  const db = c.env.DB
  const cid = Number(c.req.param('cid'))
  if (!Number.isFinite(cid)) return c.json({ error: 'invalid id' }, 400)
  await db.prepare(`DELETE FROM improvement_comments WHERE id = ?`).bind(cid).run()
  return c.json({ ok: true })
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

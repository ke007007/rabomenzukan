#!/usr/bin/env node
// Migrate existing Base64 image / PDF data in D1 members rows to Cloudflare R2.
// Default mode is dry-run. Pass --live to actually mutate.
//
// Usage:
//   node scripts/migrate-base64-to-r2.mjs                       # dry-run, all members
//   node scripts/migrate-base64-to-r2.mjs --live                # actually migrate all members
//   node scripts/migrate-base64-to-r2.mjs --limit 3 --live      # migrate only the first 3 that need it
//   node scripts/migrate-base64-to-r2.mjs --member <id> --live  # migrate a single member by id
//   node scripts/migrate-base64-to-r2.mjs --base http://localhost:8788    # point at local dev

import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    live: { type: 'boolean', default: false },
    limit: { type: 'string' },
    member: { type: 'string' },
    base: { type: 'string', default: 'https://webapp-2-8qy.pages.dev' },
    help: { type: 'boolean', default: false },
  },
})

if (values.help) {
  console.log(`Usage:
  --live           Actually perform migration (otherwise dry-run)
  --limit N        Process at most N members that need migration
  --member <id>    Migrate only this member id
  --base <url>     API base URL (default https://webapp-2-8qy.pages.dev)
  --help           Show this help`)
  process.exit(0)
}

const BASE_URL = values.base.replace(/\/$/, '')
const DRY_RUN = !values.live
const LIMIT = values.limit ? Number(values.limit) : Infinity
const ONLY_MEMBER = values.member || null

const isBase64DataUrl = (s) => typeof s === 'string' && s.startsWith('data:')

function decodeDataUrl(dataUrl) {
  const i = dataUrl.indexOf(',')
  const meta = dataUrl.slice(5, i) // strip "data:" prefix, before comma
  const b64 = dataUrl.slice(i + 1)
  const mime = (meta.match(/^([^;]+)/) || [, 'application/octet-stream'])[1]
  const bytes = Buffer.from(b64, 'base64')
  return { bytes, mime }
}

function extFromMime(mime) {
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  if (mime === 'application/pdf') return 'pdf'
  return 'bin'
}

async function getJson(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`GET ${url} → HTTP ${r.status}`)
  return r.json()
}

async function uploadToR2(bytes, mime, type) {
  const ext = extFromMime(mime)
  const blob = new Blob([bytes], { type: mime })
  const fd = new FormData()
  fd.append('file', blob, `migrated.${ext}`)
  fd.append('type', type)
  const r = await fetch(`${BASE_URL}/api/upload`, { method: 'POST', body: fd })
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    throw new Error(`upload → HTTP ${r.status} ${t.slice(0, 200)}`)
  }
  const data = await r.json()
  if (!data.url) throw new Error('upload response missing url')
  return data.url
}

async function putMember(id, body) {
  const r = await fetch(`${BASE_URL}/api/members/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    throw new Error(`PUT → HTTP ${r.status} ${t.slice(0, 200)}`)
  }
  return r.json()
}

function fmtKB(n) {
  return Math.round(n / 1024) + ' KB'
}

async function processMember(m) {
  const detail = await getJson(`${BASE_URL}/api/members/${m.id}/detail`)
  const tasks = []
  if (isBase64DataUrl(m.imageUrl)) tasks.push({ field: 'imageUrl', value: m.imageUrl, type: 'avatar' })
  if (isBase64DataUrl(detail.introImage1)) tasks.push({ field: 'introImage1', value: detail.introImage1, type: 'intro' })
  if (isBase64DataUrl(detail.introImage2)) tasks.push({ field: 'introImage2', value: detail.introImage2, type: 'intro' })
  if (isBase64DataUrl(detail.profilePdfUrl)) tasks.push({ field: 'profilePdfUrl', value: detail.profilePdfUrl, type: 'pdf' })

  if (tasks.length === 0) {
    return { id: m.id, name: m.name, skipped: true, reason: 'no Base64 fields' }
  }

  const taskSummary = tasks.map((t) => `${t.field}(${fmtKB(t.value.length)})`).join(', ')
  if (DRY_RUN) {
    console.log(`  [dry-run] ${m.name} (${m.id}) → would migrate: ${taskSummary}`)
    return { id: m.id, name: m.name, dryRun: true, tasks }
  }

  // Upload each Base64 field to R2
  const updates = {}
  for (const t of tasks) {
    const { bytes, mime } = decodeDataUrl(t.value)
    const url = await uploadToR2(bytes, mime, t.type)
    updates[t.field] = url
  }

  // Compose full PUT body, preserving all existing fields
  const body = {
    name: m.name || '',
    preferredName: m.preferredName || '',
    imageUrl: updates.imageUrl ?? m.imageUrl ?? '',
    occupation: m.occupation || '',
    whyLab: m.whyLab || '',
    whatToDo: m.whatToDo || '',
    facebookUrl: m.facebookUrl || '',
    instagramUrl: m.instagramUrl || '',
    xUrl: m.xUrl || '',
    websiteUrl1: m.websiteUrl1 || '',
    websiteUrl2: m.websiteUrl2 || '',
    introImage1: updates.introImage1 ?? detail.introImage1 ?? '',
    introImage2: updates.introImage2 ?? detail.introImage2 ?? '',
    youtubeUrl1: detail.youtubeUrl1 || '',
    youtubeUrl2: detail.youtubeUrl2 || '',
    profilePdfUrl: updates.profilePdfUrl ?? detail.profilePdfUrl ?? '',
    profilePdfThumbUrl: detail.profilePdfThumbUrl || '',
    interestTags: m.interestTags || [],
    involvementTags: m.involvementTags || [],
    areaTags: m.areaTags || [],
  }

  await putMember(m.id, body)
  console.log(`  ✓ ${m.name} (${m.id}) — migrated: ${taskSummary}`)
  return { id: m.id, name: m.name, migrated: true, tasks }
}

async function main() {
  console.log('=== Base64 → R2 migration ===')
  console.log(`Target API: ${BASE_URL}`)
  console.log(`Mode:       ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE (will mutate production data)'}`)
  if (ONLY_MEMBER) console.log(`Member:     ${ONLY_MEMBER}`)
  if (LIMIT !== Infinity) console.log(`Limit:      ${LIMIT}`)
  console.log()

  const all = await getJson(`${BASE_URL}/api/members`)
  const filtered = ONLY_MEMBER ? all.filter((m) => m.id === ONLY_MEMBER) : all
  if (ONLY_MEMBER && filtered.length === 0) {
    console.error(`No member found with id=${ONLY_MEMBER}`)
    process.exit(1)
  }

  let processedCount = 0
  let migratedCount = 0
  let skippedCount = 0
  let failedCount = 0
  const failedItems = []

  for (const m of filtered) {
    if (migratedCount >= LIMIT) break
    try {
      const result = await processMember(m)
      if (result.skipped) skippedCount++
      else if (result.dryRun) migratedCount++ // count as "would migrate"
      else migratedCount++
    } catch (err) {
      failedCount++
      failedItems.push({ id: m.id, name: m.name, error: err.message })
      console.error(`  ✗ ${m.name} (${m.id}) — ${err.message}`)
    }
    processedCount++
    // Small pause every 5 members to be gentle on the server
    if (processedCount % 5 === 0) await new Promise((r) => setTimeout(r, 1000))
  }

  console.log()
  console.log('=== Summary ===')
  console.log(`Processed:  ${processedCount}`)
  console.log(`${DRY_RUN ? 'Would migrate' : 'Migrated'}:  ${migratedCount}`)
  console.log(`Skipped:    ${skippedCount} (already URL or empty)`)
  console.log(`Failed:     ${failedCount}`)
  if (failedItems.length) {
    console.log('Failures:')
    for (const f of failedItems) console.log(`  - ${f.name} (${f.id}): ${f.error}`)
  }
  if (DRY_RUN) {
    console.log()
    console.log('To actually perform the migration, re-run with --live')
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})

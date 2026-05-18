// SPA for ラボメン図鑑
// React 19 + React Router 6 (CDN-less: we bundle nothing here, plain JS)
// To keep bundle-free, we implement a minimal SPA without React build.
// However, spec requests React 19. In Pages runtime we can't bundle at runtime.
// So we implement a lightweight vanilla JS SPA that follows the UX spec closely.

// NOTE: If strict React is required later, we can switch to Vite + JSX build
// and serve the compiled assets from /static/.

;(function () {
  const state = {
    operatorName: '',
    members: [],
    tags: { interest: [], involvement: [], area: [] },
    loading: false,
    formDraft: null,
    memberDetail: null, // { id, introImage1, introImage2, youtubeUrl1, youtubeUrl2, profilePdfUrl, profilePdfThumbUrl }
    lightboxSrc: null,  // 拡大表示する画像URL（nullなら非表示）
    filter: {
      q: '',
      interest: new Set(),
      involvement: new Set(),
      area: new Set(),
    },
    ui: {
      listFiltersCollapsed: true,
      isComposing: false,
    },
    dialogueSearchQ: '',
    tagMapCategory: 'interest',
    posts: {
      loaded: false,
      loading: false,
      items: [],
      filter: 'all',
      sort: 'recommended', // 'recommended' | 'likes' | 'recent'
      expanded: new Set(),
      composer: { open: false, title: '', body: '', submitter: '' },
      commentDraft: {},
      editing: { id: null, title: '', body: '', submitter: '' },
      likedIds: new Set(),
      likeBusy: new Set(),
    },
  }

  // Sample seed data（5名、タグに一部共通を持たせる）
  const seedMembers = [
    {
      id: '1',
      name: '山田 太郎',
      preferredName: 'たろう',
      imageUrl: '',
      occupation: 'コミュニティ運営 / DX支援',
      interestTags: ['組織開発', '教育', '音楽'],
      involvementTags: ['ラボ運営', 'メンター'],
      areaTags: ['京都', '関西'],
      whyLab: '多様な人と学び合う場を作りたい',
      whatToDo: '相互学習の仕組みづくりを実験',
      coreValuesTags: [
        { value: '挑戦', author: 'けいた' },
        { value: 'つながり', author: 'けいた' },
      ],
    },
    {
      id: '2',
      name: '佐藤 花子',
      preferredName: 'はな',
      imageUrl: '',
      occupation: '農業 / アート',
      interestTags: ['農業', 'サステナビリティ', '文化'],
      involvementTags: ['参加者'],
      areaTags: ['千葉', '関東'],
      whyLab: '地域に根差した実践を広げたい',
      whatToDo: '虹ファームの仲間を増やす',
      coreValuesTags: [
        { value: '共創', author: 'けいた' },
        { value: '誠実', author: 'Aさん' },
      ],
    },
    {
      id: '3',
      name: '鈴木 一郎',
      preferredName: 'いちろう',
      imageUrl: '',
      occupation: '教育支援 / 文化企画',
      interestTags: ['教育', '文化', '音楽'],
      involvementTags: ['メンター', '参加者'],
      areaTags: ['東京', '関東'],
      whyLab: '学びの土壌を広げたい',
      whatToDo: '文化×教育のプロジェクトを立ち上げる',
      coreValuesTags: [
        { value: '挑戦', author: 'Bさん' },
        { value: '共創', author: 'Bさん' },
      ],
    },
    {
      id: '4',
      name: '高橋 真由',
      preferredName: 'まゆ',
      imageUrl: '',
      occupation: '組織開発 / コミュニティ',
      interestTags: ['組織開発', 'サステナビリティ', 'コミュニティ'],
      involvementTags: ['ラボ運営'],
      areaTags: ['大阪', '関西'],
      whyLab: '実験と検証の場を作る',
      whatToDo: 'コミュニティの評価指標づくり',
      coreValuesTags: [
        { value: '学び', author: 'Cさん' },
        { value: '誠実', author: 'Cさん' },
      ],
    },
    {
      id: '5',
      name: '田中 健',
      preferredName: 'けん',
      imageUrl: '',
      occupation: '音楽 / テクノロジー',
      interestTags: ['音楽', 'テクノロジー', '教育'],
      involvementTags: ['参加者'],
      areaTags: ['海外/バンコク'],
      whyLab: 'テクノロジーで表現を拡張したい',
      whatToDo: '音楽×AIのセッション',
      coreValuesTags: [
        { value: '探究', author: 'Dさん' },
        { value: 'つながり', author: 'Dさん' },
      ],
    },
  ]

  // ---- API client & helpers ----
  const api = {
    async _json(res) {
      if (!res.ok) {
        const txt = await res.text().catch(()=> '')
        throw new Error(`HTTP ${res.status} ${res.statusText} ${txt}`)
      }
      return res.json()
    },
    async getMembers() {
      return this._json(await fetch('/api/members'))
    },
    async createMember(m) {
      return this._json(
        await fetch('/api/members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(m),
        })
      )
    },
    async updateMember(id, m) {
      return this._json(
        await fetch(`/api/members/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(m),
        })
      )
    },
    async deleteMember(id) {
      return this._json(
        await fetch(`/api/members/${encodeURIComponent(id)}`, { method: 'DELETE' })
      )
    },
    async addCoreValue(id, value, author) {
      return this._json(
        await fetch(`/api/member/${encodeURIComponent(id)}/core-values`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value, author }),
        })
      )
    },
    async deleteCoreValue(id, value, author) {
      const qs = new URLSearchParams({ value, author }).toString()
      return this._json(
        await fetch(`/api/member/${encodeURIComponent(id)}/core-values?${qs}`, { method: 'DELETE' })
      )
    },
    async getMemberDetail(id) {
      return this._json(await fetch(`/api/members/${encodeURIComponent(id)}/detail`))
    },
    async getTags(category, usedOnly = true) {
      const usp = new URLSearchParams()
      if (category) usp.set('category', category)
      if (usedOnly) usp.set('usedOnly', '1')
      const url = '/api/tags' + (usp.toString() ? `?${usp.toString()}` : '')
      return this._json(await fetch(url))
    },
    async listImprovements() {
      return this._json(await fetch('/api/improvements'))
    },
    async getImprovement(id) {
      return this._json(await fetch(`/api/improvements/${encodeURIComponent(id)}`))
    },
    async createImprovement(payload) {
      return this._json(
        await fetch('/api/improvements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      )
    },
    async updateImprovement(id, payload) {
      return this._json(
        await fetch(`/api/improvements/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      )
    },
    async deleteImprovement(id) {
      return this._json(
        await fetch(`/api/improvements/${encodeURIComponent(id)}`, { method: 'DELETE' })
      )
    },
    async addImprovementComment(id, payload) {
      return this._json(
        await fetch(`/api/improvements/${encodeURIComponent(id)}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      )
    },
    async deleteImprovementComment(reqId, cid) {
      return this._json(
        await fetch(`/api/improvements/${encodeURIComponent(reqId)}/comments/${encodeURIComponent(cid)}`, { method: 'DELETE' })
      )
    },
    async likeImprovement(id) {
      return this._json(
        await fetch(`/api/improvements/${encodeURIComponent(id)}/like`, { method: 'POST' })
      )
    },
    async unlikeImprovement(id) {
      return this._json(
        await fetch(`/api/improvements/${encodeURIComponent(id)}/like`, { method: 'DELETE' })
      )
    },
    async refreshAll() {
      state.loading = true
      update()
      try {
        const [members, interest, involvement, area] = await Promise.all([
          this.getMembers(),
          this.getTags('interest'),
          this.getTags('involvement'),
          this.getTags('area'),
        ])
        state.members = injectAvatars(members)
        state.tags = {
          interest: interest.map((t) => t.name),
          involvement: involvement.map((t) => t.name),
          area: area.map((t) => t.name),
        }
      } finally {
        state.loading = false
        update()
      }
    },
  }

  function injectAvatars(members) {
    // Placeholder for future avatar enrichment if needed
    return members.map((m) => ({ ...m }))
  }

  // ---- Image helpers ----
  // Convert common Google Drive share URLs (file/d/<id>/view, open?id=, uc?id=,
  // thumbnail?id=) to the embeddable lh3.googleusercontent.com form so <img> can load them.
  function normalizeImageUrl(url) {
    if (!url || typeof url !== 'string') return url
    if (url.startsWith('data:')) return url
    let id = null
    const m1 = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/)
    if (m1) id = m1[1]
    if (!id) {
      const m2 = url.match(/drive\.google\.com\/(?:open|uc|thumbnail)\?(?:.*&)?id=([a-zA-Z0-9_-]+)/)
      if (m2) id = m2[1]
    }
    if (id) return `https://lh3.googleusercontent.com/d/${id}=w512`
    return url
  }

  function isLikelyImageUrl(url) {
    if (!url || typeof url !== 'string') return false
    return /^(https?:\/\/|data:)/.test(url)
  }

  // Resize an image File to a JPEG data URL with bounded dimensions, so the resulting
  // Base64 string fits comfortably in Cloudflare D1 (which fails on multi-MB blobs).
  // Returns a Promise<string> (data URL).
  function resizeImageToDataUrl(file, { maxDim = 1280, quality = 0.85 } = {}) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        try {
          let w = img.naturalWidth, h = img.naturalHeight
          if (Math.max(w, h) > maxDim) {
            const scale = maxDim / Math.max(w, h)
            w = Math.round(w * scale)
            h = Math.round(h * scale)
          }
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          // Fill white so any source transparency doesn't render as black in JPEG
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, w, h)
          ctx.drawImage(img, 0, 0, w, h)
          const dataUrl = canvas.toDataURL('image/jpeg', quality)
          URL.revokeObjectURL(url)
          resolve(dataUrl)
        } catch (err) {
          URL.revokeObjectURL(url)
          reject(err)
        }
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('画像の読み込みに失敗しました（対応していない形式の可能性: HEIC等）'))
      }
      img.src = url
    })
  }

  // Lazy-load PDF.js (bundled locally from pdfjs-dist). Only loaded when the user
  // uploads a PDF, so it doesn't bloat normal page loads.
  let _pdfJsPromise = null
  function loadPdfJs() {
    if (_pdfJsPromise) return _pdfJsPromise
    _pdfJsPromise = (async () => {
      const mod = await import('/static/pdfjs/pdf.min.mjs')
      mod.GlobalWorkerOptions.workerSrc = '/static/pdfjs/pdf.worker.min.mjs'
      return mod
    })()
    return _pdfJsPromise
  }

  // Render the first page of a PDF File to a JPEG data URL for use as a thumbnail.
  async function renderPdfFirstPageToJpeg(file, { maxWidth = 600, quality = 0.85 } = {}) {
    const pdfjsLib = await loadPdfJs()
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
    const page = await pdf.getPage(1)
    const baseViewport = page.getViewport({ scale: 1 })
    const scale = Math.min(maxWidth / baseViewport.width, 3) // cap scale so tiny PDFs don't blow up
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d')
    // White background so any transparent PDFs render properly as JPEG
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise
    return canvas.toDataURL('image/jpeg', quality)
  }

  // Upload a Blob/File to R2 via /api/upload. type ∈ {avatar, intro, pdf, pdf-thumb}.
  // Returns the public URL on success, throws on failure.
  async function uploadBlobToR2(blob, type, filename) {
    const formData = new FormData()
    formData.append('file', blob, filename)
    formData.append('type', type)
    const res = await fetch('/api/upload', { method: 'POST', body: formData })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`Upload failed: HTTP ${res.status} ${txt}`)
    }
    const data = await res.json()
    if (!data.url) throw new Error('Upload response missing url field')
    return data.url
  }

  // Render an <img> that swaps in `fallbackEl` if the src is invalid or fails to load.
  function imgWithFallback(imgProps, fallbackEl) {
    const url = normalizeImageUrl(imgProps.src)
    if (!isLikelyImageUrl(url)) return fallbackEl
    return h('img', {
      ...imgProps,
      src: url,
      onError: (e) => {
        try { e.target.replaceWith(fallbackEl) } catch (_) { e.target.style.display = 'none' }
      },
    })
  }

  // Debug helper (overlay + logs)
  const Debug = (() => {
    let active = false
    try {
      // localStorageのdebugフラグは使わない（誤って残ったフラグをクリア）
      localStorage.removeItem('debug')
      const params = new URLSearchParams((location.hash.split('?')[1]) || '')
      if (params.get('debug') === '1') active = true
    } catch (_) {}

    const overlay = document.createElement('div')
    overlay.id = 'debug-overlay'
    overlay.className = 'debug-overlay hidden'

    const ensureOverlay = () => {
      if (!document.body) return setTimeout(ensureOverlay, 0)
      if (!document.getElementById('debug-overlay')) document.body.appendChild(overlay)
    }
    ensureOverlay()

    const write = (level, ...args) => {
      const native = (console[level] || console.log).bind(console)
      native(...args)
      if (!active) return
      const line = document.createElement('div')
      const prefix = `[${new Date().toISOString()}][${level.toUpperCase()}] `
      const msg = args.map((a) => {
        try {
          return typeof a === 'object' ? JSON.stringify(a) : String(a)
        } catch (_) {
          return String(a)
        }
      }).join(' ')
      line.textContent = prefix + msg
      overlay.appendChild(line)
      overlay.scrollTop = overlay.scrollHeight
    }

    window.addEventListener('error', (e) => write('error', '[onerror]', e.message, e.filename, e.lineno))
    window.addEventListener('unhandledrejection', (e) => write('error', '[unhandledrejection]', e.reason))

    const setActive = (v) => {
      active = !!v
      localStorage.setItem('debug', active ? '1' : '0')
      overlay.classList.toggle('hidden', !active)
      if (active) write('log', '[Debug] enabled', { ua: navigator.userAgent, w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio })
      else write('log', '[Debug] disabled')
    }

    // initialize visibility
    if (active) overlay.classList.remove('hidden')

    return {
      log: (...a) => write('log', ...a),
      warn: (...a) => write('warn', ...a),
      error: (...a) => write('error', ...a),
      setActive,
    }
  })()

  // Utilities
  function h(tag, props = {}, ...children) {
    const SVG_NS = 'http://www.w3.org/2000/svg'
    const XLINK_NS = 'http://www.w3.org/1999/xlink'
    const SVG_TAGS = new Set(['svg','g','line','circle','rect','path','text','image','clipPath','defs','title']) // HTML label is not SVG; handled by default createElement
    const isSvg = SVG_TAGS.has(tag)
    const el = isSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag)

    Object.entries(props || {}).forEach(([k, v]) => {
      if (v === undefined || v === null) return
      if (k === 'class') {
        if (isSvg) el.setAttribute('class', v)
        else el.className = v
      } else if (k === 'html') {
        if (!isSvg) el.innerHTML = v
      } else if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v)
      } else if (isSvg && k === 'href') {
        // Ensure image/link href works across browsers
        try { el.setAttributeNS(XLINK_NS, 'xlink:href', v) } catch(_) {}
        el.setAttribute('href', v)
      } else if (!isSvg && k === 'value') {
        // For form controls, set property to reflect value
        try { el.value = v } catch (_) { el.setAttribute('value', v) }
      } else if (typeof v === 'boolean') {
        // Properly handle boolean attributes (e.g., disabled, checked)
        try { el[k] = v } catch(_) {}
        if (v) el.setAttribute(k, '')
        else el.removeAttribute(k)
      } else {
        el.setAttribute(k, v)
      }
    })

    children.flat().forEach((c) => {
      if (c == null) return
      if (typeof c === 'string' || typeof c === 'number') el.appendChild(document.createTextNode(String(c)))
      else el.appendChild(c)
    })
    return el
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10)
  }

  // Debounce helper to throttle update() during typing
  const debounce = (() => {
    const timers = new Map()
    return function (key, fn, ms = 200) {
      const t = timers.get(key)
      if (t) clearTimeout(t)
      const nt = setTimeout(fn, ms)
      timers.set(key, nt)
    }
  })()

  // Router (hash-based to keep things simple)
  function navigate(path) {
    location.hash = '#' + path
  }

  function currentPath() {
    return location.hash.replace(/^#/, '') || '/'
  }

  window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render() })
  // expose Debug toggle
  window.Debug = Debug
  window.addEventListener('keydown', (e) => {
    if (e.shiftKey && (e.key === 'D' || e.key === 'd')) {
      const on = localStorage.getItem('debug') !== '1'
      Debug.setActive(on)
    }
  })

  // State management (in-memory only)
  async function init() {
    try {
      await api.refreshAll()
    } catch (e) {
      Debug.error('[Init] failed, fallback to seed', e)
      state.members = injectAvatars(seedMembers.map((m) => ({ ...m })))
      render()
    }
  }

  // Header
  function Header() {
    const path = currentPath()
    const link = (to, label, icon) =>
      h(
        'a',
        {
          href: '#' + to,
          class:
            'px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ' +
            (path === to ? 'bg-sky-100 text-sky-700' : 'text-gray-700 hover:bg-gray-100'),
        },
        icon ? h('i', { class: icon }) : null,
        label,
      )

    const burger = h(
      'button',
      { class: 'md:hidden p-2 rounded-md hover:bg-gray-100', id: 'burger', onClick: toggleMenu },
      h('i', { class: 'fas fa-bars' }),
    )

    const navLinks = h(
      'div',
      { class: 'hidden md:flex items-center gap-2', id: 'navlinks' },
      link('/', 'ラボメン一覧', 'fas fa-users'),
      link('/dialogue', 'ラボメン対話', 'fas fa-comments'),
      link('/correlation', 'ラボメン相関図', 'fas fa-project-diagram'),
      link('/tag-map', 'タグマップ', 'fas fa-tags'),
      link('/core-values', '大切にしていること', 'fas fa-heart'),
      link('/posts', 'ねえねえポスト', 'fas fa-envelope-open-text'),
    )

    const mobileMenu = h(
      'div',
      { class: 'md:hidden hidden flex-col gap-2 p-2', id: 'mobileMenu' },
      link('/', 'ラボメン一覧'),
      link('/dialogue', 'ラボメン対話'),
      link('/correlation', 'ラボメン相関図'),
      link('/tag-map', 'タグマップ'),
      link('/core-values', '大切にしていること'),
      link('/posts', 'ねえねえポスト'),
    )

    function toggleMenu() {
      const mm = document.getElementById('mobileMenu')
      const icon = burger.querySelector('i')
      if (mm.classList.contains('hidden')) {
        mm.classList.remove('hidden')
        icon.classList.remove('fa-bars')
        icon.classList.add('fa-times')
      } else {
        mm.classList.add('hidden')
        icon.classList.remove('fa-times')
        icon.classList.add('fa-bars')
      }
    }

    return h(
      'header',
      { class: 'bg-white shadow-md sticky top-0 z-20' },
      h(
        'div',
        { class: 'container mx-auto px-4 py-3 flex items-center justify-between' },
        h(
          'a',
          { href: '#/', class: 'text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2' },
          h('i', { class: 'fas fa-flask text-sky-600' }),
          'ラボメン図鑑',
        ),
        navLinks,
        burger,
      ),
      mobileMenu,
    )
  }

  // Helper: Tag pill
  function TagPill(text, type = 'interest') {
    let color = 'bg-gray-100 text-gray-800'
    if (type === 'interest') color = 'bg-sky-100 text-sky-800'
    else if (type === 'involvement') color = 'bg-blue-100 text-blue-800'
    else if (type === 'area') color = 'bg-emerald-100 text-emerald-800'
    else if (type === 'core') color = 'bg-amber-100 text-amber-800'
    return h(
      'span',
      { class: `text-xs font-medium px-2 py-1 rounded-full ${color} whitespace-nowrap` },
      text,
    )
  }

  // 今日のラボメン：日付ベースで毎日2人を選出
  function getTodayMembers(members, count = 2) {
    if (!members.length) return []
    const daysSinceEpoch = Math.floor(Date.now() / (1000 * 60 * 60 * 24))
    const result = []
    for (let i = 0; i < count; i++) {
      result.push(members[(daysSinceEpoch + i) % members.length])
    }
    // 同じ人が重複しないように（メンバー数が少ない場合）
    return [...new Map(result.map(m => [m.id, m])).values()]
  }

  function MemberSpotCard(m) {
    const avatar = imgWithFallback(
      { src: m.imageUrl, class: 'w-20 h-20 rounded-full object-cover shadow-md flex-shrink-0' },
      h('div', { class: 'w-20 h-20 rounded-full bg-sky-100 flex items-center justify-center flex-shrink-0' },
        h('i', { class: 'fas fa-user text-2xl text-sky-400' }))
    )

    const tags = h('div', { class: 'flex flex-wrap gap-1 mt-2' },
      ...(m.interestTags || []).slice(0, 3).map(t => TagPill(t, 'interest')),
      ...(m.involvementTags || []).slice(0, 1).map(t => TagPill(t, 'involvement')),
      ...(m.areaTags || []).slice(0, 1).map(t => TagPill(t, 'area')),
    )

    const coreValues = m.coreValuesTags && m.coreValuesTags.length > 0
      ? h('div', { class: 'flex flex-wrap gap-1 mt-2' },
          h('span', { class: 'text-xs text-amber-600 font-bold mr-1' }, '大切にしていること:'),
          ...m.coreValuesTags.slice(0, 3).map(cv => TagPill(cv.value, 'core'))
        )
      : null

    // SNSアイコン（登録があるものだけ表示）
    const snsLinks = [
      m.facebookUrl ? h('a', { href: m.facebookUrl, target: '_blank', rel: 'noopener noreferrer', class: 'text-blue-500 hover:text-blue-700 text-lg' }, h('i', { class: 'fab fa-facebook' })) : null,
      m.instagramUrl ? h('a', { href: m.instagramUrl, target: '_blank', rel: 'noopener noreferrer', class: 'text-pink-500 hover:text-pink-700 text-lg' }, h('i', { class: 'fab fa-instagram' })) : null,
      m.xUrl ? h('a', { href: m.xUrl, target: '_blank', rel: 'noopener noreferrer', class: 'text-gray-700 hover:text-black text-lg' }, h('i', { class: 'fab fa-x-twitter' })) : null,
      m.websiteUrl1 ? h('a', { href: m.websiteUrl1, target: '_blank', rel: 'noopener noreferrer', class: 'text-green-600 hover:text-green-800 text-lg' }, h('i', { class: 'fas fa-link' })) : null,
      m.websiteUrl2 ? h('a', { href: m.websiteUrl2, target: '_blank', rel: 'noopener noreferrer', class: 'text-green-600 hover:text-green-800 text-lg' }, h('i', { class: 'fas fa-link' })) : null,
    ].filter(Boolean)
    const sns = snsLinks.length > 0
      ? h('div', { class: 'flex gap-3 mt-2', onClick: (e) => e.stopPropagation() }, ...snsLinks)
      : null

    return h('div', { class: 'flex-1 bg-white rounded-xl border border-sky-100 p-4 flex flex-col gap-3' },
      h('div', { class: 'flex items-start gap-3' },
        avatar,
        h('div', { class: 'flex-1 min-w-0' },
          h('div', { class: 'text-lg font-extrabold text-gray-900 leading-tight' }, m.preferredName || m.name),
          m.preferredName ? h('div', { class: 'text-xs text-gray-400' }, m.name) : null,
          m.occupation ? h('div', { class: 'text-xs text-gray-600 mt-1 leading-snug' }, m.occupation) : null,
          tags,
          coreValues,
          sns,
        ),
      ),
      m.whyLab ? h('div', { class: 'p-2.5 bg-sky-50 rounded-lg' },
        h('div', { class: 'text-xs font-bold text-sky-600 mb-0.5' }, '🔹 なぜラボに？'),
        h('div', { class: 'text-xs text-gray-700 leading-relaxed whitespace-pre-line line-clamp-3' }, m.whyLab),
      ) : null,
      m.whatToDo ? h('div', { class: 'p-2.5 bg-sky-50 rounded-lg' },
        h('div', { class: 'text-xs font-bold text-sky-600 mb-0.5' }, '🔸 やってみたいこと'),
        h('div', { class: 'text-xs text-gray-700 leading-relaxed whitespace-pre-line line-clamp-3' }, m.whatToDo),
      ) : null,
      h('button', {
        class: 'mt-auto inline-flex items-center gap-1 text-sm font-medium text-sky-600 hover:text-sky-800',
        onClick: () => navigate(`/member/${m.id}`)
      }, 'もっと知る', h('i', { class: 'fas fa-arrow-right text-xs' })),
    )
  }

  function TodayMemberCard() {
    const members = getTodayMembers(state.members, 2)
    if (!members.length) return null

    const today = new Date()
    const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`

    return h('div', { class: 'bg-gradient-to-br from-sky-50 to-white rounded-2xl shadow-md border border-sky-100 p-4 sm:p-5 mb-2' },
      h('div', { class: 'flex items-center gap-2 mb-4' },
        h('i', { class: 'fas fa-star text-amber-400' }),
        h('span', { class: 'text-sm font-bold text-sky-700' }, '今日のラボメン'),
        h('span', { class: 'text-xs text-gray-400 ml-auto' }, dateStr),
      ),
      h('div', { class: 'flex flex-col sm:flex-row gap-3' },
        ...members.map(m => MemberSpotCard(m))
      ),
    )
  }

  // List page
  function ListPage() {
    if (state.loading) return container(LoadingSpinner())
    const qInput = h('input', {
      id: 'list-q',
      'data-keep-focus': '1',
      type: 'text',
      placeholder: '名前・呼び名・普段やっていることで検索',
      class:
        'w-full md:w-1/2 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-300',
      onCompositionstart: () => { state.ui.isComposing = true },
      onCompositionend: () => { state.ui.isComposing = false; update() },
      onInput: (e) => {
        state.filter.q = e.target.value
        if (!state.ui.isComposing) debounce('list-q', () => update(), 200)
      },
      value: state.filter.q,
    })

    const allInterest = Array.from(new Set(state.members.flatMap((m) => m.interestTags)))
    const allInvolvement = Array.from(new Set(state.members.flatMap((m) => m.involvementTags)))
    const allArea = Array.from(new Set(state.members.flatMap((m) => m.areaTags || [])))

    const collapsed = !!(state.ui && state.ui.listFiltersCollapsed)
    const toggleFilters = () => { state.ui.listFiltersCollapsed = !collapsed; update() }
    const filterSection = h(
      'div',
      { class: 'space-y-3' },
      h('div', { class: 'flex items-center justify-between' },
        h('div', { class: 'text-sm font-bold text-gray-700' }, 'タグフィルター'),
        h('button', { class: 'text-xs px-2 py-1 rounded-md border border-gray-300 bg-white hover:bg-gray-50', onClick: toggleFilters }, collapsed ? '表示' : '非表示')
      ),
      collapsed ? null : tagFilterRow('興味関心タグ', allInterest, 'interest'),
      collapsed ? null : tagFilterRow('関わりタグ', allInvolvement, 'involvement'),
      collapsed ? null : tagFilterRow('活動エリアタグ', allArea, 'area'),
    )

    function tagFilterRow(title, tags, type) {
      return h(
        'div',
        {},
        h('div', { class: 'text-xs font-bold text-gray-600 mb-1' }, title),
        h(
          'div',
          { class: 'flex flex-wrap gap-2' },
          tags.map((t) =>
            h(
              'button',
              {
                class:
                  'px-2 py-1 rounded-lg text-xs border ' +
                  (state.filter[type].has(t)
                    ? 'bg-sky-500 text-white border-sky-500'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-300'),
                onClick: () => {
                  if (state.filter[type].has(t)) state.filter[type].delete(t)
                  else state.filter[type].add(t)
                  update()
                },
              },
              t,
            ),
          ),
        ),
      )
    }

    const addButton = h(
      'button',
      {
        class:
          'bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow min-h-[40px]',
        onClick: () => navigate('/add'),
      },
      h('i', { class: 'fas fa-user-plus mr-2' }),
      '新規登録',
    )

    const members = filteredMembers()

    const grid = h(
      'div',
      { class: 'grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-4 md:gap-6' },
      members.map(Card),
    )

    return container(
      TodayMemberCard(),
      h(
        'div',
        { class: 'flex items-center justify-between mb-4' },
        h('h1', { class: 'text-2xl font-bold text-gray-900' }, 'ラボメン一覧'),
        addButton,
      ),
      h('div', { class: 'mb-4' }, qInput),
      filterSection,
      h('div', { class: 'mt-4' }, grid),
    )
  }

  function filteredMembers() {
    const q = state.filter.q.toLowerCase()
    const iSel = state.filter.interest
    const invSel = state.filter.involvement
    const areaSel = state.filter.area

    return state.members.filter((m) => {
      const textMatch = [m.name, m.preferredName, m.occupation]
        .join(' ')
        .toLowerCase()
        .includes(q)
      const interestOk = Array.from(iSel).every((t) => m.interestTags.includes(t))
      const invOk = Array.from(invSel).every((t) => m.involvementTags.includes(t))
      const areaOk = Array.from(areaSel).every((t) => (m.areaTags || []).includes(t))
      return textMatch && interestOk && invOk && areaOk
    })
  }

  // Member card
  function Card(m) {
    const tagPreview = (arr, type) => {
      const shown = arr.slice(0, 3)
      const extra = arr.length - shown.length
      return h(
        'div',
        { class: 'flex flex-wrap gap-2' },
        shown.map((t) => TagPill(t, type)),
        extra > 0 ? h('span', { class: 'text-xs text-gray-500' }, `+${extra}`) : null,
      )
    }

    const img = imgWithFallback(
      { src: m.imageUrl, class: 'w-16 h-16 rounded-full object-cover' },
      h(
        'div',
        { class: 'w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-gray-600' },
        h('i', { class: 'fas fa-user text-xl' }),
      )
    )

    const openDetail = () => navigate(`/member/${m.id}`)

    const editBtn = h(
      'button',
      {
        class: 'text-xs px-2 py-1 rounded-md bg-gray-200 hover:bg-gray-300',
        onClick: (e) => {
          e.stopPropagation()
          navigate(`/edit/${m.id}`)
        },
      },
      '編集',
    )

    const delBtn = h(
      'button',
      {
        class: 'text-xs px-2 py-1 rounded-md bg-red-100 text-red-700 hover:bg-red-200',
        onClick: async (e) => {
          e.stopPropagation()
          if (!confirm('削除しますか？')) return
          try {
            await api.deleteMember(m.id)
            await api.refreshAll()
          } catch (err) {
            Debug.error('[Delete] failed', err)
            alert('削除に失敗しました')
          }
        },
      },
      '削除',
    )

    const snippet = (text) => (text && text.length > 60 ? text.slice(0, 60) + '…' : (text || ''))

    return h(
      'div',
      {
        class:
          'bg-white rounded-lg shadow-md md:shadow-lg p-3 md:p-4 hover:-translate-y-0.5 md:hover:-translate-y-1 transition-transform cursor-pointer flex flex-col gap-2 md:gap-3',
        onClick: openDetail,
      },
      h('div', { class: 'flex items-center gap-3' },
        img,
        h('div', {},
          h('div', { class: 'text-base md:text-lg font-bold leading-tight' }, m.name),
          h('div', { class: 'text-sm text-gray-600 leading-tight' }, m.preferredName),
        ),
      ),
      h('div', { class: 'space-y-2' },
        h('div', {}, tagPreview(m.interestTags, 'interest')),
        h('div', {}, tagPreview(m.involvementTags, 'involvement')),
        h('div', {}, tagPreview(m.areaTags || [], 'area')),
        h('div', { class: 'text-xs text-gray-600' }, '普段やっていること: ' + snippet(m.occupation)),
        h('div', { class: 'text-xs text-gray-600' }, 'どうしてラボへ？: ' + snippet(m.whyLab)),
        h('div', { class: 'text-xs text-gray-600' }, 'やってみたいこと: ' + snippet(m.whatToDo)),
      ),
      h('div', { class: 'flex items-center gap-2 mt-auto' },
        editBtn, delBtn,
        h('div', { class: 'flex gap-2 ml-auto', onClick: (e) => e.stopPropagation() },
          m.facebookUrl ? h('a', { href: m.facebookUrl, target: '_blank', rel: 'noopener noreferrer', class: 'text-blue-500 hover:text-blue-700 text-lg' }, h('i', { class: 'fab fa-facebook' })) : null,
          m.instagramUrl ? h('a', { href: m.instagramUrl, target: '_blank', rel: 'noopener noreferrer', class: 'text-pink-500 hover:text-pink-700 text-lg' }, h('i', { class: 'fab fa-instagram' })) : null,
          m.xUrl ? h('a', { href: m.xUrl, target: '_blank', rel: 'noopener noreferrer', class: 'text-gray-700 hover:text-black text-lg' }, h('i', { class: 'fab fa-x-twitter' })) : null,
          m.websiteUrl1 ? h('a', { href: m.websiteUrl1, target: '_blank', rel: 'noopener noreferrer', class: 'text-green-600 hover:text-green-800 text-lg' }, h('i', { class: 'fas fa-link' })) : null,
          m.websiteUrl2 ? h('a', { href: m.websiteUrl2, target: '_blank', rel: 'noopener noreferrer', class: 'text-green-600 hover:text-green-800 text-lg' }, h('i', { class: 'fas fa-link' })) : null,
        ),
      ),
    )
  }

  // ローディングスピナー
  function LoadingSpinner() {
    return h('div', { class: 'flex flex-col items-center justify-center py-16 gap-3' },
      h('div', { class: 'w-10 h-10 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin' }),
      h('div', { class: 'text-sm text-gray-500' }, '読み込み中...')
    )
  }

  // YouTubeのURLから動画IDを抽出するヘルパー
  function youtubeVideoId(url) {
    if (!url) return null
    const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/)
    return m ? m[1] : null
  }

  // Detail page
  function DetailPage(params) {
    const m = state.members.find((x) => x.id === params.id)
    if (state.loading) return container(LoadingSpinner())
    if (!m) return container(h('div', { class: 'text-gray-600' }, '見つかりませんでした'))

    // 詳細データ（画像・YouTube）を非同期で取得
    if (!state.memberDetail || state.memberDetail.id !== params.id) {
      state.memberDetail = { id: params.id, loading: true, introImage1: '', introImage2: '', youtubeUrl1: '', youtubeUrl2: '', profilePdfUrl: '', profilePdfThumbUrl: '' }
      api.getMemberDetail(params.id)
        .then((d) => { state.memberDetail = { id: params.id, loading: false, ...d }; update() })
        .catch(() => { state.memberDetail = { id: params.id, loading: false, introImage1: '', introImage2: '', youtubeUrl1: '', youtubeUrl2: '', profilePdfUrl: '', profilePdfThumbUrl: '' }; update() })
    }
    const detail = state.memberDetail || {}

    const back = h(
      'button',
      { class: 'px-3 py-2 rounded-md bg-gray-200 hover:bg-gray-300', onClick: () => history.back() },
      '戻る',
    )

    const avatar = imgWithFallback(
      { src: m.imageUrl, class: 'w-32 h-32 rounded-full object-cover' },
      h(
        'div',
        { class: 'w-32 h-32 rounded-full bg-gray-200 flex items-center justify-center text-gray-600' },
        h('i', { class: 'fas fa-user text-3xl' }),
      )
    )

    return container(
      back,
      h('div', { class: 'mt-4 flex flex-col sm:flex-row items-start gap-4 sm:gap-6' },
        avatar,
        h('div', { class: 'space-y-2' },
          h('div', { class: 'text-2xl md:text-3xl font-extrabold text-gray-900 leading-tight' }, m.name),
          h('div', { class: 'text-sm md:text-base text-gray-600 leading-tight' }, m.preferredName),
        ),
      ),
      section('普段やっていること', h('div', { class: 'text-sm md:text-base leading-relaxed whitespace-pre-line' }, m.occupation)),
      section('興味関心', h('div', { class: 'flex flex-wrap gap-2' }, m.interestTags.map((t) => TagPill(t, 'interest')))),
      section('関わり方', h('div', { class: 'flex flex-wrap gap-2' }, m.involvementTags.map((t) => TagPill(t, 'involvement')))),
      section('活動エリア', h('div', { class: 'flex flex-wrap gap-2' }, (m.areaTags || []).map((t) => TagPill(t, 'area')))),
      section('どうしてラボへ？', h('div', { class: 'text-sm md:text-base leading-relaxed whitespace-pre-line' }, m.whyLab)),
      section('ラボでやってみたいこと', h('div', { class: 'text-sm md:text-base leading-relaxed whitespace-pre-line' }, m.whatToDo)),
      section('大切にしていること', h('div', { class: 'flex flex-wrap gap-2' }, m.coreValuesTags.map((cv) => TagPill(`${cv.value} / ${cv.author}`, 'core')))),
      (m.facebookUrl || m.instagramUrl || m.xUrl || m.websiteUrl1 || m.websiteUrl2)
        ? section('SNS・リンク', h('div', { class: 'flex flex-wrap gap-3' },
            m.facebookUrl ? h('a', { href: m.facebookUrl, target: '_blank', rel: 'noopener noreferrer', class: 'flex items-center gap-1 text-blue-600 hover:underline text-sm' }, h('i', { class: 'fab fa-facebook text-lg' }), 'Facebook') : null,
            m.instagramUrl ? h('a', { href: m.instagramUrl, target: '_blank', rel: 'noopener noreferrer', class: 'flex items-center gap-1 text-pink-500 hover:underline text-sm' }, h('i', { class: 'fab fa-instagram text-lg' }), 'Instagram') : null,
            m.xUrl ? h('a', { href: m.xUrl, target: '_blank', rel: 'noopener noreferrer', class: 'flex items-center gap-1 text-gray-800 hover:underline text-sm' }, h('i', { class: 'fab fa-x-twitter text-lg' }), 'X') : null,
            m.websiteUrl1 ? h('a', { href: m.websiteUrl1, target: '_blank', rel: 'noopener noreferrer', class: 'flex items-center gap-1 text-green-600 hover:underline text-sm' }, h('i', { class: 'fas fa-link text-lg' }), 'Website') : null,
            m.websiteUrl2 ? h('a', { href: m.websiteUrl2, target: '_blank', rel: 'noopener noreferrer', class: 'flex items-center gap-1 text-green-600 hover:underline text-sm' }, h('i', { class: 'fas fa-link text-lg' }), 'Website 2') : null,
          ))
        : null,
      // 自己紹介画像（グラレコ等）
      (detail.introImage1 || detail.introImage2)
        ? section('自己紹介画像', h('div', { class: 'flex flex-col gap-4' },
            detail.introImage1 ? imgWithFallback(
              { src: detail.introImage1, class: 'max-w-md w-full rounded-lg shadow-md object-contain max-h-80 cursor-zoom-in', onClick: () => { state.lightboxSrc = normalizeImageUrl(detail.introImage1); update() } },
              h('div', { class: 'text-xs text-gray-400 italic' }, '自己紹介画像を読み込めませんでした')
            ) : null,
            detail.introImage2 ? imgWithFallback(
              { src: detail.introImage2, class: 'max-w-md w-full rounded-lg shadow-md object-contain max-h-80 cursor-zoom-in', onClick: () => { state.lightboxSrc = normalizeImageUrl(detail.introImage2); update() } },
              h('div', { class: 'text-xs text-gray-400 italic' }, '自己紹介画像を読み込めませんでした')
            ) : null,
            h('div', { class: 'text-xs text-gray-400' }, '画像をクリックすると拡大できます'),
          ))
        : null,
      // YouTube動画
      (detail.youtubeUrl1 || detail.youtubeUrl2)
        ? section('動画・インタビュー', h('div', { class: 'flex flex-col gap-6' },
            ...[detail.youtubeUrl1, detail.youtubeUrl2].filter(Boolean).map((url) => {
              const vid = youtubeVideoId(url)
              if (vid) {
                return h('iframe', {
                  src: `https://www.youtube.com/embed/${vid}`,
                  style: 'display:block;width:100%;max-width:480px;aspect-ratio:16/9;border-radius:8px;border:none;',
                  allowfullscreen: true,
                  allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
                })
              }
              return h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', class: 'text-blue-600 underline text-sm break-all' }, url)
            }),
          ))
        : null,
      // プロフィールPDF
      detail.profilePdfUrl
        ? (() => {
            const pdfUrl = detail.profilePdfUrl
            const isDataUrl = pdfUrl.startsWith('data:')
            const openPdf = (e) => {
              if (!isDataUrl) return // 通常URL は <a href> 任せ
              e.preventDefault()
              try {
                // data: URL を Blob 化して開く（モダンブラウザは data: の直接遷移をブロックすることがある）
                const [meta, b64] = pdfUrl.split(',', 2)
                const mime = (meta.match(/data:([^;]+)/) || [, 'application/pdf'])[1]
                const bin = atob(b64)
                const len = bin.length
                const bytes = new Uint8Array(len)
                for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i)
                const blob = new Blob([bytes], { type: mime })
                const blobUrl = URL.createObjectURL(blob)
                window.open(blobUrl, '_blank', 'noopener,noreferrer')
                // メモリ解放（少し遅らせて、別タブが読み終えるのを待つ）
                setTimeout(() => URL.revokeObjectURL(blobUrl), 30 * 1000)
              } catch (err) {
                console.error('[pdf open] failed', err)
                alert('PDFを開けませんでした')
              }
            }
            const thumbUrl = detail.profilePdfThumbUrl
            return section('プロフィールPDF', h('div', { class: 'flex flex-col gap-3' },
              thumbUrl
                ? h('a', {
                    href: isDataUrl ? '#' : pdfUrl,
                    target: '_blank',
                    rel: 'noopener noreferrer',
                    onClick: openPdf,
                    class: 'group block w-fit max-w-md cursor-pointer',
                    title: 'クリックでPDFを開く',
                  },
                    h('div', { class: 'relative rounded-lg overflow-hidden border border-gray-200 shadow-md group-hover:shadow-xl transition-shadow bg-white' },
                      h('img', { src: thumbUrl, class: 'block w-full h-auto max-h-96 object-contain bg-white' }),
                      h('div', { class: 'absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-colors' },
                        h('div', { class: 'opacity-0 group-hover:opacity-100 transition-opacity px-4 py-2 rounded-full bg-white text-red-700 font-bold text-sm shadow-lg flex items-center gap-2' },
                          h('i', { class: 'fas fa-file-pdf' }),
                          'PDFを開く',
                        ),
                      ),
                    ),
                  )
                : null,
              h('a', {
                href: isDataUrl ? '#' : pdfUrl,
                target: '_blank',
                rel: 'noopener noreferrer',
                onClick: openPdf,
                class: 'inline-flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-bold text-sm md:text-base w-fit',
              },
                h('i', { class: 'fas fa-file-pdf text-xl' }),
                'PDFを開く',
                h('i', { class: 'fas fa-external-link-alt text-xs ml-1' }),
              ),
              isDataUrl
                ? h('div', { class: 'text-xs text-gray-500' }, `添付ファイル（${Math.round(pdfUrl.length / 1024)} KB）`)
                : h('div', { class: 'text-xs text-gray-500 break-all' }, pdfUrl),
            ))
          })()
        : null,
    )
  }

  function section(title, content) {
    return h(
      'div',
      { class: 'mt-5 md:mt-6' },
      h('div', { class: 'text-sm md:text-base font-bold text-gray-700 mb-2' }, title),
      content,
    )
  }

  // Add/Edit page
  function FormPage(params) {
    const isEdit = !!params.id
    const draftKey = isEdit ? params.id : 'new'
    if (!state.formDraft || state.formDraft._key !== draftKey) {
      state.formDraft = isEdit
        ? { ...state.members.find((x) => x.id === params.id), introImage1: '', introImage2: '', youtubeUrl1: '', youtubeUrl2: '', profilePdfUrl: '', profilePdfThumbUrl: '', _detailLoaded: false }
        : {
            id: uid(),
            name: '',
            preferredName: '',
            imageUrl: '',
            occupation: '',
            interestTags: [],
            involvementTags: [],
            whyLab: '',
            whatToDo: '',
            coreValuesTags: [],
            areaTags: [],
            facebookUrl: '',
            instagramUrl: '',
            xUrl: '',
            websiteUrl1: '',
            websiteUrl2: '',
            introImage1: '',
            introImage2: '',
            youtubeUrl1: '',
            youtubeUrl2: '',
            profilePdfUrl: '',
            profilePdfThumbUrl: '',
          }
      state.formDraft._key = draftKey
    }
    const m = state.formDraft

    // 編集時：詳細データ（画像・YouTube）をAPIから取得してフォームに反映
    if (isEdit && !m._detailLoaded) {
      m._detailLoaded = true
      api.getMemberDetail(params.id)
        .then((d) => { if (d) { m.introImage1 = d.introImage1 || ''; m.introImage2 = d.introImage2 || ''; m.youtubeUrl1 = d.youtubeUrl1 || ''; m.youtubeUrl2 = d.youtubeUrl2 || ''; m.profilePdfUrl = d.profilePdfUrl || ''; m.profilePdfThumbUrl = d.profilePdfThumbUrl || '' }; update() })
        .catch(() => {})
    }

    // persist image mode per draft to avoid reset on re-render
    if (!m._imageMode) m._imageMode = 'url'
    let imageMode = m._imageMode // 'url' or 'upload'

    const field = (key, label, type = 'text') =>
      h(
        'div',
        { class: 'space-y-1' },
        h('label', { class: 'text-xs font-bold text-gray-600' }, label),
        type === 'textarea'
          ? h('textarea', {
              class: 'w-full border border-gray-300 rounded-lg px-3 py-2',
              rows: 3,
              value: m[key],
              onInput: (e) => (m[key] = e.target.value),
            })
          : h('input', {
              type: 'text',
              class: 'w-full border border-gray-300 rounded-lg px-3 py-2',
              value: m[key],
              onInput: (e) => (m[key] = e.target.value),
            }),
      )

    const imageTabs = h(
      'div',
      { class: 'space-y-2' },
      h('div', { class: 'flex gap-2' },
        tabBtn('URL入力', 'url'),
        tabBtn('画像アップロード', 'upload'),
      ),
      imageMode === 'url'
        ? h('input', {
            id: `image-url-${m.id}`,
            'data-keep-focus': '1',
            type: 'text',
            placeholder: 'https://...jpg',
            class: 'w-full border border-gray-300 rounded-lg px-3 py-2',
            value: m.imageUrl || '',
            onCompositionstart: () => { state.ui.isComposing = true },
            onCompositionend: () => { state.ui.isComposing = false; update() },
            onInput: (e) => {
              m.imageUrl = e.target.value
              if (!state.ui.isComposing) debounce(`img-url-${m.id}`, () => update(), 200)
            },
          })
        : (function(){
            const fileInputId = `avatar-file-input-${m.id || 'new'}`
            const isDebug = (localStorage.getItem('debug') === '1')
            return h('div', { class: 'space-y-2' },
              h('div', { class: 'flex gap-2 items-center' },
                h('label', { for: fileInputId, class: 'px-3 py-2 rounded-md bg-gray-200 hover:bg-gray-300 cursor-pointer inline-block' }, 'ファイルを選択'),
                h('span', { class: 'text-xs text-gray-500' }, 'JPEG/PNG, 2MB以下推奨')
              ),
              h('input', {
                id: fileInputId,
                type: 'file',
                accept: 'image/*',
                capture: 'environment',
                class: isDebug ? 'block border border-dashed p-1 text-xs' : 'sr-only',
                style: isDebug ? '' : 'position:absolute; left:-9999px; width:1px; height:1px; opacity:0;',
                onChange: async (e) => {
                  const file = e.target.files && e.target.files.length ? e.target.files[0] : null
                  Debug.log('[upload] onChange', { hasFile: !!file, name: file && file.name, size: file && file.size, type: file && file.type })
                  if (!file) {
                    alert('ファイルが選択されていません')
                    return
                  }
                  if (!(file instanceof Blob)) {
                    alert('不正なファイルです')
                    return
                  }
                  try {
                    // Avatar is shown at max ~128px circle — 512px source is plenty even on retina.
                    const dataUrl = await resizeImageToDataUrl(file, { maxDim: 512, quality: 0.85 })
                    const blob = await (await fetch(dataUrl)).blob()
                    m.imageUrl = await uploadBlobToR2(blob, 'avatar', `avatar-${file.name || 'image'}.jpg`)
                    Debug.log('[upload] avatar uploaded to R2:', m.imageUrl, 'original:', file.size, 'resized:', blob.size)
                    update()
                  } catch (err) {
                    console.error('[avatar upload] failed', err)
                    alert('画像のアップロードに失敗しました：' + (err && err.message ? err.message : String(err)))
                  }
                },
              })
            )
          })(),
      h('div', { class: 'mt-2' },
        m.imageUrl
          ? imgWithFallback(
              { src: m.imageUrl, class: 'w-24 h-24 rounded-full object-cover' },
              h('div', { class: 'text-xs text-red-500' }, '画像を読み込めません（URLを確認してください）')
            )
          : h('div', { class: 'text-xs text-gray-500' }, 'プレビューなし'),
      ),
    )

    function tabBtn(label, mode) {
      return h(
        'button',
        {
          class:
            'px-3 py-1 rounded-md text-sm ' +
            (imageMode === mode ? 'bg-sky-500 text-white' : 'bg-gray-200 hover:bg-gray-300'),
          onClick: () => {
            m._imageMode = mode
            imageMode = mode
            update()
          },
        },
        label,
      )
    }

    const onSubmit = async () => {
      if (!m.name || !m.preferredName) {
        alert('氏名と呼ばれたい名前は必須です')
        return
      }
      state.saving = true
      update()
      try {
        if (isEdit) await api.updateMember(m.id, m)
        else await api.createMember(m)
        state.formDraft = null
        await api.refreshAll()
        navigate('/')
      } catch (err) {
        Debug.error('[Save] failed', err)
        alert('保存に失敗しました')
      } finally {
        state.saving = false
        update()
      }
    }

    return container(
      h('h1', { class: 'text-2xl font-bold text-gray-900 mb-4' }, isEdit ? 'ラボメン情報編集' : '新規ラボメン登録'),
      field('name', '氏名'),
      field('preferredName', '呼ばれたい名前'),
      h('div', { class: 'space-y-1' }, h('label', { class: 'text-xs font-bold text-gray-600' }, 'プロフィール画像'), imageTabs, h('div', { class: 'text-xs text-gray-500' }, '推奨: 正方形 256×256〜512×512（最大1MB目安）')),
      field('occupation', '普段やっていること', 'textarea'),
      h('div', { class: 'grid grid-cols-1 md:grid-cols-3 gap-4' },
        TagInput('興味関心タグ', m.interestTags, 'interest'),
        TagInput('関わりタグ', m.involvementTags, 'involvement'),
        TagInput('活動エリアタグ', m.areaTags, 'area'),
      ),
      field('whyLab', 'どうしてラボへ？', 'textarea'),
      field('whatToDo', 'ラボでやってみたいこと', 'textarea'),
      h('div', { class: 'mt-4 space-y-2' },
        h('div', { class: 'text-sm font-bold text-gray-600' }, 'SNS・リンク'),
        h('div', { class: 'grid grid-cols-1 md:grid-cols-2 gap-3' },
          field('facebookUrl', 'Facebook URL'),
          field('instagramUrl', 'Instagram URL'),
          field('xUrl', 'X（旧Twitter）URL'),
          field('websiteUrl1', 'ウェブサイト URL 1'),
          field('websiteUrl2', 'ウェブサイト URL 2'),
        ),
      ),
      h('div', { class: 'mt-4 space-y-2' },
        h('div', { class: 'text-sm font-bold text-gray-600' }, '自己紹介画像（グラレコ等）'),
        h('div', { class: 'text-xs text-gray-500 mb-2' }, '詳細ページにのみ表示されます。JPG/PNG推奨（大きすぎる画像は保存に時間がかかります）'),
        ...['introImage1', 'introImage2'].map((key, i) => {
          const fileInputId = `intro-img-${key}-${m.id || 'new'}`
          return h('div', { class: 'space-y-1' },
            h('label', { class: 'text-xs font-bold text-gray-600' }, `画像 ${i + 1}`),
            h('div', { class: 'flex gap-2 items-center' },
              h('label', { class: 'cursor-pointer px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-md text-sm border border-gray-300', for: fileInputId }, 'ファイルを選択'),
              h('input', {
                id: fileInputId,
                type: 'file',
                accept: 'image/*',
                class: 'hidden',
                onChange: async (e) => {
                  const file = e.target.files[0]
                  if (!file) return
                  try {
                    // Intro image can be opened in the lightbox — 1280px keeps it crisp when zoomed.
                    const dataUrl = await resizeImageToDataUrl(file, { maxDim: 1280, quality: 0.85 })
                    const blob = await (await fetch(dataUrl)).blob()
                    m[key] = await uploadBlobToR2(blob, 'intro', `intro-${file.name || 'image'}.jpg`)
                    update()
                  } catch (err) {
                    console.error('[intro image] upload failed', err)
                    alert('画像のアップロードに失敗しました：' + (err && err.message ? err.message : String(err)))
                  }
                },
              }),
              m[key] ? h('span', { class: 'text-xs text-green-600' }, '✓ 画像あり') : h('span', { class: 'text-xs text-gray-400' }, '未選択'),
            ),
            m[key] ? imgWithFallback(
              { src: m[key], class: 'mt-1 max-h-32 rounded-md object-contain border border-gray-200' },
              h('div', { class: 'text-xs text-red-500 mt-1' }, '画像を読み込めません')
            ) : null,
          )
        }),
      ),
      h('div', { class: 'mt-4 space-y-2' },
        h('div', { class: 'text-sm font-bold text-gray-600' }, 'YouTube動画（インタビュー等）'),
        h('div', { class: 'text-xs text-gray-500 mb-2' }, 'YouTubeのURLを貼り付けると詳細ページに動画が埋め込まれます'),
        h('div', { class: 'grid grid-cols-1 gap-3' },
          field('youtubeUrl1', '動画URL 1（例: https://youtube.com/watch?v=XXXXX）'),
          field('youtubeUrl2', '動画URL 2'),
        ),
      ),
      (() => {
        const pdfFileInputId = `pdf-file-input-${m.id || 'new'}`
        const isDataUrl = (m.profilePdfUrl || '').startsWith('data:')
        const dataUrlSizeKB = isDataUrl ? Math.round(m.profilePdfUrl.length / 1024) : 0
        return h('div', { class: 'mt-4 space-y-2' },
          h('div', { class: 'text-sm font-bold text-gray-600' }, 'プロフィールPDF（任意）'),
          h('div', { class: 'text-xs text-gray-500 mb-2' }, 'PDFをそのまま添付できます（最大20MB）。または Google Drive 等の共有URLを貼ってもOK。'),
          isDataUrl
            ? h('div', { class: 'flex items-center gap-2 p-2 rounded-md bg-yellow-50 border border-yellow-200' },
                h('i', { class: 'fas fa-file-pdf text-red-600 text-lg' }),
                h('span', { class: 'text-sm text-gray-700' }, `旧形式の埋め込みPDF（${dataUrlSizeKB} KB）。次回アップロードでR2に移ります`),
                h('button', {
                  type: 'button',
                  class: 'ml-auto text-xs px-2 py-1 rounded-md bg-gray-200 hover:bg-gray-300',
                  onClick: () => { m.profilePdfUrl = ''; update() },
                }, '削除'),
              )
            : h('div', { class: 'space-y-2' },
                field('profilePdfUrl', 'PDFのURL'),
                h('div', { class: 'flex items-center gap-2' },
                  h('span', { class: 'text-xs text-gray-500' }, 'または'),
                  h('label', {
                    class: 'cursor-pointer px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-md text-sm border border-gray-300',
                    for: pdfFileInputId,
                  }, '📎 PDFファイルを添付'),
                  h('input', {
                    id: pdfFileInputId,
                    type: 'file',
                    accept: 'application/pdf,.pdf',
                    class: 'hidden',
                    onChange: async (e) => {
                      const file = e.target.files && e.target.files[0]
                      if (!file) return
                      if (file.size > 20 * 1024 * 1024) {
                        alert(`このPDFは${Math.round(file.size / 1024 / 1024)} MB あり、上限の20MBを超えています。\n別のPDFを試すか、Google Drive等にアップロードして共有URLを貼ってください。`)
                        e.target.value = ''
                        return
                      }
                      try {
                        // 1) Upload the PDF itself
                        m.profilePdfUrl = await uploadBlobToR2(file, 'pdf', file.name || 'profile.pdf')
                        // Clear any old thumbnail so the UI shows a "generating..." state cleanly
                        m.profilePdfThumbUrl = ''
                        update()
                        // 2) Generate thumbnail of page 1 and upload it (best-effort — PDF still works without)
                        try {
                          const thumbDataUrl = await renderPdfFirstPageToJpeg(file, { maxWidth: 600, quality: 0.85 })
                          const thumbBlob = await (await fetch(thumbDataUrl)).blob()
                          m.profilePdfThumbUrl = await uploadBlobToR2(thumbBlob, 'pdf-thumb', 'pdf-thumb.jpg')
                          update()
                        } catch (thumbErr) {
                          console.warn('[pdf thumb] failed to generate thumbnail', thumbErr)
                          // Non-fatal: leave thumb URL empty, detail page will fall back to button-only
                        }
                      } catch (err) {
                        console.error('[pdf upload] failed', err)
                        alert('PDFのアップロードに失敗しました：' + (err && err.message ? err.message : String(err)))
                      }
                    },
                  }),
                ),
                m.profilePdfUrl && !isDataUrl ? h('div', { class: 'text-xs text-green-600 break-all' }, `✓ PDFが設定されています（${m.profilePdfUrl.slice(0, 80)}${m.profilePdfUrl.length > 80 ? '…' : ''}）`) : null,
                // Thumbnail preview if available (R2-uploaded PDFs only)
                m.profilePdfThumbUrl
                  ? h('div', { class: 'mt-1' },
                      h('div', { class: 'text-xs text-gray-500 mb-1' }, 'サムネイル（1ページ目）:'),
                      h('img', { src: m.profilePdfThumbUrl, class: 'max-h-40 rounded-md border border-gray-200 shadow-sm' }),
                    )
                  : (m.profilePdfUrl && !isDataUrl && m.profilePdfUrl.includes('/r2/pdf/') ? h('div', { class: 'text-xs text-gray-500' }, 'サムネイル生成中...') : null),
              ),
        )
      })(),
      h('div', { class: 'flex gap-2 mt-4 items-center' },
        h('button', { class: 'bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 rounded-lg min-h-[40px] disabled:opacity-50 disabled:cursor-not-allowed', onClick: onSubmit, disabled: !!state.saving }, state.saving ? '更新中…' : (isEdit ? '更新' : '登録')),
        h('button', { class: 'bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-lg min-h-[40px] disabled:opacity-50 disabled:cursor-not-allowed', onClick: () => { if (state.saving) return; state.formDraft = null; history.back() }, disabled: !!state.saving }, 'キャンセル'),
        state.saving ? h('span', { class: 'text-xs text-gray-500' }, 'サーバに保存中です…') : null,
      ),
    )
  }

  // Tag input component
  function TagInput(title, list, type) {
    const wrap = h('div', { class: 'space-y-1' })
    const input = h('input', {
      class: 'w-full border border-gray-300 rounded-lg px-3 py-2',
      placeholder: `${title} を追加してEnter`,
      onKeydown: (e) => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault()
          const v = e.target.value.trim()
          if (v && !list.includes(v)) list.push(v)
          e.target.value = ''
          update()
        }
      },
    })

    const quickAdd = (state.tags && state.tags[type] && state.tags[type].length
      ? state.tags[type]
      : Array.from(new Set(state.members.flatMap((m) => (type === 'interest' ? (m.interestTags || []) : type === 'involvement' ? (m.involvementTags || []) : type === 'area' ? (m.areaTags || []) : []))))
      ).filter((t) => {
        // 既存ラボメンに1件も紐づいていないタグは表示しない
        const used = state.members.some((m) => (type === 'interest' ? (m.interestTags || []) : type === 'involvement' ? (m.involvementTags || []) : type === 'area' ? (m.areaTags || []) : []).includes(t))
        return used
      })
    const chips = () =>
      h(
        'div',
        { class: 'flex flex-wrap gap-2' },
        list.map((t, idx) =>
          h(
            'span',
            { class: 'inline-flex items-center gap-2 text-xs px-2 py-1 rounded-full ' + (type === 'interest' ? 'bg-sky-100 text-sky-800' : type === 'involvement' ? 'bg-blue-100 text-blue-800' : type === 'area' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800') },
            t,
            h(
              'button',
              {
                class: 'ml-1 text-gray-500 hover:text-red-600',
                onClick: () => {
                  list.splice(idx, 1)
                  update()
                },
              },
              '×',
            ),
          ),
        ),
      )

    const quick = h(
      'div',
      { class: 'flex flex-wrap gap-2' },
      quickAdd.map((t) =>
        h(
          'button',
          {
            class: 'px-2 py-1 rounded-lg text-xs bg-gray-100 hover:bg-gray-200',
            onClick: () => {
              if (!list.includes(t)) list.push(t)
              update()
            },
          },
          t,
        ),
      ),
    )

    wrap.append(
      h('label', { class: 'text-xs font-bold text-gray-600' }, title),
      input,
      chips(),
      h('div', { class: 'text-xs font-bold text-gray-600 mt-2' }, '既存タグ'),
      h('div', { class: 'text-xs text-gray-500' }, 'クリックで追加／Enterで新規タグ追加'),
      quick,
    )

    return wrap
  }

  // Dialogue page
  function DialoguePage() {
    // ensure tags are refreshed when entering this page (for quick add in a future step)
    if (!state.tags || !(state.tags.interest && state.tags.involvement && state.tags.area)) {
      api.refreshAll().catch(()=>{})
    }
    const nameInput = h('input', {
      class: 'border border-gray-300 rounded-lg px-3 py-2 w-full md:w-64',
      placeholder: 'あなたの名前（必須）',
      value: state.operatorName,
      onInput: (e) => (state.operatorName = e.target.value),
    })

    const searchInput = h('input', {
      id: 'dialogue-q',
      'data-keep-focus': '1',
      class: 'border border-gray-300 rounded-lg px-3 py-2 w-full md:w-64',
      placeholder: '氏名/呼ばれたい名前で検索',
      value: state.dialogueSearchQ || '',
      onCompositionstart: () => { state.ui.isComposing = true },
      onCompositionend: () => { state.ui.isComposing = false; update() },
      onInput: (e) => {
        state.dialogueSearchQ = e.target.value
        if (!state.ui.isComposing) debounce('dialogue-q', () => update(), 200)
      }
    })

    const dQ = (state.dialogueSearchQ || '').toLowerCase()
    const filtered = state.members.filter((m) => [m.name, m.preferredName].join(' ').toLowerCase().includes(dQ))

    const list = h(
      'div',
      { class: 'grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3' },
      filtered.map((m) =>
        h(
          'button',
          {
            class: 'bg-white rounded-lg shadow p-3 hover:-translate-y-1 transition-all',
            onClick: () => {
              m._selected = !m._selected
              update()
            },
          },
          imgWithFallback(
            { src: m.imageUrl, class: 'w-16 h-16 rounded-full object-cover mx-auto' },
            h('div', { class: 'w-16 h-16 rounded-full bg-gray-200 mx-auto flex items-center justify-center text-gray-600' }, h('i', { class: 'fas fa-user' }))
          ),
          h('div', { class: 'text-xs mt-1 text-center' }, m.name),
        ),
      ),
    )

    const selected = state.members.filter((m) => m._selected)

    const cards = h(
      'div',
      { class: 'space-y-4' },
      selected.map((m) =>
        h(
          'div',
          { class: 'bg-white rounded-lg shadow p-4 space-y-2' },
          h('div', { class: 'flex items-center gap-3' },
            imgWithFallback(
              { src: m.imageUrl, class: 'w-10 h-10 rounded-full object-cover' },
              h('div', { class: 'w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600' }, h('i', { class: 'fas fa-user' }))
            ),
            h('div', { class: 'font-bold' }, m.name),
          ),
          h('details', {},
            h('summary', { class: 'text-sm font-bold text-gray-700 cursor-pointer' }, 'プロフィール'),
            h('div', { class: 'text-sm text-gray-600 space-y-1 mt-2' },
              h('div', {}, '呼ばれたい名前: ' + m.preferredName),
              h('div', { class: 'whitespace-pre-line' }, '普段やっていること: ' + m.occupation),
              h('div', { class: 'whitespace-pre-line' }, 'どうしてラボへ？: ' + m.whyLab),
              h('div', { class: 'whitespace-pre-line' }, 'やってみたいこと: ' + m.whatToDo),
            ),
          ),
          (function(){
            const cvInput = h('input', { class: 'border border-gray-300 rounded-lg px-3 py-2 flex-1', placeholder: '大切にしていること（キーワード）' })
            const add = async () => {
              const v = cvInput.value.trim()
              if (!v) return
              if (!state.operatorName) return alert('先にあなたの名前を入力してください')
              try {
                await api.addCoreValue(m.id, v, state.operatorName)
                m.coreValuesTags.push({ value: v, author: state.operatorName })
                cvInput.value = ''
                update()
              } catch (err) {
                Debug.error('[CoreValue add] failed', err)
                alert('追加に失敗しました')
              }
            }
            cvInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add() } })
            return h('div', { class: 'flex items-center gap-2' },
              cvInput,
              h('button', { class: 'bg-amber-400 text-white px-3 py-2 rounded-lg hover:bg-amber-500', onClick: add }, '追加')
            )
          })(),
          h('div', { class: 'flex flex-wrap gap-2' },
            m.coreValuesTags.map((cv, idx) =>
              h(
                'span',
                {
                  class:
                    'inline-flex items-center gap-2 text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-800',
                },
                `${cv.value} / ${cv.author}`,
                h(
                  'button',
                  {
                    class: 'text-gray-500 hover:text-red-600',
                    onClick: async () => {
                      try {
                        await api.deleteCoreValue(m.id, cv.value, cv.author)
                        m.coreValuesTags.splice(idx, 1)
                        update()
                      } catch (err) {
                        Debug.error('[CoreValue delete] failed', err)
                        alert('削除に失敗しました')
                      }
                    }
                  },
                  '×',
                ),
              ),
            ),
          ),
        ),
      ),
    )

    return container(
      h('h1', { class: 'text-2xl font-bold text-gray-900' }, 'ラボメン対話'),
      h('div', { class: 'mt-3 space-y-3' },
        h('div', {}, h('label', { class: 'text-xs font-bold text-gray-600 mr-2' }, 'あなたの名前'), nameInput),
        h('div', {}, h('label', { class: 'text-xs font-bold text-gray-600 mr-2' }, '参加者検索'), searchInput),
        h('div', { class: 'text-sm font-bold text-gray-700' }, '参加者を選択'),
        list,
        h('div', { class: 'mt-4 space-y-2' }, cards),
      ),
    )
  }

  // Correlation page (network graph with D3 force, filtered by selected tags)
  function CorrelationPage() {
    const interestAll = Array.from(new Set(state.members.flatMap((m) => m.interestTags)))
    const involvementAll = Array.from(new Set(state.members.flatMap((m) => m.involvementTags)))
    const areaAll = Array.from(new Set(state.members.flatMap((m) => m.areaTags || [])))
    const selected = { interest: new Set(), involvement: new Set(), area: new Set() }

    let rafId = 0
    const scheduleDraw = () => {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        draw().catch((e) => console.error('[Correlation] draw error:', e))
      })
    }

    const panel = h(
      'div',
      { class: 'space-y-2 mb-3' },
      h('div', { class: 'text-xs font-bold text-gray-600' }, 'タグを選択（複数可）'),
      tagRow('興味関心タグ', interestAll, 'interest', 'bg-sky-500'),
      tagRow('関わりタグ', involvementAll, 'involvement', 'bg-blue-500'),
      tagRow('活動エリアタグ', areaAll, 'area', 'bg-emerald-500'),
    )

    function tagRow(title, tags, type, activeBg) {
      return h(
        'div',
        {},
        h('div', { class: 'text-xs font-bold text-gray-600 mb-1' }, title),
        h(
          'div',
          { class: 'flex flex-wrap gap-2' },
          tags.map((t) => h(
            'button',
            {
              class: 'px-2 py-1 rounded-lg text-xs border bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-300',
              onClick: function () {
                const set = selected[type]
                const wasActive = set.has(t)
                if (wasActive) set.delete(t)
                else set.add(t)
                if (!wasActive) {
                  this.classList.add(activeBg, 'text-white', 'border-transparent')
                  this.classList.remove('bg-gray-100', 'text-gray-700', 'border-gray-300')
                } else {
                  this.classList.remove(activeBg, 'text-white', 'border-transparent')
                  this.classList.add('bg-gray-100', 'text-gray-700', 'border-gray-300')
                }
                Debug.log('[Correlation] selected', type, Array.from(set))
                scheduleDraw()
              },
            },
            t,
          ))
        )
      )
    }

    const debugOn = (localStorage.getItem('debug') === '1')
    const legend = h('div', { class: 'flex flex-wrap items-center gap-3 text-xs mb-2' },
      h('div', { class: 'flex items-center gap-2' }, h('span', { class: 'w-6 h-0.5 bg-sky-500 inline-block' }), '興味関心'),
      h('div', { class: 'flex items-center gap-2' }, h('span', { class: 'w-6 h-0.5 bg-blue-500 inline-block' }), '関わり方'),
      h('div', { class: 'flex items-center gap-2' }, h('span', { class: 'w-6 h-0.5 bg-emerald-500 inline-block' }), '活動エリア')
    )
    const svgWrap = h('div', { class: 'bg-white rounded-lg shadow p-2 relative ' + (debugOn ? 'debug-svg-wrap' : 'overflow-hidden') })
    const svg = h('svg', { width: '100%', height: 480 })
    svgWrap.appendChild(svg)

    // Observe size changes to re-draw when layout stabilizes
    const ro = new ResizeObserver(() => scheduleDraw())
    ro.observe(svgWrap)

    async function draw() {
      let d3
      try {
        d3 = await import('https://cdn.jsdelivr.net/npm/d3@7/+esm')
      } catch (e) {
        console.error('[Correlation] Failed to load d3:', e)
        svg.innerHTML = '<text x="12" y="24" fill="#ef4444">D3の読み込みに失敗しました。ネットワーク状況をご確認ください。</text>'
        return
      }
      // fallback width if not yet mounted
      let raw = svgWrap ? svgWrap.clientWidth : 0
      let width = raw - 16
      Debug.log('[Correlation] measured width raw:', raw, 'computed:', width)
      const height = 440
      if (!width || width < 100) width = 800
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
      // baseline frame for debug visibility (debug時のみ)
      if (debugOn) {
        try {
          const gBase = d3.select(svg).append('g').attr('data-debug','baseline')
          gBase.append('rect').attr('x',0.5).attr('y',0.5).attr('width',width-1).attr('height',height-1).attr('fill','none').attr('stroke','#93c5fd').attr('stroke-dasharray','4,2').attr('pointer-events','none')
          gBase.append('text').attr('x',8).attr('y',20).attr('fill','#60a5fa').attr('font-size',12).text(`${width}x${height}`)
        } catch (__) {}
      }
      Debug.log('[Correlation] width:', width, 'height:', height, 'selected:', Array.from(selected))

      const members = state.members
      Debug.log('[Correlation] members sample', members.slice(0,2))
      if (!members.length) {
        svg.innerHTML = '<text x="12" y="24" fill="#6b7280">メンバーがいません</text>'
        return
      }
      const nodes = members.map((m) => ({ id: m.id, member: m }))

      function commonTags(a, b) {
        const ints = a.interestTags.filter((t) => b.interestTags.includes(t))
        const invs = a.involvementTags.filter((t) => b.involvementTags.includes(t))
        const areas = (a.areaTags || []).filter((t) => (b.areaTags || []).includes(t))
        const useInts = selected.interest.size ? ints.filter((t) => selected.interest.has(t)) : []
        const useInvs = selected.involvement.size ? invs.filter((t) => selected.involvement.has(t)) : []
        const useAreas = selected.area.size ? areas.filter((t) => selected.area.has(t)) : []
        return { interest: useInts, involvement: useInvs, area: useAreas }
      }

      const links = []
      const anySelected = selected.interest.size + selected.involvement.size + selected.area.size
      if (anySelected > 0) {
        for (let i = 0; i < members.length; i++) {
          for (let j = i + 1; j < members.length; j++) {
            const by = commonTags(members[i], members[j])
            const total = by.interest.length + by.involvement.length + by.area.length
            if (total) links.push({ source: members[i].id, target: members[j].id, by, total })
          }
        }
      }
      Debug.log('[Correlation] nodes:', nodes.length, 'links:', links.length)

      // Clear previous drawing before deciding what to render
      svg.innerHTML = ''

      if (!links.length) {
        const msg = d3.select(svg).append('g')
          .attr('data-debug', 'true')
          .attr('data-links', 0)
        msg
          .append('text')
          .attr('x', 12)
          .attr('y', 24)
          .attr('fill', '#6b7280')
          .text('タグを選択すると、共通タグのあるつながりを表示します。')
      }

      const linkWidth = d3
        .scaleLinear()
        .domain([1, Math.max(2, d3.max(links, (d) => d.total) || 2)])
        .range([1, 6])
      const catColor = (d) => {
        const ints = d.by.interest.length, invs = d.by.involvement.length, areas = d.by.area.length
        if (ints === 0 && invs === 0 && areas === 0) return '#9ca3af'
        if (ints >= invs && ints >= areas) return '#0ea5e9' // sky-500
        if (invs >= ints && invs >= areas) return '#3b82f6' // blue-500
        return '#10b981' // emerald-500
      }

      const simulation = d3
        .forceSimulation(nodes)
        .force('link', d3.forceLink(links).id((d) => d.id).distance(140))
        .force('charge', d3.forceManyBody().strength(-280))
        .force('center', d3.forceCenter(width / 2, height / 2))

      const g = d3.select(svg).append('g')
        .attr('data-debug','root')

      const zoom = d3.zoom().on('zoom', (event) => {
        g.attr('transform', event.transform)
      })
      d3.select(svg).call(zoom)
      // Reset zoom to identity to avoid hidden state
      d3.select(svg).call(zoom.transform, d3.zoomIdentity)

      // remove old tooltip if any
      svgWrap.querySelectorAll('.cf-tooltip').forEach((el) => el.remove())
      const tooltip = h('div', {
        class: 'cf-tooltip absolute text-xs bg-white shadow rounded px-2 py-1 border hidden',
      })
      svgWrap.style.position = 'relative'
      svgWrap.appendChild(tooltip)

      // 大きめの透明ヒットエリアで細い線のツールチップを出しやすく
      const linkHit = g
        .selectAll('line.hit')
        .data(links)
        .enter()
        .append('line')
        .attr('class', 'hit')
        .attr('stroke', 'transparent')
        .attr('stroke-width', 16)
        .style('pointer-events', 'stroke')
        .on('mousemove', function (event, d) {
          tooltip.innerHTML = `[興味関心] ${(d.by.interest.join(', ')||'-')}  ` + ` [関わり方] ${(d.by.involvement.join(', ')||'-')}  ` + ` [活動エリア] ${(d.by.area.join(', ')||'-')}`
          tooltip.style.left = event.offsetX + 10 + 'px'
          tooltip.style.top = event.offsetY + 10 + 'px'
          tooltip.classList.remove('hidden')
        })
        .on('mouseout', () => tooltip.classList.add('hidden'))

      const link = g
        .selectAll('line.visible')
        .data(links)
        .enter()
        .append('line')
        .attr('class', 'visible')
        .attr('stroke', (d) => catColor(d))
        .attr('stroke-width', (d) => linkWidth(d.total))
        .attr('stroke-opacity', 0.85)
        .style('pointer-events', 'none')

      const node = g
        .selectAll('g.node')
        .data(nodes)
        .enter()
        .append('g')
        .attr('class', 'node')
        .call(
          d3
            .drag()
            .on('start', (event, d) => {
              if (!event.active) simulation.alphaTarget(0.3).restart()
              d.fx = d.x
              d.fy = d.y
            })
            .on('drag', (event, d) => {
              d.fx = event.x
              d.fy = event.y
            })
            .on('end', (event, d) => {
              if (!event.active) simulation.alphaTarget(0)
              d.fx = null
              d.fy = null
            }),
        )

      node.append('circle').attr('r', 22).attr('fill', '#e5e7eb')

      // Use <defs><clipPath> for consistent image clipping across browsers
      const defs = g.append('defs')
      const cp = defs.append('clipPath')
        .attr('id', 'avatar-clip')
        .attr('clipPathUnits', 'objectBoundingBox')
      cp.append('circle')
        .attr('r', 0.5)
        .attr('cx', 0.5)
        .attr('cy', 0.5)

      node
        .append('image')
        .attr(
          'href',
          (d) => d.member.imageUrl || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="%23e5e7eb"/><path d="M20 22c4.418 0 8-3.582 8-8s-3.582-8-8-8-8 3.582-8 8 3.582 8 8 8zm0 4c-6.627 0-12 3.134-12 7v3h24v-3c0-3.866-5.373-7-12-7z" fill="%236b7280"/></svg>',
        )
        .attr('x', -20)
        .attr('y', -20)
        .attr('width', 40)
        .attr('height', 40)
        .attr('clip-path', 'url(#avatar-clip)')
        .append('title')
        .text((d) => d.member.name)

      // name label above icon
      node.append('text')
        .attr('y', -30)
        .attr('text-anchor', 'middle')
        .attr('font-size', 10)
        .attr('fill', '#374151')
        .text((d) => d.member.name)

      simulation.on('tick', () => {
        linkHit
          .attr('x1', (d) => d.source.x)
          .attr('y1', (d) => d.source.y)
          .attr('x2', (d) => d.target.x)
          .attr('y2', (d) => d.target.y)

        link
          .attr('x1', (d) => d.source.x)
          .attr('y1', (d) => d.source.y)
          .attr('x2', (d) => d.target.x)
          .attr('y2', (d) => d.target.y)

        node.attr('transform', (d) => `translate(${d.x},${d.y})`)
      })

      // visibility check and auto-fit
      try {
        const maxAttempts = 3
        let attempt = 0
        const check = () => {
          try {
            const bbox = g.node().getBBox()
            Debug.log('[Correlation] bbox', {x:bbox.x, y:bbox.y, w:bbox.width, h:bbox.height})
            if (!bbox.width || !bbox.height || bbox.width < 1 || bbox.height < 1) {
              if (++attempt <= maxAttempts) return requestAnimationFrame(check)
            }
            const pad = 40
            const sx = width / (bbox.width + pad)
            const sy = height / (bbox.height + pad)
            const scale = Math.min(1, sx, sy)
            const tx = width / 2 - (bbox.x + bbox.width / 2) * scale
            const ty = height / 2 - (bbox.y + bbox.height / 2) * scale
            d3.select(svg).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale))
          } catch (e) {
            console.warn('[Correlation] ensureVisible failed', e)
          }
        }
        requestAnimationFrame(check)
      } catch (__) {}
    }

    const wrap = container(
      h('h1', { class: 'text-2xl font-bold text-gray-900' }, 'ラボメン相関図（ネットワーク）'),
      panel,
      legend,
      svgWrap,
    )

    // Draw after layout
    scheduleDraw()
    return wrap
  }

  // Core values word cloud (force layout, zoom/drag, size by frequency)
  function CoreValuesPage() {
    const debugOn = (localStorage.getItem('debug') === '1')
    const legend = h('div', { class: 'flex flex-wrap items-center gap-3 text-xs mb-2' },
      h('div', { class: 'flex items-center gap-2' }, h('span', { class: 'w-6 h-0.5 bg-sky-500 inline-block' }), '興味関心'),
      h('div', { class: 'flex items-center gap-2' }, h('span', { class: 'w-6 h-0.5 bg-blue-500 inline-block' }), '関わり方'),
      h('div', { class: 'flex items-center gap-2' }, h('span', { class: 'w-6 h-0.5 bg-emerald-500 inline-block' }), '活動エリア')
    )
    const svgWrap = h('div', { class: 'bg-white rounded-lg shadow p-2 relative ' + (debugOn ? 'debug-svg-wrap' : 'overflow-hidden') })
    const svg = h('svg', { width: '100%', height: 480 })
    svgWrap.appendChild(svg)

    let rafId = 0
    const scheduleDraw = () => {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        draw().catch((e) => console.error('[CoreValues] draw error:', e))
      })
    }

    const ro = new ResizeObserver(() => scheduleDraw())
    ro.observe(svgWrap)

    async function draw() {
      let d3
      try {
        d3 = await import('https://cdn.jsdelivr.net/npm/d3@7/+esm')
      } catch (e) {
        console.error('[CoreValues] Failed to load d3:', e)
        svg.innerHTML = '<text x="12" y="24" fill="#ef4444">D3の読み込みに失敗しました。ネットワーク状況をご確認ください。</text>'
        return
      }
      const Tableau10 = d3.schemeTableau10
      const words = collectCoreValues()
      Debug.log('[CoreValues] words sample', words.slice(0, 5))

      svg.innerHTML = ''
      // set viewBox with fallback width
      let raw = svgWrap ? svgWrap.clientWidth : 0
      let width = raw - 16
      Debug.log('[CoreValues] measured width raw:', raw, 'computed:', width)
      const height = 440
      if (!width || width < 100) width = 800
      svg.setAttribute('viewBox', `0 0 ${width} ${height}` )
      // baseline frame for debug visibility (debug時のみ)
      if (debugOn) {
        try {
          const gBase = d3.select(svg).append('g').attr('data-debug','baseline')
          gBase.append('rect').attr('x',0.5).attr('y',0.5).attr('width',width-1).attr('height',height-1).attr('fill','none').attr('stroke','#93c5fd').attr('stroke-dasharray','4,2').attr('pointer-events','none')
          gBase.append('text').attr('x',8).attr('y',20).attr('fill','#60a5fa').attr('font-size',12).text(`${width}x${height}`)
        } catch (__) {}
      }
      Debug.log('[CoreValues] width:', width, 'height:', height, 'words:', words.length)

      // frequency map
      const freq = new Map()
      words.forEach((w) => freq.set(w, (freq.get(w) || 0) + 1))
      const items = [...freq.entries()].map(([text, count]) => ({ text, count }))
      if (!items.length) {
        svg.innerHTML = '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#6b7280">データがありません</text>'
        return
      }

      const size = d3.scaleSqrt().domain([1, Math.max(...items.map((d) => d.count))]).range([12, 60])
      const color = d3.scaleOrdinal(Tableau10)

      // D3 force to avoid overlap
      const nodes = items.map((d) => {
        const fs = size(d.count)
        const w = Math.max(8, d.text.length * fs * 0.6)
        const h = fs
        const r = Math.sqrt((w*w + h*h)) / 2 + 6
        return { ...d, fs, w, h, r, x: Math.random() * width, y: Math.random() * height }
      })
      const sim = d3
        .forceSimulation(nodes)
        .force('charge', d3.forceManyBody().strength(-1))
        .force('collide', d3.forceCollide().radius((d) => d.r).strength(1))
        .force('x', d3.forceX(width / 2).strength(0.08))
        .force('y', d3.forceY(height / 2).strength(0.08))

      const g = d3.select(svg).append('g')
      const zoom = d3.zoom().on('zoom', (event) => g.attr('transform', event.transform))
      d3.select(svg).call(zoom)
      // Reset zoom to identity to avoid hidden state
      d3.select(svg).call(zoom.transform, d3.zoomIdentity)

      // visibility check and auto-fit
      try {
        const maxAttempts = 3
        let attempt = 0
        const check = () => {
          try {
            const bbox = g.node().getBBox()
            Debug.log('[CoreValues] bbox', {x:bbox.x, y:bbox.y, w:bbox.width, h:bbox.height})
            if (!bbox.width || !bbox.height || bbox.width < 1 || bbox.height < 1) {
              if (++attempt <= maxAttempts) return requestAnimationFrame(check)
            }
            const pad = 40
            const sx = width / (bbox.width + pad)
            const sy = height / (bbox.height + pad)
            const scale = Math.min(1, sx, sy)
            const tx = width / 2 - (bbox.x + bbox.width / 2) * scale
            const ty = height / 2 - (bbox.y + bbox.height / 2) * scale
            d3.select(svg).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale))
          } catch (e) {
            console.warn('[CoreValues] ensureVisible failed', e)
          }
        }
        requestAnimationFrame(check)
      } catch (__) {}
      // Reset zoom to identity to avoid hidden state
      d3.select(svg).call(zoom.transform, d3.zoomIdentity)

      const texts = g
        .selectAll('text')
        .data(nodes)
        .enter()
        .append('text')
        .attr('x', (d) => d.x)
        .attr('y', (d) => d.y)
        .attr('font-size', (d) => d.fs)
        .attr('fill', (d) => color(d.text))
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .style('cursor', 'move')
        .text((d) => d.text)
        .call(
          d3
            .drag()
            .on('start', (event, d) => {
              if (!event.active) sim.alphaTarget(0.3).restart()
              d.fx = d.x
              d.fy = d.y
            })
            .on('drag', (event, d) => {
              d.fx = event.x
              d.fy = event.y
            })
            .on('end', (event, d) => {
              if (!event.active) sim.alphaTarget(0)
              d.fx = null
              d.fy = null
            }),
        )

      sim.on('tick', () => {
        texts.attr('x', (d) => d.x).attr('y', (d) => d.y)
      })
    }

    const wrap = container(
      h('h1', { class: 'text-2xl font-bold text-gray-900' }, '大切にしていること（ワードクラウド）'),
      svgWrap,
    )

    // draw after layout
    scheduleDraw()
    return wrap
  }

  function collectCoreValues() {
    return state.members.flatMap((m) => m.coreValuesTags.map((cv) => cv.value))
  }

  // Tag Map Page - D3バブルチャート（カテゴリタブ切り替え + 2人以上のタグのみ表示）
  function TagMapPage() {
    const cat = state.tagMapCategory || 'interest'
    const colorMap = { interest: '#0ea5e9', involvement: '#3b82f6', area: '#10b981' }
    const catLabel = { interest: '興味関心', involvement: '関わり方', area: '活動エリア' }

    const tabs = h('div', { class: 'flex gap-2 mb-4' },
      ...['interest', 'involvement', 'area'].map(c =>
        h('button', {
          class: 'px-4 py-2 rounded-full text-sm font-bold border-2 transition-colors ' +
            (cat === c
              ? `border-transparent text-white`
              : 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50'),
          style: cat === c ? `background:${colorMap[c]};border-color:${colorMap[c]}` : '',
          onClick: () => { state.tagMapCategory = c; update() },
        }, catLabel[c])
      )
    )

    const svgWrap = h('div', { style: 'width:100%;height:480px;position:relative;', id: 'tag-map-wrap' })
    const panel = h('div', { id: 'tag-map-panel', class: 'mt-4 hidden' })
    const tooltip = h('div', {
      id: 'tag-map-tooltip',
      class: 'hidden pointer-events-none z-10 bg-gray-800 text-white text-xs rounded px-2 py-1',
      style: 'position:fixed;'
    })

    function buildTagData(category) {
      const map = {}
      const addTag = (name, member) => {
        if (!name) return
        if (!map[name]) map[name] = { name, category, count: 0, members: [] }
        map[name].count++
        if (!map[name].members.find(mx => mx.id === member.id)) map[name].members.push(member)
      }
      const tagKey = { interest: 'interestTags', involvement: 'involvementTags', area: 'areaTags' }
      state.members.forEach(m => {
        ;(m[tagKey[category]] || []).forEach(t => addTag(t, m))
      })
      // 3人以上のタグのみ返す
      return Object.values(map).filter(t => t.count >= 3)
    }

    function scheduleDraw() {
      requestAnimationFrame(() => {
        const wrap = document.getElementById('tag-map-wrap')
        if (!wrap) return
        drawTagMap(wrap)
      })
    }

    async function drawTagMap(wrap) {
      let d3
      try {
        d3 = await import('https://cdn.jsdelivr.net/npm/d3@7/+esm')
      } catch (e) {
        wrap.innerHTML = '<p class="text-red-500 p-4">D3の読み込みに失敗しました。ネットワーク状況をご確認ください。</p>'
        return
      }

      const width = wrap.clientWidth || 800
      const height = 480
      const currentCat = state.tagMapCategory || 'interest'
      const tags = buildTagData(currentCat)
      if (!tags.length) {
        wrap.innerHTML = '<p class="text-gray-500 p-4">3人以上が持つタグがありません。</p>'
        return
      }

      const colorBase = { interest: '#0ea5e9', involvement: '#3b82f6', area: '#10b981' }
      const color = colorBase[currentCat]

      // Treemapレイアウト
      const root = d3.hierarchy({ children: tags })
        .sum(d => d.count)
        .sort((a, b) => b.value - a.value)

      d3.treemap()
        .size([width, height])
        .padding(3)
        .round(true)(root)

      // メンバー数の最大値（色の濃淡用）
      const maxCount = d3.max(tags, t => t.count)

      const svg = d3.select(wrap).append('svg')
        .attr('width', '100%').attr('height', height)
        .attr('viewBox', `0 0 ${width} ${height}`)
        .style('border-radius', '12px').style('overflow', 'hidden')

      const tipEl = document.getElementById('tag-map-tooltip')

      const cell = svg.selectAll('g.cell').data(root.leaves()).enter()
        .append('g').attr('class', 'cell')
        .attr('transform', d => `translate(${d.x0},${d.y0})`)
        .style('cursor', 'pointer')

      // 色の濃淡：メンバー数が多いほど濃い
      const colorScale = d3.scaleLinear()
        .domain([3, maxCount])
        .range([color + '30', color + 'cc'])

      cell.append('rect')
        .attr('width', d => Math.max(0, d.x1 - d.x0))
        .attr('height', d => Math.max(0, d.y1 - d.y0))
        .attr('fill', d => colorScale(d.data.count))
        .attr('stroke', '#fff')
        .attr('stroke-width', 2)
        .attr('rx', 4)

      // タイルのサイズが十分な場合のみラベル表示
      const LABEL_MIN_W = 50
      const LABEL_MIN_H = 30

      cell.each(function(d) {
        const w = d.x1 - d.x0
        const h = d.y1 - d.y0
        if (w < LABEL_MIN_W || h < LABEL_MIN_H) return  // 小さすぎる場合は非表示

        const g = d3.select(this)
        const fs = Math.min(14, Math.max(10, Math.sqrt(w * h) * 0.12))
        const textColor = d.data.count >= maxCount * 0.6 ? '#ffffff' : color

        g.append('text')
          .attr('x', w / 2).attr('y', h / 2 - (h > 50 ? 8 : 0))
          .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
          .attr('font-size', fs).attr('font-weight', 'bold')
          .attr('fill', textColor)
          .text(d.data.name)

        if (h > 50) {
          g.append('text')
            .attr('x', w / 2).attr('y', h / 2 + fs + 2)
            .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
            .attr('font-size', 10).attr('fill', textColor).attr('opacity', 0.8)
            .text(`${d.data.count}人`)
        }
      })

      cell.on('mouseover', function(event, d) {
        if (tipEl) {
          tipEl.classList.remove('hidden')
          tipEl.textContent = `${d.data.name}（${d.data.count}人）`
        }
        d3.select(this).select('rect').attr('opacity', 0.75)
      })
      .on('mousemove', function(event) {
        if (tipEl) {
          tipEl.style.left = (event.clientX + 12) + 'px'
          tipEl.style.top = (event.clientY - 8) + 'px'
        }
      })
      .on('mouseout', function() {
        if (tipEl) tipEl.classList.add('hidden')
        d3.select(this).select('rect').attr('opacity', 1)
      })
      .on('click', function(event, d) {
        const panelEl = document.getElementById('tag-map-panel')
        if (!panelEl) return
        panelEl.innerHTML = ''
        panelEl.classList.remove('hidden')
        const title = document.createElement('div')
        title.className = 'text-base font-bold text-gray-800 mb-3 border-b pb-2'
        title.textContent = `「${d.data.name}」タグのメンバー（${d.data.count}人）`
        panelEl.appendChild(title)
        const grid = document.createElement('div')
        grid.className = 'grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-3'
        d.data.members.forEach(m => {
          const card = document.createElement('div')
          card.className = 'flex flex-col items-center gap-1 cursor-pointer hover:opacity-80'
          card.onclick = () => navigate(`/member/${m.id}`)
          if (m.imageUrl) {
            const img = document.createElement('img')
            img.src = m.imageUrl; img.className = 'w-14 h-14 rounded-full object-cover shadow'
            card.appendChild(img)
          } else {
            const ph = document.createElement('div')
            ph.className = 'w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center'
            ph.innerHTML = '<i class="fas fa-user text-gray-500"></i>'
            card.appendChild(ph)
          }
          const name = document.createElement('div')
          name.className = 'text-xs text-center text-gray-700 leading-tight'
          name.textContent = m.preferredName || m.name
          card.appendChild(name)
          grid.appendChild(card)
        })
        panelEl.appendChild(grid)
      })
    }

    const hint = h('div', { class: 'text-xs text-gray-400 mb-1' }, '面積の大きさ = メンバー数　色が濃いほど人数が多い　※3人以上のタグのみ表示　タイルをクリックするとメンバー表示')

    const wrap = container(
      h('h1', { class: 'text-2xl font-bold text-gray-900' }, 'タグマップ'),
      h('p', { class: 'text-sm text-gray-500' }, 'タブを切り替えてカテゴリ別のタグ分布を確認できます。'),
      tabs,
      hint,
      svgWrap,
      tooltip,
      panel,
    )

    scheduleDraw()
    return wrap
  }

  // Container helper
  // ---------- ねえねえポスト ----------
  const POST_STATUS_META = {
    new: { label: '🆕 未対応', badge: 'bg-gray-200 text-gray-800' },
    in_progress: { label: '🔧 対応中', badge: 'bg-sky-200 text-sky-900' },
    done: { label: '✅ 対応済み', badge: 'bg-emerald-200 text-emerald-900' },
    wontfix: { label: '💤 見送り', badge: 'bg-amber-100 text-amber-800' },
  }

  function formatPostDate(s) {
    if (!s) return ''
    const d = new Date(s)
    if (isNaN(d.getTime())) return s
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${y}/${m}/${day} ${hh}:${mm}`
  }

  const POSTS_LIKED_KEY = 'posts.likedIds.v1'
  function loadLikedIds() {
    try {
      const raw = localStorage.getItem(POSTS_LIKED_KEY)
      if (!raw) return new Set()
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) return new Set(arr.map((x) => Number(x)).filter((x) => Number.isFinite(x)))
    } catch (_) {}
    return new Set()
  }
  function saveLikedIds(set) {
    try {
      localStorage.setItem(POSTS_LIKED_KEY, JSON.stringify(Array.from(set)))
    } catch (_) {}
  }

  async function toggleLikePost(post) {
    const id = post.id
    if (state.posts.likeBusy.has(id)) return
    state.posts.likeBusy.add(id)
    const liked = state.posts.likedIds.has(id)
    // optimistic update
    if (liked) {
      state.posts.likedIds.delete(id)
      post.likes = Math.max(0, (post.likes || 0) - 1)
    } else {
      state.posts.likedIds.add(id)
      post.likes = (post.likes || 0) + 1
    }
    saveLikedIds(state.posts.likedIds)
    update()
    try {
      const res = liked ? await api.unlikeImprovement(id) : await api.likeImprovement(id)
      if (typeof res?.likes === 'number') {
        post.likes = res.likes
      }
    } catch (e) {
      // revert on failure
      if (liked) {
        state.posts.likedIds.add(id)
        post.likes = (post.likes || 0) + 1
      } else {
        state.posts.likedIds.delete(id)
        post.likes = Math.max(0, (post.likes || 0) - 1)
      }
      saveLikedIds(state.posts.likedIds)
      alert('いいねの保存に失敗しました：' + (e && e.message ? e.message : e))
    } finally {
      state.posts.likeBusy.delete(id)
      update()
    }
  }

  async function loadPosts({ force = false } = {}) {
    if (state.posts.loaded && !force) return
    state.posts.loading = true
    // first load: pull likedIds from localStorage
    if (!state.posts.loaded) {
      state.posts.likedIds = loadLikedIds()
    }
    update()
    try {
      const items = await api.listImprovements()
      state.posts.items = items
      state.posts.loaded = true
    } catch (e) {
      Debug.error('[Posts] load failed', e)
      alert('投稿の読み込みに失敗しました：' + (e && e.message ? e.message : e))
    } finally {
      state.posts.loading = false
      update()
    }
  }

  async function submitPost() {
    const c = state.posts.composer
    const title = (c.title || '').trim()
    if (!title) {
      alert('タイトルを入力してください')
      return
    }
    try {
      await api.createImprovement({
        title,
        body: c.body || '',
        submitter: (c.submitter || '').trim(),
      })
      state.posts.composer = { open: false, title: '', body: '', submitter: '' }
      await loadPosts({ force: true })
    } catch (e) {
      alert('投稿に失敗しました：' + (e && e.message ? e.message : e))
    }
  }

  async function changePostStatus(post, status) {
    if (post.status === status) return
    try {
      await api.updateImprovement(post.id, { status })
      post.status = status
      post.updated_at = new Date().toISOString()
      update()
    } catch (e) {
      alert('ステータス変更に失敗しました：' + (e && e.message ? e.message : e))
    }
  }

  async function submitComment(post) {
    const draft = state.posts.commentDraft[post.id] || { body: '', commenter: '' }
    const body = (draft.body || '').trim()
    if (!body) {
      alert('コメントを入力してください')
      return
    }
    try {
      await api.addImprovementComment(post.id, {
        body,
        commenter: (draft.commenter || '').trim(),
      })
      state.posts.commentDraft[post.id] = { body: '', commenter: draft.commenter || '' }
      // refresh the detail (comments) inline
      const fresh = await api.getImprovement(post.id)
      post.comments = fresh.comments || []
      post.comment_count = (fresh.comments || []).length
      post.updated_at = fresh.updated_at
      update()
    } catch (e) {
      alert('コメント投稿に失敗しました：' + (e && e.message ? e.message : e))
    }
  }

  async function togglePostExpanded(post) {
    const id = post.id
    if (state.posts.expanded.has(id)) {
      state.posts.expanded.delete(id)
      update()
      return
    }
    state.posts.expanded.add(id)
    // fetch comments lazily
    if (!Array.isArray(post.comments)) {
      try {
        const fresh = await api.getImprovement(id)
        post.comments = fresh.comments || []
      } catch (e) {
        Debug.error('[Posts] failed to load comments', e)
      }
    }
    update()
  }

  function startEditPost(post) {
    state.posts.editing = {
      id: post.id,
      title: post.title || '',
      body: post.body || '',
      submitter: post.submitter || '',
    }
    // ensure the card stays expanded while editing
    state.posts.expanded.add(post.id)
    update()
  }

  function cancelEditPost() {
    state.posts.editing = { id: null, title: '', body: '', submitter: '' }
    update()
  }

  async function saveEditPost() {
    const e = state.posts.editing
    if (!e.id) return
    const title = (e.title || '').trim()
    if (!title) {
      alert('タイトルを入力してください')
      return
    }
    try {
      await api.updateImprovement(e.id, {
        title,
        body: e.body || '',
        submitter: (e.submitter || '').trim(),
      })
      const post = state.posts.items.find((p) => p.id === e.id)
      if (post) {
        post.title = title
        post.body = e.body || ''
        post.submitter = (e.submitter || '').trim() || '匿名のラボメン'
        post.updated_at = new Date().toISOString()
      }
      state.posts.editing = { id: null, title: '', body: '', submitter: '' }
      update()
    } catch (err) {
      alert('編集の保存に失敗しました：' + (err && err.message ? err.message : err))
    }
  }

  async function deletePost(post) {
    if (!confirm(`「${post.title}」を削除しますか？コメントも一緒に削除されます。`)) return
    try {
      await api.deleteImprovement(post.id)
      state.posts.items = state.posts.items.filter((p) => p.id !== post.id)
      state.posts.expanded.delete(post.id)
      update()
    } catch (e) {
      alert('削除に失敗しました：' + (e && e.message ? e.message : e))
    }
  }

  async function deleteComment(post, comment) {
    if (!confirm('このコメントを削除しますか？')) return
    try {
      await api.deleteImprovementComment(post.id, comment.id)
      post.comments = (post.comments || []).filter((c) => c.id !== comment.id)
      post.comment_count = Math.max(0, (post.comment_count || 1) - 1)
      update()
    } catch (e) {
      alert('コメント削除に失敗しました：' + (e && e.message ? e.message : e))
    }
  }

  function PostStatusBadge(status) {
    const meta = POST_STATUS_META[status] || POST_STATUS_META.new
    return h('span', { class: `inline-block text-xs font-bold px-2 py-1 rounded-full ${meta.badge}` }, meta.label)
  }

  function PostComposer() {
    const c = state.posts.composer
    if (!c.open) {
      return h(
        'button',
        {
          class: 'w-full md:w-auto bg-sky-500 hover:bg-sky-600 text-white px-4 py-3 rounded-lg text-sm font-semibold shadow flex items-center justify-center gap-2',
          onClick: () => { state.posts.composer.open = true; update() },
        },
        h('i', { class: 'fas fa-plus' }),
        '新しいねえねえを投稿する',
      )
    }
    return h('div', { class: 'bg-white rounded-lg shadow p-4 space-y-3 border border-sky-200' },
      h('div', { class: 'flex items-center justify-between' },
        h('h2', { class: 'text-lg font-bold text-gray-900 flex items-center gap-2' },
          h('i', { class: 'fas fa-envelope-open-text text-sky-600' }),
          'ねえねえ、これどうかな？',
        ),
        h('button', {
          class: 'text-gray-500 hover:text-gray-700 text-sm',
          onClick: () => { state.posts.composer = { open: false, title: '', body: '', submitter: '' }; update() },
        }, '閉じる'),
      ),
      h('div', {},
        h('label', { class: 'block text-xs font-bold text-gray-600 mb-1' }, 'タイトル（必須）'),
        h('input', {
          id: 'post-title',
          'data-keep-focus': '1',
          type: 'text',
          placeholder: '例：トップにお知らせコーナーが欲しい',
          class: 'w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-300',
          value: c.title,
          onInput: (e) => { c.title = e.target.value },
        }),
      ),
      h('div', {},
        h('label', { class: 'block text-xs font-bold text-gray-600 mb-1' }, '内容'),
        h('textarea', {
          id: 'post-body',
          'data-keep-focus': '1',
          rows: 4,
          placeholder: 'どんな改善があると嬉しい？背景や使い方のイメージなどがあれば一緒に書いてください。',
          class: 'w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-300',
          value: c.body,
          onInput: (e) => { c.body = e.target.value },
        }),
      ),
      h('div', {},
        h('label', { class: 'block text-xs font-bold text-gray-600 mb-1' }, 'お名前（空欄なら「匿名のラボメン」）'),
        h('input', {
          id: 'post-submitter',
          'data-keep-focus': '1',
          type: 'text',
          placeholder: '匿名のラボメン',
          class: 'w-full md:w-1/2 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-300',
          value: c.submitter,
          onInput: (e) => { c.submitter = e.target.value },
        }),
      ),
      h('div', { class: 'flex justify-end gap-2' },
        h('button', {
          class: 'px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-sm',
          onClick: () => { state.posts.composer = { open: false, title: '', body: '', submitter: '' }; update() },
        }, 'キャンセル'),
        h('button', {
          class: 'px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold shadow',
          onClick: submitPost,
        }, '投稿する'),
      ),
    )
  }

  function PostCard(post) {
    const expanded = state.posts.expanded.has(post.id)
    const draft = state.posts.commentDraft[post.id] || { body: '', commenter: '' }
    state.posts.commentDraft[post.id] = draft
    const isEditing = state.posts.editing.id === post.id

    const statusSelect = h('select', {
      class: 'text-xs border border-gray-300 rounded px-2 py-1 bg-white',
      onChange: (e) => changePostStatus(post, e.target.value),
      onClick: (e) => e.stopPropagation(),
    },
      ...Object.entries(POST_STATUS_META).map(([key, meta]) =>
        h('option', { value: key, selected: post.status === key ? 'selected' : null }, meta.label)
      ),
    )

    const liked = state.posts.likedIds.has(post.id)
    const likeBtn = h('button', {
      class: 'flex items-center gap-1 text-xs px-2 py-1 rounded-full border ' +
        (liked
          ? 'bg-pink-50 text-pink-600 border-pink-200 hover:bg-pink-100'
          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'),
      title: liked ? 'いいねを取り消す' : 'いいねする',
      onClick: (ev) => { ev.stopPropagation(); toggleLikePost(post) },
    },
      h('i', { class: (liked ? 'fas' : 'far') + ' fa-heart' }),
      h('span', { class: 'font-semibold' }, String(post.likes || 0)),
    )

    const header = h('div', {
      class: 'flex items-start justify-between gap-3 cursor-pointer',
      onClick: () => togglePostExpanded(post),
    },
      h('div', { class: 'flex-1 min-w-0' },
        h('div', { class: 'flex items-center gap-2 flex-wrap mb-1' },
          PostStatusBadge(post.status),
          h('span', { class: 'text-xs text-gray-500' }, `${formatPostDate(post.created_at)} · ${post.submitter || '匿名のラボメン'}`),
        ),
        h('h3', { class: 'text-base font-bold text-gray-900 break-words' }, post.title),
      ),
      h('div', { class: 'flex items-center gap-2 flex-shrink-0' },
        likeBtn,
        h('span', { class: 'text-xs text-gray-600 flex items-center gap-1' },
          h('i', { class: 'far fa-comment' }),
          String(post.comment_count || 0),
        ),
        h('i', { class: `fas fa-chevron-${expanded ? 'up' : 'down'} text-gray-400` }),
      ),
    )

    if (!expanded) {
      return h('div', { class: 'bg-white rounded-lg shadow p-4' }, header)
    }

    // ----- Edit mode -----
    if (isEditing) {
      const e = state.posts.editing
      const editHeader = h('div', { class: 'flex items-center justify-between gap-3' },
        h('div', { class: 'flex items-center gap-2 flex-wrap' },
          PostStatusBadge(post.status),
          h('span', { class: 'text-xs text-gray-500' }, `編集中（${formatPostDate(post.created_at)}）`),
        ),
        h('i', { class: 'fas fa-pen text-sky-500' }),
      )
      return h('div', { class: 'bg-white rounded-lg shadow p-4 space-y-3 border-2 border-sky-200' },
        editHeader,
        h('div', {},
          h('label', { class: 'block text-xs font-bold text-gray-600 mb-1' }, 'タイトル（必須）'),
          h('input', {
            id: `post-edit-title-${post.id}`,
            'data-keep-focus': '1',
            type: 'text',
            class: 'w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-300',
            value: e.title,
            onInput: (ev) => { e.title = ev.target.value },
          }),
        ),
        h('div', {},
          h('label', { class: 'block text-xs font-bold text-gray-600 mb-1' }, '内容'),
          h('textarea', {
            id: `post-edit-body-${post.id}`,
            'data-keep-focus': '1',
            rows: 5,
            class: 'w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-300',
            value: e.body,
            onInput: (ev) => { e.body = ev.target.value },
          }),
        ),
        h('div', {},
          h('label', { class: 'block text-xs font-bold text-gray-600 mb-1' }, 'お名前（空欄なら「匿名のラボメン」）'),
          h('input', {
            id: `post-edit-name-${post.id}`,
            'data-keep-focus': '1',
            type: 'text',
            placeholder: '匿名のラボメン',
            class: 'w-full md:w-1/2 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-300',
            value: e.submitter,
            onInput: (ev) => { e.submitter = ev.target.value },
          }),
        ),
        h('div', { class: 'flex justify-end gap-2' },
          h('button', {
            class: 'px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-sm',
            onClick: cancelEditPost,
          }, 'キャンセル'),
          h('button', {
            class: 'px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold shadow',
            onClick: saveEditPost,
          }, '保存する'),
        ),
      )
    }

    const commentsList = Array.isArray(post.comments) && post.comments.length > 0
      ? h('ul', { class: 'space-y-2' },
          ...post.comments.map((cm) =>
            h('li', { class: 'bg-gray-50 rounded-lg p-3' },
              h('div', { class: 'flex items-center justify-between gap-2 mb-1' },
                h('span', { class: 'text-xs font-bold text-gray-700' }, cm.commenter || '匿名のラボメン'),
                h('div', { class: 'flex items-center gap-2' },
                  h('span', { class: 'text-xs text-gray-500' }, formatPostDate(cm.created_at)),
                  h('button', {
                    class: 'text-xs text-red-500 hover:text-red-700',
                    title: 'コメント削除',
                    onClick: () => deleteComment(post, cm),
                  }, h('i', { class: 'fas fa-trash' })),
                ),
              ),
              h('p', { class: 'text-sm text-gray-800 whitespace-pre-wrap break-words' }, cm.body),
            ),
          ),
        )
      : h('p', { class: 'text-xs text-gray-500' }, 'まだコメントはありません。')

    return h('div', { class: 'bg-white rounded-lg shadow p-4 space-y-3' },
      header,
      post.body
        ? h('p', { class: 'text-sm text-gray-800 whitespace-pre-wrap break-words bg-sky-50 p-3 rounded-lg' }, post.body)
        : null,
      h('div', { class: 'flex flex-wrap items-center gap-2 text-xs' },
        h('span', { class: 'text-gray-600' }, 'ステータス：'),
        statusSelect,
        h('button', {
          class: 'ml-auto text-sky-600 hover:text-sky-800 text-xs font-medium',
          onClick: () => startEditPost(post),
        }, h('i', { class: 'fas fa-pen mr-1' }), '編集'),
        h('button', {
          class: 'text-red-500 hover:text-red-700 text-xs',
          onClick: () => deletePost(post),
        }, h('i', { class: 'fas fa-trash mr-1' }), '削除'),
      ),
      h('div', { class: 'border-t pt-3 space-y-2' },
        h('h4', { class: 'text-sm font-bold text-gray-700' }, `コメント（${(post.comments || []).length}）`),
        commentsList,
        h('div', { class: 'space-y-2 pt-2' },
          h('textarea', {
            id: `post-comment-body-${post.id}`,
            'data-keep-focus': '1',
            rows: 2,
            placeholder: '状況・対応予定・質問などをコメントで残せます',
            class: 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300',
            value: draft.body,
            onInput: (e) => { draft.body = e.target.value },
          }),
          h('div', { class: 'flex items-center gap-2 flex-wrap' },
            h('input', {
              id: `post-comment-name-${post.id}`,
              'data-keep-focus': '1',
              type: 'text',
              placeholder: 'お名前（任意）',
              class: 'flex-1 min-w-[160px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300',
              value: draft.commenter,
              onInput: (e) => { draft.commenter = e.target.value },
            }),
            h('button', {
              class: 'px-3 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold',
              onClick: () => submitComment(post),
            }, 'コメントする'),
          ),
        ),
      ),
    )
  }

  function PostsPage() {
    if (!state.posts.loaded && !state.posts.loading) {
      // kick off load (fire-and-forget)
      loadPosts()
    }
    const filter = state.posts.filter || 'all'
    const sort = state.posts.sort || 'recommended'
    const all = state.posts.items || []
    const filtered = all.filter((p) => {
      if (filter === 'all') return true
      if (filter === 'open') return p.status === 'new' || p.status === 'in_progress'
      if (filter === 'done') return p.status === 'done'
      if (filter === 'wontfix') return p.status === 'wontfix'
      return true
    })
    const statusRank = { new: 0, in_progress: 1, done: 2, wontfix: 3 }
    const sorted = filtered.slice().sort((a, b) => {
      if (sort === 'likes') {
        const d = (b.likes || 0) - (a.likes || 0)
        if (d !== 0) return d
        return (b.updated_at || '').localeCompare(a.updated_at || '')
      }
      if (sort === 'recent') {
        return (b.created_at || '').localeCompare(a.created_at || '')
      }
      // recommended (default): status priority then updated_at desc
      const d = (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9)
      if (d !== 0) return d
      return (b.updated_at || '').localeCompare(a.updated_at || '')
    })

    const filterBtn = (key, label) => h('button', {
      class: 'px-3 py-1 rounded-full text-xs font-medium border ' +
        (filter === key ? 'bg-sky-500 text-white border-sky-500' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'),
      onClick: () => { state.posts.filter = key; update() },
    }, label)

    const counts = {
      open: all.filter((p) => p.status === 'new' || p.status === 'in_progress').length,
      done: all.filter((p) => p.status === 'done').length,
      wontfix: all.filter((p) => p.status === 'wontfix').length,
      all: all.length,
    }

    const header = h('div', { class: 'bg-gradient-to-r from-sky-50 to-emerald-50 rounded-lg p-4 md:p-5 border border-sky-100' },
      h('div', { class: 'flex items-center gap-3 mb-2' },
        h('i', { class: 'fas fa-envelope-open-text text-2xl text-sky-600' }),
        h('h1', { class: 'text-xl md:text-2xl font-bold text-gray-900' }, 'ねえねえポスト'),
      ),
      h('p', { class: 'text-sm text-gray-700' },
        'ラボメン図鑑への「こうだったらいいな」を気軽に投稿できる掲示板。',
        h('br'),
        '誰でも投稿・コメント・ステータス変更ができます。',
      ),
    )

    const filters = h('div', { class: 'flex flex-wrap items-center gap-2' },
      filterBtn('all', `すべて (${counts.all})`),
      filterBtn('open', `対応中・未対応 (${counts.open})`),
      filterBtn('done', `対応済み (${counts.done})`),
      filterBtn('wontfix', `見送り (${counts.wontfix})`),
    )

    const sortSelect = h('div', { class: 'flex items-center gap-2 text-xs text-gray-600' },
      h('label', { for: 'posts-sort' }, '並び順：'),
      h('select', {
        id: 'posts-sort',
        class: 'border border-gray-300 rounded px-2 py-1 bg-white text-xs',
        onChange: (e) => { state.posts.sort = e.target.value; update() },
      },
        h('option', { value: 'recommended', selected: sort === 'recommended' ? 'selected' : null }, 'おすすめ（未対応 → 対応中 → 完了）'),
        h('option', { value: 'likes', selected: sort === 'likes' ? 'selected' : null }, 'いいね順'),
        h('option', { value: 'recent', selected: sort === 'recent' ? 'selected' : null }, '新着順'),
      ),
    )

    const list = state.posts.loading
      ? LoadingSpinner()
      : sorted.length === 0
        ? h('div', { class: 'bg-white rounded-lg shadow p-6 text-center text-gray-500 text-sm' },
            '該当するねえねえはまだありません。最初の一通を投稿してみよう！')
        : h('div', { class: 'space-y-3' }, ...sorted.map(PostCard))

    return container(
      header,
      PostComposer(),
      h('div', { class: 'flex flex-col md:flex-row md:items-center md:justify-between gap-2' },
        filters,
        sortSelect,
      ),
      list,
    )
  }

  function container(...children) {
    return h(
      'main',
      { class: 'container mx-auto px-4 py-6 space-y-4 md:space-y-6' },
      ...children,
    )
  }

  // Simple router
  function Router() {
    const path = currentPath()

    const routes = [
      { path: /^\/$/, view: ListPage },
      { path: /^\/add$/, view: FormPage },
      { path: /^\/edit\/(.+)$/, view: (p) => FormPage({ id: p[1] }) },
      { path: /^\/member\/(.+)$/, view: (p) => DetailPage({ id: p[1] }) },
      { path: /^\/dialogue$/, view: DialoguePage },
      { path: /^\/correlation$/, view: CorrelationPage },
      { path: /^\/tag-map$/, view: TagMapPage },
      { path: /^\/core-values$/, view: CoreValuesPage },
      { path: /^\/posts$/, view: PostsPage },
    ]

    for (const r of routes) {
      const m = path.match(r.path)
      if (m) return r.view(m)
    }
    return container(h('div', {}, 'Not Found'))
  }

  function render() {
    const root = document.getElementById('root')
    if (!root) {
      Debug.error('[Render] #root not found')
      return
    }

    // preserve focus for inputs marked with data-keep-focus
    let focusInfo = null
    try {
      const act = document.activeElement
      if (act && (act.tagName === 'INPUT' || act.tagName === 'TEXTAREA') && act.dataset && act.dataset.keepFocus === '1') {
        focusInfo = {
          id: act.id,
          start: act.selectionStart,
          end: act.selectionEnd,
        }
      }
    } catch (_) {}

    root.innerHTML = ''
    // ライトボックス（画像拡大表示）
    if (state.lightboxSrc) {
      const lb = h('div', {
        class: 'fixed inset-0 z-50 bg-black bg-opacity-80 flex items-center justify-center p-4',
        onClick: () => { state.lightboxSrc = null; update() },
      },
        imgWithFallback(
          { src: state.lightboxSrc, class: 'max-w-full max-h-full rounded-lg shadow-2xl object-contain', onClick: (e) => e.stopPropagation() },
          h('div', { class: 'text-white text-lg' }, '画像を読み込めません')
        ),
        h('button', { class: 'absolute top-4 right-4 text-white text-3xl leading-none', onClick: () => { state.lightboxSrc = null; update() } }, '×'),
      )
      root.appendChild(lb)
    }
    root.appendChild(Header())
    const view = Router()
    root.appendChild(view)

    // restore focus and selection
    if (focusInfo && focusInfo.id) {
      const el = document.getElementById(focusInfo.id)
      if (el) {
        try { el.focus() } catch (_) {}
        try { if (typeof focusInfo.start === 'number' && typeof focusInfo.end === 'number') el.setSelectionRange(focusInfo.start, focusInfo.end) } catch (_) {}
      }
    }

    // after mount, log sizes for debug
    try {
      const svgs = root.querySelectorAll('svg')
      svgs.forEach((s, i) => Debug.log('[Render] svg', i, 'clientWidth', s.clientWidth, 'viewBox', s.getAttribute('viewBox')))
    } catch (_) {}
  }

  function update() {
    Debug.log('[Update] route', location.hash)
    render()
  }

  init()
})()

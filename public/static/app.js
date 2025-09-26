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
    filter: {
      q: '',
      interest: new Set(),
      involvement: new Set(),
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
      whyLab: 'テクノロジーで表現を拡張したい',
      whatToDo: '音楽×AIのセッション',
      coreValuesTags: [
        { value: '探究', author: 'Dさん' },
        { value: 'つながり', author: 'Dさん' },
      ],
    },
  ]

  // Debug helper (overlay + logs)
  const Debug = (() => {
    let active = false
    try {
      const params = new URLSearchParams((location.hash.split('?')[1]) || '')
      if (params.get('debug') === '1' || localStorage.getItem('debug') === '1') active = true
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
    const el = document.createElement(tag)
    Object.entries(props || {}).forEach(([k, v]) => {
      if (k === 'class') el.className = v
      else if (k === 'html') el.innerHTML = v
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v)
      else if (v !== undefined && v !== null) el.setAttribute(k, v)
    })
    children.flat().forEach((c) => {
      if (c == null) return
      if (typeof c === 'string' || typeof c === 'number') el.appendChild(document.createTextNode(c))
      else el.appendChild(c)
    })
    return el
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10)
  }

  // Router (hash-based to keep things simple)
  function navigate(path) {
    location.hash = '#' + path
  }

  function currentPath() {
    return location.hash.replace(/^#/, '') || '/'
  }

  window.addEventListener('hashchange', render)
  // expose Debug toggle
  window.Debug = Debug
  window.addEventListener('keydown', (e) => {
    if (e.shiftKey && (e.key === 'D' || e.key === 'd')) {
      const on = localStorage.getItem('debug') !== '1'
      Debug.setActive(on)
    }
  })

  // State management (in-memory only)
  function init() {
    state.members = seedMembers.map((m) => ({ ...m }))
    Debug.log('[Init] members', state.members.length)
    render()
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
      link('/core-values', '大切にしていること', 'fas fa-heart'),
    )

    const mobileMenu = h(
      'div',
      { class: 'md:hidden hidden flex-col gap-2 p-2', id: 'mobileMenu' },
      link('/', 'ラボメン一覧'),
      link('/dialogue', 'ラボメン対話'),
      link('/correlation', 'ラボメン相関図'),
      link('/core-values', '大切にしていること'),
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
    const color =
      type === 'interest'
        ? 'bg-sky-100 text-sky-800'
        : type === 'involvement'
        ? 'bg-blue-100 text-blue-800'
        : 'bg-amber-100 text-amber-800'
    return h(
      'span',
      { class: `text-xs font-medium px-2 py-1 rounded-full ${color} whitespace-nowrap` },
      text,
    )
  }

  // List page
  function ListPage() {
    const qInput = h('input', {
      type: 'text',
      placeholder: '名前・呼び名・普段やっていることで検索',
      class:
        'w-full md:w-1/2 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-300',
      onInput: (e) => {
        state.filter.q = e.target.value
        update()
      },
      value: state.filter.q,
    })

    const allInterest = Array.from(new Set(state.members.flatMap((m) => m.interestTags)))
    const allInvolvement = Array.from(new Set(state.members.flatMap((m) => m.involvementTags)))

    const filterSection = h(
      'div',
      { class: 'space-y-3' },
      h('div', { class: 'text-sm font-bold text-gray-700' }, 'タグフィルター'),
      tagFilterRow('興味関心タグ', allInterest, 'interest'),
      tagFilterRow('関わりタグ', allInvolvement, 'involvement'),
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
          'bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow',
        onClick: () => navigate('/add'),
      },
      h('i', { class: 'fas fa-user-plus mr-2' }),
      '新規登録',
    )

    const members = filteredMembers()

    const grid = h(
      'div',
      { class: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4' },
      members.map(Card),
    )

    return container(
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

    return state.members.filter((m) => {
      const textMatch = [m.name, m.preferredName, m.occupation]
        .join(' ')
        .toLowerCase()
        .includes(q)
      const interestOk = Array.from(iSel).every((t) => m.interestTags.includes(t))
      const invOk = Array.from(invSel).every((t) => m.involvementTags.includes(t))
      return textMatch && interestOk && invOk
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

    const img = m.imageUrl
      ? h('img', { src: m.imageUrl, class: 'w-16 h-16 rounded-full object-cover' })
      : h(
          'div',
          { class: 'w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-gray-600' },
          h('i', { class: 'fas fa-user text-xl' }),
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
        onClick: (e) => {
          e.stopPropagation()
          if (confirm('削除しますか？')) {
            state.members = state.members.filter((x) => x.id !== m.id)
            update()
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
          'bg-white rounded-lg shadow-lg p-4 hover:-translate-y-1 transition-all cursor-pointer flex flex-col gap-3',
        onClick: openDetail,
      },
      h('div', { class: 'flex items-center gap-3' },
        img,
        h('div', {},
          h('div', { class: 'text-lg font-bold' }, m.name),
          h('div', { class: 'text-sm text-gray-600' }, m.occupation),
        ),
      ),
      h('div', { class: 'space-y-2' },
        h('div', {}, tagPreview(m.interestTags, 'interest')),
        h('div', {}, tagPreview(m.involvementTags, 'involvement')),
        h('div', { class: 'text-xs text-gray-600' }, '普段やってること: ' + snippet(m.occupation)),
        h('div', { class: 'text-xs text-gray-600' }, 'どうしてラボへ？: ' + snippet(m.whyLab)),
        h('div', { class: 'text-xs text-gray-600' }, 'やってみたいこと: ' + snippet(m.whatToDo)),
      ),
      h('div', { class: 'flex gap-2 mt-auto' }, editBtn, delBtn),
    )
  }

  // Detail page
  function DetailPage(params) {
    const m = state.members.find((x) => x.id === params.id)
    if (!m) return container(h('div', { class: 'text-gray-600' }, '見つかりませんでした'))

    const back = h(
      'button',
      { class: 'px-3 py-2 rounded-md bg-gray-200 hover:bg-gray-300', onClick: () => history.back() },
      '戻る',
    )

    const avatar = m.imageUrl
      ? h('img', { src: m.imageUrl, class: 'w-32 h-32 rounded-full object-cover' })
      : h(
          'div',
          { class: 'w-32 h-32 rounded-full bg-gray-200 flex items-center justify-center text-gray-600' },
          h('i', { class: 'fas fa-user text-3xl' }),
        )

    return container(
      back,
      h('div', { class: 'mt-4 flex items-start gap-6' },
        avatar,
        h('div', { class: 'space-y-2' },
          h('div', { class: 'text-4xl font-extrabold text-gray-900' }, m.name),
          h('div', { class: 'text-sm text-gray-600' }, `呼ばれたい名前: ${m.preferredName}`),
        ),
      ),
      section('普段やっていること', h('div', { class: 'text-sm' }, m.occupation)),
      section('興味関心', h('div', { class: 'flex flex-wrap gap-2' }, m.interestTags.map((t) => TagPill(t, 'interest')))),
      section('関わり方', h('div', { class: 'flex flex-wrap gap-2' }, m.involvementTags.map((t) => TagPill(t, 'involvement')))),
      section('どうしてラボへ？', h('div', { class: 'text-sm' }, m.whyLab)),
      section('ラボでやってみたいこと', h('div', { class: 'text-sm' }, m.whatToDo)),
      section('大切にしていること', h('div', { class: 'flex flex-wrap gap-2' }, m.coreValuesTags.map((cv) => TagPill(`${cv.value} / ${cv.author}`, 'core')))),
    )
  }

  function section(title, content) {
    return h(
      'div',
      { class: 'mt-6' },
      h('div', { class: 'text-sm font-bold text-gray-700 mb-2' }, title),
      content,
    )
  }

  // Add/Edit page
  function FormPage(params) {
    const isEdit = !!params.id
    const m = isEdit
      ? JSON.parse(JSON.stringify(state.members.find((x) => x.id === params.id)))
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
        }

    let imageMode = 'url' // or 'upload'

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
            type: 'text',
            placeholder: 'https://...jpg',
            class: 'w-full border border-gray-300 rounded-lg px-3 py-2',
            value: m.imageUrl,
            onInput: (e) => (m.imageUrl = e.target.value),
          })
        : h('input', {
            type: 'file',
            accept: 'image/*',
            class: 'w-full',
            onChange: async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              const reader = new FileReader()
              reader.onload = () => (m.imageUrl = reader.result)
              reader.readAsDataURL(file)
            },
          }),
      h('div', { class: 'mt-2' },
        m.imageUrl
          ? h('img', { src: m.imageUrl, class: 'w-24 h-24 rounded-full object-cover' })
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
            imageMode = mode
            update()
          },
        },
        label,
      )
    }

    const onSubmit = () => {
      if (!m.name || !m.preferredName) {
        alert('氏名と呼ばれたい名前は必須です')
        return
      }
      if (isEdit) {
        const idx = state.members.findIndex((x) => x.id === m.id)
        state.members[idx] = m
      } else {
        state.members.unshift(m)
      }
      navigate('/')
      update()
    }

    return container(
      h('h1', { class: 'text-2xl font-bold text-gray-900 mb-4' }, isEdit ? 'ラボメン情報編集' : '新規ラボメン登録'),
      field('name', '氏名'),
      field('preferredName', '呼ばれたい名前'),
      h('div', { class: 'space-y-1' }, h('label', { class: 'text-xs font-bold text-gray-600' }, 'プロフィール画像'), imageTabs),
      field('occupation', '普段やっていること', 'textarea'),
      h('div', { class: 'grid grid-cols-1 md:grid-cols-2 gap-4' },
        TagInput('興味関心タグ', m.interestTags, 'interest'),
        TagInput('関わりタグ', m.involvementTags, 'involvement'),
      ),
      field('whyLab', 'どうしてラボへ？', 'textarea'),
      field('whatToDo', 'ラボでやってみたいこと', 'textarea'),
      h('div', { class: 'flex gap-2 mt-4' },
        h('button', { class: 'bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 rounded-lg', onClick: onSubmit }, isEdit ? '更新' : '登録'),
        h('button', { class: 'bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-lg', onClick: () => history.back() }, 'キャンセル'),
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

    const quickAdd = Array.from(new Set(state.members.flatMap((m) => (type === 'interest' ? m.interestTags : m.involvementTags))))
    const chips = () =>
      h(
        'div',
        { class: 'flex flex-wrap gap-2' },
        list.map((t, idx) =>
          h(
            'span',
            { class: 'inline-flex items-center gap-2 text-xs px-2 py-1 rounded-full ' + (type === 'interest' ? 'bg-sky-100 text-sky-800' : 'bg-blue-100 text-blue-800') },
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
      quick,
    )

    return wrap
  }

  // Dialogue page
  function DialoguePage() {
    const nameInput = h('input', {
      class: 'border border-gray-300 rounded-lg px-3 py-2 w-full md:w-64',
      placeholder: 'あなたの名前（必須）',
      value: state.operatorName,
      onInput: (e) => (state.operatorName = e.target.value),
    })

    const list = h(
      'div',
      { class: 'grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3' },
      state.members.map((m) =>
        h(
          'button',
          {
            class: 'bg-white rounded-lg shadow p-3 hover:-translate-y-1 transition-all',
            onClick: () => {
              m._selected = !m._selected
              update()
            },
          },
          m.imageUrl
            ? h('img', { src: m.imageUrl, class: 'w-16 h-16 rounded-full object-cover mx-auto' })
            : h('div', { class: 'w-16 h-16 rounded-full bg-gray-200 mx-auto flex items-center justify-center text-gray-600' }, h('i', { class: 'fas fa-user' })),
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
            m.imageUrl
              ? h('img', { src: m.imageUrl, class: 'w-10 h-10 rounded-full object-cover' })
              : h('div', { class: 'w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600' }, h('i', { class: 'fas fa-user' })),
            h('div', { class: 'font-bold' }, m.name),
          ),
          h('details', {},
            h('summary', { class: 'text-sm font-bold text-gray-700 cursor-pointer' }, 'プロフィール'),
            h('div', { class: 'text-sm text-gray-600 space-y-1 mt-2' },
              h('div', {}, '呼ばれたい名前: ' + m.preferredName),
              h('div', {}, '普段やっていること: ' + m.occupation),
              h('div', {}, 'どうしてラボへ？: ' + m.whyLab),
              h('div', {}, 'やってみたいこと: ' + m.whatToDo),
            ),
          ),
          h('div', { class: 'flex items-center gap-2' },
            h('input', { class: 'border border-gray-300 rounded-lg px-3 py-2 flex-1', placeholder: '大切にしていること（キーワード）' }),
            h('button', { class: 'bg-amber-400 text-white px-3 py-2 rounded-lg hover:bg-amber-500', onClick: function () {
              const inp = this.previousSibling
              const v = inp.value.trim()
              if (!v) return
              if (!state.operatorName) return alert('先にあなたの名前を入力してください')
              m.coreValuesTags.push({ value: v, author: state.operatorName })
              inp.value = ''
              update()
            } }, '追加'),
          ),
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
                    onClick: () => {
                      m.coreValuesTags.splice(idx, 1)
                      update()
                    },
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
        h('div', { class: 'text-sm font-bold text-gray-700' }, '参加者を選択'),
        list,
        h('div', { class: 'mt-4 space-y-2' }, cards),
      ),
    )
  }

  // Correlation page (network graph with D3 force, filtered by selected tags)
  function CorrelationPage() {
    const allTags = Array.from(new Set(state.members.flatMap((m) => [...m.interestTags, ...m.involvementTags])))
    const selected = new Set()

    let rafId = 0
    const scheduleDraw = () => {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        draw().catch((e) => console.error('[Correlation] draw error:', e))
      })
    }

    const panel = h(
      'div',
      { class: 'flex flex-wrap gap-2 mb-3' },
      allTags.map((t) =>
        h(
          'button',
          {
            class: 'px-2 py-1 rounded-lg text-xs bg-gray-100 hover:bg-gray-200',
            onClick: function () {
              if (selected.has(t)) selected.delete(t)
              else selected.add(t)
              this.classList.toggle('bg-sky-500')
              this.classList.toggle('text-white')
              Debug.log('[Correlation] selected tags', Array.from(selected))
              scheduleDraw()
            },
          },
          t,
        ),
      ),
    )

    const debugOn = (localStorage.getItem('debug') === '1')
    const svgWrap = h('div', { class: 'bg-white rounded-lg shadow p-2 relative ' + (debugOn ? 'debug-svg-wrap' : 'overflow-hidden') })
    const svg = h('svg', { width: '100%', height: 480 })
    svgWrap.appendChild(svg)

    // Observe size changes to re-draw when layout stabilizes
    const ro = new ResizeObserver(() => scheduleDraw())
    ro.observe(svgWrap)

    const exportBtn = h(
      'button',
      { class: 'bg-gray-200 hover:bg-gray-300 px-3 py-2 rounded-lg mt-3' },
      'PNGとして保存',
    )
    exportBtn.addEventListener('click', async () => {
      try {
        const node = svgWrap
        const { toPng } = await import('https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/+esm')
        const dataUrl = await toPng(node)
        const a = document.createElement('a')
        a.href = dataUrl
        a.download = 'correlation.png'
        a.click()
      } catch (e) {
        console.error('[Correlation] export failed:', e)
      }
    })

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
      // baseline frame for debug visibility
      try {
        const gBase = d3.select(svg).append('g').attr('data-debug','baseline')
        gBase.append('rect').attr('x',0.5).attr('y',0.5).attr('width',width-1).attr('height',height-1).attr('fill','none').attr('stroke','#93c5fd').attr('stroke-dasharray','4,2').attr('pointer-events','none')
        gBase.append('text').attr('x',8).attr('y',20).attr('fill','#60a5fa').attr('font-size',12).text(`${width}x${height}`)
      } catch (__) {}
      Debug.log('[Correlation] width:', width, 'height:', height, 'selected:', Array.from(selected))

      const members = state.members
      Debug.log('[Correlation] members sample', members.slice(0,2))
      if (!members.length) {
        svg.innerHTML = '<text x="12" y="24" fill="#6b7280">メンバーがいません</text>'
        return
      }
      const nodes = members.map((m) => ({ id: m.id, member: m }))

      function commonTags(a, b) {
        const setA = new Set([...a.interestTags, ...a.involvementTags])
        const setB = new Set([...b.interestTags, ...b.involvementTags])
        let common = [...setA].filter((x) => setB.has(x))
        if (selected.size) common = common.filter((t) => selected.has(t))
        return common
      }

      const links = []
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const common = commonTags(members[i], members[j])
          if (common.length) links.push({ source: members[i].id, target: members[j].id, tags: common })
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
          .text('共通タグのある組み合わせがありません。タグを選択してみてください。')
        return
      }

      const colorScale = d3.scaleSequential(d3.interpolateCividis).domain([
        1,
        Math.max(2, d3.max(links, (d) => d.tags.length) || 2),
      ])
      const linkWidth = d3
        .scaleLinear()
        .domain([1, Math.max(2, d3.max(links, (d) => d.tags.length) || 2)])
        .range([1, 6])

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

      const link = g
        .selectAll('line')
        .data(links)
        .enter()
        .append('line')
        .attr('stroke', (d) => colorScale(d.tags.length))
        .attr('stroke-width', (d) => linkWidth(d.tags.length))
        .attr('stroke-opacity', 0.85)
        .on('mousemove', function (event, d) {
          tooltip.textContent = d.tags.join(', ')
          tooltip.style.left = event.offsetX + 10 + 'px'
          tooltip.style.top = event.offsetY + 10 + 'px'
          tooltip.classList.remove('hidden')
        })
        .on('mouseout', () => tooltip.classList.add('hidden'))

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

      node
        .append('image')
        .attr(
          'href',
          (d) =>
            d.member.imageUrl ||
            'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><rect width="100%" height="100%" fill="%23e5e7eb"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-size="12" fill="%236b7280">No Img</text></svg>',
        )
        .attr('x', -20)
        .attr('y', -20)
        .attr('width', 40)
        .attr('height', 40)
        .attr('clip-path', 'circle(20px at 20px 20px)')
        .append('title')
        .text((d) => d.member.name)

      simulation.on('tick', () => {
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
      svgWrap,
      exportBtn,
    )

    // Draw after layout
    scheduleDraw()
    return wrap
  }

  // Core values word cloud (force layout, zoom/drag, size by frequency)
  function CoreValuesPage() {
    const debugOn = (localStorage.getItem('debug') === '1')
    const svgWrap = h('div', { class: 'bg-white rounded-lg shadow p-2 relative ' + (debugOn ? 'debug-svg-wrap' : 'overflow-hidden') })
    const svg = h('svg', { width: '100%', height: 480 })
    svgWrap.appendChild(svg)

    const exportBtn = h(
      'button',
      { class: 'bg-gray-200 hover:bg-gray-300 px-3 py-2 rounded-lg mt-3' },
      'PNGとして保存',
    )
    exportBtn.addEventListener('click', async () => {
      try {
        const { toPng } = await import('https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/+esm')
        const dataUrl = await toPng(svgWrap)
        const a = document.createElement('a')
        a.href = dataUrl
        a.download = 'core-values.png'
        a.click()
      } catch (e) {
        console.error('[CoreValues] export failed:', e)
      }
    })

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
      // baseline frame for debug visibility
      try {
        const gBase = d3.select(svg).append('g').attr('data-debug','baseline')
        gBase.append('rect').attr('x',0.5).attr('y',0.5).attr('width',width-1).attr('height',height-1).attr('fill','none').attr('stroke','#93c5fd').attr('stroke-dasharray','4,2').attr('pointer-events','none')
        gBase.append('text').attr('x',8).attr('y',20).attr('fill','#60a5fa').attr('font-size',12).text(`${width}x${height}`)
      } catch (__) {}
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
      const nodes = items.map((d) => ({ ...d, x: Math.random() * width, y: Math.random() * height }))
      const sim = d3
        .forceSimulation(nodes)
        .force('charge', d3.forceManyBody().strength(-2))
        .force('collide', d3.forceCollide().radius((d) => size(d.count) * 0.6))
        .force('x', d3.forceX(width / 2).strength(0.05))
        .force('y', d3.forceY(height / 2).strength(0.05))

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
        .attr('font-size', (d) => size(d.count))
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
      exportBtn,
    )

    // draw after layout
    scheduleDraw()
    return wrap
  }

  function collectCoreValues() {
    return state.members.flatMap((m) => m.coreValuesTags.map((cv) => cv.value))
  }

  // Container helper
  function container(...children) {
    return h(
      'main',
      { class: 'container mx-auto px-4 py-6 space-y-3' },
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
      { path: /^\/core-values$/, view: CoreValuesPage },
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
    root.innerHTML = ''
    root.appendChild(Header())
    const view = Router()
    root.appendChild(view)
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

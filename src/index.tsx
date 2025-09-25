import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-workers'

const app = new Hono()

// Serve static assets from public/
app.use('/static/*', serveStatic({ root: './public' }))

// SPA entry
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

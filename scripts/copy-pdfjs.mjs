// Copies the pdfjs-dist runtime files into public/static/pdfjs/ so the browser
// can load PDF.js for thumbnail generation. Runs automatically before each build.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const src = path.join(root, 'node_modules', 'pdfjs-dist', 'build')
const dst = path.join(root, 'public', 'static', 'pdfjs')

fs.mkdirSync(dst, { recursive: true })
for (const file of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
  fs.copyFileSync(path.join(src, file), path.join(dst, file))
}
console.log(`[copy-pdfjs] copied pdf.min.mjs + pdf.worker.min.mjs to ${path.relative(root, dst)}/`)

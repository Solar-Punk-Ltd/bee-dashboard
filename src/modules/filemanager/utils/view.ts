import { FileInfo, FileManager } from '@solarpunkltd/file-manager-lib'

const EXT_TO_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  csv: 'text/csv',
  html: 'text/html',
  htm: 'text/html',
}

function guessMime(name: string, fi: FileInfo): string {
  const md = fi.customMetadata?.mimeType || fi.customMetadata?.mime || fi.customMetadata?.['content-type']

  if (md) return md

  const ext = name.split('.').pop()?.toLowerCase() || ''

  return EXT_TO_MIME[ext] || 'application/octet-stream'
}

type Viewer = {
  name: string
  test: (mime: string) => boolean
  render: (win: Window, url: string, mime: string, name: string) => void
}

const VIDEO_HTML = (u: string, title: string) =>
  `<html><head><meta charset="utf-8"/><title>${title}</title></head><body style="margin:0;background:#000">
    <video controls autoplay style="width:100%;height:100%" src="${u}"></video>
  </body></html>`

const AUDIO_HTML = (u: string, title: string) =>
  `<html><head><meta charset="utf-8"/><title>${title}</title></head><body>
    <audio controls autoplay style="width:100%" src="${u}"></audio>
  </body></html>`

const IMAGE_HTML = (u: string, title: string) =>
  `<html><head><meta charset="utf-8"/><title>${title}</title></head><body style="margin:0;background:#111;display:grid;place-items:center;min-height:100vh">
    <img style="max-width:100%;max-height:100vh" src="${u}" />
  </body></html>`

const VIEWERS: Viewer[] = [
  {
    name: 'video',
    test: m => m.startsWith('video/'),
    render: (w, url, mime, name) => {
      w.document.write(VIDEO_HTML(url, name))
      w.document.title = name
    },
  },
  {
    name: 'audio',
    test: m => m.startsWith('audio/'),
    render: (w, url, mime, name) => {
      w.document.write(AUDIO_HTML(url, name))
      w.document.title = name
    },
  },
  {
    name: 'image',
    test: m => m.startsWith('image/'),
    render: (w, url, mime, name) => {
      w.document.write(IMAGE_HTML(url, name))
      w.document.title = name
    },
  },
  {
    name: 'pdf',
    test: m => m === 'application/pdf',
    render: (w, url, mime, name) => {
      w.document.title = name
      w.location.href = url
    },
  },
  {
    name: 'html',
    test: m => m === 'text/html',
    render: (w, url, mime, name) => {
      w.document.title = name
      w.location.href = url
    },
  },
  {
    name: 'text-like',
    test: m => m.startsWith('text/') || m === 'application/json' || m === 'text/markdown',
    render: (w, url, mime, name) => {
      w.document.title = name
      w.location.href = url
    },
  },
]

export async function openOrDownload(
  beeUrl: string,
  fm: FileManager,
  fi: FileInfo,
  path?: string,
  headers?: Record<string, string>,
): Promise<void> {
  const win = window.open('', '_blank')

  const map = await fm.listFiles(fi)
  const pick = path ?? fi.name
  const ref = map[pick]

  if (!ref) throw new Error(`Path not found in mantaray: ${pick}`)
  // TODO: use simply use bee.downloadData?
  const href = `${beeUrl}/bytes/${ref}`

  const mime = guessMime(pick, fi)
  const viewer = VIEWERS.find(v => v.test(mime))

  if (!viewer) {
    downloadByName(href, pick)

    return
  }

  if (!win) {
    downloadByName(href, pick)

    return
  }

  try {
    const res = await fetch(href, { headers })

    if (!res.ok) throw new Error(`GET failed: ${res.status}`)
    const blob = await res.blob()

    const typed = blob.type && blob.type !== 'application/octet-stream' ? blob : new Blob([blob], { type: mime })
    const url = URL.createObjectURL(typed)

    viewer.render(win, url, mime, pick)
  } catch (e) {
    win.close()
    downloadByName(href, pick)
  }
}

// TODO: DRY, use downloadFileFallback
function downloadByName(href: string, fileName: string): void {
  const a = document.createElement('a')
  a.href = href
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
}

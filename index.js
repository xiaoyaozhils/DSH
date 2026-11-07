/**
 * 书桌 — host half.
 *
 * 资料库在 DSH 工作区之外，浏览器自己读不到，所以由后端读取。
 * 所以库的读取全在宿主这边做，只通过 /api/shuzhuo 暴露：
 *   概览（有多少页、哪些是枢纽、最近动了什么）
 *   牵连（一个术语一旦被改动，全库哪些页会被波及）
 *   单个页面（正文、出链、入链、小节）
 *   讨论台的拆分 / 认词 / 待议抽取
 *
 * 写库不直接碰文件：一律走 Obsidian 侧的 Whale Bridge（本地 HTTP），由 Obsidian 落盘。
 */
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, relative, sep, resolve, dirname, basename } from 'node:path'
import { homedir } from 'node:os'

export const API = '/api/shuzhuo'

let pluginCtx = null

/**
 * 配置：优先环境变量，其次 ~/.shuzhuo/config.json，最后内置默认。
 * config.json 形状：{ "vault": "...", "stateDir": "...", "bridgePort": 9787, "bridgeToken": "...", "workdir": "..." }
 * 包里不写死任何人的路径——没配 vault 就明确报错，不静默返回空库。
 */
const CONFIG_FILE = process.env.SHUZHUO_CONFIG || join(homedir(), '.shuzhuo', 'config.json')

function loadConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))
  } catch {
    return {}
  }
}

const config = loadConfig()
const STATE_DIR = process.env.SHUZHUO_STATE || config.stateDir || join(homedir(), '.shuzhuo')
const VAULT = process.env.SHUZHUO_VAULT || config.vault || ''
/** 书桌所在的工作区：叫助手时会优先找这个目录下的会话。留空就按最近的会话走。 */
const WORKDIR = process.env.SHUZHUO_WORKDIR || config.workdir || ''
const TODO_FILE = process.env.SHUZHUO_TODO || join(STATE_DIR, 'todo.json')
const DRAFTS_FILE = process.env.SHUZHUO_DRAFTS || join(STATE_DIR, 'drafts.json')

/** Whale Bridge（Obsidian 侧插件 whale-obsidian-bridge）：写库唯一通道。 */
const BRIDGE = {
  port: Number(process.env.SHUZHUO_BRIDGE_PORT || config.bridgePort || 9787),
  token: process.env.SHUZHUO_BRIDGE_TOKEN || config.bridgeToken || '',
}
const SKIP_DIRS = new Set(['.obsidian', '.trash', '.git', 'node_modules'])

/** 元笔记：它们大量提及术语，但不是定义点，排序时压到后面。 */
const META_HINTS = ['清单', '总览', '地图', '索引', '说明', '首页', '命名总表']

// ── 库扫描 ────────────────────────────────────────────────────────────────

const docCache = new Map()

function listFiles() {
  const out = []
  const walk = (dir) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(abs)
        continue
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue
      let stat
      try {
        stat = statSync(abs)
      } catch {
        continue
      }
      out.push({ abs, mtime: stat.mtimeMs, size: stat.size })
    }
  }
  walk(VAULT)
  return out
}

const LINK_RE = /\[\[([^\]]+)\]\]/g

function parseDoc(rel, abs, mtime, size) {
  const cached = docCache.get(rel)
  if (cached !== undefined && cached.mtime === mtime && cached.size === size) return cached

  let text = ''
  try {
    text = readFileSync(abs, 'utf8')
  } catch {
    text = ''
  }
  const lines = text.split(/\r?\n/)

  // 逐行记录它属于哪个「## 小节」，牵连结果里才能说清"改的是哪一节的事"。
  const sections = []
  const secOf = new Array(lines.length)
  let current = -1
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const head = /^#{1,6}\s+(.*)$/.exec(line)
    if (head !== null) {
      if (/^##\s/.test(line) || /^#\s/.test(line)) {
        sections.push({ title: head[1].trim(), line: i })
        current = sections.length - 1
      }
    }
    secOf[i] = current
  }

  const links = []
  LINK_RE.lastIndex = 0
  let match
  while ((match = LINK_RE.exec(text)) !== null) {
    const raw = match[1]
    const target = raw.split('|')[0].split('#')[0].trim()
    if (target !== '' && !/^https?:/i.test(target)) links.push(target)
  }

  const title = (() => {
    const head = /^#\s+(.*)$/m.exec(text)
    if (head !== null) return head[1].trim()
    return rel.split('/').pop().replace(/\.md$/i, '')
  })()

  const doc = {
    rel,
    abs,
    name: rel.split('/').pop().replace(/\.md$/i, ''),
    dir: rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '(根目录)',
    title,
    mtime,
    size,
    chars: text.length,
    text,
    lines,
    sections,
    secOf,
    links,
    meta: META_HINTS.some((hint) => rel.includes(hint)),
  }
  docCache.set(rel, doc)
  return doc
}

function readAll() {
  const files = listFiles()
  const docs = []
  const present = new Set()
  for (const file of files) {
    const rel = relative(VAULT, file.abs).split(sep).join('/')
    present.add(rel)
    docs.push(parseDoc(rel, file.abs, file.mtime, file.size))
  }
  for (const key of docCache.keys()) if (!present.has(key)) docCache.delete(key)
  return docs
}

/** 双链是按名字解析的：[[02-故事/13-某角色]] 和 [[13-某角色]] 指的是同一页。 */
function buildIndex(docs) {
  const byName = new Map()
  const byPath = new Map()
  for (const doc of docs) {
    byPath.set(doc.rel.replace(/\.md$/i, ''), doc.rel)
    byPath.set(doc.rel, doc.rel)
    const bucket = byName.get(doc.name)
    if (bucket === undefined) byName.set(doc.name, [doc.rel])
    else bucket.push(doc.rel)
  }

  const resolveLink = (target) => {
    const clean = target.replace(/\.md$/i, '')
    const direct = byPath.get(clean)
    if (direct !== undefined) return direct
    const named = byName.get(clean.split('/').pop())
    if (named !== undefined && named.length === 1) return named[0]
    return null
  }

  const inbound = new Map()
  const outbound = new Map()
  for (const doc of docs) {
    const outs = []
    for (const target of doc.links) {
      const rel = resolveLink(target)
      if (rel === null || rel === doc.rel) continue
      if (!outs.includes(rel)) outs.push(rel)
      const bucket = inbound.get(rel)
      if (bucket === undefined) inbound.set(rel, [doc.rel])
      else if (!bucket.includes(doc.rel)) bucket.push(doc.rel)
    }
    outbound.set(doc.rel, outs)
  }
  const broken = new Set()
  for (const doc of docs) for (const target of doc.links) if (resolveLink(target) === null) broken.add(target)
  return { byName, byPath, inbound, outbound, broken, resolveLink }
}

// ── 概览 ──────────────────────────────────────────────────────────────────

export function overview() {
  const docs = readAll()
  const index = buildIndex(docs)
  const dirs = new Map()
  let chars = 0
  let links = 0
  for (const doc of docs) {
    chars += doc.chars
    links += doc.links.length
    const top = doc.dir.split('/')[0]
    const bucket = dirs.get(top) ?? { name: top, pages: 0, chars: 0 }
    bucket.pages += 1
    bucket.chars += doc.chars
    dirs.set(top, bucket)
  }
  const orphans = docs.filter((doc) => (index.outbound.get(doc.rel) ?? []).length === 0)

  return {
    ok: true,
    at: Date.now(),
    vault: VAULT,
    workdir: WORKDIR,
    paths: { vault: VAULT, state: STATE_DIR, drafts: DRAFTS_FILE, todo: TODO_FILE },
    stats: {
      pages: docs.length,
      chars,
      links,
      orphans: orphans.length,
      broken: index.broken.size,
      brokenTargets: [...index.broken].slice(0, 12),
    },
    dirs: [...dirs.values()].sort((a, b) => b.pages - a.pages),
    recent: docs
      .slice()
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 12)
      .map((doc) => ({ rel: doc.rel, name: doc.name, dir: doc.dir, mtime: doc.mtime, chars: doc.chars })),
    hubs: docs
      .map((doc) => ({ rel: doc.rel, name: doc.name, dir: doc.dir, count: (index.inbound.get(doc.rel) ?? []).length }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    orphans: orphans.slice(0, 14).map((doc) => ({ rel: doc.rel, name: doc.name, dir: doc.dir })),
    meta: { title: basename(VAULT) || '资料库', subtitle: config.metaSubtitle || '' },
  }
}

// ── 牵连 ──────────────────────────────────────────────────────────────────

/** 定义点：标题、表格首列、列表项的加粗词、引用块开头。 */
function isDefining(line, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp('^#{1,6}\\s*' + escaped),
    new RegExp('^\\|\\s*\\*{0,2}' + escaped),
    new RegExp('^-\\s+\\*{1,2}' + escaped),
    new RegExp('^>\\s*\\*{1,2}' + escaped),
  ]
  return patterns.some((re) => re.test(line))
}

export function probe(terms, options = {}) {
  const ctxLines = Number.isFinite(options.ctx) ? options.ctx : 60
  const includeArchive = options.archive === true
  const maxSnippets = Number.isFinite(options.maxHits) ? options.maxHits : 8

  const docs = readAll().filter((doc) => includeArchive || !doc.rel.startsWith('09-归档'))
  const index = buildIndex(readAll())

  const items = []
  for (const doc of docs) {
    let hits = 0
    let defining = false
    const perTerm = new Map()
    const snippets = []
    const sectionHits = new Map()

    for (let i = 0; i < doc.lines.length; i += 1) {
      const line = doc.lines[i]
      if (line === '' || line.startsWith('```')) continue
      for (const term of terms) {
        if (term === '' || !line.includes(term)) continue
        hits += 1
        perTerm.set(term, (perTerm.get(term) ?? 0) + 1)
        const def = isDefining(line, term)
        if (def) defining = true
        const secIdx = doc.secOf[i]
        const secTitle = secIdx >= 0 && doc.sections[secIdx] !== undefined ? doc.sections[secIdx].title : '(文首)'
        sectionHits.set(secTitle, (sectionHits.get(secTitle) ?? 0) + 1)
        snippets.push({
          line: i + 1,
          sec: secTitle,
          text: line.trim().slice(0, ctxLines * 4),
          term,
          defining: def,
        })
        break
      }
    }
    if (hits === 0) continue

    const level = defining ? 'red' : perTerm.size >= 2 || hits >= 3 ? 'yellow' : 'gray'
    snippets.sort((a, b) => Number(b.defining) - Number(a.defining) || a.line - b.line)
    const seen = new Set()
    const kept = []
    for (const snip of snippets) {
      if (seen.has(snip.line)) continue
      seen.add(snip.line)
      kept.push(snip)
      if (kept.length >= maxSnippets) break
    }

    items.push({
      rel: doc.rel,
      name: doc.name,
      title: doc.title,
      dir: doc.dir,
      mtime: doc.mtime,
      meta: doc.meta,
      level,
      hits,
      terms: [...perTerm.entries()].map(([term, count]) => ({ term, count })).sort((a, b) => b.count - a.count),
      sections: [...sectionHits.entries()].map(([title, count]) => ({ title, count })).sort((a, b) => b.count - a.count),
      snippets: kept,
      out: (index.outbound.get(doc.rel) ?? []).slice(0, 12),
      in: (index.inbound.get(doc.rel) ?? []).slice(0, 12),
    })
  }

  const order = { red: 0, yellow: 1, gray: 2 }
  items.sort((a, b) => order[a.level] - order[b.level] || Number(a.meta) - Number(b.meta) || b.hits - a.hits)

  return {
    ok: true,
    at: Date.now(),
    terms,
    counts: {
      red: items.filter((item) => item.level === 'red').length,
      yellow: items.filter((item) => item.level === 'yellow').length,
      gray: items.filter((item) => item.level === 'gray').length,
      pages: items.length,
    },
    items,
  }
}

// ── 扫描词 ────────────────────────────────────────────────────────────────
//
// 2026-11-07：以前只拿「标题 + 和什么有关」当扫描词。标题一旦是猜的（「下面只」
// 这种），牵连图就一个点都画不出来。现在从正文里认词：库里已有的页名、
// 书名号/引号里点名的词，都比句子里随便一个短语靠谱。

const TERM_STOP = new Set(('一个 两个 这些 那些 这个 那个 这样 那样 这种 那种 一些 大概 具体 细节 '
  + '方面 没有 什么 怎么 就是 但是 不过 因为 所以 如果 然后 之后 之前 现在 后来 最后 自己 我们 你们 '
  + '他们 她们 东西 时候 地方 事情 问题 可以 需要 一定 肯定 其实 已经 还是 只是 之类 等等 一下 一样 '
  + '一边 同时 其中 此外 因此 而且 并且 虽然 即使 只要 只有 不要 不能 不会 不是 还有 另外 其实')
  .split(/\s+/).filter((word) => word !== ''))

export function termsOf(input) {
  const text = String(input?.text ?? '')
  const title = String(input?.title ?? '').trim()
  const related = String(input?.related ?? '')
  const found = new Map()
  const bump = (term, weight) => {
    if (term.length < 2 || term.length > 14) return
    if (TERM_STOP.has(term)) return
    found.set(term, (found.get(term) ?? 0) + weight)
  }

  // 库里已有的页名：正文里出现，就是这一条真正牵着的东西。
  const names = [...new Set(readAll().map((doc) => stripNum(doc.name)))]
    .filter((name) => name.length >= 2 && name.length <= 14)
  for (const name of names) {
    const count = text.split(name).length - 1
    if (count > 0) bump(name, 10 + Math.min(count, 5) * 2 + name.length)
  }
  // 书名号、引号里点名的词：作者自己划了重点。
  for (const raw of text.match(/《[^》]{2,20}》/g) ?? []) bump(raw.slice(1, -1).trim(), 8)
  for (const raw of text.match(/[「『“"][^」』”"]{2,14}[」』”"]/g) ?? []) bump(raw.slice(1, -1).trim(), 6)

  const out = [...found.entries()].sort((a, b) => b[1] - a[1]).map(([term]) => term)
  // 标题自己也算一个词（作者手填的标题通常是真名）；「和什么有关」里的短语补在后面，
  // 但只收短、像专名的那些——「一个资格者的人物设定想法」是描述，不是术语。
  const extras = []
  for (const extra of [title, ...related.split(/[，,、;；:：。！？\s]+/)]) {
    const value = String(extra ?? '').trim()
    if (value === '' || value.length > 10) continue
    if (TERM_STOP.has(value)) continue
    // 2026-11-07：标题也要过一遍名字体检——标题可能是书桌自己猜的（如「下面只」），
    // 直接当术语会把整张牵连图带偏。
    if (!looksLikeName(value) && !names.includes(value)) continue
    if (!extras.includes(value) && !out.includes(value)) extras.push(value)
  }
  return { ok: true, terms: [...extras, ...out].slice(0, 8) }
}

// ── 单页 ──────────────────────────────────────────────────────────────────

export function pageDetail(rel) {
  const docs = readAll()
  const index = buildIndex(docs)
  const doc = docs.find((entry) => entry.rel === rel)
  if (doc === undefined) return { ok: false, error: 'not-found', rel }
  return {
    ok: true,
    rel: doc.rel,
    name: doc.name,
    title: doc.title,
    dir: doc.dir,
    mtime: doc.mtime,
    chars: doc.chars,
    text: doc.text,
    sections: doc.sections.map((section) => ({ title: section.title, line: section.line + 1 })),
    out: (index.outbound.get(doc.rel) ?? []).map((target) => ({ rel: target, name: target.split('/').pop().replace(/\.md$/i, '') })),
    in: (index.inbound.get(doc.rel) ?? []).map((source) => ({ rel: source, name: source.split('/').pop().replace(/\.md$/i, '') })),
  }
}

export function search(query) {
  const needle = String(query ?? '').trim()
  if (needle === '') return { ok: true, items: [] }
  const docs = readAll()
  const items = []
  for (const doc of docs) {
    const at = doc.text.indexOf(needle)
    const nameHit = doc.name.includes(needle)
    if (at < 0 && !nameHit) continue
    let line = ''
    if (at >= 0) {
      const before = doc.text.slice(0, at)
      const lineNo = before.split('\n').length - 1
      line = (doc.lines[lineNo] ?? '').trim().slice(0, 120)
    }
    items.push({ rel: doc.rel, name: doc.name, dir: doc.dir, nameHit, line })
    if (items.length >= 40) break
  }
  items.sort((a, b) => Number(b.nameHit) - Number(a.nameHit))
  return { ok: true, query: needle, items }
}

// ── 待办 ──────────────────────────────────────────────────────────────────

export function readTodo() {
  try {
    const parsed = JSON.parse(readFileSync(TODO_FILE, 'utf8'))
    const items = Array.isArray(parsed?.items) ? parsed.items : []
    return { ok: true, items: items.filter((item) => item !== null && typeof item === 'object') }
  } catch {
    return { ok: true, items: [] }
  }
}

export function writeTodo(items) {
  const clean = (Array.isArray(items) ? items : [])
    .filter((item) => item !== null && typeof item === 'object' && typeof item.text === 'string')
    .slice(0, 200)
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : String(Date.now() + Math.random()),
      text: item.text.slice(0, 400),
      done: item.done === true,
      at: Number.isFinite(item.at) ? item.at : Date.now(),
      tag: typeof item.tag === 'string' ? item.tag.slice(0, 20) : '',
    }))
  try {
    mkdirSync(dirname(TODO_FILE), { recursive: true })
    writeFileSync(TODO_FILE, JSON.stringify({ items: clean }, null, 2), 'utf8')
    return { ok: true, items: clean }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) }
  }
}

// ── 讨论台的草稿 ──────────────────────────────────────────────────────────
//
// 讨论阶段和入库阶段是两种状态：前者只管写，不查牵连；后者才结算。
// 草稿存在工作区里（不是库），入库那一刻才通过桥落到库中。

export function readDrafts() {
  try {
    const parsed = JSON.parse(readFileSync(DRAFTS_FILE, 'utf8'))
    const items = Array.isArray(parsed?.items) ? parsed.items : []
    return { ok: true, items: items.filter((item) => item !== null && typeof item === 'object') }
  } catch {
    return { ok: true, items: [] }
  }
}

export function writeDrafts(items) {
  const clean = (Array.isArray(items) ? items : [])
    .filter((item) => item !== null && typeof item === 'object' && typeof item.title === 'string')
    .slice(0, 100)
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : String(Date.now() + Math.random()),
      title: item.title.slice(0, 120),
      aliases: Array.isArray(item.aliases) ? item.aliases.slice(0, 12).map((a) => String(a).slice(0, 40)) : [],
      category: typeof item.category === 'string' ? item.category.slice(0, 20) : '设定',
      summary: typeof item.summary === 'string' ? item.summary.slice(0, 400) : '',
      related: typeof item.related === 'string' ? item.related.slice(0, 400) : '',
      body: typeof item.body === 'string' ? item.body.slice(0, 200_000) : '',
      status: item.status === 'filed' ? 'filed' : (item.status === 'settled' ? 'settled' : 'draft'),
      rel: typeof item.rel === 'string' ? item.rel.slice(0, 300) : null,
      rels: Array.isArray(item.rels) ? item.rels.slice(0, 60).map((rel) => String(rel).slice(0, 300)) : [],
      parts: Array.isArray(item.parts)
        ? item.parts.slice(0, 60).filter((part) => part !== null && typeof part === 'object').map((part) => ({
            id: typeof part.id === 'string' ? part.id : String(Date.now() + Math.random()),
            title: typeof part.title === 'string' ? part.title.slice(0, 120) : '',
            type: typeof part.type === 'string' ? part.type.slice(0, 20) : '设定',
            dir: typeof part.dir === 'string' ? part.dir.slice(0, 200) : '',
            body: typeof part.body === 'string' ? part.body.slice(0, 100_000) : '',
            on: part.on !== false,
          }))
        : [],
      at: Number.isFinite(item.at) ? item.at : Date.now(),
      updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now(),
    }))
  try {
    mkdirSync(dirname(DRAFTS_FILE), { recursive: true })
    writeFileSync(DRAFTS_FILE, JSON.stringify({ items: clean }, null, 2), 'utf8')
    return { ok: true, items: clean }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) }
  }
}

async function bridgeRequest(method, path, body) {
  const response = await fetch('http://127.0.0.1:' + BRIDGE.port + path, {
    method,
    headers: Object.assign(
      { 'x-bridge-token': BRIDGE.token },
      body == null ? {} : { 'content-type': 'text/markdown; charset=utf-8' },
    ),
    body: body == null ? undefined : body,
  })
  return { ok: response.ok, status: response.status, text: (await response.text()).slice(0, 4000) }
}

export async function bridgePing() {
  try {
    const result = await bridgeRequest('GET', '/ping')
    return { ok: result.ok, detail: result.text }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) }
  }
}

/** 把一篇草稿写进库。rel 必须是库内 .md；内容原样落盘。 */
export async function commitDraft(rel, content) {
  if (typeof rel !== 'string' || !rel.endsWith('.md') || insideVault(rel) === null) {
    return { ok: false, error: 'bad-path' }
  }
  if (typeof content !== 'string' || content.trim() === '') {
    return { ok: false, error: 'empty' }
  }
  try {
    const result = await bridgeRequest('PUT', '/file?path=' + encodeURIComponent(rel), content)
    if (!result.ok) return { ok: false, error: 'bridge-' + result.status, detail: result.text }
    return { ok: true, rel }
  } catch (error) {
    return { ok: false, error: 'bridge-offline', detail: String(error?.message ?? error) }
  }
}

// ── 入库：分类树 / 拆条 / 套库结构 ────────────────────────────────────────
//
// 2026-11-05 作者：一条新设定往往同时牵涉人物、事件、具体设定，
// 「不能一股脑塞进去」。所以入库前先把正文拆成几片，一片一页，
// 各自归到库里对应的多级目录；排版也套成库里现有的样子。
// 分类目录不写死，每次现扫库——他改库结构，书桌这边自动跟上。

const CONTENT_TOPS = ['01-世界', '02-故事', '03-人物', '04-设定', '05-写作', '06-素材']

const TYPE_TOP = {
  人物: '03-人物',
  事件: '02-故事',
  故事: '02-故事',
  世界: '01-世界',
  地点: '01-世界',
  设定: '04-设定',
  素材: '06-素材',
  写作: '05-写作',
}

/** 入库第一站：待定箱。助手在库里过一遍、改顺了，再手动挪进正式分类。 */
const INBOX_DIR = '08-待定/00-新入库'

const TYPE_CUES = [
  ['人物', /人物|角色|名叫|叫作|叫做|出身|性格|外貌|身世|她是|他是/g],
  ['事件', /事件|这一章|这一节|这一卷|剧情|情节|起因|经过|结果|结局|战争|之后|来到|离开|发生/g],
  ['世界', /世界|宇宙|空间|海洋|大海|一棵树|巨树|位面|层级|法则|规则|神明/g],
  ['素材', /物候|植物|动物|节气|参考|资料|历法表|生物|现实里的/g],
  ['设定', /设定|体系|机制|原理|能量|等级|制度|社会|历法|命名|称呼|规矩|分类|概念/g],
]

const LABEL_RE = /^(人物|角色|事件|故事|设定|世界|地点|素材|写作)\s*[：:]\s*/

/** 目录名去掉前面的「NN-」编号，剩下的部分才是语义。 */
function stripNum(name) {
  return String(name ?? '').replace(/^\d{2,3}\s*[-_.、]\s*/, '').trim()
}

/** 文件名只留能安全落盘的字符。 */
function safeTitle(title) {
  return String(title ?? '')
    .replace(/[\\/:*?"<>|#^\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 60)
}

/** 现扫库里的目录：多级分类的唯一来源（客户端的下拉直接从这来）。 */
function vaultDirs() {
  const out = []
  const walk = (rel) => {
    const abs = rel === '' ? VAULT : join(VAULT, rel)
    let entries
    try {
      entries = readdirSync(abs, { withFileTypes: true })
    } catch {
      return
    }
    if (rel !== '') {
      const files = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md')).length
      out.push({ path: rel, name: rel.split('/').pop(), depth: rel.split('/').length, files })
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue
      walk(rel === '' ? entry.name : rel + '/' + entry.name)
    }
  }
  walk('')
  const byPath = new Map(out.map((dir) => [dir.path, dir]))
  for (const dir of out) {
    dir.total = 0
    for (const other of out) {
      if (other.path === dir.path || other.path.startsWith(dir.path + '/')) dir.total += other.files
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path, 'zh'))
}

function guessType(text, fallback) {
  const scores = []
  for (const [type, re] of TYPE_CUES) {
    re.lastIndex = 0
    const hits = (String(text).match(re) ?? []).length
    if (hits > 0) scores.push({ type, score: Math.min(hits, 3) })
  }
  scores.sort((a, b) => b.score - a.score)
  if (scores.length === 0) return fallback ?? '设定'
  // 人物/事件的词太常用，只在明显压过其它类时才认。
  if (scores.length > 1 && scores[1].score === scores[0].score && (scores[0].type === '人物' || scores[0].type === '事件')) {
    return fallback ?? '设定'
  }
  return scores[0].type
}

/** 名字长得像不像个专名：虚词开头、带助词、带标点的一律不认（散文里的「这两个人是……」不是名字）。 */
const NAME_HEAD = /^(这|那|下|上|以|不|很|然|并|但|而|所|因|对|从|到|在|和|与|及|其|此|该|每|各|两|几|数|多|少|全|都|又|再|更|最|太|还|就|才|只|也|却|便|则|若|如|虽|即|且|或|可|能|要|会|把|被|给|让|使|为|着|了|过|是|有|没|无|说|讲|写|像|成|做|用|让|一)/
const NAME_BAD = /[的了着过嘛呢吧啊呀哦是有在把被给让使为着吗\s，。、；：！？,.;:!?"'“”‘’「」『』《》（）()\[\]]/

function looksLikeName(value) {
  const text = String(value ?? '').trim()
  if (text.length < 2 || text.length > 14) return false
  if (NAME_HEAD.test(text) || NAME_BAD.test(text)) return false
  return true
}

/** 只在有旁证时才认名字：引号里点名，或者全文里反复出现（真专名总不止出现一次）。 */
function guessName(text, whole) {
  const body = String(text ?? '').trim()
  const all = String(whole ?? body)
  const firstLine = body.split(/\n+/)[0] ?? ''
  const quoted = /[「『"“]([^」』"”]{2,14})[」』"”]/.exec(firstLine)
  if (quoted !== null && looksLikeName(quoted[1])) return quoted[1]
  const asName = /^([^\s，。、；：！？]{2,14})(?:是|指|即|就是|叫作|叫做|称为|名叫)/.exec(firstLine)
  if (asName !== null && looksLikeName(asName[1]) && all.split(asName[1]).length - 1 >= 2) return asName[1]
  return ''
}

function splitSentences(text) {
  return String(text).split(/(?<=[。！？!?])/).map((part) => part.trim()).filter((part) => part !== '')
}

/** 星号列表：一条一个实体时才拆（≥2 条才值得拆）。 */
function bulletItems(block) {
  const items = []
  for (const line of block.split('\n')) {
    const match = /^\s*(?:[-*+]|\d+[.、])\s*\*{0,2}([^*：:，。；\s]{1,16})\*{0,2}\s*[：:—–-]\s*(.+)$/.exec(line)
    if (match === null) continue
    items.push({ title: match[1].trim(), text: match[2].trim() })
  }
  return items
}

/** 长段落里连着几句「X 是……」，按句拆成几片。
 *  2026-11-07 停用：散文里「这两个人是……」「不过这个剑修不是……」都会被当成定义句，
 *  一条草稿被剁成十几片、标题全是半句话。拆片只认作者自己写的结构（小节、标签、清单）。 */
function defGroups(block) {
  return []
}

function cutDraft(draft) {
  let raw = draft.body.replace(/\r\n?/g, '\n').trim()
  const parts = []
  // 作者把大问题写在草稿最后面（省上下文）。标了记的那些是「要议的」，不是正文：
  // 抽出来单独回给讨论区，免得混进页面里入库存档。2026-11-07 作者定的流程。
  const issues = []
  const ISSUE_HEAD = /^#{1,6}\s*(待议|待定问题|待讨论|问题|疑问|存疑)\s*$/
  const lines0 = raw.split('\n')
  const issueAt = lines0.findIndex((line) => ISSUE_HEAD.test(line.trim()))
  if (issueAt !== -1) {
    // 只吃掉这个小节：后面再出现别的标题，那是正文，得留下。
    const nextHead = lines0.findIndex((line, i) => i > issueAt && /^#{1,6}\s+/.test(line.trim()))
    const end = nextHead === -1 ? lines0.length : nextHead
    const tail = lines0.slice(issueAt + 1, end).join('\n').trim()
    if (tail !== '') {
      issues.push(...tail.split(/\n+/)
        .map((line) => line.replace(/^[-*+]\s*/, '').replace(/^(?:问题|问)[:：]\s*/, '').trim())
        .filter((line) => line !== ''))
    }
    raw = [...lines0.slice(0, issueAt), ...lines0.slice(end)].join('\n').trim()
  }
  raw = raw
    .split('\n')
    .filter((line) => {
      const q = /^(?:问题|问)[:：]\s*(.+)$/.exec(line.trim())
      if (q === null) return true
      issues.push(q[1].trim())
      return false
    })
    .join('\n')
    .trim()
  if (raw === '') return { parts, issues }

  const lines = raw.split('\n')
  const hasSection = lines.some((line) => /^##\s+/.test(line))

  if (hasSection) {
    // 已经分好节：一节一片。节前的导语单独成片（用整页的题目）。
    let current = null
    const lead = []
    for (const line of lines) {
      const head = /^##\s+(.*)$/.exec(line)
      if (head !== null) {
        if (current !== null) parts.push(current)
        const title = head[1].replace(/^[一二三四五六七八九十百\d]+[、.．]\s*/, '').trim()
        current = { title, type: '', text: [] }
      } else if (current === null) {
        lead.push(line)
      } else {
        current.text.push(line)
      }
    }
    if (current !== null) parts.push(current)
    const leadText = lead.join('\n').trim()
    if (leadText !== '') parts.unshift({ title: draft.title.trim(), type: '', text: leadText })
  } else {
    // 没有小节：只认作者自己写的结构——「人物：…」「设定：…」这种标签段，
    // 或者「- 名字：一句话」这种清单。剩下的散文整篇算一片，
    // 宁可少拆也不猜：猜出来的词多半是半句话，入库就变成一堆废页。
    const blocks = raw.split(/\n{2,}/).map((block) => block.trim()).filter((block) => block !== '')
    const loose = []
    for (const block of blocks) {
      const label = LABEL_RE.exec(block)
      if (label !== null) {
        const body = block.slice(label[0].length).trim()
        if (body !== '') {
          parts.push({ title: '', type: label[1], text: body })
          continue
        }
      }
      const items = bulletItems(block)
      if (items.length >= 2) {
        for (const item of items) parts.push({ title: item.title, type: '', text: item.text })
        continue
      }
      loose.push(block)
    }
    if (loose.length > 0) {
      const text = loose.join('\n\n')
      if (parts.length === 0) parts.push({ title: '', type: '', text })
      else parts.unshift({ title: '', type: '', text })
    }
  }

  // 太碎的小段并回上一片，别把一句半句话拆成孤页。
  const merged = []
  for (const part of parts) {
    const text = Array.isArray(part.text) ? part.text.join('\n').trim() : part.text
    if (text === '') continue
    const prev = merged[merged.length - 1]
    if (prev !== undefined && prev.text.length < 30 && part.type === '' && part.title === '') {
      prev.text += '\n\n' + text
      continue
    }
    merged.push({ title: part.title ?? '', type: part.type ?? '', text })
  }
  return { parts: merged, issues }
}

/** 给一片找目录：先看类型，再用「目录名 + 目录里已有的页名」跟正文对词。 */
function routeDir(text, title, type, dirs) {
  const top = TYPE_TOP[type] ?? '04-设定'
  let best = { dir: top, score: 0 }
  for (const dir of dirs) {
    // 类型已经定了树，就只在这棵树里挑叶：正文里提了一堆世界术语，
    // 不代表这一条人物该塞进 01-世界。
    if (dir.path !== top && !dir.path.startsWith(top + '/')) continue
    let score = dir.path === top ? 3 : 4
    for (const token of stripNum(dir.name).split(/[与和、,，\s]+/)) {
      if (token.length >= 2 && (text.includes(token) || title.includes(token))) score += 2
    }
    let pageHits = 0
    for (const page of dir.pages) {
      if (page.length >= 2 && (text.includes(page) || title.includes(page))) pageHits += 1
    }
    score += Math.min(5, pageHits * 2)
    if (score > best.score) best = { dir: dir.path, score }
  }
  return best.dir
}

/** 套成库里现有的样子：frontmatter + 一级标题 + 导语 + 分节 + 双链。 */
function formatPage(entry) {
  const title = safeTitle(entry.title) || '未命名'
  const type = entry.type ?? '设定'
  const today = new Date().toISOString().slice(0, 10)
  let body = String(entry.body ?? '').replace(/\r\n?/g, '\n').trim()
  body = body.replace(/^#\s+[^\n]*\n+/, '')
  body = body
    .split('\n')
    .map((line) => {
      const head = /^(#{1,6})\s+(.*)$/.exec(line)
      if (head === null) return line
      return '#'.repeat(Math.min(6, head[1].length + 1)) + ' ' + head[2]
    })
    .join('\n')
  body = body.replace(/^(\s*)[-*+](\S)/gm, '$1- $2')
  const summary = String(entry.summary ?? '').trim()
    || (splitSentences(body)[0] ?? '').replace(/^#+\s*/, '').slice(0, 80)
    || ('（' + type + '）')
  // 导语已经占了一行，正文别再重复一遍那句话；但整段只有一句话时得留着，不能删空。
  let text = body
  if (summary !== '' && text.startsWith(summary)) {
    const rest = text.slice(summary.length).replace(/^[\s，,。；;、:：]+/, '')
    if (rest !== '') text = rest
  }
  const lines = [
    '---',
    'tags: [书桌, ' + type + ']',
    'created: ' + today,
    'updated: ' + today,
    '---',
    '',
    '# ' + title,
    '',
    '> ' + summary,
    '> 🆕 **新建（' + today + '，书桌入库）** · 🔵 待确认',
    '',
    '---',
    '',
    linkifyBody(text, title),
    '',
  ]
  return lines.join('\n')
}

/** 正文里凡是库里已有的页名，第一次提到时补成双链（库里就是这个习惯）。 */
function linkifyBody(body, ownTitle) {
  const docs = readAll()
  const names = [...new Set(docs.map((doc) => doc.name))]
    .filter((name) => name.length >= 3 && name !== ownTitle)
    .sort((a, b) => b.length - a.length)
    .slice(0, 400)
  let budget = 16
  return body
    .split('\n')
    .map((line) => {
      if (/^\s*(```|> |#)/.test(line)) return line
      return line
        .split(/(\[\[[^\]]*\]\]|`[^`]*`)/)
        .map((piece) => {
          if (piece.startsWith('[[') || piece.startsWith('`')) return piece
          let text = piece
          for (const name of names) {
            if (budget <= 0) break
            if (!text.includes(name)) continue
            text = text.split(name).join('[[' + name + ']]')
            budget -= 1
          }
          return text
        })
        .join('')
    })
    .join('\n')
}

/** 往已有页里追加一节：不覆盖原文，只把新内容挂到末尾。 */
function appendSection(existingText, entry) {
  const title = safeTitle(entry.title) || '补充'
  let body = String(entry.body ?? '').replace(/\r\n?/g, '\n').trim()
  body = body.replace(/^#\s+[^\n]*\n+/, '')
  const oldTitle = /^#\s+(.*)$/m.exec(existingText)
  const sameTitle = oldTitle !== null && oldTitle[1].trim() === title
  const heading = '## ' + title + (sameTitle ? '（补充）' : '')
  return existingText.replace(/\s+$/, '') + '\n\n' + heading + '\n\n' + body + '\n'
}

export function splitDraft(input) {
  const draft = {
    title: String(input?.title ?? ''),
    related: String(input?.related ?? ''),
    body: String(input?.body ?? ''),
    category: String(input?.category ?? '') || '设定',
  }
  const docs = readAll()
  const dirs = vaultDirs().map((dir) => ({
    ...dir,
    pages: docs.filter((doc) => doc.dir === dir.path).map((doc) => stripNum(doc.name)),
  }))
  // 入库先进待定箱，助手过一遍再挪到正式分类（2026-11-07 作者定的第四版→第五版流程）。
  if (!dirs.some((dir) => dir.path === INBOX_DIR)) {
    dirs.unshift({ path: INBOX_DIR, name: '新入库', pages: [] })
  }
  const cut = cutDraft(draft)
  const raw = cut.parts
  const issues = cut.issues
  const parts = []
  const used = new Map()
  for (const item of raw) {
    const text = item.text.trim()
    if (text === '') continue
    const type = item.type !== '' ? item.type : guessType(text, draft.category)
    const guessed = safeTitle(guessName(text, draft.body))
    const title = safeTitle(item.title)
      || guessed
      || (raw.length <= 1 ? safeTitle(draft.title) : '')
      || safeTitle(draft.title + '·' + type)
      || '（待命名）'
    // 默认进待定箱；建议的正式分类留着给结算页那个下拉当提示（routeDir 仍然算）。
    const suggested = routeDir(text, title, type, dirs)
    const dir = INBOX_DIR
    const rel = dir + '/' + title + '.md'
    const previous = used.get(rel)
    if (previous !== undefined) {
      previous.body += '\n\n' + text
      continue
    }
    const entry = { title, type, dir, suggested, rel, body: text, chars: text.length }
    used.set(rel, entry)
    parts.push(entry)
  }
  return { ok: true, parts, dirs, issues, today: new Date().toISOString().slice(0, 10) }
}

/** 写多页：目标已存在就追加一节，不存在才新建。逐页回报结果。 */
export async function commitPages(pages) {
  const results = []
  const root = resolve(VAULT)
  for (const page of (Array.isArray(pages) ? pages : []).slice(0, 40)) {
    const wanted = String(page?.rel ?? '').trim() !== ''
      ? page.rel
      : (String(page?.dir ?? '').trim() !== '' ? String(page.dir).trim() : (TYPE_TOP[page?.type] ?? '04-设定'))
        + '/' + (safeTitle(page?.title) || '（待命名）') + '.md'
    const abs = insideVault(String(wanted ?? ''))
    if (abs === null) {
      results.push({ ok: false, rel: wanted, error: 'bad-path' })
      continue
    }
    const rel = relative(root, abs).split(sep).join('/')
    const title = safeTitle(page?.title) || rel.split('/').pop().replace(/\.md$/i, '')
    const entry = { title, type: page?.type, body: page?.body, summary: page?.summary }
    let content
    let action = 'created'
    if (existsSync(abs)) {
      if (page?.mode === 'replace') {
        content = formatPage(entry)
        action = 'replaced'
      } else {
        let old = ''
        try {
          old = readFileSync(abs, 'utf8')
        } catch {
          old = ''
        }
        content = appendSection(old, entry)
        action = 'appended'
      }
    } else {
      content = formatPage(entry)
    }
    try {
      const put = await bridgeRequest('PUT', '/file?path=' + encodeURIComponent(rel), content)
      if (!put.ok) {
        results.push({ ok: false, rel, error: 'bridge-' + put.status, detail: put.text })
        continue
      }
      results.push({ ok: true, rel, action, title })
    } catch (error) {
      results.push({ ok: false, rel, error: 'bridge-offline', detail: String(error?.message ?? error) })
    }
  }
  return { ok: results.every((row) => row.ok === true), pages: results, count: results.filter((row) => row.ok).length }
}

// ── 路由 ──────────────────────────────────────────────────────────────────

function sendJson(response, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.byteLength),
    'x-content-type-options': 'nosniff',
  })
  response.end(body)
}

function loopbackOnly(request) {
  const address = request.socket?.remoteAddress ?? ''
  return address === '' || address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

function readBody(request) {
  return new Promise((resolveBody) => {
    const chunks = []
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > 1_000_000) {
        request.destroy()
        resolveBody(null)
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        resolveBody(null)
      }
    })
    request.on('error', () => resolveBody(null))
  })
}

function insideVault(rel) {
  const abs = resolve(VAULT, rel)
  return abs.startsWith(resolve(VAULT) + sep) ? abs : null
}

async function handle(request, response, url) {
  if (!loopbackOnly(request)) {
    response.writeHead(403)
    response.end()
    return
  }
  const route = url.pathname.slice(API.length) || '/'
  const method = request.method ?? 'GET'

  if (VAULT === '') {
    sendJson(response, 200, {
      ok: false,
      error: 'no-vault',
      hint: '还没有配置资料库路径。编辑 ' + CONFIG_FILE + '，写入 {"vault":"你的 Obsidian 库绝对路径"}，再刷新页面。',
    })
    return
  }

  if (method !== 'GET' && method !== 'POST') {
    response.writeHead(405, { allow: 'GET, POST' })
    response.end()
    return
  }

  const terms = (url.searchParams.get('terms') ?? '')
    .split(/[,，、\s]+/)
    .map((term) => term.trim())
    .filter((term) => term !== '')
    .slice(0, 12)

  switch (route) {
    case '/state':
      sendJson(response, 200, overview())
      return
    case '/probe':
      sendJson(response, 200, probe(terms, { archive: url.searchParams.get('archive') === '1' }))
      return
    case '/terms': {
      if (method === 'POST') {
        const body = await readBody(request)
        sendJson(response, 200, termsOf(body))
        return
      }
      sendJson(response, 200, termsOf({ text: url.searchParams.get('text') ?? '' }))
      return
    }
    case '/page': {
      const rel = url.searchParams.get('rel') ?? ''
      const abs = insideVault(rel)
      if (abs === null) {
        sendJson(response, 400, { ok: false, error: 'bad-path' })
        return
      }
      sendJson(response, 200, pageDetail(rel))
      return
    }
    case '/search':
      sendJson(response, 200, search(url.searchParams.get('q') ?? ''))
      return
    case '/todo':
      if (method === 'POST') {
        const body = await readBody(request)
        sendJson(response, 200, writeTodo(body?.items))
        return
      }
      sendJson(response, 200, readTodo())
      return
    case '/drafts':
      if (method === 'POST') {
        const body = await readBody(request)
        sendJson(response, 200, writeDrafts(body?.items))
        return
      }
      sendJson(response, 200, readDrafts())
      return
    case '/bridge':
      sendJson(response, 200, await bridgePing())
      return
    case '/call': {
      if (method !== 'POST') {
        sendJson(response, 405, { ok: false, error: 'post-only' })
        return
      }
      const body = await readBody(request)
      sendJson(response, 200, await callWhale(body))
      return
    }
    case '/tree':
      sendJson(response, 200, { ok: true, dirs: vaultDirs().filter((dir) => CONTENT_TOPS.includes(dir.path.split('/')[0])) })
      return
    case '/split': {
      if (method !== 'POST') {
        sendJson(response, 405, { ok: false, error: 'post-only' })
        return
      }
      const body = await readBody(request)
      sendJson(response, 200, splitDraft(body))
      return
    }
    case '/commit': {
      if (method !== 'POST') {
        sendJson(response, 405, { ok: false, error: 'post-only' })
        return
      }
      const body = await readBody(request)
      if (Array.isArray(body?.pages)) {
        sendJson(response, 200, await commitPages(body.pages))
        return
      }
      sendJson(response, 200, await commitDraft(body?.rel, body?.content))
      return
    }
    default:
      sendJson(response, 404, { ok: false, error: 'unknown-route' })
  }
}

/**
 * 叫助手：把这页草稿写好的消息送进「最近的会话」。
 * 找不到合适的会话（比如所有会话都关了）就新开一个，绝不静默失败。
 */
async function callWhale(body) {
  const controller = pluginCtx?.get?.('sessionController')
  if (controller === undefined || controller === null) {
    return { ok: false, error: '拿不到 session 服务，DSH 这边可能还没起来' }
  }
  const signal = new AbortController().signal
  let rows = []
  try {
    const listed = await controller.list({}, signal)
    rows = (listed?.items ?? []).filter((item) =>
      item.origin !== 'subagent' &&
      item.parentSessionId === undefined &&
      !item.blank)
    // 配了 workdir 就只在这个工作区里找；没配就退到最近的那个会话。
    if (WORKDIR !== '') {
      rows = rows.filter((item) =>
        typeof item.cwd === 'string' && item.cwd.toLowerCase() === WORKDIR.toLowerCase())
    }
    rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  } catch (error) {
    return { ok: false, error: '列会话失败：' + String(error?.message ?? error) }
  }
  let sessionId = rows.length > 0 ? rows[0].sessionId : null
  let created = false
  try {
    if (sessionId === null) {
      const made = await controller.create(WORKDIR === '' ? {} : { cwd: WORKDIR })
      sessionId = made.sessionId
      created = true
    }
    const title = typeof body?.title === 'string' && body.title.trim() !== ''
      ? body.title.trim()
      : '新的一页'
    const text = '【书桌】「' + title + '」这页草稿写好了，帮我查漏补缺。'
      + '草稿在 ' + DRAFTS_FILE + '，跟库里已有设定有没有打架也一起看看。'
    await controller.prompt({
      requestId: 'shuzhuo-' + Date.now(),
      sessionId,
      mode: 'queue',
      content: [{ type: 'text', text }],
    }, signal)
    return { ok: true, sessionId, created }
  } catch (error) {
    return { ok: false, error: '发消息失败：' + String(error?.message ?? error) }
  }
}

export function apply(ctx) {
  pluginCtx = ctx

  const route = {
    kind: 'prefix',
    path: API,
    handler: (request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      return handle(request, response, url).catch((error) => {
        try {
          sendJson(response, 500, { ok: false, error: String(error?.message ?? error) })
        } catch {
          /* the socket is already gone */
        }
      })
    },
  }

  ctx.inject(['webServer'], (host) => {
    host.effect(() => host.webServer.register(route), 'shuzhuo: ' + route.path)
  })
}

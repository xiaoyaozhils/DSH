/**
 * 书桌 — client half.
 *
 * 一个 main 面板 + 侧栏图标。四张台子：概览、牵连、页面、待办。
 * 所有数据来自 /api/shuzhuo/*，这里不碰库、不碰文件系统。
 */
window.__ModuleLoader__.load({
  id: '@local/shuzhuo',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useRef, useState } = React

    const API = '/api/shuzhuo'
    const NS = 'shuzhuo'
    let panelCtx = null

    // ── 样式 ───────────────────────────────────────────────────────────
    const CSS = `
.sz { height:100%; overflow:auto; box-sizing:border-box; padding:22px 26px 96px;
  font-family:inherit; color:var(--dsw-alias-text-primary, #dfe8f7); }
.sz-head { display:flex; align-items:flex-end; gap:14px; }
.sz-title { font-size:21px; letter-spacing:1px; line-height:1.2; }
.sz-sub { font-size:12.5px; color:rgba(160,185,220,.55); margin-top:5px; letter-spacing:.3px; }
.sz-spacer { flex:1; }
.sz-tabs { display:flex; gap:2px; margin:20px 0 20px; border-bottom:1px solid rgba(150,190,255,.10); }
.sz-tab { padding:7px 15px 9px; font-size:13.5px; letter-spacing:.4px; color:rgba(170,195,230,.60);
  cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; user-select:none;
  transition:color .15s ease, border-color .15s ease; }
.sz-tab:hover { color:rgba(205,222,248,.85); }
.sz-tab[data-on="1"] { color:#a9c8ff; border-bottom-color:#6f9cf5; }
.sz-card { background:rgba(255,255,255,.025); border:1px solid rgba(150,190,255,.10);
  border-radius:14px; padding:15px 17px; margin-bottom:14px; }
.sz-card h3 { margin:0 0 12px; font-size:13px; font-weight:500; letter-spacing:1px;
  color:rgba(175,200,235,.72); }
.sz-stats { display:flex; gap:12px; margin-bottom:14px; flex-wrap:wrap; }
.sz-stat { flex:1 1 140px; background:rgba(255,255,255,.025); border:1px solid rgba(150,190,255,.10);
  border-radius:14px; padding:13px 16px; }
.sz-stat-num { font-size:22px; letter-spacing:.5px; font-variant-numeric:tabular-nums;
  color:rgba(226,238,255,.94); }
.sz-stat-num small { font-size:12px; margin-left:3px; color:rgba(160,185,220,.6); }
.sz-stat-label { font-size:11.5px; margin-top:5px; letter-spacing:.6px; color:rgba(160,185,220,.55); }
.sz-cols { display:flex; gap:14px; align-items:flex-start; flex-wrap:wrap; }
.sz-cols > .sz-card { flex:1 1 320px; margin-bottom:14px; }
.sz-row { display:flex; align-items:center; gap:9px; padding:5px 0; font-size:12.8px; }
.sz-row-name { color:rgba(210,226,248,.90); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sz-row-meta { color:rgba(155,180,215,.55); font-size:11.5px; font-variant-numeric:tabular-nums; }
.sz-bar { flex:1; height:4px; border-radius:2px; background:rgba(150,190,255,.08); overflow:hidden; min-width:40px; }
.sz-bar i { display:block; height:100%; border-radius:2px; background:rgba(120,160,235,.55); }
.sz-link { cursor:pointer; }
.sz-link:hover { color:#bcd4ff; text-decoration:underline; text-underline-offset:3px; }
.sz-chips { display:flex; flex-wrap:wrap; gap:7px; }
.sz-chip { font-size:12.2px; padding:4px 10px; border-radius:9px; cursor:pointer;
  background:rgba(255,255,255,.035); border:1px solid rgba(150,190,255,.10);
  color:rgba(200,218,245,.82); white-space:nowrap; }
.sz-chip:hover { border-color:rgba(140,180,255,.35); color:#cfe0ff; }
.sz-chip small { color:rgba(155,180,215,.5); margin-left:6px; }
.sz-scan { display:flex; gap:9px; margin-bottom:10px; }
.sz-input { flex:1; box-sizing:border-box; padding:9px 13px; border-radius:11px; font-family:inherit;
  font-size:13.5px; color:rgba(220,234,255,.92); background:rgba(255,255,255,.045);
  border:1px solid rgba(150,190,255,.14); outline:none; }
.sz-input:focus { border-color:rgba(140,180,255,.42); background:rgba(255,255,255,.06); }
.sz-input::placeholder { color:rgba(150,175,215,.42); }
.sz-btn { padding:9px 18px; border-radius:11px; font-family:inherit; font-size:13.5px; cursor:pointer;
  color:rgba(228,238,255,.94); background:rgba(110,150,235,.22);
  border:1px solid rgba(140,180,255,.30); white-space:nowrap; }
.sz-btn:hover { background:rgba(110,150,235,.32); }
.sz-btn:disabled { opacity:.5; cursor:default; }
.sz-hint { font-size:11.8px; color:rgba(150,175,215,.48); margin-bottom:18px; letter-spacing:.3px; }
.sz-gsum { display:flex; gap:16px; align-items:center; margin:2px 0 16px; font-size:13px; }
.sz-gdot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; vertical-align:1px; }
.sz-hit { border:1px solid rgba(150,190,255,.09); border-radius:13px; padding:11px 14px;
  margin-bottom:9px; background:rgba(255,255,255,.018); }
.sz-hit[data-level="red"] { border-left:3px solid rgba(240,145,141,.75); }
.sz-hit[data-level="yellow"] { border-left:3px solid rgba(226,183,107,.70); }
.sz-hit[data-level="gray"] { border-left:3px solid rgba(150,175,215,.30); }
.sz-hit-head { display:flex; align-items:baseline; gap:10px; cursor:pointer; }
.sz-hit-name { font-size:14px; color:rgba(222,235,255,.94); letter-spacing:.3px; }
.sz-hit-name.meta::after { content:"元"; font-size:9.5px; margin-left:6px; padding:1px 4px;
  border-radius:4px; color:rgba(150,175,215,.7); background:rgba(150,175,215,.12); vertical-align:2px; }
.sz-hit-dir { font-size:11.5px; color:rgba(155,180,215,.50); }
.sz-hit-space { flex:1; }
.sz-hit-count { font-size:12px; color:rgba(170,195,230,.68); font-variant-numeric:tabular-nums; }
.sz-hit-sub { margin-top:7px; font-size:12.2px; color:rgba(165,190,225,.62); }
.sz-hit-sub b { font-weight:500; color:rgba(190,212,245,.80); }
.sz-snips { margin-top:9px; border-top:1px dashed rgba(150,190,255,.10); padding-top:9px; }
.sz-snip { display:flex; gap:10px; font-size:12.4px; line-height:1.75; padding:1px 0; }
.sz-snip-sec { flex:0 0 116px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  color:rgba(140,168,210,.52); font-size:11.5px; }
.sz-snip-text { flex:1; color:rgba(196,214,240,.78); word-break:break-word; }
.sz-snip[data-def="1"] .sz-snip-text { color:rgba(232,240,255,.95); }
.sz-mark { background:rgba(255,205,120,.16); color:rgba(255,226,168,.96); border-radius:3px; padding:0 1px; }
.sz-empty { font-size:12.5px; color:rgba(150,175,215,.45); padding:10px 0; }
.sz-page { display:flex; gap:16px; align-items:flex-start; }
.sz-page-list { flex:0 0 250px; max-height:64vh; overflow:auto; padding-right:4px; }
.sz-page-item { padding:6px 9px; border-radius:8px; font-size:12.6px; cursor:pointer;
  color:rgba(198,216,242,.80); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sz-page-item:hover { background:rgba(255,255,255,.045); }
.sz-page-item[data-on="1"] { background:rgba(110,150,235,.16); color:#cfe0ff; }
.sz-page-body { flex:1; min-width:0; }
.sz-pre { white-space:pre-wrap; word-break:break-word; font-family:inherit; font-size:13.2px;
  line-height:1.95; color:rgba(206,222,246,.82); margin:0; max-height:60vh; overflow:auto;
  padding-right:8px; }
.sz-links { display:flex; flex-wrap:wrap; gap:6px; margin-top:4px; }
.sz-todo-in { display:flex; gap:9px; margin-bottom:14px; }
.sz-todo { display:flex; align-items:flex-start; gap:10px; padding:7px 0;
  border-bottom:1px solid rgba(150,190,255,.06); font-size:13.2px; }
.sz-todo-box { flex:0 0 16px; width:16px; height:16px; margin-top:2px; border-radius:5px; cursor:pointer;
  border:1px solid rgba(150,190,255,.30); display:flex; align-items:center; justify-content:center;
  color:#8fb4ff; font-size:11px; }
.sz-todo[data-done="1"] .sz-todo-text { color:rgba(150,175,215,.40); text-decoration:line-through; }
.sz-todo-text { flex:1; color:rgba(208,224,248,.88); word-break:break-word; line-height:1.6; }
.sz-todo-del { cursor:pointer; color:rgba(150,175,215,.35); font-size:12px; padding:0 4px; }
.sz-todo-del:hover { color:rgba(240,145,141,.85); }
.sz-err { color:rgba(240,145,141,.85); font-size:13.5px; }

/* ── 讨论台 ─────────────────────────────────────────────── */
.sz-desk { display:flex; gap:18px; align-items:flex-start; }
.sz-desk-list { flex:0 0 250px; min-width:0; }
.sz-desk-item { padding:8px 11px; border-radius:10px; cursor:pointer; margin-bottom:3px;
  border:1px solid transparent; }
.sz-desk-item:hover { background:rgba(255,255,255,.04); }
.sz-desk-item[data-on="1"] { background:rgba(110,150,235,.14); border-color:rgba(140,180,255,.22); }
.sz-desk-name { font-size:14px; color:rgba(210,226,248,.90); overflow:hidden;
  text-overflow:ellipsis; white-space:nowrap; }
.sz-desk-meta { font-size:12px; color:rgba(150,175,215,.50); margin-top:3px; letter-spacing:.3px; }
.sz-desk-main { flex:1; min-width:0; }
.sz-field { display:block; margin-bottom:10px; }
.sz-field .sz-input { width:100%; box-sizing:border-box; }
.sz-select { box-sizing:border-box; padding:9px 12px; border-radius:11px; font-family:inherit;
  font-size:14.5px; color:rgba(220,234,255,.92); background:rgba(255,255,255,.045);
  border:1px solid rgba(150,190,255,.14); outline:none; }
.sz-area { box-sizing:border-box; width:100%; min-height:44vh; resize:vertical; padding:15px 17px;
  border-radius:14px; font-family:inherit; font-size:15px; line-height:1.95;
  color:rgba(214,228,250,.90); background:rgba(255,255,255,.030);
  border:1px solid rgba(150,190,255,.12); outline:none; }
.sz-area:focus { border-color:rgba(140,180,255,.38); background:rgba(255,255,255,.045); }
.sz-area::placeholder { color:rgba(150,175,215,.42); }
.sz-part { border:1px solid rgba(140,180,255,.15); border-radius:12px; padding:10px 12px;
  margin-top:10px; background:rgba(110,150,235,.05); }
.sz-part[data-on="0"] { opacity:.55; background:transparent; }
.sz-part-head { display:flex; align-items:center; gap:8px; margin-bottom:7px; }
.sz-part-num { font-size:12.5px; color:rgba(150,175,215,.55); min-width:18px; }
.sz-part-body { box-sizing:border-box; width:100%; height:96px; min-height:96px; resize:vertical;
  padding:9px 11px; border-radius:10px; font-family:inherit; font-size:15.5px; line-height:1.75;
  color:rgba(214,228,250,.88); background:rgba(255,255,255,.028);
  border:1px solid rgba(150,190,255,.11); outline:none; }
.sz-part-body:focus { border-color:rgba(140,180,255,.34); background:rgba(255,255,255,.045); }
.sz-part-x { padding:3px 9px; font-size:14px; background:rgba(240,145,141,.10); border-color:rgba(240,145,141,.24); }
.sz-part-foot { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
.sz-split-hint { font-size:12.5px; color:rgba(150,175,215,.50); margin-top:8px; }
.sz-settle-scroll { flex:1 1 auto; min-height:0; overflow:auto; padding-right:8px; }
.sz-desk-bar { display:flex; align-items:center; gap:12px; margin-top:10px; flex-wrap:wrap; }
.sz-desk-quiet { flex:1 1 100%; font-size:12.5px; color:rgba(150,175,215,.48); }
.sz-badge { display:inline-block; font-size:11px; padding:1px 5px; border-radius:4px; margin-left:6px;
  color:rgba(150,175,215,.72); background:rgba(150,175,215,.12); vertical-align:2px; }
.sz-settle-line { display:flex; align-items:center; gap:8px; padding:7px 0; font-size:13px;
  color:rgba(205,222,248,.85); border-bottom:1px solid rgba(150,190,255,.06); }
.sz-note { font-size:12.5px; color:rgba(226,183,107,.82); }

/* 讨论台整页模式：铺满面板，整页不滚动 */
.sz.sz-deskonly { display:flex; flex-direction:column; overflow:hidden; padding:16px 24px 14px; }
.sz-deskonly .sz-head { flex:0 0 auto; }
.sz-deskonly .sz-tabs { flex:0 0 auto; margin:12px 0 14px; }
.sz-deskonly .sz-desk { flex:1 1 auto; min-height:0; align-items:stretch; }
.sz-deskonly .sz-desk-list { overflow:auto; max-height:none; }
.sz-deskonly .sz-desk-main { display:flex; flex-direction:column; min-height:0; }
.sz-desk[data-mode="talk"] .sz-field { flex:0 0 auto; }
.sz-desk[data-mode="talk"] .sz-area { flex:1 1 auto; min-height:160px; height:auto; resize:none; }

/* 牵连图 */
.sz-graph { width:100%; overflow:auto; max-height:62vh; border-radius:14px;
  background:rgba(255,255,255,.015); border:1px solid rgba(150,190,255,.08); }
.sz-graph svg { display:block; }
.sz-node { cursor:pointer; }
.sz-node text { fill:rgba(205,222,248,.85); font-family:inherit; }
.sz-node:hover text { fill:#dce9ff; }
.sz-node[data-on="1"] text { fill:#a9c8ff; }
.sz-glegend { display:flex; gap:14px; margin-top:10px; font-size:12.5px; color:rgba(160,185,220,.6); }
.sz-detail { background:rgba(255,255,255,.02); border:1px solid rgba(150,190,255,.09);
  border-radius:13px; padding:12px 14px; }
.sz-detail-head { display:flex; align-items:baseline; gap:10px; margin-bottom:8px; }
.sz-detail-name { font-size:16px; color:#dfe9f8; }
.sz-detail-dir { font-size:12px; color:rgba(155,180,215,.55); }
.sz-detail-meta { font-size:12px; color:rgba(160,185,220,.6); }
.sz-seg { display:flex; gap:6px; }
.sz-seg button { padding:5px 12px; border-radius:9px; font-family:inherit; font-size:12.5px;
  cursor:pointer; color:rgba(190,210,240,.75); background:rgba(255,255,255,.04);
  border:1px solid rgba(150,190,255,.12); }
.sz-seg button[data-on="1"] { color:#cfe0ff; background:rgba(110,150,235,.22);
  border-color:rgba(140,180,255,.32); }

/* ── 字号基准（2026-11-05 作者用调节条定稿：整体 100%、正文 100%，按钮已删） ── */
.sz-title { font-size:26px; }
.sz-sub { font-size:15.5px; }
.sz-tab { font-size:17px; }
.sz-card h3 { font-size:16px; }
.sz-stat-num { font-size:27px; }
.sz-stat-num small { font-size:15px; }
.sz-stat-label { font-size:14.5px; }
.sz-row { font-size:16px; }
.sz-row-meta { font-size:14.5px; }
.sz-chip { font-size:15.2px; }
.sz-input { font-size:17px; }
.sz-select { font-size:16.5px; }
.sz-btn { font-size:17px; }
.sz-hint { font-size:15px; }
.sz-gsum { font-size:16.5px; }
.sz-hit-name { font-size:17.5px; }
.sz-hit-dir { font-size:14.5px; }
.sz-hit-count { font-size:15px; }
.sz-hit-sub { font-size:15.2px; }
.sz-snip { font-size:15.6px; }
.sz-snip-sec { font-size:14.5px; }
.sz-empty { font-size:15.5px; }
.sz-page-item { font-size:16px; }
.sz-todo { font-size:16.5px; }
.sz-desk-name { font-size:16px; }
.sz-desk-meta { font-size:14px; }
.sz-desk-quiet { font-size:14.5px; }
.sz-badge { font-size:13.5px; }
.sz-settle-name { font-size:19px; }
.sz-settle-line { font-size:15.6px; }
.sz-note { font-size:15px; }
.sz-seg button { font-size:15.5px; }
.sz-detail-name { font-size:18px; }
.sz-detail-dir { font-size:14.5px; }
.sz-detail-meta { font-size:14.8px; }
.sz-glegend { font-size:14.8px; }
.sz-pre { font-size:17px; line-height:2.15; }
.sz.sz-deskonly .sz-title { font-size:23px; }
.sz-desk[data-mode="talk"] > .sz-desk-list .sz-desk-new { font-size:15.5px; }
.sz-desk[data-mode="talk"] > .sz-desk-list .sz-desk-name { font-size:15.2px; }
.sz-desk[data-mode="talk"] > .sz-desk-list .sz-desk-meta { font-size:13.4px; }
.sz-desk[data-mode="talk"] .sz-desk-bar .sz-desk-quiet { font-size:14px; }
.sz-detail .sz-snip { font-size:15.2px; }
.sz-area { font-size:20px; line-height:1.5; padding:16px 20px; }

`

    function ensureStyle() {
      const id = 'shuzhuo-style'
      if (document.getElementById(id) !== null) return () => {}
      const node = document.createElement('style')
      node.id = id
      node.textContent = CSS
      document.head.appendChild(node)
      return () => {
        if (node.parentNode !== null) node.parentNode.removeChild(node)
      }
    }

    // ── 小工具 ─────────────────────────────────────────────────────────
    const LEVEL = {
      red: { dot: 'rgba(240,145,141,.85)', text: '定义点' },
      yellow: { dot: 'rgba(226,183,107,.85)', text: '深度涉及' },
      gray: { dot: 'rgba(150,175,215,.35)', text: '顺带提及' },
    }

    function escapeRe(value) {
      return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }

    function highlight(text, terms) {
      const active = terms.filter((term) => term !== '' && text.includes(term))
      if (active.length === 0) return text
      const re = new RegExp('(' + active.map(escapeRe).join('|') + ')', 'g')
      return text.split(re).map((part, index) =>
        active.includes(part) ? h('mark', { key: index, className: 'sz-mark' }, part) : part,
      )
    }

    function when(ms) {
      const delta = Date.now() - ms
      if (!Number.isFinite(delta)) return ''
      if (delta < 90_000) return '刚刚'
      if (delta < 3_600_000) return Math.round(delta / 60_000) + ' 分钟前'
      if (delta < 86_400_000) return Math.round(delta / 3_600_000) + ' 小时前'
      return Math.round(delta / 86_400_000) + ' 天前'
    }

    function num(value) {
      if (value >= 10_000) return (value / 10_000).toFixed(1)
      return String(value)
    }

    /** 27.2 万字 / 5,302 字 —— 中文里「万字」是单位，不能只有数字。 */
    function words(chars) {
      if (chars >= 10_000) return num(chars) + ' 万字'
      return String(chars) + ' 字'
    }

    /**
     * 走 XHR 而不是 fetch：宿主里有别的插件给 window.fetch 打了补丁，
     * 某些情况下请求会永远挂着不 resolve。XHR 不经过那层补丁。
     */
    function http(method, path, body) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open(method, path, true)
        xhr.timeout = 20000
        xhr.setRequestHeader('accept', 'application/json')
        xhr.onload = () => {
          if (xhr.status < 200 || xhr.status >= 300) {
            reject(new Error('HTTP ' + xhr.status))
            return
          }
          try {
            resolve(xhr.responseText === '' ? null : JSON.parse(xhr.responseText))
          } catch (err) {
            reject(new Error('返回的不是 JSON'))
          }
        }
        xhr.onerror = () => reject(new Error('网络请求失败'))
        xhr.ontimeout = () => reject(new Error('请求超时'))
        if (body === undefined) {
          xhr.send()
        } else {
          xhr.setRequestHeader('content-type', 'application/json')
          xhr.send(JSON.stringify(body))
        }
      })
    }

    function getJson(path) {
      return http('GET', path)
    }

    /**
     * 书桌自己的位置（库、草稿、工作区）由宿主告诉前端，前端不再写死任何人的路径。
     * 第一次读 /state 之后缓存住，叫助手和列会话都从这里取。
     */
    let deskState = null
    async function loadDeskState() {
      if (deskState !== null) return deskState
      try {
        const next = await getJson(API + '/state')
        if (next?.ok === true) deskState = next
      } catch { /* 读不到就按未配置处理 */ }
      return deskState
    }

    function remoteSession() {
      try {
        return panelCtx === null ? null : panelCtx.remote.session
      } catch {
        return null
      }
    }

    /**
     * 叫助手看一眼发到哪儿。作者 2026-11-06 要的：
     * 可以自己选会话——正在聊的那个、或者新开一个；入库之后再叫，也还跟着这个选择。
     * 选择存在 localStorage，书桌面板关了再开也记得。
     */
    const ASK_TARGET_KEY = 'shuzhuo.askTarget'
    const ASK_NEW_KEY = 'shuzhuo.askNewSession'

    function readAskTarget() {
      try {
        const value = window.localStorage.getItem(ASK_TARGET_KEY)
        return typeof value === 'string' && value !== '' ? value : 'auto'
      } catch {
        return 'auto'
      }
    }

    function writeAskTarget(value) {
      try {
        window.localStorage.setItem(ASK_TARGET_KEY, value)
        // 换了去向就把上次新开的那个忘掉：再选「新建会话」应当给一个新的。
        window.localStorage.removeItem(ASK_NEW_KEY)
      } catch {
        /* 存不了就只顾这一次 */
      }
    }

    function readNewSession() {
      try {
        const value = window.localStorage.getItem(ASK_NEW_KEY)
        return typeof value === 'string' && value !== '' ? value : null
      } catch {
        return null
      }
    }

    function writeNewSession(sessionId) {
      try {
        window.localStorage.setItem(ASK_NEW_KEY, sessionId)
      } catch {
        /* 忽略 */
      }
    }

    /** 发到哪个会话的下拉。auto = 最近在聊的那个；session:xx = 指定的老会话；new = 新开一个。 */
    function AskTarget(props) {
      const { value, targets, onChange } = props
      return h('select', {
        className: 'sz-select',
        title: '这条消息发到哪个会话',
        value,
        onChange: (event) => onChange(event.target.value),
        style: { width: 'auto', minWidth: '132px', maxWidth: '220px', fontSize: '13px', padding: '6px 8px' },
      },
        h('option', { value: 'auto' }, '发到：当前会话'),
        ...targets.map((row) => h('option', { key: row.value, value: row.value }, row.label)),
        h('option', { value: 'new' }, '发到：新建会话'))
    }

    /**
     * 叫助手看一眼。两种对象：
     * - 讨论中的草稿：看工作区里的 drafts.json，查漏补缺；
     * - 已入库的页：看库里那一页，因为草稿马上会被清掉，真正留下的是库。
     * 返回一句给按钮下面显示的话。
     */
    async function askWhale(payload) {
      const title = (typeof payload.title === 'string' && payload.title.trim() !== '')
        ? payload.title.trim()
        : '（还没有名字的一页）'
      // 草稿在哪儿、工作区在哪儿都问宿主要，不再写死某个人的路径。
      const desk = await loadDeskState()
      const draftsPath = typeof desk?.paths?.drafts === 'string' ? desk.paths.drafts : ''
      const workdir = typeof desk?.workdir === 'string' ? desk.workdir : ''
      const text = payload.filed === true
        ? '【书桌】「' + title + '」这页已经入库了（' + (payload.rel ?? '') + '），'
          + '帮我看看有没有漏的、要补的，跟库里别的设定有没有打架。'
        : '【书桌】「' + title + '」这页草稿写好了，帮我查漏补缺。'
          + (draftsPath === '' ? '' : '草稿在 ' + draftsPath + '，')
          + '跟库里已有设定有没有打架也一起看看。'
      const signal = new AbortController().signal
      const target = readAskTarget()
      try {
        const remote = remoteSession()
        if (remote !== undefined && remote !== null) {
          const norm = (value) => String(value ?? '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
          const here0 = workdir === '' ? '' : norm(workdir)
          let sessionId = null
          let created = false
          let how = 'current'
          if (target.startsWith('session:')) {
            sessionId = target.slice('session:'.length)
            how = 'picked'
          } else if (target === 'new') {
            const kept = readNewSession()
            if (kept !== null) {
              sessionId = kept
              how = 'reused'
            }
          }
          if (sessionId === null && target === 'auto') {
            const listed = await remote.list({}, signal)
            const all = listed?.value?.items ?? listed?.items ?? []
            const rows = all
              .filter((item) => item.origin !== 'subagent' && item.parentSessionId === undefined && item.blank !== true)
              .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
            const here = here0 === '' ? rows : rows.filter((item) => norm(item.cwd) === here0)
            const pick = here.length > 0 ? here[0] : null
            sessionId = pick !== null ? pick.sessionId : null
          }
          if (sessionId === null) {
            const made = await remote.create(workdir === ''
              ? { agentPreset: 'writing' }
              : { cwd: workdir, agentPreset: 'writing' })
            sessionId = made?.value?.sessionId ?? made?.sessionId
            created = true
            how = target === 'new' ? 'created' : 'fallback'
            if (target === 'new' && typeof sessionId === 'string') writeNewSession(sessionId)
          }
          await remote.prompt({
            requestId: 'shuzhuo-' + Date.now(),
            sessionId,
            mode: 'queue',
            content: [{ type: 'text', text }],
          }, signal)
          if (created === true) {
            return how === 'created'
              ? '叫到了：新开了一个会话，去那边等我（之后再叫还发到它）'
              : '叫到了：这边没有开着的会话，新开了一个，去那边等我'
          }
          if (how === 'reused') return '叫到了：还是刚才新开的那个会话，去那边等我'
          if (how === 'picked') return '叫到了：按你选的会话发过去了，去那边等我'
          return '叫到了：助手那边已经收到，去会话里等我'
        }
        const result = await http('POST', API + '/call', { title })
        if (result.ok === true) {
          return result.created === true
            ? '叫到了：这边没找到开着的会话，新开了一个，去那边说一声'
            : '叫到了：助手那边已经收到，去会话里等我'
        }
        return '没叫成：' + (result.error ?? '未知错误')
      } catch (error) {
        return '没叫成：' + String(error?.message ?? error)
      }
    }

    // ── 概览 ───────────────────────────────────────────────────────────
    function Overview(props) {
      const { data, openPage } = props
      if (data === null) return h('div', { className: 'sz-empty' }, '正在读库…')
      const stats = data.stats
      const maxDir = Math.max(...data.dirs.map((row) => row.pages), 1)
      return h(
        'div',
        null,
        h(
          'div',
          { className: 'sz-stats' },
          h('div', { className: 'sz-stat' },
            h('div', { className: 'sz-stat-num' }, String(stats.pages)),
            h('div', { className: 'sz-stat-label' }, '页')),
          h('div', { className: 'sz-stat' },
            h('div', { className: 'sz-stat-num' },
              num(stats.chars), h('small', null, '万字')),
            h('div', { className: 'sz-stat-label' }, '总篇幅')),
          h('div', { className: 'sz-stat' },
            h('div', { className: 'sz-stat-num' }, String(stats.links)),
            h('div', { className: 'sz-stat-label' }, '双链')),
          h('div', { className: 'sz-stat' },
            h('div', { className: 'sz-stat-num' },
              String(stats.orphans), h('small', null, '/ ' + stats.pages)),
            h('div', { className: 'sz-stat-label' }, '零出链')),
        ),
        h(
          'div',
          { className: 'sz-cols' },
          h('div', { className: 'sz-card' },
            h('h3', null, '目录'),
            ...data.dirs.map((row) =>
              h('div', { key: row.name, className: 'sz-row' },
                h('span', { className: 'sz-row-name', style: { width: '104px', flex: 'none' } }, row.name),
                h('span', { className: 'sz-bar' },
                  h('i', { style: { width: Math.round((row.pages / maxDir) * 100) + '%' } })),
                h('span', { className: 'sz-row-meta' }, String(row.pages)))),
          ),
          h('div', { className: 'sz-card' },
            h('h3', null, '枢纽页 · 被链最多'),
            ...data.hubs.map((row) =>
              h('div', { key: row.rel, className: 'sz-row' },
                h('span', {
                  className: 'sz-row-name sz-link',
                  onClick: () => openPage(row.rel),
                  title: row.rel,
                }, row.name),
                h('span', { className: 'sz-spacer', style: { flex: 1 } }),
                h('span', { className: 'sz-row-meta' }, '← ' + row.count)))),
        ),
        h('div', { className: 'sz-card' },
          h('h3', null, '最近改动'),
          h('div', { className: 'sz-chips' },
            ...data.recent.map((row) =>
              h('span', {
                key: row.rel,
                className: 'sz-chip',
                onClick: () => openPage(row.rel),
                title: row.rel,
              }, row.name, h('small', null, when(row.mtime)))))),
        h('div', { className: 'sz-card' },
          h('h3', null, '零出链 · 这些页没有指向别处'),
          h('div', { className: 'sz-chips' },
            ...data.orphans.map((row) =>
              h('span', {
                key: row.rel,
                className: 'sz-chip',
                onClick: () => openPage(row.rel),
                title: row.rel,
              }, row.name))),
          stats.orphans > data.orphans.length
            ? h('div', { className: 'sz-empty' }, '另有 ' + (stats.orphans - data.orphans.length) + ' 页未列出')
            : null),
      )
    }

    // ── 牵连 ───────────────────────────────────────────────────────────
    function Hit(props) {
      const { item, terms, openPage } = props
      const [open, setOpen] = useState(false)
      const level = LEVEL[item.level] ?? LEVEL.gray
      const shown = open ? item.snippets : item.snippets.slice(0, 2)
      return h(
        'div',
        { className: 'sz-hit', 'data-level': item.level },
        h('div', { className: 'sz-hit-head', onClick: () => setOpen(!open) },
          h('span', { className: 'sz-dot', style: { background: level.dot, width: '7px', height: '7px', borderRadius: '50%', display: 'inline-block' } }),
          h('span', { className: 'sz-hit-name' + (item.meta ? ' meta' : '') }, item.name),
          h('span', { className: 'sz-hit-dir' }, item.dir),
          h('span', { className: 'sz-hit-space' }),
          h('span', { className: 'sz-hit-count' }, item.hits + ' 处'),
          h('span', {
            className: 'sz-hit-count sz-link',
            onClick: (event) => { event.stopPropagation(); openPage(item.rel) },
          }, '打开 ›')),
        h('div', { className: 'sz-hit-sub' },
          ...item.terms.map((entry, index) =>
            h('span', { key: entry.term }, index > 0 ? ' · ' : '', h('b', null, entry.term), '×' + entry.count)),
          item.sections.length > 0
            ? h('span', null, '　', item.sections.slice(0, 3).map((section) => '§' + section.title + '×' + section.count).join('　'))
            : null),
        shown.length === 0 ? null : h('div', { className: 'sz-snips' },
          ...shown.map((snip) =>
            h('div', { key: snip.line, className: 'sz-snip', 'data-def': snip.defining ? '1' : '0' },
              h('span', { className: 'sz-snip-sec' }, snip.sec),
              h('span', { className: 'sz-snip-text' }, highlight(snip.text, terms)))),
          !open && item.snippets.length > 2
            ? h('div', { className: 'sz-snip sz-link', onClick: () => setOpen(true) },
                h('span', { className: 'sz-snip-sec' }, ''),
                h('span', { className: 'sz-snip-text' }, '展开其余 ' + (item.snippets.length - 2) + ' 处'))
            : null),
      )
    }

    // ── 牵连图 ─────────────────────────────────────────────────────────
    //
    // 中心是正在改的这条设定，四周按远近铺开命中的页：
    // 内圈红=定义点，中圈黄=深度涉及，外圈灰=只提过一句。
    // 主边是「术语命中」（中心→页），双链只作加强（页与页之间的细弧）——
    // 库里双链很稀（120 页里 69 页零出链），不能只画双链。

    const RING = { red: 152, yellow: 254, gray: 336 }
    const GRAY_CAP = 26

    function truncate(text, max) {
      return text.length <= max ? text : text.slice(0, max) + '…'
    }

    function Graph(props) {
      const { result, openPage } = props
      const [focusRel, setFocusRel] = useState(null)
      const W = 1060
      const H = 720
      const CX = W / 2
      const CY = H / 2

      const bucket = { red: [], yellow: [], gray: [] }
      for (const item of result.items) bucket[item.level].push(item)
      const hiddenGray = Math.max(0, bucket.gray.length - GRAY_CAP)
      bucket.gray = bucket.gray.slice(0, GRAY_CAP)

      const nodes = []
      for (const level of ['red', 'yellow', 'gray']) {
        const rows = bucket[level]
        const ring = RING[level]
        rows.forEach((item, index) => {
          const angle = -Math.PI / 2 + (index * Math.PI * 2) / Math.max(rows.length, 1)
          nodes.push({
            ...item,
            level,
            angle,
            ring,
            x: CX + Math.cos(angle) * ring,
            y: CY + Math.sin(angle) * ring,
            nr: Math.min(14, 5.5 + Math.sqrt(item.hits) * 2),
          })
        })
      }
      const byRel = new Map(nodes.map((node) => [node.rel, node]))

      // 双链：只在画出来的节点之间连，太密的图会糊成一片。
      const links = []
      const seen = new Set()
      for (const node of nodes) {
        for (const other of [...node.out, ...node.in]) {
          const peer = byRel.get(other)
          if (peer === undefined || peer.rel === node.rel) continue
          const key = node.rel < peer.rel ? node.rel + '\u0000' + peer.rel : peer.rel + '\u0000' + node.rel
          if (seen.has(key)) continue
          seen.add(key)
          links.push({ key, a: node, b: peer })
          if (links.length >= 70) break
        }
      }

      const focus = focusRel === null ? null : (byRel.get(focusRel) ?? null)
      const grayLabels = bucket.gray.length <= 14

      const label = (node) => {
        if (node.level === 'gray') return grayLabels || node.rel === focusRel ? truncate(node.name, 10) : ''
        return truncate(node.name, node.level === 'red' ? 13 : 11)
      }

      const shortTerm = truncate(result.terms[0] ?? '这个设定', 9)

      return h('div', null,
        h('div', { className: 'sz-graph' },
          h('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img' },
            h('defs', null,
              h('radialGradient', { id: 'sz-hub', cx: '38%', cy: '32%', r: '75%' },
                h('stop', { offset: '0%', stopColor: '#8fb4ff' }),
                h('stop', { offset: '100%', stopColor: '#3c63c8' }))),
            h('circle', { cx: CX, cy: CY, r: 96, fill: 'none',
              stroke: 'rgba(140,180,255,.05)', strokeDasharray: '3 7' }),
            ['red', 'yellow', 'gray'].map((level, index) =>
              h('circle', {
                key: 'ring' + level,
                cx: CX, cy: CY, r: RING[level], fill: 'none',
                stroke: 'rgba(150,190,255,' + (0.075 - index * 0.018) + ')',
                strokeDasharray: '2 9',
              })),
            // 双链（页 ↔ 页），画在底下，只作加强
            h('g', null, ...links.map((edge) => {
              const mx = (edge.a.x + edge.b.x) / 2
              const my = (edge.a.y + edge.b.y) / 2
              const dx = edge.b.x - edge.a.x
              const dy = edge.b.y - edge.a.y
              const len = Math.hypot(dx, dy) || 1
              const bend = len * 0.10
              return h('path', {
                key: 'l' + edge.key,
                d: 'M' + edge.a.x + ' ' + edge.a.y +
                   ' Q ' + (mx - (dy / len) * bend) + ' ' + (my + (dx / len) * bend) +
                   ' ' + edge.b.x + ' ' + edge.b.y,
                fill: 'none',
                stroke: 'rgba(130,170,240,.20)',
                strokeWidth: 1,
              })
            })),
            // 术语命中（中心 → 页）
            h('g', null, ...nodes.map((node) => h('line', {
              key: 'e' + node.rel,
              x1: CX + Math.cos(node.angle) * 52,
              y1: CY + Math.sin(node.angle) * 52,
              x2: node.x - Math.cos(node.angle) * (node.nr + 2),
              y2: node.y - Math.sin(node.angle) * (node.nr + 2),
              stroke: LEVEL[node.level].dot,
              strokeOpacity: node.rel === focusRel ? 0.85 : 0.26,
              strokeWidth: node.rel === focusRel ? 2.2 : 1 + Math.min(2, Math.log2(node.hits + 1) * 0.5),
              strokeDasharray: node.level === 'gray' ? '3 5' : undefined,
            }))),
            // 中心
            h('g', { className: 'sz-node' },
              h('circle', { cx: CX, cy: CY, r: 54, fill: 'rgba(110,150,235,.13)',
                stroke: 'rgba(140,180,255,.18)' }),
              h('circle', { cx: CX, cy: CY, r: 44, fill: 'url(#sz-hub)', fillOpacity: .85,
                stroke: 'rgba(200,220,255,.35)' }),
              h('text', { x: CX, y: CY - 3, textAnchor: 'middle', fill: '#f2f7ff',
                fontSize: '16.5px', letterSpacing: .5 }, shortTerm),
              h('text', { x: CX, y: CY + 17, textAnchor: 'middle', fill: 'rgba(230,240,255,.72)',
                fontSize: '12.5px', letterSpacing: .5 }, result.terms.length > 1 ? '等 ' + result.terms.length + ' 项' : '正在改')),
            // 命中的页
            h('g', null, ...nodes.map((node) => {
              const active = node.rel === focusRel
              const r = node.nr * (active ? 1.35 : 1)
              return h('g', {
                key: 'n' + node.rel,
                className: 'sz-node',
                onClick: () => setFocusRel(active ? null : node.rel),
              },
                h('title', null,
                  node.name + '\n' + node.dir + '\n' + LEVEL[node.level].text + ' · ' + node.hits + ' 处'),
                h('circle', { cx: node.x, cy: node.y, r: r + 6, fill: LEVEL[node.level].dot,
                  fillOpacity: active ? 0.16 : 0, stroke: 'none' }),
                h('circle', { cx: node.x, cy: node.y, r,
                  fill: LEVEL[node.level].dot,
                  fillOpacity: node.level === 'gray' ? 0.55 : 0.9,
                  stroke: active ? '#e8f1ff' : 'rgba(235,244,255,.35)',
                  strokeWidth: active ? 1.6 : 0.8 }),
                node.meta ? h('circle', { cx: node.x, cy: node.y, r: r + 3, fill: 'none',
                  stroke: 'rgba(190,210,240,.35)', strokeWidth: .8, strokeDasharray: '2 2' }) : null,
                label(node) === '' ? null : (() => {
                  const lx = CX + Math.cos(node.angle) * (node.ring + 16)
                  const ly = CY + Math.sin(node.angle) * (node.ring + 16)
                  const cos = Math.cos(node.angle)
                  return h('text', {
                    x: lx, y: ly,
                    textAnchor: cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle',
                    dominantBaseline: 'middle',
                    fill: node.level === 'gray' ? 'rgba(180,200,230,.55)' : 'rgba(214,229,250,.88)',
                    fontSize: node.level === 'red' ? '15.5px' : node.level === 'yellow' ? '14.8px' : '13.8px',
                  }, label(node))
                })(),
              )
            })),
          ),
          h('div', { className: 'sz-glegend' },
            ...['red', 'yellow', 'gray'].map((level) =>
              h('span', { key: level },
                h('span', { className: 'sz-gdot', style: { background: LEVEL[level].dot } }),
                LEVEL[level].text + ' ' + bucket[level].length)),
            h('span', { style: { color: 'rgba(150,175,215,.45)', fontSize: '14px' } },
              '细线 = 术语命中 · 细弧 = 双链' + (hiddenGray > 0 ? ' · 另有 ' + hiddenGray + ' 页只提过一句未画' : '')),
          ),
        ),
        focus === null
          ? h('div', { className: 'sz-hint', style: { marginTop: '10px', marginBottom: '0' } },
              '点一个节点，看它原句写在哪儿。')
          : h('div', { className: 'sz-detail' },
              h('div', { className: 'sz-detail-head' },
                h('span', { className: 'sz-gdot', style: { background: LEVEL[focus.level].dot, alignSelf: 'center' } }),
                h('span', { className: 'sz-detail-name' }, focus.name),
                h('span', { className: 'sz-detail-dir' }, focus.dir),
                h('span', { style: { flex: 1 } }),
                h('span', { className: 'sz-detail-meta' },
                  LEVEL[focus.level].text + ' · ' + focus.hits + ' 处 · '
                  + focus.terms.map((entry) => entry.term + '×' + entry.count).join(' ')),
                h('span', { className: 'sz-link sz-detail-meta',
                  onClick: () => openPage(focus.rel) }, '打开整页 ›')),
              focus.snippets.length === 0
                ? h('div', { className: 'sz-empty' }, '只提到过，没有可看的原句。')
                : h('div', { className: 'sz-snips' },
                    ...focus.snippets.slice(0, 4).map((snip) =>
                      h('div', { key: snip.line, className: 'sz-snip', 'data-def': snip.defining ? '1' : '0' },
                        h('span', { className: 'sz-snip-sec' }, snip.sec),
                        h('span', { className: 'sz-snip-text' }, highlight(snip.text, result.terms))))),
              h('div', { className: 'sz-hint', style: { margin: '10px 0 0' } },
                '红黄点 = 真要动的地方；灰点多半顺手看一眼就行。')),
      )
    }

    function Probe(props) {
      const { terms, setTerms, result, busy, run, openPage } = props
      const [view, setView] = useState('graph')
      const groups = ['red', 'yellow', 'gray']
      return h(
        'div',
        null,
        h('form', {
          className: 'sz-scan',
          onSubmit: (event) => { event.preventDefault(); void run() },
        },
          h('input', {
            className: 'sz-input',
            value: terms,
            placeholder: '要改的术语，逗号分隔：比如 主角名，某个地名，或一条核心设定',
            onChange: (event) => setTerms(event.target.value),
          }),
          h('button', { className: 'sz-btn', type: 'submit', disabled: busy },
            busy ? '扫描中…' : '扫描全库')),
        h('div', { className: 'sz-hint' },
          '红 = 有定义点（改的是它本身）· 黄 = 深度涉及（多处、多术语）· 灰 = 顺带提一句。归档目录默认不看。'),
        result === null
          ? h('div', { className: 'sz-empty' }, '输入一个基础设定，看看它牵动全库的哪些页。')
          : h('div', null,
              h('div', { className: 'sz-gbar' },
                h('div', { className: 'sz-gsum', style: { margin: 0 } },
                  ...groups.map((level) =>
                    h('span', { key: level },
                      h('span', { className: 'sz-gdot', style: { background: LEVEL[level].dot } }),
                      LEVEL[level].text + ' ' + (result.counts[level] ?? 0))),
                  h('span', { style: { color: 'rgba(155,180,215,.55)', fontSize: '14px' } },
                    '共 ' + result.counts.pages + ' 页')),
                h('div', { className: 'sz-seg' },
                  h('button', {
                    type: 'button',
                    'data-on': view === 'graph' ? '1' : '0',
                    onClick: () => setView('graph'),
                  }, '图'),
                  h('button', {
                    type: 'button',
                    'data-on': view === 'list' ? '1' : '0',
                    onClick: () => setView('list'),
                  }, '列表'))),
              view === 'graph'
                ? h(Graph, { result, openPage })
                : groups.map((level) => {
                    const rows = result.items.filter((item) => item.level === level)
                    if (rows.length === 0) return null
                    return h('div', { key: level, style: { marginBottom: '18px' } },
                      ...rows.map((item) => h(Hit, { key: item.rel, item, terms: result.terms, openPage })))
                  })),
      )
    }

    // ── 页面 ───────────────────────────────────────────────────────────
    function PageView(props) {
      const { data, openPage, selected, askTarget, targets, setAskTarget } = props
      const [query, setQuery] = useState('')
      const [list, setList] = useState([])
      const [askNote, setAskNote] = useState('')
      const [asking, setAsking] = useState(false)

      useEffect(() => { setAskNote('') }, [selected])

      const ask = async () => {
        if (data === null || data.ok !== true || asking) return
        setAsking(true)
        setAskNote('')
        try {
          setAskNote(await askWhale({ title: data.title, rel: selected, filed: true }))
        } finally {
          setAsking(false)
        }
      }
      useEffect(() => {
        if (query.trim() === '') { setList([]); return undefined }
        let alive = true
        const timer = window.setTimeout(async () => {
          try {
            const next = await getJson(API + '/search?q=' + encodeURIComponent(query.trim()))
            if (alive && next.ok === true) setList(next.items)
          } catch { /* 搜索失败就保持安静 */ }
        }, 180)
        return () => { alive = false; window.clearTimeout(timer) }
      }, [query])

      const pages = query.trim() === ''
        ? []
        : list

      return h('div', { className: 'sz-page' },
        h('div', { className: 'sz-page-list' },
          h('input', {
            className: 'sz-input',
            style: { width: '100%', marginBottom: '8px' },
            value: query,
            placeholder: '搜页面 / 搜正文…',
            onChange: (event) => setQuery(event.target.value),
          }),
          pages.length === 0
            ? h('div', { className: 'sz-empty' }, query === '' ? '从一个名字开始' : '没找到')
            : pages.map((row) =>
                h('div', {
                  key: row.rel,
                  className: 'sz-page-item',
                  title: row.line || row.rel,
                  'data-on': row.rel === selected ? '1' : '0',
                  onClick: () => openPage(row.rel),
                }, row.name))),
        h('div', { className: 'sz-page-body' },
          data === null
            ? h('div', { className: 'sz-empty' }, '选一页看看，或者先去「概览」点一个名字。')
            : data.ok !== true
              ? h('div', { className: 'sz-err' }, '读不到这一页：' + (data.error ?? ''))
              : h('div', null,
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' } },
                    h('div', { className: 'sz-stat-label' },
                      data.dir + ' · ' + words(data.chars) + ' · ' + when(data.mtime)),
                    h('span', { style: { flex: 1 } }),
                    h(AskTarget, { value: askTarget, targets, onChange: setAskTarget }),
                    h('button', {
                      className: 'sz-btn',
                      onClick: () => { void ask() },
                      disabled: asking,
                      style: { background: 'rgba(120,170,255,.18)', borderColor: 'rgba(140,180,255,.36)' },
                    }, asking ? '叫…' : '叫助手看看这页')),
                  askNote === '' ? null : h('div', { className: 'sz-note', style: { margin: '0 0 8px' } }, askNote),
                  h('h2', { style: { fontSize: '19px', margin: '0 0 14px', letterSpacing: '.5px' } }, data.title),
                  h('pre', { className: 'sz-pre' }, data.text),
                  h('div', { className: 'sz-links', style: { marginTop: '18px' } },
                    ...data.out.map((row) =>
                      h('span', { key: 'o' + row.rel, className: 'sz-chip', onClick: () => openPage(row.rel) },
                        '→ ' + row.name)),
                    ...data.in.map((row) =>
                      h('span', { key: 'i' + row.rel, className: 'sz-chip', onClick: () => openPage(row.rel) },
                        '← ' + row.name))))),
      )
    }

    // ── 待办 ───────────────────────────────────────────────────────────
    function TodoView(props) {
      const { items, setItems } = props
      const [draft, setDraft] = useState('')
      const save = (next) => {
        setItems(next)
        http('POST', API + '/todo', { items: next }).catch(() => {})
      }
      const add = () => {
        const text = draft.trim()
        if (text === '') return
        setDraft('')
        save([{ id: String(Date.now()), text, done: false, at: Date.now() }, ...items])
      }
      const pending = items.filter((item) => item.done !== true)
      const done = items.filter((item) => item.done === true)
      const row = (item) =>
        h('div', { key: item.id, className: 'sz-todo', 'data-done': item.done === true ? '1' : '0' },
          h('span', {
            className: 'sz-todo-box',
            onClick: () => save(items.map((entry) => entry.id === item.id ? { ...entry, done: entry.done !== true } : entry)),
          }, item.done === true ? '✓' : ''),
          h('span', { className: 'sz-todo-text' }, item.text),
          h('span', {
            className: 'sz-todo-del',
            onClick: () => save(items.filter((entry) => entry.id !== item.id)),
          }, '×'))
      return h('div', null,
        h('form', {
          className: 'sz-todo-in',
          onSubmit: (event) => { event.preventDefault(); add() },
        },
          h('input', {
            className: 'sz-input',
            value: draft,
            placeholder: '下一步要做什么…',
            onChange: (event) => setDraft(event.target.value),
          }),
          h('button', { className: 'sz-btn', type: 'submit' }, '记下')),
        h('div', { className: 'sz-card' },
          h('h3', null, '待办'),
          pending.length === 0 ? h('div', { className: 'sz-empty' }, '空着。') : pending.map(row)),
        done.length === 0 ? null : h('div', { className: 'sz-card' },
          h('h3', null, '已完成'),
          done.slice(0, 20).map(row)),
      )
    }

    // ── 讨论台 ─────────────────────────────────────────────────────────
    //
    // 讨论的时候不打扰：这一页不查牵连、不弹提示，只写字。
    // 点「准备入库」才结算——那时候才去扫全库，看这一条会跟谁打架。
    // 分类不再写死目录：库自己长成什么样，书桌就去问 host 要树（/split 会带回来）。
    // 这里只留「类型 → 顶层」的兜底，免得目录树换了新花样时没地方落。
    const TYPE_TOP = {
      人物: '03-人物',
      事件: '02-故事',
      故事: '02-故事',
      世界: '01-世界',
      设定: '04-设定',
      素材: '06-素材',
      写作: '05-写作',
    }
    const TYPE_OPTIONS = ['人物', '事件', '设定', '世界', '素材', '写作', '故事']
    /** 入库的落脚点：先进待定箱，助手过一遍再挪进正式分类。 */
    const INBOX_DIR = '08-待定/00-新入库'

    const STATUS_TEXT = { draft: '讨论中', settled: '待入库', filed: '已入库' }

    /** 老存档里没有 related 这些字段，统一补齐，免得读的时候到处判空。 */
    /** 字符串数组的兜底：盘上可能是 undefined、也可能被手改坏。 */
    function asStringList(value) {
      return Array.isArray(value) ? value.filter((one) => typeof one === 'string' && one.trim() !== '') : []
    }

    function normalizeDraft(item) {
      const text = (value) => (typeof value === 'string' ? value : '')
      return {
        ...item,
        title: text(item.title),
        summary: text(item.summary),
        related: text(item.related),
        body: text(item.body),
        category: text(item.category) === '' ? '设定' : item.category,
        aliases: Array.isArray(item.aliases) ? item.aliases.filter((a) => typeof a === 'string') : [],
        issues: asStringList(item.issues),
      }
    }

    // 草稿的本地兜底：正文先落 localStorage 再排队写盘，写盘失败/页面被刷掉也不至于
    // 让刚写的一整页凭空消失。2026-11-06 真实丢过一次（drafts.json 只剩空壳）。
    const DRAFT_CACHE = 'shuzhuo.drafts.cache.v1'

    function isBlankDraft(item) {
      const t = (value) => (typeof value === 'string' ? value.trim() : '')
      return t(item.title) === '' && t(item.body) === '' && t(item.summary) === ''
    }

    function readDraftCache() {
      try {
        const raw = window.localStorage.getItem(DRAFT_CACHE)
        if (raw === null || raw === '') return null
        const items = JSON.parse(raw)
        return Array.isArray(items) ? items.map(normalizeDraft) : null
      } catch {
        return null
      }
    }

    function writeDraftCache(items) {
      try {
        window.localStorage.setItem(DRAFT_CACHE, JSON.stringify(items))
      } catch { /* 存不了（隐私模式/满了）就只靠写盘 */ }
    }

    /**
     * 盘上那份和本地缓存合并，同一条按 updatedAt 取新的那一边。
     *
     * 2026-11-07：以前这里只有「盘上为空壳才用缓存」一条兜底，结果反过来——
     * 缓存里是旧的（比如书桌早先猜的名字「下面只」），一刷新就盖回盘上，
     * 助手改在 drafts.json 里的东西全被吃掉。现在谁新听谁的，且两边独有的条目不丢。
     */
    function mergeDrafts(serverItems, cached) {
      const byId = new Map()
      for (const item of cached ?? []) byId.set(item.id, item)
      for (const item of serverItems ?? []) {
        const local = byId.get(item.id)
        const newer = local === undefined ? item
          : (Number(local.updatedAt ?? 0) > Number(item.updatedAt ?? 0) ? local : item)
        byId.set(item.id, newer)
      }
      return [...byId.values()].sort((a, b) => Number(b.updatedAt ?? b.at ?? 0) - Number(a.updatedAt ?? a.at ?? 0))
    }

    // 名字、类别、别名这些，作者不擅长也不爱填 —— 他自己说的「交给你来判断」。
    // 所以讨论态只留两个框：跟什么有关、正文。其余在结算时由下面这几个函数先猜一份，
    // 猜错了在结算页改一下就行，猜对了就当没看见。
    function firstPhrase(text) {
      const head = text.trim().split(/[，,、;；:：。！？\s]+/).filter((part) => part !== '')[0]
      return head ?? ''
    }

    /** 名字长得像不像专名：虚词开头、带助词标点的都不算（对应宿主那边同一套判断）。 */
    const NAME_HEAD = /^(这|那|下|上|以|不|很|然|并|但|而|所|因|对|从|到|在|和|与|及|其|此|该|每|各|两|几|数|多|少|全|都|又|再|更|最|太|还|就|才|只|也|却|便|则|若|如|虽|即|且|或|可|能|要|会|把|被|给|让|使|为|着|了|过|是|有|没|无|说|讲|写|像|成|做|用|一)/
    const NAME_BAD = /[的了着过嘛呢吧啊呀哦是有在把被给让使为吗\s，。、；：！？,.;:!?"'“”‘’「」『』《》（）()\[\]]/

    function looksLikeName(value) {
      const text = String(value ?? '').trim()
      if (text.length < 2 || text.length > 14) return false
      return !NAME_HEAD.test(text) && !NAME_BAD.test(text)
    }

    function guessTitle(draft) {
      // 2026-11-07：「下面只是一些大概的想法」以前会被认成名字「下面只」。
      // 宁可不猜：猜不出就留空，让作者自己填（结算页会要他给个名字）。
      const body = draft.body.trim()
      const firstLine = body.split(/\n+/)[0] ?? ''
      const quoted = /[「『"“]([^」』"”]{2,14})[」』"”]/.exec(firstLine)
      if (quoted !== null && looksLikeName(quoted[1])) return quoted[1]
      const asName = /^([^\s，。、；：！？]{2,14})(?:是|指|即|就是|叫作|叫做)/.exec(firstLine)
      if (asName !== null && looksLikeName(asName[1]) && body.split(asName[1]).length - 1 >= 2) return asName[1]
      return ''
    }

    function guessCategory(draft) {
      // 只认「人物 / 故事」这两个好认的；其余一律先归到设定（作者要改也就是下拉里点一下）。
      const text = draft.related + ' ' + draft.body.slice(0, 300)
      if (/人物|角色|她是|他是|她叫|他叫/.test(text)) return '人物'
      if (/这一章|这一节|这一卷|大纲|情节|结局/.test(draft.related)) return '故事'
      return '设定'
    }

    /** 扫描用的词：先问宿主从正文里认（库里的页名、书名号引号里的词），认不出再退回本地拼。 */
    async function guessTerms(draft) {
      try {
        const res = await http('POST', API + '/terms', {
          text: draft.body ?? '',
          title: (draft.title ?? '').trim(),
          related: draft.related ?? '',
        })
        if (res?.ok === true && Array.isArray(res.terms) && res.terms.length > 0) return res.terms
      } catch {
        /* 宿主没响应就往回退，别为了扫描词卡住整个结算 */
      }
      const terms = new Set()
      const title = (draft.title.trim() !== '' ? draft.title : guessTitle(draft)).trim()
      if (title !== '') terms.add(title)
      draft.related.split(/[，,、;；:：。！？\s]+/).forEach((part) => {
        const value = part.trim()
        if (value.length >= 2 && value.length <= 10 && looksLikeName(value)) terms.add(value)
      })
      draft.aliases.forEach((alias) => {
        if (alias.trim() !== '') terms.add(alias.trim())
      })
      return [...terms].slice(0, 8)
    }

    function draftMarkdown(draft) {
      const title = (draft.title.trim() !== '' ? draft.title : guessTitle(draft)).trim() || '未命名'
      const lines = ['# ' + title]
      if (draft.summary.trim() !== '') lines.push('', '> ' + draft.summary.trim())
      else if (draft.related.trim() !== '') lines.push('', '> 关联：' + draft.related.trim())
      if (draft.body.trim() !== '') lines.push('', draft.body.trim())
      return lines.join('\n') + '\n'
    }

    function DeskView(props) {
      const { drafts, setDrafts, activeId, setActiveId, openPage, askTarget, targets, setAskTarget } = props
      const active = drafts.find((item) => item.id === activeId) ?? null
      const [mode, setMode] = useState('talk')
      const [scan, setScan] = useState(null)
      const [busy, setBusy] = useState(false)
      const [note, setNote] = useState('')
      const [parts, setParts] = useState([])
      const [issues, setIssues] = useState([])
      const [dirs, setDirs] = useState([])
      const [termText, setTermText] = useState('')
      const [fileNote, setFileNote] = useState('')
      const saveTimer = useRef(0)
      const latestDrafts = useRef(drafts)
      latestDrafts.current = drafts

      useEffect(() => {
        setMode('talk')
        setScan(null)
        setNote('')
        setFileNote('')
        setParts([])
        setIssues(Array.isArray(active?.issues) ? active.issues : [])
      }, [activeId])

      const flushDrafts = async () => {
        window.clearTimeout(saveTimer.current)
        const items = latestDrafts.current
        writeDraftCache(items)
        try {
          await http('POST', API + '/drafts', { items })
          return true
        } catch {
          return false
        }
      }

      const persist = (next) => {
        latestDrafts.current = next
        setDrafts(next)
        writeDraftCache(next)
        window.clearTimeout(saveTimer.current)
        saveTimer.current = window.setTimeout(() => { void flushDrafts() }, 500)
      }

      // 面板关掉/切走时把没写盘的半秒补上。
      useEffect(() => () => {
        window.clearTimeout(saveTimer.current)
        const items = latestDrafts.current
        if (saveTimer.current !== 0) {
          writeDraftCache(items)
          http('POST', API + '/drafts', { items }).catch(() => {})
        }
      }, [])

      const patch = (fields) => {
        if (active === null) return
        persist(drafts.map((item) =>
          item.id === active.id ? { ...item, ...fields, updatedAt: Date.now() } : item))
      }

      const create = () => {
        const id = String(Date.now())
        const draft = {
          id, title: '', aliases: [], category: '设定', summary: '', related: '', body: '',
          status: 'draft', rel: null, at: Date.now(), updatedAt: Date.now(),
        }
        persist([draft, ...drafts])
        setActiveId(id)
      }

      const remove = (id) => {
        const next = drafts.filter((item) => item.id !== id)
        persist(next)
        if (id === activeId) setActiveId(next.length === 0 ? null : next[0].id)
      }

      /** 入库之后库里的页才是正本，工作区里这份草稿就没用了，清掉腾地方。 */
      const cleanFiled = () => {
        const next = drafts.filter((item) => item.status !== 'filed')
        persist(next)
        if (active !== null && active.status === 'filed') {
          setActiveId(next.length === 0 ? null : next[0].id)
        }
      }

      /** 拆片用的指纹：标题/关联/正文/类别四样变了，才重新拆。 */
      const splitKeyOf = (item) => [item.title, item.related, item.body, item.category].join('\u0001')

      const putParts = (next) => {
        setParts(next)
        patch({ parts: next })
      }

      const updatePart = (id, fields) => {
        putParts(parts.map((part) => (part.id === id ? { ...part, ...fields } : part)))
        // 2026-11-07：只有一片时，在结算页给这页改的名字，同时写回草稿自己——
        // 否则左边卡片的标题还是书桌早先猜的那个（比如「下面只」），改完名字两处对不上。
        if (parts.length === 1 && typeof fields?.title === 'string' && fields.title.trim() !== '') {
          patch({ title: fields.title.trim() })
        }
      }

      const dropPart = (id) => {
        putParts(parts.filter((part) => part.id !== id))
      }

      const swapType = (part, type) => {
        // 2026-11-07：入库统一先进待定箱，换类型只换写法，不把去向跳回正式分类。
        updatePart(part.id, { type })
      }

      const addPart = () => {
        const inbox = dirs.find((dir) => dir.path === INBOX_DIR)?.path
          ?? dirs.find((dir) => dir.name === '新入库')?.path
          ?? dirs[0]?.path
          ?? INBOX_DIR
        putParts([...parts, {
          id: 'p' + Date.now(),
          on: true,
          title: '',
          type: '设定',
          dir: inbox,
          body: '',
        }])
      }

      const settle = async () => {
        if (active === null || busy) return
        // 名字和类别先替他猜一份：猜得出就用，猜不出就等结算页里手填。
        const seed = {
          title: active.title.trim() !== '' ? active.title : guessTitle(active),
          category: active.title.trim() !== '' ? active.category : guessCategory(active),
        }
        if (seed.title.trim() === '') {
          setNote('先把这一条写出来，或者给个名字，我才知道怎么拆。')
          return
        }
        setNote('')
        setBusy(true)
        try {
          const key = splitKeyOf({ ...active, ...seed })
          const kept = Array.isArray(active.parts) && active.parts.length > 0 && active.splitKey === key
            ? active.parts
            : null
          const terms = await guessTerms({ ...active, ...seed })
          setTermText(terms.join('，'))
          const tasks = [getJson(API + '/probe?terms=' + encodeURIComponent(terms.join(','))).catch(() => null)]
          if (kept === null) {
            tasks.push(http('POST', API + '/split', {
              title: seed.title,
              related: active.related,
              body: active.body,
              category: seed.category,
            }).catch((error) => ({ ok: false, error: String(error?.message ?? error) })))
          }
          const [probeRes, splitRes] = await Promise.all(tasks)
          if (kept === null && splitRes?.ok !== true) {
            setNote('拆不开：' + (splitRes?.error ?? '未知错误'))
            return
          }
          const nextParts = kept ?? (splitRes.parts ?? []).map((part, index) => ({
            id: 'p' + Date.now() + '-' + index,
            on: true,
            title: part.title,
            type: part.type,
            dir: part.dir,
            suggested: part.suggested,
            body: part.body,
          }))
          if (kept === null) {
            setDirs(splitRes.dirs ?? [])
          } else if (dirs.length === 0) {
            try {
              const tree = await getJson(API + '/tree')
              if (tree?.ok === true) setDirs(tree.dirs ?? [])
            } catch {
              /* 目录树拉不到就先按空列表走，part.dir 会作为自定义项显示 */
            }
          }
          // 待议的条目挂回草稿：切回讨论、或者再结算一次，都不丢。
          const nextIssues = kept === null
            ? asStringList(splitRes.issues)
            : asStringList(active.issues)
          setParts(nextParts)
          setIssues(nextIssues)
          patch({ ...seed, parts: nextParts, splitKey: key, issues: nextIssues })
          if (probeRes?.ok === true) setScan(probeRes)
          else setScan(null)
          setFileNote('')
          setMode('settle')
        } catch {
          setNote('扫描失败')
        } finally {
          setBusy(false)
        }
      }

      const file = async () => {
        if (active === null || busy) return
        const chosen = parts.filter((part) => part.on && part.body.trim() !== '' && part.title.trim() !== '')
        if (chosen.length === 0) {
          setFileNote('没有可以写的一片——标题和内容都要有。')
          return
        }
        setBusy(true)
        setFileNote('')
        try {
          const result = await http('POST', API + '/commit', {
            pages: chosen.map((part) => ({ dir: part.dir, title: part.title, type: part.type, body: part.body })),
          })
          const rows = Array.isArray(result?.pages) ? result.pages : []
          const rels = rows.filter((row) => row.ok === true).map((row) => row.rel)
          const failed = rows.filter((row) => row.ok !== true)
          if (rels.length > 0) {
            patch({ status: 'filed', rel: rels[0], rels, parts })
            setMode('talk')
            setScan(null)
            setParts([])
            setFileNote('入库了 ' + rels.length + ' 页：' + rels.join('、'))
            if (failed.length > 0) {
              setFileNote('入库了 ' + rels.length + ' 页，另有 ' + failed.length + ' 页没写成（'
                + failed.map((row) => (row.rel ?? '') + ' ' + (row.error ?? '')).join('；') + '）')
            }
            if (rels[0] !== undefined) openPage(rels[0])
          } else if (result?.error === 'bridge-offline') {
            setFileNote('桥没开——Obsidian 打开着才能写库。')
          } else {
            setFileNote('没写成：' + (failed[0]?.error ?? result?.error ?? '未知错误'))
          }
        } catch {
          setFileNote('没写成：请求失败')
        } finally {
          setBusy(false)
        }
      }

      const filedCount = drafts.filter((item) => item.status === 'filed').length
      const list = h('div', { className: 'sz-desk-list' },
        h('button', {
          className: 'sz-btn',
          style: { width: '100%', marginBottom: '10px' },
          onClick: create,
        }, '+ 新的一页'),
        drafts.length === 0
          ? h('div', { className: 'sz-empty' }, '还没有草稿。')
          : drafts.map((item) =>
              h('div', {
                key: item.id,
                className: 'sz-desk-item',
                'data-on': item.id === activeId ? '1' : '0',
                onClick: () => setActiveId(item.id),
              },
                h('div', { className: 'sz-desk-name' },
                  item.title.trim() !== '' ? item.title
                    : (guessTitle(item) !== '' ? guessTitle(item) : '（还没有名字）')),
                h('div', { className: 'sz-desk-meta' },
                  STATUS_TEXT[item.status] + ' · ' + when(item.updatedAt)))),
        filedCount === 0
          ? null
          : h('button', {
              className: 'sz-btn',
              style: { width: '100%', marginTop: '10px', background: 'rgba(240,145,141,.12)', borderColor: 'rgba(240,145,141,.28)' },
              onClick: cleanFiled,
            }, '清理已入库 · ' + filedCount))

      if (active === null) {
        return h('div', { className: 'sz-desk' }, list,
          h('div', { className: 'sz-desk-main' },
            h('div', { className: 'sz-empty' }, '开一页新的，我们边聊边写。讨论的时候这里什么都不查，不打扰。')))
      }

      const dirOptions = (part) => {
        const rows = dirs.map((dir) => h('option', { key: dir.path, value: dir.path },
          '　'.repeat(Math.max(0, (dir.depth ?? 1) - 1)) + dir.name))
        if (typeof part.dir === 'string' && part.dir !== '' && !dirs.some((dir) => dir.path === part.dir)) {
          rows.unshift(h('option', { key: 'self', value: part.dir }, part.dir))
        }
        return rows
      }

      const partCard = (part, index) =>
        h('div', { key: part.id, className: 'sz-part', 'data-on': part.on ? '1' : '0' },
          h('div', { className: 'sz-part-head' },
            h('input', {
              type: 'checkbox',
              checked: part.on,
              onChange: (event) => updatePart(part.id, { on: event.target.checked }),
            }),
            h('span', { className: 'sz-part-num' }, String(index + 1)),
            h('input', {
              className: 'sz-input',
              style: { flex: 1, fontSize: '16px' },
              value: part.title,
              placeholder: '这一片叫什么',
              onChange: (event) => updatePart(part.id, { title: event.target.value }),
            }),
            h('select', {
              className: 'sz-select',
              value: part.type,
              onChange: (event) => swapType(part, event.target.value),
            }, TYPE_OPTIONS.map((name) => h('option', { key: name, value: name }, name))),
            h('button', {
              className: 'sz-btn sz-part-x',
              title: '不要这一片',
              onClick: () => dropPart(part.id),
            }, '×')),
          h('div', { className: 'sz-part-foot' },
            h('span', { className: 'sz-split-hint' }, '归到'),
            h('select', {
              className: 'sz-select',
              style: { flex: 1, fontSize: '13.5px' },
              value: part.dir,
              onChange: (event) => updatePart(part.id, { dir: event.target.value }),
            }, dirOptions(part)),
            typeof part.suggested === 'string' && part.suggested !== '' && part.suggested !== part.dir
              ? h('span', { className: 'sz-split-hint', style: { marginLeft: '6px' } },
                  '建议 ' + part.suggested)
              : null),
          h('textarea', {
            className: 'sz-part-body',
            value: part.body,
            onChange: (event) => updatePart(part.id, { body: event.target.value }),
          }))

      // ── 结算：先拆片、各归各类，再写库 ───────────────────────────────
      const rescan = async () => {
        const list = termText.split(/[,，、\s]+/).map((one) => one.trim()).filter((one) => one !== '')
        if (list.length === 0 || busy) return
        setBusy(true)
        try {
          const next = await getJson(API + '/probe?terms=' + encodeURIComponent(list.join(',')))
          setScan(next?.ok === true ? next : null)
        } catch {
          setScan(null)
        } finally {
          setBusy(false)
        }
      }

      if (mode === 'settle') {
        const reds = (scan?.items ?? []).filter((item) => item.level === 'red')
        const yellows = (scan?.items ?? []).filter((item) => item.level === 'yellow')
        const chosen = parts.filter((part) => part.on && part.title.trim() !== '' && part.body.trim() !== '')
        const clashes = (scan?.items ?? []).filter((item) => parts.some((part) => part.title.trim() === item.name))
        const line = (item) =>
          h('div', { key: item.rel, className: 'sz-settle-line' },
            h('span', { className: 'sz-gdot', style: { background: LEVEL[item.level].dot } }),
            h('span', {
              className: 'sz-row-name sz-link',
              title: item.rel,
              onClick: () => openPage(item.rel),
            }, item.name),
            item.meta ? h('span', { className: 'sz-badge' }, '元') : null,
            h('span', { style: { flex: 1 } }),
            h('span', { className: 'sz-row-meta' }, item.dir),
            h('span', { className: 'sz-row-meta' }, item.hits + ' 处'))
        return h('div', { className: 'sz-desk' }, list,
          h('div', { className: 'sz-desk-main' },
            h('div', { className: 'sz-settle-scroll' },
            scan === null
              ? null
              : h('div', { className: 'sz-card' },
                  h('h3', null, '这一条牵动了谁'),
                  h('div', { className: 'sz-gsum' },
                    h('span', null, h('span', { className: 'sz-gdot', style: { background: LEVEL.red.dot } }),
                      '定义点 ' + (scan.counts?.red ?? 0)),
                    h('span', null, h('span', { className: 'sz-gdot', style: { background: LEVEL.yellow.dot } }),
                      '深度涉及 ' + (scan.counts?.yellow ?? 0)),
                    h('span', null, h('span', { className: 'sz-gdot', style: { background: LEVEL.gray.dot } }),
                      '顺带提及 ' + (scan.counts?.gray ?? 0))),
                  h('div', { className: 'sz-scan', style: { margin: '10px 0 6px' } },
                    h('input', {
                      className: 'sz-input',
                      value: termText,
                      placeholder: '拿哪些词去搜，逗号分隔',
                      onChange: (event) => setTermText(event.target.value),
                    }),
                    h('button', { className: 'sz-btn', type: 'button', onClick: () => { void rescan() }, disabled: busy },
                      busy ? '扫描中…' : '重扫')),
                  h('div', { className: 'sz-hint', style: { margin: '0 0 10px' } },
                    '扫描词是从正文里认的：库里已有的页名、书名号引号里点名的词。认错了就改上面这行再重扫。'),
                  (scan.items ?? []).length === 0
                    ? h('div', { className: 'sz-empty' }, '这些词在库里没有落脚的地方——要么真是新东西，要么词没认对。')
                    : h(Graph, { result: scan, openPage }),
                  reds.length === 0 ? null : h('div', { style: { marginTop: '10px' } }, ...reds.map(line)),
                  yellows.length === 0 ? null : h('div', { style: { marginTop: '10px' } },
                    h('div', { className: 'sz-hint', style: { marginBottom: '4px' } }, '深度涉及（可能要一起改）'),
                    ...yellows.map(line)),
                  clashes.length === 0
                    ? null
                    : h('div', { className: 'sz-note', style: { marginTop: '10px' } },
                        '库里有同名页：',
                        ...clashes.slice(0, 3).map((item) =>
                          h('span', {
                            key: 'c' + item.rel,
                            className: 'sz-link',
                            style: { marginRight: '8px' },
                            onClick: () => openPage(item.rel),
                          }, item.name)),
                        '——写入时会追加成一节，不会覆盖。')),
            issues.length === 0 ? null : h('div', { className: 'sz-card' },
              h('h3', null, '留着要议的 ' + issues.length + ' 条'),
              h('div', { className: 'sz-hint', style: { marginTop: '-2px' } },
                '草稿里以「## 待议」开头、或以「问：」起行的那些，是问题不是内容——不进页面，留在讨论区等你们议。'),
              ...issues.map((line, index) =>
                h('div', { key: 'issue' + index, className: 'sz-note', style: { marginTop: '6px' } },
                  '· ' + line))),
            h('div', { className: 'sz-card' },
              h('h3', null, '拆成 ' + parts.length + ' 片 · 各归各类'),
              h('div', { className: 'sz-hint', style: { marginTop: '-2px' } },
                '入库先进 08-待定/00-新入库，助手在库里过一遍、改顺了再挪进正式分类。这里核一下每片的标题和去向，不对就改。'),
              parts.length === 0
                ? h('div', { className: 'sz-empty' }, '没能拆出内容——回去把正文写具体一点。')
                : null,
              ...parts.map(partCard),
              h('button', {
                className: 'sz-btn',
                style: { marginTop: '10px' },
                onClick: addPart,
              }, '＋ 再加一片'))),
            h('div', { className: 'sz-desk-bar' },
              fileNote === ''
                ? h('span', { className: 'sz-desk-quiet' }, '勾了 ' + chosen.length + ' 片，会写成 ' + chosen.length + ' 页。')
                : h('span', { className: 'sz-note' }, fileNote),
              h('button', {
                className: 'sz-btn',
                onClick: () => { setMode('talk'); setFileNote('') },
                disabled: busy,
              }, '再聊聊'),
              h('button', { className: 'sz-btn', onClick: () => { void file() }, disabled: busy || chosen.length === 0 },
                busy ? '写入中…' : '写入库（' + chosen.length + ' 页）'))))
      }

      // ── 讨论：只管写 ─────────────────────────────────────────────────
      // 作者 2026-11-05：「名字、类别、别名、一句话、这些我不太擅长，交给你来判断。
      // 你给我留两个栏就可以了」——所以这里只有两个框。
      const callWhale = async () => {
        setNote('')
        if (busy) return
        setBusy(true)
        try {
          // 先把正文写盘再发消息，否则助手读到的是半秒前的旧文件。
          const saved = await flushDrafts()
          const filed = active.status === 'filed' && typeof active.rel === 'string'
          setNote(saved === false
            ? '草稿没写进文件（宿主没响应），这次先别指望助手看到正文。'
            : await askWhale({
                title: active.title.trim() !== '' ? active.title.trim() : guessTitle(active),
                rel: active.rel,
                filed,
              }))
        } finally {
          setBusy(false)
        }
      }

      return h('div', { className: 'sz-desk', 'data-mode': 'talk' }, list,
        h('div', { className: 'sz-desk-main' },
          h('div', { className: 'sz-field' },
            h('input', {
              className: 'sz-input',
              style: { flex: 1, fontSize: '18px' },
              value: active.related,
              placeholder: '这一条和什么有关？（跟哪个设定、哪条线、哪个人有关，一句话就行）',
              onChange: (event) => patch({ related: event.target.value }),
            })),
          h('textarea', {
            className: 'sz-area',
            value: active.body,
            placeholder: '具体内容。怎么想的就怎么写，这里没人打断。',
            onChange: (event) => patch({ body: event.target.value }),
          }),
          issues.length === 0 ? null : h('div', { className: 'sz-card', style: { marginTop: '10px' } },
            h('div', { className: 'sz-part-head' },
              h('h3', { style: { margin: 0 } }, '留着要议的 ' + issues.length + ' 条'),
              h('span', { style: { flex: 1 } }),
              h('button', {
                className: 'sz-btn',
                style: { fontSize: '13px', padding: '4px 10px' },
                onClick: () => { setIssues([]); patch({ issues: [] }) },
              }, '议完了，清掉')),
            h('div', { className: 'sz-hint', style: { marginTop: '4px' } },
              '这些是问题不是内容，入库时没有写进页面。'),
            ...issues.map((line, index) =>
              h('div', { key: 'talk-issue' + index, className: 'sz-note', style: { marginTop: '6px' } },
                '· ' + line))),
          h('div', { className: 'sz-desk-bar' },
            h('span', { className: 'sz-desk-quiet' },
              active.status === 'filed'
                ? '已入库：' + ((Array.isArray(active.rels) && active.rels.length > 1)
                  ? active.rels.length + ' 页 · ' + active.rels[0]
                  : (active.rel ?? ''))
                : '讨论中 · 这一页不查牵连 · ' + words(active.body.length)),
            active.status === 'filed'
              ? h('button', {
                  className: 'sz-btn',
                  onClick: () => { if (active.rel !== null) openPage(active.rel) },
                }, '打开这页')
              : null,
            h('button', {
              className: 'sz-btn',
              onClick: () => remove(active.id),
              style: { background: 'rgba(240,145,141,.12)', borderColor: 'rgba(240,145,141,.28)' },
            }, active.status === 'filed' ? '清理草稿' : '丢掉'),
            h(AskTarget, { value: askTarget, targets, onChange: setAskTarget }),
            h('button', {
              className: 'sz-btn',
              onClick: () => { void callWhale() },
              disabled: busy,
              style: { background: 'rgba(120,170,255,.18)', borderColor: 'rgba(140,180,255,.36)' },
            }, active.status === 'filed' ? '叫助手看看这页' : '叫助手看一眼'),
            active.status === 'filed'
              ? null
              : h('button', {
                  className: 'sz-btn',
                  onClick: () => { void settle() },
                  disabled: busy || (active.related.trim() === '' && active.body.trim() === ''),
                }, busy ? '扫描中…' : '谈完了，准备入库')),
          note === '' ? null : h('div', { className: 'sz-note', style: { marginTop: '8px' } }, note)))
    }

    // ── 面板 ───────────────────────────────────────────────────────────
    function Panel() {
      const [tab, setTab] = useState('desk')
      const [state, setState] = useState(null)
      const [error, setError] = useState('')
      const [terms, setTerms] = useState('')
      const [result, setResult] = useState(null)
      const [busy, setBusy] = useState(false)
      const [selected, setSelected] = useState(null)
      const [pageData, setPageData] = useState(null)
      const [todo, setTodo] = useState([])
      const [drafts, setDrafts] = useState([])
      const [activeId, setActiveId] = useState(null)
      const [askTarget, setAskTarget] = useState(readAskTarget())
      const [sessions, setSessions] = useState([])
      const loadedRef = useRef(false)

      // 叫助手发到哪儿：把工作区里最近的几个会话列出来让他自己选。
      useEffect(() => {
        void (async () => {
          try {
            const remote = remoteSession()
            if (remote === null || remote === undefined) return
            const listed = await remote.list({}, new AbortController().signal)
            const all = listed?.value?.items ?? listed?.items ?? []
            const norm = (value) => String(value ?? '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
            const desk = await loadDeskState()
            const here0 = typeof desk?.workdir === 'string' && desk.workdir !== '' ? norm(desk.workdir) : ''
            const rows = all
              .filter((item) => item.origin !== 'subagent' && item.parentSessionId === undefined && item.blank !== true)
              .filter((item) => here0 === '' || norm(item.cwd) === here0)
              .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
              .slice(0, 6)
            setSessions(rows.map((row) => ({
              value: 'session:' + row.sessionId,
              label: (row.title === undefined || row.title === null || String(row.title).trim() === '')
                ? '会话 ' + String(row.sessionId).slice(0, 6)
                : String(row.title).trim().slice(0, 18),
            })))
          } catch { /* 列不出来就只留当前 / 新建两项 */ }
        })()
      }, [])

      const changeAskTarget = (value) => {
        writeAskTarget(value)
        setAskTarget(value)
      }

      useEffect(() => {
        if (loadedRef.current) return
        loadedRef.current = true
        void (async () => {
          try {
            const next = await getJson(API + '/state')
            if (next.ok === true) { deskState = next; setState(next) }
            else setError('读库失败')
          } catch (err) {
            console.error('[shuzhuo] state fetch failed', err && err.message, err)
            setError('宿主还没起来，稍后刷新一下。')
          }
        })()
        void (async () => {
          try {
            const next = await getJson(API + '/todo')
            if (next.ok === true) setTodo(next.items)
          } catch { /* 待办读不到不影响别的 */ }
        })()
        void (async () => {
          try {
            const next = await getJson(API + '/drafts')
            const serverItems = next.ok === true && Array.isArray(next.items)
              ? next.items.map(normalizeDraft)
              : []
            const cached = readDraftCache()
            const merged = mergeDrafts(serverItems, cached)
            if (merged.length > 0) {
              setDrafts(merged)
              setActiveId(merged[0].id)
              writeDraftCache(merged)
            }
            // 合并结果和盘上不一样（本地有更新的、或缓存里多一条）→ 补写回盘上，
            // 别让下一次刷新又回到旧的那一份。按 id 比，不按顺序比：顺序一变不该算改动。
            const serverById = new Map(serverItems.map((item) => [item.id, item]))
            const changed = merged.length !== serverItems.length
              || merged.some((item) => {
                const row = serverById.get(item.id)
                return row === undefined
                  || Number(row.updatedAt ?? 0) !== Number(item.updatedAt ?? 0)
              })
            if (changed) {
              try {
                await http('POST', API + '/drafts', { items: merged })
              } catch { /* 补写失败就先让正文留在屏幕上 */ }
            }
          } catch (err) {
            console.error('[shuzhuo] drafts fetch failed', err && err.message, err)
            const cached = readDraftCache()
            if (cached !== null && cached.length > 0) {
              setDrafts(cached)
              setActiveId(cached[0].id)
            }
          }
        })()
      }, [])

      const openPage = (rel) => {
        setSelected(rel)
        setTab('page')
        setPageData(null)
        void (async () => {
          try {
            const next = await getJson(API + '/page?rel=' + encodeURIComponent(rel))
            setPageData(next)
          } catch {
            setPageData({ ok: false, error: '请求失败' })
          }
        })()
      }

      const run = async () => {
        const list = terms.split(/[,，、\s]+/).map((term) => term.trim()).filter((term) => term !== '')
        if (list.length === 0) return
        setBusy(true)
        try {
          const next = await getJson(API + '/probe?terms=' + encodeURIComponent(list.join(',')))
          if (next.ok === true) setResult(next)
        } catch {
          setError('扫描失败')
        } finally {
          setBusy(false)
        }
      }

      const tabs = [
        { id: 'desk', label: '讨论' },
        { id: 'overview', label: '概览' },
        { id: 'probe', label: '牵连' },
        { id: 'page', label: '页面' },
        { id: 'todo', label: '待办' },
      ]

      return h('div', { className: 'sz' + (tab === 'desk' ? ' sz-deskonly' : '') },
        h('div', { className: 'sz-head' },
          h('div', null,
            h('div', { className: 'sz-title' }, '书桌'),
            h('div', { className: 'sz-sub' },
              state === null ? '正在读库…' : (state.meta && state.meta.title ? state.meta.title : '资料库') + ' · ' + state.stats.pages + ' 页 · ' + words(state.stats.chars))),
          h('div', { className: 'sz-spacer' })),
        error === '' ? null : h('div', { className: 'sz-err', style: { marginTop: '8px' } }, error),
        h('div', { className: 'sz-tabs' },
          ...tabs.map((entry) =>
            h('div', {
              key: entry.id,
              className: 'sz-tab',
              'data-on': tab === entry.id ? '1' : '0',
              onClick: () => setTab(entry.id),
            }, entry.label))),
        tab === 'desk'
          ? h(DeskView, {
              drafts, setDrafts, activeId, setActiveId, openPage,
              askTarget, targets: sessions, setAskTarget: changeAskTarget,
            })
          : null,
        tab === 'overview' ? h(Overview, { data: state, openPage }) : null,
        tab === 'probe' ? h(Probe, { terms, setTerms, result, busy, run, openPage }) : null,
        tab === 'page' ? h(PageView, {
          data: pageData, openPage, selected,
          askTarget, targets: sessions, setAskTarget: changeAskTarget,
        }) : null,
        tab === 'todo' ? h(TodoView, { items: todo, setItems: setTodo }) : null,
      )
    }

    // ── 图标 ───────────────────────────────────────────────────────────
    function Icon(props) {
      const size = props.size ?? 18
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        style: { opacity: props.active === true ? 1 : 0.72 },
      },
        h('path', { d: 'M12 15.6c-1.5-1.1-3.2-1.5-4.8-1.3V7.4c1.6-.2 3.3.2 4.8 1.3' }),
        h('path', { d: 'M12 15.6c1.5-1.1 3.2-1.5 4.8-1.3V7.4c-1.6-.2-3.3.2-4.8 1.3' }),
        h('path', { d: 'M3.5 18.6h17' }),
      )
    }

    return {
      inject: ['slots', 'remote', 'remote.session'],
      apply(ctx) {
        panelCtx = ctx
        ctx.effect(() => ensureStyle(), 'shuzhuo: styles')
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            { name: 'sidebar.panellist', id: 'shuzhuo', order: 3, label: '书桌' },
            Icon,
          ),
        )
        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: 'shuzhuo' }, Panel),
        )
      },
    }
  },
})
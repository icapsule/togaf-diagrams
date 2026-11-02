/* ============================================================
   TOGAF 图谱学习站 — 应用逻辑
   原生 ES Module，零第三方运行时依赖。
   ============================================================ */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c]);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const LS = { read: 'togaf.read.v1', last: 'togaf.last.v1' };
function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
  catch { return fallback; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 隐私模式下忽略 */ }
}

const state = {
  data: null,
  items: [],
  bySlug: new Map(),
  cats: [],
  catMap: new Map(),
  query: '',
  filters: { cat: 'all', shape: 'all', read: 'all', sort: 'path' },
  read: new Set(),
  route: { name: 'home', slug: null },
  scrollMem: {},
  searchTimer: null,
};

/* ── 工具 ──────────────────────────────────────────────── */

const norm = (s) =>
  String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim();

function catOf(item) { return state.catMap.get(item.category); }

/* ── 搜索 ──────────────────────────────────────────────── */

const SEARCH_FIELDS = [
  ['zhTitle', 10], ['title', 8], ['keywords', 5],
  ['zhDesc', 3], ['desc', 2], ['catZh', 1],
];

function searchItems(q) {
  const query = norm(q);
  if (!query) return null;
  const tokens = query.split(' ').filter(Boolean);
  const out = [];
  for (const it of state.items) {
    const fields = {
      zhTitle: norm(it.zhTitle), title: norm(it.title), keywords: norm(it.keywords),
      zhDesc: norm(it.zhDesc), desc: norm(it.desc), catZh: norm(catOf(it)?.zh || ''),
    };
    let total = 0;
    let ok = true;
    for (const tok of tokens) {
      let best = 0;
      for (const [key, w] of SEARCH_FIELDS) {
        const idx = fields[key].indexOf(tok);
        if (idx < 0) continue;
        const s = w + (idx === 0 ? 4 : 0) - Math.min(idx, 12) * 0.15;
        if (s > best) best = s;
      }
      if (best === 0) { ok = false; break; }
      total += best;
    }
    if (!ok) continue;
    if (norm(it.zhTitle) === query || norm(it.title) === query) total += 25;
    out.push({ it, score: total });
  }
  out.sort((a, b) => b.score - a.score || a.it.title.localeCompare(b.it.title));
  return out.map((r) => r.it);
}

/* ── 筛选 ──────────────────────────────────────────────── */

function visibleItems() {
  let list = state.items;

  if (state.filters.cat !== 'all') list = list.filter((it) => it.category === state.filters.cat);
  if (state.filters.shape !== 'all') list = list.filter((it) => it.shape === state.filters.shape);
  if (state.filters.read === 'unread') list = list.filter((it) => !state.read.has(it.slug));
  if (state.filters.read === 'read') list = list.filter((it) => state.read.has(it.slug));

  const hits = searchItems(state.query);
  if (hits) {
    const rank = new Map(hits.map((it, i) => [it.slug, i]));
    list = list.filter((it) => rank.has(it.slug)).sort((a, b) => rank.get(a.slug) - rank.get(b.slug));
    return list;
  }

  const sorted = [...list];
  const f = state.filters.sort;
  if (f === 'path') {
    sorted.sort((a, b) => (a.pathIndex ?? 999) - (b.pathIndex ?? 999) || a.title.localeCompare(b.title));
  } else if (f === 'title') {
    sorted.sort((a, b) => a.zhTitle.localeCompare(b.zhTitle, 'zh'));
  } else if (f === 'category') {
    sorted.sort((a, b) => a.category.localeCompare(b.category) || a.zhTitle.localeCompare(b.zhTitle, 'zh'));
  } else if (f === 'size') {
    sorted.sort((a, b) => b.width * b.height - a.width * a.height);
  }
  return sorted;
}

/* ── 卡片 ──────────────────────────────────────────────── */

function cardHTML(it) {
  const cat = catOf(it);
  const done = state.read.has(it.slug);
  return `
  <a class="card" href="#/d/${esc(it.slug)}" data-slug="${esc(it.slug)}">
    <div class="thumb">
      <img src="${esc(it.thumb)}" alt="${esc(it.zhDesc)}" loading="lazy" decoding="async">
      <span class="badge">${esc(it.shapeZh)}</span>
      ${done ? '<span class="dot" title="已读"></span>' : ''}
    </div>
    <div class="card-body">
      <h3 class="card-title">${esc(it.zhTitle)}</h3>
      <div class="card-en">${esc(it.title)}</div>
      <div class="card-foot">
        <span class="tag">${esc(cat?.zh || '')}<span class="n">${it.width}×${it.height}</span></span>
      </div>
    </div>
  </a>`;
}

/* ── 路由 ──────────────────────────────────────────────── */

function parseRoute() {
  const raw = location.hash.replace(/^#/, '');
  const parts = raw.split('/').filter(Boolean);
  if (!parts.length) return { name: 'home', slug: null };
  if (parts[0] === 'gallery') return { name: 'gallery', slug: null };
  if (parts[0] === 'about') return { name: 'about', slug: null };
  if (parts[0] === 'd' && parts[1]) return { name: 'detail', slug: decodeURIComponent(parts[1]) };
  return { name: 'home', slug: null };
}

function routeKey() {
  return state.route.name === 'detail' ? `d:${state.route.slug}` : state.route.name;
}

function navigate() {
  // 记住当前视图滚动位置
  state.scrollMem[routeKey()] = window.scrollY;
  state.route = parseRoute();
  render();
  // 恢复滚动位置（详情页回到顶部）
  const key = routeKey();
  const y = state.scrollMem[key] || 0;
  window.scrollTo({ top: y, behavior: 'auto' });
}

/* ── 渲染：首页 ────────────────────────────────────────── */

function renderHome() {
  const total = state.items.length;
  const done = state.read.size;
  const featured = state.items.filter((it) => it.featured);
  const path = state.items
    .filter((it) => it.pathIndex !== null)
    .sort((a, b) => a.pathIndex - b.pathIndex);

  const cont = state.items.find((it) => state.read.has(it.slug)) || path[0];

  return `
  <section class="hero">
    <h1>TOGAF 10 架构图谱</h1>
    <p class="lede">
      ${total} 张 TOGAF 10 架构图，覆盖 ADM 生命周期、四大架构域、内容框架与元模型、
      连续域与架构库、架构构件、能力规划、干系人、治理合规与风险安全。
      可搜索、可缩放阅读，并记录你的学习进度。
    </p>
    <div class="hero-actions">
      <a class="btn btn-primary" href="#/gallery">浏览全部 ${total} 张图</a>
      ${cont ? `<a class="btn" href="#/d/${esc(cont.slug)}">${state.read.size ? '继续学习' : '从第一张开始'}</a>` : ''}
    </div>
    <div class="stats">
      <div><div class="stat-num">${total}</div><div class="stat-label">张架构图</div></div>
      <div><div class="stat-num">${state.cats.length}</div><div class="stat-label">个主题分类</div></div>
      <div><div class="stat-num">${path.length}</div><div class="stat-label">步推荐路径</div></div>
      <div><div class="stat-num">${done}</div><div class="stat-label">张已读</div></div>
    </div>
  </section>

  ${path.length ? `
  <section class="section">
    <div class="section-head">
      <h2>推荐学习路径</h2>
      <span class="section-note">按 ADM 推进顺序排列，共 ${path.length} 步</span>
    </div>
    <div class="pathstrip">
      ${path.map((it) => `
        <a class="pathstep ${state.read.has(it.slug) ? 'done' : ''}" href="#/d/${esc(it.slug)}">
          <span class="n">${state.read.has(it.slug) ? '✓' : it.pathIndex + 1}</span>
          <div class="t">${esc(it.zhTitle)}</div>
          <div class="c">${esc(catOf(it)?.zh || '')}</div>
        </a>`).join('')}
    </div>
  </section>` : ''}

  ${featured.length ? `
  <section class="section">
    <div class="section-head">
      <h2>精选图谱</h2>
      <span class="section-note">先看这几张建立整体印象</span>
    </div>
    <div class="grid">${featured.map(cardHTML).join('')}</div>
  </section>` : ''}

  <section class="section">
    <div class="section-head">
      <h2>按主题浏览</h2>
      <span class="section-note">${state.cats.length} 个分类</span>
    </div>
    <div class="catgrid">
      ${state.cats.map((c) => {
        const n = state.items.filter((it) => it.category === c.id).length;
        return `
        <a class="catcard" href="#/gallery" data-cat="${esc(c.id)}">
          <span class="ico">${esc(c.icon)}</span>
          <span>
            <span class="nm">${esc(c.zh)}</span>
            <span class="en">${esc(c.en)}</span>
          </span>
          <span class="ct">${n}</span>
        </a>`;
      }).join('')}
    </div>
  </section>`;
}

/* ── 渲染：图库 ────────────────────────────────────────── */

function renderGallery() {
  const list = visibleItems();
  const q = state.query.trim();
  const hits = searchItems(q);

  const shapeChips = [['all', '全部'], ['landscape', '横版'], ['square', '方版'], ['portrait', '竖版']];
  const readChips = [['all', '全部'], ['unread', '未读'], ['read', '已读']];
  const sortChips = [['path', '推荐顺序'], ['title', '中文标题'], ['category', '分类'], ['size', '尺寸']];

  return `
  <div class="filterbar">
    <div class="frow">
      <span class="flabel">分类</span>
      <button class="chip ${state.filters.cat === 'all' ? 'on' : ''}" data-f="cat" data-v="all">全部<span class="c">${state.items.length}</span></button>
      ${state.cats.map((c) => {
        const n = state.items.filter((it) => it.category === c.id).length;
        return `<button class="chip ${state.filters.cat === c.id ? 'on' : ''}" data-f="cat" data-v="${esc(c.id)}">${esc(c.icon)} ${esc(c.zh)}<span class="c">${n}</span></button>`;
      }).join('')}
    </div>
    <div class="frow">
      <span class="flabel">形态</span>
      ${shapeChips.map(([v, l]) => `<button class="chip ${state.filters.shape === v ? 'on' : ''}" data-f="shape" data-v="${v}">${l}</button>`).join('')}
      <span class="flabel" style="margin-left:10px">状态</span>
      ${readChips.map(([v, l]) => `<button class="chip ${state.filters.read === v ? 'on' : ''}" data-f="read" data-v="${v}">${l}</button>`).join('')}
      <span class="flabel" style="margin-left:10px">排序</span>
      ${sortChips.map(([v, l]) => `<button class="chip ${state.filters.sort === v ? 'on' : ''}" data-f="sort" data-v="${v}">${l}</button>`).join('')}
    </div>
  </div>

  <p class="resultline">
    ${hits
      ? `搜索 <b>「${esc(q)}」</b> 命中 <b>${list.length}</b> 张图`
      : `共 <b>${list.length}</b> 张图`}
    ${state.read.size ? ` · 已读 <b>${state.read.size}</b>/${state.items.length}` : ''}
  </p>

  ${list.length
    ? `<div class="grid">${list.map(cardHTML).join('')}</div>`
    : `<div class="empty"><div class="big">🔍</div><p>没有匹配的图谱。</p><p><a href="#/gallery" onclick="location.hash='#/gallery';return false">清除筛选条件</a></p></div>`}`;
}

/* ── 渲染：详情 ────────────────────────────────────────── */

function renderDetail(slug) {
  const it = state.bySlug.get(slug);
  if (!it) {
    return `<div class="empty"><div class="big">🤷</div><p>找不到这张图：<code>${esc(slug)}</code></p><p><a href="#/gallery">返回图库</a></p></div>`;
  }
  const cat = catOf(it);
  const related = state.items
    .filter((x) => x.category === it.category && x.slug !== it.slug)
    .slice(0, 4);
  const done = state.read.has(it.slug);

  return `
  <div class="detail-head">
    <a class="btn back" href="#/gallery">← 图库</a>
    <div style="flex:1;min-width:220px">
      <h1 class="detail-title">${esc(it.zhTitle)}</h1>
      <div class="detail-en">${esc(it.title)}</div>
    </div>
    <span class="tag">${esc(cat?.icon || '')} ${esc(cat?.zh || '')}</span>
    <span class="tag">${esc(it.shapeZh)}</span>
  </div>

  <div class="viewer" id="viewer">
    <div class="viewer-scroll" id="viewerScroll">
      <div class="viewer-inner">
        <picture>
          <source srcset="${esc(it.full.avif)}" type="image/avif">
          <source srcset="${esc(it.full.webp)}" type="image/webp">
          <img id="viewerImg" src="${esc(it.full.webp)}" alt="${esc(it.zhDesc)}"
               width="${it.width}" height="${it.height}" draggable="false">
        </picture>
      </div>
    </div>
    <button class="viewer-nav prev" id="vPrev" aria-label="上一张">‹</button>
    <button class="viewer-nav next" id="vNext" aria-label="下一张">›</button>
    <div class="vtoolbar" id="vToolbar">
      <button class="vbtn" data-vmode="fit"><span class="lg">适应屏幕</span><span class="sm">屏幕</span></button>
      <button class="vbtn" data-vmode="width"><span class="lg">适应宽度</span><span class="sm">宽度</span></button>
      <button class="vbtn" data-vmode="actual">1:1</button>
      <span class="vsep"></span>
      <button class="vbtn" id="vZoomOut" aria-label="缩小">−</button>
      <span class="vzoom" id="vZoom">100%</span>
      <button class="vbtn" id="vZoomIn" aria-label="放大">+</button>
      <span class="vsep"></span>
      <button class="vbtn" id="vMark"><span class="lg">标记已读</span><span class="sm">已读</span></button>
      <button class="vbtn" id="vCopy"><span class="lg">复制链接</span><span class="sm">链接</span></button>
    </div>
  </div>

  <div class="detail-grid">
    <div class="panel">
      <h3>图解说明</h3>
      <p>${esc(it.zhDesc)}</p>
      <p style="font-size:13px;color:var(--text-3)">${esc(it.caption)}</p>
      ${related.length ? `
      <h3 style="margin-top:24px">同分类其他图</h3>
      <div class="related">${related.map(cardHTML).join('')}</div>` : ''}
    </div>
    <div class="panel">
      <h3>技术信息</h3>
      <dl class="kv">
        <dt>像素尺寸</dt><dd>${it.width} × ${it.height}</dd>
        <dt>宽高比</dt><dd>${it.aspect.toFixed(2)}</dd>
        <dt>AVIF</dt><dd>${Math.round(it.bytes.avif / 1024)} KB</dd>
        <dt>WebP</dt><dd>${Math.round(it.bytes.webp / 1024)} KB</dd>
        <dt>原始 PNG</dt><dd>${(it.bytes.src / 1048576).toFixed(1)} MB</dd>
        <dt>分类</dt><dd>${esc(cat?.zh || '')}</dd>
      </dl>
      ${it.keywords ? `<p style="margin-top:14px;font-size:12.5px;color:var(--text-3)">关键词：${esc(it.keywords)}</p>` : ''}
      <button class="btn readbtn ${done ? 'done' : ''}" id="vMark2">${done ? '✓ 已读' : '标记为已读'}</button>
    </div>
  </div>`;
}

/* ── 渲染：关于 ────────────────────────────────────────── */

function renderAbout() {
  const s = state.data.source;
  return `
  <div class="about">
    <h2 style="margin-top:0">关于本站</h2>
    <p>
      本站是 TOGAF 10 架构图谱的本地学习站，收录 ${state.items.length} 张图，
      按 ${state.cats.length} 个主题分类组织，并提供搜索、缩放阅读与学习进度记录。
      所有数据都在浏览器本地处理，没有账号、没有服务端、进度保存在你自己的浏览器里。
    </p>

    <h2>图谱来源</h2>
    <p>
      全部图谱来自 <code>${esc(s.originalRepo)}</code>，作者 Nels Ambrose，
      以 <strong>MIT 协议</strong>发布，可自由用于个人与商业用途（署名非强制）。
      原仓库目前已不可访问，因此本站固定了 fork <code>${esc(s.repo)}</code>
      的 commit <code>${esc(s.sha.slice(0, 12))}</code> 作为唯一来源，并在本地重新生成
      缩略图与 AVIF / WebP 派生图，站点不再依赖上游可用性。
    </p>
    <div class="callout">
      <p>
        这些图是对 TOGAF 概念的社区化简化解读，<strong>不是</strong> The Open Group 的权威材料。
        备考或实际项目请以官方 TOGAF 文档为准。本站与 The Open Group 无隶属关系，
        TOGAF 是 The Open Group 的注册商标。
      </p>
    </div>

    <h2>性能是怎么做到的</h2>
    <ul>
      <li>源 PNG 共约 67 MB，构建为 AVIF 约 4.3 MB、WebP 约 7.4 MB、缩略图约 1.1 MB。</li>
      <li>网格只加载 480px 内的缩略图（平均约 24 KB），全尺寸图仅在打开详情时按需加载。</li>
      <li>文件名带内容哈希，配合 <code>Cache-Control: immutable</code> 强缓存。</li>
      <li>零第三方运行时依赖，无外部字体与外部请求。</li>
    </ul>

    <h2>数据与隐私</h2>
    <p>
      学习进度保存在你浏览器的 localStorage 中（键名 <code>togaf.read.v1</code>），
      不上传任何服务器。清除浏览器数据会一并清掉进度。
    </p>
  </div>`;
}

/* ── 渲染主入口 ────────────────────────────────────────── */

function render() {
  const app = $('#app');
  let html = '';
  switch (state.route.name) {
    case 'gallery': html = renderGallery(); break;
    case 'detail': html = renderDetail(state.route.slug); break;
    case 'about': html = renderAbout(); break;
    default: html = renderHome();
  }
  app.innerHTML = html;

  $$('.navlink').forEach((a) => a.classList.toggle('active', a.dataset.nav === state.route.name));
  document.title = state.route.name === 'detail'
    ? `${state.bySlug.get(state.route.slug)?.zhTitle || '图谱'} · TOGAF 图谱`
    : 'TOGAF 图谱学习站';

  updateProgress();
  syncSearchInput();
  if (state.route.name === 'detail') bindViewer();
  window.scrollTo({ top: state.scrollMem[routeKey()] || 0, behavior: 'auto' });
}

function updateProgress() {
  const total = state.items.length || 1;
  const done = state.read.size;
  const pct = Math.round((done / total) * 100);
  const ring = $('#progressRing');
  if (ring) ring.style.setProperty('--p', pct);
  const txt = $('#progressText');
  if (txt) txt.textContent = `${done}/${state.items.length}`;
}

function syncSearchInput() {
  const input = $('#search');
  if (!input) return;
  if (input.value !== state.query) input.value = state.query;
  $('#searchClear').hidden = !state.query;
}

/* ── 详情查看器（缩放 / 平移 / 翻页） ──────────────────── */

const viewer = {
  el: null, scroll: null, img: null,
  mode: 'fit',
  naturalW: 0, naturalH: 0,
  width: 0,       // 当前显示宽度（px）
  minW: 40, maxW: 6000,
  item: null,

  init() {
    this.el = $('#viewer');
    if (!this.el) return;
    this.scroll = $('#viewerScroll');
    this.img = $('#viewerImg');
    this.item = state.bySlug.get(state.route.slug);
    if (!this.img || !this.item) return;
    this.naturalW = this.item.width;
    this.naturalH = this.item.height;
    this.reset();
    this.bind();
  },

  inner() {
    return this.img?.closest('.viewer-inner') || this.scroll;
  },
  boxWidth() {
    const cs = getComputedStyle(this.inner());
    return this.scroll.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  },
  boxHeight() {
    const cs = getComputedStyle(this.inner());
    return this.scroll.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  },

  fitBoth() {
    const bw = this.boxWidth(), bh = this.boxHeight();
    if (!bw || !bh) return this.naturalW;
    const scale = Math.min(bw / this.naturalW, bh / this.naturalH);
    return this.naturalW * scale;
  },
  screenWidth() {
    const bw = this.boxWidth();
    return bw || this.naturalW;
  },

  reset() {
    this.mode = 'fit';
    this.apply(this.fitBoth());
  },

  setModeSilent(mode) {
    this.mode = mode;
    this.img.style.width = Math.round(this.width) + 'px';
    this.syncToolbar();
  },

  apply(width, anchor) {
    const next = clamp(Math.round(width), this.minW, this.maxW);
    if (anchor) {
      const before = this.img.getBoundingClientRect();
      const sr = this.scroll.getBoundingClientRect();
      const fx = (anchor.x - before.left) / Math.max(before.width, 1);
      const fy = (anchor.y - before.top) / Math.max(before.height, 1);
      const prev = this.width || next;
      this.img.style.width = next + 'px';
      const after = this.img.getBoundingClientRect();
      const targetLeft = anchor.x - fx * after.width;
      const targetTop = anchor.y - fy * after.height;
      this.scroll.scrollLeft += (targetLeft - before.left);
      this.scroll.scrollTop += (targetTop - before.top);
      void sr; void prev;
    } else {
      this.img.style.width = next + 'px';
    }
    this.width = next;
    this.syncToolbar();
  },

  setMode(mode) {
    if (mode === 'fit') this.width = this.fitBoth();
    else if (mode === 'width') this.width = this.screenWidth();
    else if (mode === 'actual') this.width = this.naturalW;
    this.mode = mode;
    this.img.style.width = this.width + 'px';
    this.scroll.scrollLeft = 0;
    this.scroll.scrollTop = 0;
    this.syncToolbar();
  },

  zoomBy(factor, anchor) {
    const base = this.width || this.naturalW;
    this.mode = 'custom';
    this.apply(base * factor, anchor);
  },

  syncToolbar() {
    $$('.vbtn[data-vmode]').forEach((b) => b.classList.toggle('on', b.dataset.vmode === this.mode));
    const z = $('#vZoom');
    if (z) z.textContent = Math.round((this.width / this.naturalW) * 100) + '%';
    const mark = $('#vMark'), mark2 = $('#vMark2');
    const done = state.read.has(this.item.slug);
    if (mark) {
      mark.innerHTML = done
        ? '<span class="lg">✓ 已读</span><span class="sm">✓</span>'
        : '<span class="lg">标记已读</span><span class="sm">已读</span>';
    }
    if (mark2) mark2.textContent = done ? '✓ 已读' : '标记为已读';
    if (mark2) mark2.classList.toggle('done', done);
  },

  step(delta) {
    const list = state.items;
    const i = list.findIndex((x) => x.slug === this.item.slug);
    const next = list[(i + delta + list.length) % list.length];
    if (next) location.hash = `#/d/${next.slug}`;
  },

  bind() {
    const self = this;

    // 模式切换 / 缩放
    // 用 closest('button') 判定：按钮内含 span 时 e.target 并不是按钮本身
    this.el.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.vmode) { self.setMode(btn.dataset.vmode); return; }
      switch (btn.id) {
        case 'vZoomIn': self.zoomBy(1.25, centerAnchor()); break;
        case 'vZoomOut': self.zoomBy(0.8, centerAnchor()); break;
        case 'vPrev': self.step(-1); break;
        case 'vNext': self.step(1); break;
        case 'vMark': case 'vMark2':
          toggleRead(self.item.slug);
          self.syncToolbar();
          break;
        case 'vCopy': copyLink(); break;
      }
    });

    function centerAnchor() {
      const r = self.scroll.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    // 双击：适应屏幕 ↔ 2 倍
    this.img.addEventListener('dblclick', (e) => {
      e.preventDefault();
      const fit = self.fitBoth();
      if (Math.abs(self.width - fit) < 4) self.apply(fit * 2, { x: e.clientX, y: e.clientY });
      else self.apply(fit, { x: e.clientX, y: e.clientY });
    });

    // 滚轮：Ctrl/⌘ + 滚轮 缩放；普通滚轮交给原生滚动
    this.scroll.addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.12 : 0.89;
      self.zoomBy(f, { x: e.clientX, y: e.clientY });
    }, { passive: false });

    // 双指捏合
    let pinch = null;
    this.el.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        pinch = {
          dist: touchDist(e),
          width: self.width,
          cx: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          cy: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        };
      }
    }, { passive: true });
    this.el.addEventListener('touchmove', (e) => {
      if (pinch && e.touches.length === 2) {
        e.preventDefault();
        const d = touchDist(e);
        if (pinch.dist > 0) self.apply(pinch.width * (d / pinch.dist), { x: pinch.cx, y: pinch.cy });
      }
    }, { passive: false });
    this.el.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) pinch = null;
    }, { passive: true });

    // 滑动翻页（仅在未放大时）
    let sx = 0, sy = 0, st = 0;
    this.el.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
    }, { passive: true });
    this.el.addEventListener('touchend', (e) => {
      if (!st || pinch) return;
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      const dt = Date.now() - st;
      st = 0;
      const fit = self.fitBoth();
      if (Math.abs(self.width - fit) > 4) return;   // 放大状态下不翻页
      if (dt < 600 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) {
        self.step(dx < 0 ? 1 : -1);
      }
    }, { passive: true });

    // 尺寸变化时重新适配（避免重复绑定）
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    this._onResize = () => { if (self.mode === 'fit') self.setMode('fit'); };
    window.addEventListener('resize', this._onResize);
  },
};

function touchDist(e) {
  const dx = e.touches[0].clientX - e.touches[1].clientX;
  const dy = e.touches[0].clientY - e.touches[1].clientY;
  return Math.hypot(dx, dy);
}

function bindViewer() {
  viewer.init();
}

async function copyLink() {
  const url = location.href;
  try {
    await navigator.clipboard.writeText(url);
    const b = $('#vCopy');
    if (b) { const t = b.textContent; b.textContent = '已复制 ✓'; setTimeout(() => { b.textContent = t; }, 1400); }
  } catch {
    const b = $('#vCopy');
    if (b) { const t = b.textContent; b.textContent = '复制失败'; setTimeout(() => { b.textContent = t; }, 1400); }
  }
}

/* ── 已读状态 ──────────────────────────────────────────── */

function toggleRead(slug) {
  if (state.read.has(slug)) state.read.delete(slug);
  else state.read.add(slug);
  lsSet(LS.read, [...state.read]);
  lsSet(LS.last, slug);
  updateProgress();
  // 同步当前视图中的卡片标记
  $$(`.card[data-slug="${CSS.escape(slug)}"]`).forEach((c) => {
    const dot = $('.dot', c);
    if (state.read.has(slug) && !dot) {
      const d = document.createElement('span');
      d.className = 'dot'; d.title = '已读';
      $('.thumb', c).appendChild(d);
    } else if (!state.read.has(slug) && dot) {
      dot.remove();
    }
  });
}

/* ── 事件绑定 ──────────────────────────────────────────── */

function bindGlobal() {
  window.addEventListener('hashchange', navigate);

  const input = $('#search');
  input.addEventListener('input', () => {
    state.query = input.value;
    $('#searchClear').hidden = !state.query;
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => {
      if (state.route.name !== 'gallery') {
        location.hash = '#/gallery';
      } else {
        render();
      }
    }, 120);
  });

  $('#searchClear').addEventListener('click', () => {
    state.query = '';
    input.value = '';
    $('#searchClear').hidden = true;
    input.focus();
    if (state.route.name === 'gallery') render();
  });

  // 事件委托：筛选 chip / 分类卡
  document.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip[data-f]');
    if (chip) {
      state.filters[chip.dataset.f] = chip.dataset.v;
      render();
      return;
    }
    const catcard = e.target.closest('.catcard[data-cat]');
    if (catcard) {
      state.filters.cat = catcard.dataset.cat;
      location.hash = '#/gallery';
      return;
    }
  });

  // 键盘
  document.addEventListener('keydown', (e) => {
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if (e.key === '/' && !inField) { e.preventDefault(); $('#search').focus(); return; }
    if (inField) {
      if (e.key === 'Escape') { document.activeElement.blur(); }
      return;
    }
    if (state.route.name !== 'detail') return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); viewer.step(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); viewer.step(1); }
    else if (e.key === 'Escape') { location.hash = '#/gallery'; }
    else if (e.key === '0') viewer.setMode('fit');
    else if (e.key === 'w' || e.key === 'W') viewer.setMode('width');
    else if (e.key === '1') viewer.setMode('actual');
    else if (e.key === '+' || e.key === '=') viewer.zoomBy(1.25);
    else if (e.key === '-') viewer.zoomBy(0.8);
  });
}

/* ── 启动 ──────────────────────────────────────────────── */

async function boot() {
  const res = await fetch('data/diagrams.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`清单加载失败 (${res.status})`);
  state.data = await res.json();
  state.items = state.data.items;
  state.cats = state.data.categories;
  state.catMap = new Map(state.cats.map((c) => [c.id, c]));
  state.bySlug = new Map(state.items.map((i) => [i.slug, i]));

  state.read = new Set(lsGet(LS.read, []));
  const last = lsGet(LS.last, null);
  state.scrollMem['gallery'] = lsGet('togaf.scroll.gallery', 0);

  bindGlobal();
  navigate();

  // 恢复图库滚动位置
  if (state.route.name === 'gallery') {
    window.scrollTo({ top: lsGet('togaf.scroll.gallery', 0), behavior: 'auto' });
  }

  window.addEventListener('scroll', () => {
    if (state.route.name === 'gallery') lsSet('togaf.scroll.gallery', window.scrollY);
  }, { passive: true });

  // 首次访问：若有上次看的图，提示继续
  if (last && state.bySlug.has(last)) lsSet(LS.last, last);
}

boot().catch((err) => {
  console.error(err);
  $('#app').innerHTML = `<div class="empty"><div class="big">⚠️</div><p>站点加载失败：${esc(err.message)}</p><p>请先运行 <code>npm run build:site</code> 生成站点文件。</p></div>`;
});

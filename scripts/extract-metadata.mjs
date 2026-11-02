/**
 * 从上游源文件抽取 46 张图的元数据 → data/upstream.json
 *
 * 三个来源交叉：
 *   sitemap.xml  → 路径 → 标题 + 简述（46 条，最权威的路径映射）
 *   index.html   → 路径 → alt 长描述 / 卡片简述 / 关键词 / 精选标记
 *   README.md    → 标题 → 9 个概念分类
 *
 * 上游已 404，抽取结果锁定进 data/upstream.json，之后不再依赖上游。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const UP = path.join(ROOT, 'source-assets', '_upstream');
const OUT = path.join(ROOT, 'data', 'upstream.json');

export const CATEGORIES = [
  { id: 'adm', en: 'ADM & Lifecycle', zh: 'ADM 与生命周期', icon: '🔁' },
  { id: 'domains', en: 'Architecture Domains', zh: '四大架构域', icon: '🧭' },
  { id: 'content', en: 'Content, Metamodel & Structure', zh: '内容框架与元模型', icon: '📦' },
  { id: 'continuum', en: 'Repository & Continuum', zh: '连续域与架构库', icon: '🌐' },
  { id: 'blocks', en: 'Building Blocks', zh: '架构构件', icon: '🧱' },
  { id: 'capability', en: 'Capability & Planning', zh: '能力与规划', icon: '📈' },
  { id: 'stakeholders', en: 'Stakeholders & Communication', zh: '利益相关者与沟通', icon: '👥' },
  { id: 'governance', en: 'Governance & Compliance', zh: '治理与合规', icon: '⚖️' },
  { id: 'risk', en: 'Risk & Security', zh: '风险与安全', icon: '🛡️' },
];

/** 学习路径标题 norm → sitemap 标题 norm 的别名。仅用于把学习路径顺序对齐到具体图。 */
const TITLE_ALIASES = {
  // 学习路径写作 "Enterprise Continuum & Architecture Repository"，sitemap 写作 "TOGAF Enterprise Continuum & Repository"
  enterprisecontinuumarchitecturerepository: 'enterprisecontinuumrepository',
};

/** 标题 → 分类 id。README 分类列表标题与 sitemap 标题有细微差异，故手工锁定这两条。 */
const CATEGORY_OVERRIDES = {
  'docs/diagrams/continuum/togaf-phase-a-enterprise-continuum-architecture-repository-v2.png': 'continuum',
  'docs/diagrams/business/togaf-business-scenarios.png': 'domains',
};

const decode = (s) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

const norm = (s) =>
  decode(s)
    .replace(/\s*\(Phase[^)]*\)/i, '')
    .replace(/^TOGAF\s+/i, '')
    .replace(/[^a-z0-9]+/gi, '')
    .toLowerCase();

const slugify = (file) =>
  path.basename(file, '.png')
    .replace(/^togaf-/, '')
    .replace(/-v\d+$/, '')
    .replace(/-/g, '-');

async function main() {
  const read = async (f) => readFile(path.join(UP, f), 'utf8');
  const [sitemap, indexHtml, readme, exceptions] = await Promise.all([
    read('sitemap.xml'),
    read('index.html'),
    read('README.md'),
    read('diagram-exceptions.txt'),
  ]);

  // ── 1. sitemap：路径 → 标题 / 简述 ──────────────────────────
  const byPath = new Map();
  for (const m of sitemap.matchAll(
    /<image:loc>([^<]+)<\/image:loc>\s*<image:title>([^<]*)<\/image:title>\s*<image:caption>([^<]*)<\/image:caption>/g
  )) {
    const p = m[1].split('/togaf-diagrams/').pop();
    byPath.set(p, { title: decode(m[2]).trim(), caption: decode(m[3]).trim() });
  }

  // ── 2. index.html：路径 → alt / 卡片简述 / 关键词 / 精选 ──────
  const metaByPath = new Map();
  const featured = new Set();
  let section = null;
  for (const m of indexHtml.matchAll(
    /<section class="category-section" id="([^"]+)"|<a href="[^"]*" class="card">([\s\S]*?)<\/a>/g
  )) {
    if (m[1]) { section = m[1]; continue; }
    const card = m[2];
    const src = card.match(/src="(docs\/diagrams\/[^"]+\.png)"/);
    if (!src) continue;
    const p = src[1];
    if (section === 'featured') featured.add(p);
    const alt = card.match(/alt="([^"]*)"/);
    const desc = card.match(/class="card-desc">([^<]*)</);
    metaByPath.set(p, {
      alt: alt ? decode(alt[1]).trim() : '',
      desc: desc ? decode(desc[1]).trim() : '',
    });
  }

  // 搜索索引里的 keywords
  const kwBlock = indexHtml.match(/const diagrams = \[([\s\S]*?)\n  \];/);
  const keywords = new Map();
  if (kwBlock) {
    for (const m of kwBlock[1].matchAll(/\{([^{}]*)\}/g)) {
      const o = {};
      for (const kv of m[1].matchAll(/(\w+):\s*"([^"]*)"/g)) o[kv[1]] = decode(kv[2]);
      if (o.img) keywords.set(o.img, (o.keywords || '').trim());
    }
  }

  // ── 3. README：标题 → 分类 ─────────────────────────────────
  const bc = readme.slice(readme.indexOf('## Browse by Category'), readme.indexOf('## Diagrams'));
  const catByTitle = new Map();
  for (const part of bc.split(/\n(?=### )/)) {
    const m = part.match(/^### (.+?) \(\d+\)\n([\s\S]*)$/);
    if (!m) continue;
    const cat = CATEGORIES.find((c) => c.en === m[1].trim());
    if (!cat) throw new Error(`未知分类: ${m[1].trim()}`);
    for (const t of m[2].matchAll(/\[(.+?)\]\(#/g)) catByTitle.set(norm(t[1]), cat.id);
  }
  if (catByTitle.size === 0) throw new Error('分类解析失败');

  // ── 4. README 推荐学习路径（顺序） ─────────────────────────
  const lp = readme.slice(readme.indexOf('## Recommended Learning Path'), readme.indexOf('## Browse by Category'));
  const pathOrder = [];
  for (const m of lp.matchAll(/\d+\.\s*(?:\*\*Start here →\*\*\s*)?\[(.+?)\]\(#/g)) {
    const t = m[1].trim();
    if (!pathOrder.includes(t)) pathOrder.push(t);
  }
  const pathNorm = new Map(pathOrder.map((t, i) => [norm(t), i]));
  for (const [pathTitleNorm, sitemapTitleNorm] of Object.entries(TITLE_ALIASES)) {
    if (pathNorm.has(pathTitleNorm)) pathNorm.set(sitemapTitleNorm, pathNorm.get(pathTitleNorm));
  }

  // ── 5. 排除项 ───────────────────────────────────────────────
  const excluded = exceptions
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.replace(/^docs\/diagrams\//, '') + '.png');

  // ── 6. 组装 ────────────────────────────────────────────────
  const items = [];
  const problems = [];
  for (const [p, { title, caption }] of byPath) {
    if (excluded.includes(p)) { problems.push(`被上游标记为不发布，但仍出现在 sitemap: ${p}`); continue; }
    const m = metaByPath.get(p) || {};
    const catId = CATEGORY_OVERRIDES[p] || catByTitle.get(norm(title));
    if (!catId) { problems.push(`无法确定分类: ${p} (${title})`); continue; }

    const abs = path.join(ROOT, 'source-assets', p.replace(/^docs\//, ''));
    if (!existsSync(abs)) { problems.push(`源文件缺失: ${p}`); continue; }
    const { width, height } = await sharp(abs).metadata();

    const key = norm(title);
    items.push({
      slug: slugify(p),
      file: p,
      localFile: p.replace(/^docs\//, ''),
      title,
      caption,
      alt: m.alt || caption,
      desc: m.desc || caption,
      keywords: keywords.get(p) || '',
      category: catId,
      featured: featured.has(p),
      pathIndex: pathNorm.has(key) ? pathNorm.get(key) : null,
      width,
      height,
      aspect: Number((width / height).toFixed(4)),
    });
  }

  // 路径覆盖校验
  for (const p of excluded) {
    if (byPath.has(p)) problems.push(`排除项仍被收录: ${p}`);
  }

  items.sort((a, b) => a.title.localeCompare(b.title));

  const manifest = {
    $schema: 'upstream-metadata-v1',
    source: {
      repo: 'JawharMobile/togaf-diagrams',
      originalRepo: 'nelsambrase/togaf-diagrams',
      sha: '0d1def098c1cc89ac90b36b3b12704d4957b6bc8',
      license: 'MIT',
      copyright: 'Copyright (c) 2026 Nels Ambrose',
    },
    categories: CATEGORIES,
    items,
  };

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  const noPath = items.filter((i) => i.pathIndex === null);
  console.log(`✔ ${items.length} 张图 → data/upstream.json`);
  console.log(`  分类: ${[...new Set(items.map((i) => i.category))].length}/9`);
  console.log(`  精选: ${items.filter((i) => i.featured).length}`);
  console.log(`  学习路径: ${items.filter((i) => i.pathIndex !== null).length}/${pathOrder.length}`);
  if (noPath.length) console.log(`  未在推荐路径中: ${noPath.map((i) => i.title).join(', ')}`);
  if (problems.length) { console.log('\n⚠ 问题:'); problems.forEach((p) => console.log('  ' + p)); process.exitCode = 1; }
}

main().catch((e) => { console.error(e); process.exit(1); });

/**
 * 完整性校验：元数据 ↔ 源文件 ↔ 产物文件 三方一一对应。
 */
import { readFile, stat, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const problems = [];
const warns = [];
const ok = [];

const kb = (b) => (b / 1024).toFixed(1);
const mb = (b) => (b / 1048576).toFixed(2);

async function main() {
  const upstream = JSON.parse(await readFile(path.join(ROOT, 'data', 'upstream.json'), 'utf8'));
  const zh = JSON.parse(await readFile(path.join(ROOT, 'data', 'zh-content.json'), 'utf8'));
  const man = JSON.parse(await readFile(path.join(ROOT, 'data', 'diagrams.json'), 'utf8'));

  // ── 数量 ──────────────────────────────────────────────
  const N = 46;
  if (upstream.items.length !== N) problems.push(`upstream.json 图数 ${upstream.items.length} ≠ ${N}`);
  if (man.items.length !== N) problems.push(`diagrams.json 图数 ${man.items.length} ≠ ${N}`);
  if (Object.keys(zh).length !== N) problems.push(`zh-content.json 条数 ${Object.keys(zh).length} ≠ ${N}`);

  // ── slug 唯一 ─────────────────────────────────────────
  const slugs = man.items.map((i) => i.slug);
  if (new Set(slugs).size !== slugs.length) problems.push('slug 存在重复');

  // ── 分类 ──────────────────────────────────────────────
  const catIds = new Set(man.categories.map((c) => c.id));
  for (const it of man.items) if (!catIds.has(it.category)) problems.push(`${it.slug} 分类 ${it.category} 未定义`);
  const usedCats = new Set(man.items.map((i) => i.category));
  for (const c of man.categories) if (!usedCats.has(c.id)) warns.push(`分类 ${c.id} 下没有图`);
  if (man.categories.length !== 9) problems.push(`分类数 ${man.categories.length} ≠ 9`);

  // ── 中文内容 ──────────────────────────────────────────
  for (const it of man.items) {
    const z = zh[it.slug];
    if (!z) { problems.push(`${it.slug} 缺少中文内容`); continue; }
    if (!z.zhTitle) problems.push(`${it.slug} 缺少 zhTitle`);
    if (!z.zhDesc) problems.push(`${it.slug} 缺少 zhDesc`);
  }

  // ── 源文件 ────────────────────────────────────────────
  let haveSource = true;
  for (const it of upstream.items) {
    const p = path.join(ROOT, 'source-assets', it.localFile);
    if (!(await stat(p).catch(() => null))) { problems.push(`源文件缺失 ${it.localFile}`); haveSource = false; }
  }

  // ── 产物文件 ──────────────────────────────────────────
  const expected = new Set();
  let totalThumb = 0, totalAvif = 0, totalWebp = 0, totalSrc = 0;
  for (const it of man.items) {
    for (const rel of [it.thumb, it.full.avif, it.full.webp]) {
      expected.add(rel);
      const p = path.join(ROOT, 'public', rel);
      const s = await stat(p).catch(() => null);
      if (!s) { problems.push(`产物缺失 ${rel}`); continue; }
      if (s.size < 512) problems.push(`产物异常小 ${rel} (${s.size}B)`);
      if (rel.includes('/thumb/')) totalThumb += s.size;
      else if (rel.endsWith('.avif')) totalAvif += s.size;
      else totalWebp += s.size;
    }
    totalSrc += it.bytes.src;
    // 尺寸自洽
    if (it.width <= 0 || it.height <= 0) problems.push(`${it.slug} 尺寸非法`);
    if (Math.abs(it.width / it.height - it.aspect) > 0.01) problems.push(`${it.slug} aspect 与宽高不符`);
    if (!it.shape) problems.push(`${it.slug} 缺少 shape`);
  }

  // ── 孤立产物 ──────────────────────────────────────────
  for (const dir of ['thumb', 'full']) {
    const abs = path.join(ROOT, 'public', 'assets', 'diagrams', dir);
    if (!existsSync(abs)) { problems.push(`产物目录缺失 assets/diagrams/${dir}`); continue; }
    for (const f of await readdir(abs)) {
      const rel = `assets/diagrams/${dir}/${f}`;
      if (!expected.has(rel)) problems.push(`孤立产物 ${rel}`);
    }
  }

  // ── 站点文件 ──────────────────────────────────────────
  for (const f of ['index.html', 'styles.css', 'app.js', 'favicon.svg', '_headers', '_redirects', 'robots.txt']) {
    if (!existsSync(path.join(ROOT, 'public', f))) problems.push(`public/${f} 缺失（先跑 npm run build:site）`);
  }
  for (const f of ['_headers', '_redirects']) {
    if (!existsSync(path.join(ROOT, 'src', f))) problems.push(`src/${f} 缺失`);
  }

  // ── 体积 ──────────────────────────────────────────────
  const appJs = await stat(path.join(ROOT, 'public', 'app.js')).catch(() => null);
  const css = await stat(path.join(ROOT, 'public', 'styles.css')).catch(() => null);
  const html = await stat(path.join(ROOT, 'public', 'index.html')).catch(() => null);
  const manifest = await stat(path.join(ROOT, 'public', 'data', 'diagrams.json')).catch(() => null);
  const shell = (appJs?.size || 0) + (css?.size || 0) + (html?.size || 0) + (manifest?.size || 0);

  console.log('── 校验结果 ' + '─'.repeat(46));
  console.log(`  图数        ${man.items.length} · 分类 ${man.categories.length} · 学习路径 ${man.items.filter((i) => i.pathIndex !== null).length}/20`);
  console.log(`  源 PNG      ${mb(totalSrc)} MB`);
  console.log(`  缩略图      ${mb(totalThumb)} MB (均 ${Math.round(totalThumb / N / 1024)} KB)`);
  console.log(`  全尺寸      AVIF ${mb(totalAvif)} MB (均 ${Math.round(totalAvif / N / 1024)} KB) · WebP ${mb(totalWebp)} MB (均 ${Math.round(totalWebp / N / 1024)} KB)`);
  console.log(`  站点外壳    ${kb(shell)} KB (HTML ${kb(html?.size || 0)} + CSS ${kb(css?.size || 0)} + JS ${kb(appJs?.size || 0)} + 清单 ${kb(manifest?.size || 0)})`);
  if (haveSource) ok.push(`源文件 ${upstream.items.length} 个全部就位`);

  if (warns.length) { console.log('\n  提示:'); warns.forEach((w) => console.log('    · ' + w)); }
  if (problems.length) {
    console.log('\n✗ 问题 ' + problems.length + ' 项:');
    problems.slice(0, 40).forEach((p) => console.log('    · ' + p));
    if (problems.length > 40) console.log(`    … 还有 ${problems.length - 40} 项`);
    process.exit(1);
  }
  console.log('\n✔ 全部校验通过');
}

main().catch((e) => { console.error(e); process.exit(1); });

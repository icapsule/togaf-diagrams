/**
 * 图片管线：源 PNG → 缩略图 (WebP) + 全尺寸 (AVIF / WebP) → data/diagrams.json
 *
 * 源图共 47 个 PNG，其中 1 个被上游标记为「不发布」，最终产出 46 张。
 * 文件名带源内容哈希（sha8），因此可以放心用 immutable 强缓存。
 */
import { readFile, writeFile, mkdir, rm, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC_DIR = path.join(ROOT, 'source-assets');   // localFile 形如 diagrams/adm/x.png
const OUT_DIR = path.join(ROOT, 'public', 'assets', 'diagrams');
const MANIFEST = path.join(ROOT, 'data', 'diagrams.json');

const THUMB_BOX = 480;   // 缩略图外框（contain，不裁切）
const THUMB_Q = 72;
const FULL_AVIF_Q = 55;
const FULL_AVIF_EFFORT = 4;
const FULL_WEBP_Q = 82;
const FULL_WEBP_EFFORT = 5;

const shapeOf = (ar) => (ar >= 1.2 ? 'landscape' : ar >= 0.8 ? 'square' : 'portrait');
const SHAPE_ZH = { landscape: '横版', square: '方版', portrait: '竖版' };

async function sha8(file) {
  const buf = await readFile(file);
  return createHash('sha1').update(buf).digest('hex').slice(0, 8);
}

async function main() {
  const upstream = JSON.parse(await readFile(path.join(ROOT, 'data', 'upstream.json'), 'utf8'));
  const zh = JSON.parse(await readFile(path.join(ROOT, 'data', 'zh-content.json'), 'utf8'));

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(path.join(OUT_DIR, 'thumb'), { recursive: true });
  await mkdir(path.join(OUT_DIR, 'full'), { recursive: true });

  const items = [];
  let totalSrc = 0, totalThumb = 0, totalAvif = 0, totalWebp = 0;
  const t0 = Date.now();

  for (const [i, it] of upstream.items.entries()) {
    const src = path.join(SRC_DIR, it.localFile);
    if (!(await stat(src).catch(() => null))) throw new Error(`源文件缺失: ${it.localFile}`);

    const hash = await sha8(src);
    const base = `${it.slug}-${hash}`;
    const thumbRel = `assets/diagrams/thumb/${base}.webp`;
    const avifRel = `assets/diagrams/full/${base}.avif`;
    const webpRel = `assets/diagrams/full/${base}.webp`;

    const img = sharp(src);
    const meta = await img.metadata();
    if (meta.width !== it.width || meta.height !== it.height) {
      throw new Error(`尺寸不一致 ${it.slug}: 源 ${meta.width}x${meta.height} vs 元数据 ${it.width}x${it.height}`);
    }

    // 缩略图：contain 到 480x480 外框内，不裁切
    await sharp(src)
      .resize({ width: THUMB_BOX, height: THUMB_BOX, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: THUMB_Q, effort: 5 })
      .toFile(path.join(OUT_DIR, 'thumb', `${base}.webp`));

    // 全尺寸：原生像素
    await sharp(src).avif({ quality: FULL_AVIF_Q, effort: FULL_AVIF_EFFORT }).toFile(path.join(OUT_DIR, 'full', `${base}.avif`));
    await sharp(src).webp({ quality: FULL_WEBP_Q, effort: FULL_WEBP_EFFORT }).toFile(path.join(OUT_DIR, 'full', `${base}.webp`));

    const bytes = {
      src: (await stat(src)).size,
      thumb: (await stat(path.join(ROOT, 'public', thumbRel))).size,
      avif: (await stat(path.join(ROOT, 'public', avifRel))).size,
      webp: (await stat(path.join(ROOT, 'public', webpRel))).size,
    };
    totalSrc += bytes.src; totalThumb += bytes.thumb; totalAvif += bytes.avif; totalWebp += bytes.webp;

    const z = zh[it.slug] || {};
    items.push({
      slug: it.slug,
      title: it.title,
      zhTitle: z.zhTitle || it.title,
      desc: it.desc,
      zhDesc: z.zhDesc || it.desc,
      caption: it.caption,
      keywords: it.keywords,
      category: it.category,
      featured: it.featured,
      pathIndex: it.pathIndex,
      width: it.width,
      height: it.height,
      aspect: it.aspect,
      shape: shapeOf(it.aspect),
      shapeZh: SHAPE_ZH[shapeOf(it.aspect)],
      srcFile: it.file,
      thumb: thumbRel,
      full: { avif: avifRel, webp: webpRel },
      bytes,
    });
    process.stdout.write(`  ${String(i + 1).padStart(2)}/${items.length} ${it.slug}\n`);
  }

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString().slice(0, 10),
    source: upstream.source,
    categories: upstream.categories,
    items,
  };
  await mkdir(path.dirname(MANIFEST), { recursive: true });
  // 紧凑序列化：这是发给浏览器的运行时清单，体积优先
  await writeFile(MANIFEST, JSON.stringify(manifest) + '\n', 'utf8');

  const mb = (b) => (b / 1048576).toFixed(1);
  console.log(`\n✔ ${items.length} 张图，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  源 PNG      ${mb(totalSrc)} MB  →  AVIF ${mb(totalAvif)} MB / WebP ${mb(totalWebp)} MB / 缩略图 ${mb(totalThumb)} MB`);
  console.log(`  缩略图均值  ${Math.round(totalThumb / items.length / 1024)} KB`);
  console.log(`  全尺寸均值  AVIF ${Math.round(totalAvif / items.length / 1024)} KB · WebP ${Math.round(totalWebp / items.length / 1024)} KB`);
  console.log(`  清单 → data/diagrams.json (${(JSON.stringify(manifest).length / 1024).toFixed(1)} KB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });

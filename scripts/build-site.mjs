/**
 * 组装可发布站点：src/ → public/，data/diagrams.json → public/data/
 * 不依赖网络、不依赖上游，可在 Cloudflare Pages 构建环境中直接运行。
 */
import { cp, mkdir, rm, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src');
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');

async function main() {
  const manifestPath = path.join(DATA, 'diagrams.json');
  if (!(await stat(manifestPath).catch(() => null))) {
    throw new Error('缺少 data/diagrams.json —— 请先运行 npm run build:images');
  }

  // 静态资源
  for (const f of ['index.html', 'styles.css', 'app.js', 'favicon.svg', '_headers', '_redirects']) {
    await cp(path.join(SRC, f), path.join(PUBLIC, f), { force: true });
  }

  // 清单
  await mkdir(path.join(PUBLIC, 'data'), { recursive: true });
  await cp(manifestPath, path.join(PUBLIC, 'data', 'diagrams.json'), { force: true });

  // robots.txt：个人学习站，不进搜索引擎
  await writeFile(path.join(PUBLIC, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8');

  const man = JSON.parse(await readFile(manifestPath, 'utf8'));
  console.log(`✔ 站点已组装 → public/`);
  console.log(`  ${man.items.length} 张图 · ${man.categories.length} 个分类`);
  console.log(`  构建于 ${man.generatedAt}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

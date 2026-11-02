/**
 * 按固定 SHA 拉取上游图谱源文件。
 *
 * 上游仓库 nelsambrose/togaf-diagrams 已 404（作者账号疑被封禁），
 * 但其 fork 仍可访问且内容同步。这里锁定 fork + commit SHA，
 * 保证元数据与图片来源可复现，且不受上游消失影响。
 */
import { execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, rm, cp, readFile, stat, writeFile } from 'node:fs/promises';
import { readdirSync, existsSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';

export const SOURCE = {
  repo: 'JawharMobile/togaf-diagrams',
  owner: 'JawharMobile',
  sha: '0d1def098c1cc89ac90b36b3b12704d4957b6bc8',
  license: 'MIT',
  originalRepo: 'nelsambrose/togaf-diagrams',
  originalLicense: 'MIT',
  originalCopyright: 'Copyright (c) 2026 Nels Ambrose',
};

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'source-assets');
const TMP = path.join(ROOT, '.source-tmp');

const tarballUrl = `https://codeload.github.com/${SOURCE.repo}/tar.gz/${SOURCE.sha}`;

async function download(url, dest) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  const total = Number(res.headers.get('content-length') || 0);
  let got = 0;
  const last = Date.now();
  const out = createWriteStream(dest);
  const src = Readable.fromWeb(res.body);
  src.on('data', (c) => {
    got += c.length;
    if (Date.now() - last > 3000) {
      process.stdout.write(`  … ${(got / 1048576).toFixed(1)} MB${total ? ` / ${(total / 1048576).toFixed(1)} MB` : ''}\n`);
    }
  });
  await pipeline(src, out);
  return got;
}

async function main() {
  const force = process.argv.includes('--force');
  const marker = path.join(OUT, '.source.json');
  if (!force && (await stat(marker).catch(() => null))) {
    const meta = JSON.parse(await readFile(marker, 'utf8'));
    console.log(`源文件已存在（${meta.count} 张 PNG，SHA ${meta.sha.slice(0, 8)}）。加 --force 重新下载。`);
    return;
  }

  await rm(OUT, { recursive: true, force: true });
  await rm(TMP, { recursive: true, force: true });
  await mkdir(TMP, { recursive: true });

  console.log(`下载 ${tarballUrl}`);
  const tgz = path.join(TMP, 'source.tar.gz');
  const bytes = await download(tarballUrl, tgz);
  console.log(`  下载完成 ${(bytes / 1048576).toFixed(1)} MB`);

  console.log('解压…');
  // 用同步版本：execFile 的 promise 会在子进程真正退出前 resolve，导致读到半解压目录
  execFileSync('tar', ['-xzf', tgz, '-C', TMP], { stdio: ['ignore', 'ignore', 'inherit'] });

  const entries = readdirSync(TMP).filter((e) => e !== 'source.tar.gz');
  if (entries.length !== 1) throw new Error(`解压目录异常: ${entries.join(', ')}`);
  const root = path.join(TMP, entries[0]);
  if (!existsSync(path.join(root, 'docs', 'diagrams'))) throw new Error('解压缺少 docs/diagrams');

  await mkdir(path.join(OUT, 'diagrams'), { recursive: true });
  await cp(path.join(root, 'docs', 'diagrams'), path.join(OUT, 'diagrams'), { recursive: true });

  // 上游元数据文件，供 extract-metadata.mjs 使用
  await mkdir(path.join(OUT, '_upstream'), { recursive: true });
  for (const f of ['index.html', 'README.md', 'sitemap.xml', 'scripts/diagram-exceptions.txt']) {
    await cp(path.join(root, f), path.join(OUT, '_upstream', path.basename(f)), { force: true });
  }

  await rm(TMP, { recursive: true, force: true });

  const pngs = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.png')) pngs.push(path.relative(OUT, p));
    }
  };
  walk(path.join(OUT, 'diagrams'));

  await writeFile(
    marker,
    JSON.stringify({ ...SOURCE, count: pngs.length, files: pngs.sort() }, null, 2)
  );
  if (pngs.length !== 47) throw new Error(`期望 47 个 PNG，实际 ${pngs.length}`);
  console.log(`完成：${pngs.length} 个 PNG → source-assets/diagrams/`);
}

main().catch((e) => {
  console.error('fetch 失败:', e.message);
  process.exit(1);
});

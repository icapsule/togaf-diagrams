# TOGAF 图谱学习站

46 张 TOGAF 10 架构图的可导航、可缩放、带学习进度的**个人学习站**。纯静态、零后端、
零第三方运行时依赖，手机端可用。

![46 张 TOGAF 10 架构图](https://img.shields.io/badge/diagrams-46-3f5bd9) ![9 分类](https://img.shields.io/badge/categories-9-3f5bd9) ![MIT](https://img.shields.io/badge/diagrams-MIT-green) ![site-MIT-green)

## 功能

- **三种导航路径** —— 网格浏览 / 9 个主题分类 / 全文搜索（中英文均可）
- **20 步推荐学习路径** —— 按 ADM 推进顺序排列，首页可直接展开
- **三种阅读模式** —— 适应屏幕 / 适应宽度 / 1:1 原生像素；
  支持双击缩放、滚轮缩放（⌘/Ctrl）、双指捏合、放大后拖拽平移
- **键盘与手势** —— `←` `→` 翻页、`Esc` 返回、`/` 聚焦搜索、`0` `W` `1` 切换模式；
  移动端左右滑动翻页
- **深链** —— 每张图都有独立地址（`#/d/<slug>`），可收藏、可分享
- **学习进度** —— 标记已读、进度环、"只看未读"筛选，数据存在浏览器 localStorage
- **形态筛选** —— 图谱宽高比从 0.43（竖长）到 1.50（横宽）差异极大，
  可按 横版 / 方版 / 竖版 快速定位

## 性能

原始 PNG 共 **67 MB**，构建后：

| 产物 | 体积 | 均值 |
|---|---|---|
| AVIF 全尺寸 | 4.3 MB | 95 KB |
| WebP 全尺寸 | 7.4 MB | 165 KB |
| 缩略图（480px 内） | 1.1 MB | 24 KB |

- **首屏传输约 217 KB**（HTML + CSS + JS + 清单 + 首屏缩略图）
- 网格只加载缩略图；全尺寸图仅在打开详情时按需加载
- 文件名带内容哈希（sha8），配合 `Cache-Control: immutable` 强缓存
- 无外部字体、无第三方脚本、无外部请求

## 本地运行

```bash
npm install          # 仅一个依赖：sharp（构建期用）
npm run dev          # http://localhost:4321
```

## 目录结构

```
.
├── src/                    站点源码（无框架、无第三方 JS）
│   ├── index.html  styles.css  app.js  favicon.svg
│   └── _headers  _redirects      Cloudflare Pages 配置
├── data/
│   ├── upstream.json       46 条源元数据（锁定上游，防上游消失）
│   ├── zh-content.json     46 条中文标题与说明
│   └── diagrams.json       构建产物清单（尺寸/体积/哈希路径）
├── scripts/
│   ├── fetch-source.mjs    按固定 SHA 拉取源 PNG → source-assets/
│   ├── extract-metadata.mjs 从上游 index.html/README/sitemap 抽取元数据
│   ├── build-images.mjs    sharp → 缩略图 + AVIF/WebP + diagrams.json
│   ├── build-site.mjs      src/ → public/（CF Pages 构建命令）
│   ├── validate.mjs        完整性校验
│   └── serve.mjs           本地静态预览服务器
└── public/                 构建产物（已提交，CF Pages 输出目录）
```

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run fetch` | 拉取源图到 `source-assets/`（约 83 MB，已 gitignore） |
| `npm run extract` | 从上游文件重新抽取元数据 → `data/upstream.json` |
| `npm run build:images` | 重新生成图片产物与清单（约 40 秒） |
| `npm run build:site` | 组装 `public/`（秒级、离线） |
| `npm run build` | 两者都跑 |
| `npm run validate` | 校验元数据 ↔ 源文件 ↔ 产物三方一致 |
| `npm run deploy` | 组装并推送到 Cloudflare Pages |

## 部署到 Cloudflare Pages

```bash
npx wrangler login                                   # 一次（浏览器授权）
npx wrangler pages project create togaf-diagrams     # 只需一次
npm run deploy                                       # 每次发布
```

或直接在 Cloudflare 控制台连接本仓库：

- **构建命令**：`npm run build:site`
- **输出目录**：`public`

`public/` 已提交进仓库，所以构建不依赖网络，也不会因为上游消失而失败。

## 更新图谱

上游原仓库已不可访问，因此本站固定了 fork 的 commit SHA。若日后有更新：

1. 改 `scripts/fetch-source.mjs` 里的 `SOURCE.sha`
2. `npm run fetch && npm run extract && npm run build`
3. `npm run validate`

元数据与中文文案分别锁在 `data/upstream.json` 与 `data/zh-content.json`，
即使上游彻底消失，已构建的站点也不受影响。

## 许可

- 本站代码：MIT（见 `LICENSE`）
- 架构图谱：**MIT，作者 Nels Ambrose**，来自 `nelsambrose/togaf-diagrams`
  （实际取自 fork `JawharMobile/togaf-diagrams` @ `0d1def0`）

完整声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

图谱是对 TOGAF 概念的社区化简化解读，与 The Open Group 无隶属关系；
TOGAF 是 The Open Group 的注册商标。请以官方文档为准。

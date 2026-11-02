# 第三方资源与许可声明

## TOGAF 架构图谱（第三方内容）

本站收录的 46 张 TOGAF 架构图谱**全部来自第三方**，本站不主张对其版权。

| 项目 | 内容 |
|---|---|
| 原仓库 | `nelsambrose/togaf-diagrams`（作者 Nels Ambrose） |
| 原仓库状态 | 已不可访问（HTTP 404） |
| 实际来源 | fork `JawharMobile/togaf-diagrams` |
| 固定 commit | `0d1def098c1cc89ac90b36b3b12704d4957b6bc8`（2026-08-24） |
| 许可协议 | **MIT License** |
| 版权声明 | Copyright (c) 2026 Nels Ambrose |

MIT 协议全文见该仓库的 `LICENSE` 文件。MIT 允许自由使用、复制、修改、合并、发布、
再分发与销售，**且不强制署名**。本站仍在「关于」页保留了出处链接与致谢。

### 本站对这些图做了什么

仅做**技术性再处理**，未改动图的内容：

- 从 PNG 重新编码为 AVIF / WebP / 缩略图（`scripts/build-images.mjs`）
- 补齐中文标题与中文说明（`data/zh-content.json`，属本站的翻译工作）
- 建立分类、学习路径、搜索索引与阅读进度

### 商标与免责声明

- **TOGAF** 与 **The Open Group** 是 The Open Group 的注册商标。
- 这些图是对 TOGAF 概念的社区化简化解读，**不是** The Open Group 的权威材料，
  与 The Open Group 无隶属或背书关系。备考与实际项目请以官方 TOGAF 文档为准。

## 本站自身代码

MIT License — 见仓库根目录的 `LICENSE` 文件。Copyright (c) 2026 icapsule。

运行时依赖：[sharp](https://github.com/lovell/sharp)（Apache-2.0），
仅用于构建期生成图片产物，不进入浏览器运行时。

## 本地 PDF（未发布）

仓库工作区内的两份 The Open Group PDF **不在本仓库中**（已被 `.gitignore` 排除），
也未部署到线上站点：

- *The TOGAF® Standard, 10th Edition — Introduction and Core Concepts*
- *The TOGAF® Enterprise Architecture Foundation Study Guide*

两者均为 The Open Group 的受版权保护内容，其中学习指南首页明确写有
"Personal PDF Edition. Not for redistribution."。如需在线提供，请自行评估授权问题。

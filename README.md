# 近代日本史研究日报

每天 06:00（Asia/Shanghai）自动生成一份中文简报，从**中文、英文、日文、韩文**四语学术来源中筛出近代日本史（1868 年以后）的新论文与专著。每条只保留**标题**和**两三句简介**，不展示影响因子、引用数或标签。

输出三份：静态网页（含归档）、RSS、邮件。

> 第一次上手请直接看 [SETUP.md](SETUP.md)：四步完成 OpenAlex key、DeepSeek、KCI 与 GitHub/Vercel 部署，每步都有验证方法。

## 快速开始

需要 Node.js ≥ 22.9（用到内置 TypeScript 类型擦除与 `--env-file-if-exists`）。

```bash
pnpm install
cp .env.example .env      # 至少填 OPENALEX_KEY，其余可选

# 抓取 + 选题 + 生成日报 + 渲染站点 + 写邮件到 data/outbox/
pnpm run run

# 打开 public/index.html 预览
```

如果 Node 没有加进系统 PATH，用同目录下的批处理代替：`.\run.cmd run`、`.\run.cmd doctor`。

不配任何 key 也能跑：OpenAlex/Crossref/J-STAGE 可匿名访问，邮件默认写入 `data/outbox/` 而不发送。

## 命令

| 命令 | 作用 |
| --- | --- |
| `pnpm run doctor` | 逐个探测数据源连通性与 key 是否就绪 |
| `pnpm run collect` | 只抓取并落盘到 `data/items/*.jsonl` |
| `pnpm run digest` | 从已落盘数据中筛选题录，生成 `data/digests/YYYY-MM-DD.json` |
| `pnpm run site` | 把 `data/digests` 渲染成 `public/` |
| `pnpm run send` | 按 `EMAIL_PROVIDER` 发送当日邮件（默认 dry-run） |
| `pnpm run run` | 以上四步串起来 |
| `pnpm run backfill -- --days 30` | 用已有数据回填最近 30 天归档 |
| `pnpm run jstor` | 强制重新下载 JSTOR KBART 书目清单 |
| `pnpm test` / `pnpm run check` | 单元测试 / 类型检查 + 测试 |

常用参数：`--date 2026-11-01`、`--offline`（不联网，只用本地数据）、`--no-llm`、`--ignore-seen`（回填时忽略去重记录）。

## 数据源

| 语言 | 来源 | 说明 |
| --- | --- | --- |
| 英 | OpenAlex | 主源，摘要、引用数、FWCI、图书与章节 |
| 英 | Crossref | 学术出版社新书（ISBN） |
| 英 | **JSTOR** | 见下节 |
| 日 | J-STAGE | 日文期刊，参数 `article=` |
| 日 | CiNii Research | 需 `CINII_APPID` |
| 日 | NDL Search | 需 `NDL_APPID`，默认关闭 |
| 韩 | KCI | 需 `KCI_API_KEY` |
| 中 | OpenAlex | `language:zh` + 关键词 |
| 中 | 期刊目次 | 内置《日本学刊》适配器（`rbxk.ajcass.com`），可加刊 |

### JSTOR 是怎么接的

JSTOR 的 XML Gateway（SRU）只对签署 Metasearch 许可的机构开放，个人无法申请；也没有公开的检索 API。因此本项目：

1. 每周下载 JSTOR 公开的 **KBART 书目清单**（期刊 + 图书），在本地建立 `ISSN / ISBN → 收录区间` 索引；
2. 对已抓到的条目做匹配，命中且出版年在覆盖区间内，就生成官方 **OpenURL** 链接：`https://www.jstor.org/openurl?issn=…&volume=…&spage=…`（图书用 `?isbn=`）；
3. 命中 JSTOR 的条目在排序中加 0.05，并优先使用 JSTOR 链接。

这本版清单的图书文件约 68 MB，所以只在缓存过期（默认 7 天）时下载一次。若你有机构授权，可设置 `JSTOR_SRU_URL` 等变量启用 `fetchJstorSru()`（实验性）。

需要说明：JSTOR 对新刊通常有 3–5 年移动墙，日报的「新」主要由其他来源提供；JSTOR 在这里的作用是**确认收录并给出稳定链接**。

## 筛选与排序

1. **规则预筛**（`config/topics.yaml`）：必须同时命中「日本」词根与「近代」词根，并排除金融、动漫、旅游等噪声。
2. **综合评分**（`config/weights.yaml`）：期刊/出版社等级 0.30、引用速度 0.25、相关度 0.20、时效 0.15、多源命中 0.10、JSTOR 收录 0.05。
3. **配额**：单刊 ≤3、单语 ≤5、专著 ≤3，并保证四语每日各有下限；某语种当天没有新条目时从近 7 天补录，并在页面顶部注明。

「影响力」在这里指**预期影响力**：人文社科的新书新文引用数接近零，评分只能反映发表平台与时效，不能当作学术评价。

## 简介从哪来

配置 `LLM_API_KEY`（任意 OpenAI 兼容接口，默认 DeepSeek）后，每个条目会生成中文标题与 80–120 字简介，并缓存到 `data/cache/llm/`，重跑不重复计费。

没有配置时，简介退回为原文摘要（截断 180 字）；J-STAGE 等没有摘要的条目会显示「摘要未公开，请见原文」。

## 部署（零服务器成本）

### 1. 代码托管

推到 GitHub 私有或公开仓库均可。

### 2. 站点：Vercel

导入仓库，Vercel 会读取 `vercel.json`：

- Build Command：`node --experimental-strip-types pipeline/cli.ts site`
- Output Directory：`public`

每次 Action 提交 `data/` 后会自动重新部署。

### 3. 每日任务：GitHub Actions

`.github/workflows/daily.yml` 已就绪，默认 `0 22 * * *`（UTC）= 北京时间 06:00。在仓库 Settings → Secrets and variables 中按需添加：

| Secret | 必填 | 说明 |
| --- | --- | --- |
| `OPENALEX_KEY` | 建议 | 免费申请：<https://openalex.org/settings/api> |
| `LLM_API_KEY` | 可选 | 生成中文简介 |
| `KCI_API_KEY` | 可选 | 韩文覆盖 |
| `CINII_APPID` / `NDL_APPID` | 可选 | 日文覆盖 |
| `EMAIL_PROVIDER` | 可选 | `buttondown` / `resend` / 留空（dry-run） |
| `BUTTONDOWN_API_KEY` / `RESEND_API_KEY` | 可选 | 邮件发送 |
| `EMAIL_FROM` / `EMAIL_TO` | 可选 | Resend 时需要 |

另有仓库变量 `SITE_URL`（如 `https://your-app.vercel.app`），用于 RSS 与邮件里的绝对链接。

### 4. 首次回填

Actions 页面手动运行一次 `workflow_dispatch`，或在本地：

```bash
pnpm run collect
pnpm run backfill -- --days 30
pnpm run site
```

## 目录结构

```
pipeline/
  cli.ts              命令入口
  collect.ts          各源抓取与归一化
  normalize.ts        统一 Item 结构
  dedupe.ts           DOI / ISBN / 标题指纹合并
  relevance.ts        四语规则筛选
  score.ts            影响力评分
  summarize.ts        可选的 LLM 中文简介
  digest.ts           配额选题、生成日报
  email.ts            邮件发送（Buttondown / Resend / dry-run）
  lib/                配置、HTTP、存储、类型
  sources/            openalex crossref jstage kci cinii ndl jstor
  site/               模板、样式、静态渲染
config/               topics / venues / weights / sources
data/                 items（按月分片）、digests、jstor 索引、缓存
public/               渲染产物（部署目录，已 gitignore）
tests/                node:test 单元测试
```

## 测试

```bash
pnpm run check
```

覆盖：四语相关性判定、去重合并、JSTOR KBART 解析与 OpenURL 生成、评分排序、语言识别。

## 已知限制

- **中文覆盖最弱**：`近代史研究`、`世界历史` 等核心刊既没有 DOI，也不在 OpenAlex/Crossref 中；CNKI、万方、国家哲学社会科学文献中心都没有公开 API。项目里做了一个《日本学刊》目次适配器（`pipeline/sources/cnjournals.ts`），但该刊以当代政治经济为主，历史栏目不是每期都有，所以中文条目仍可能为零，页面会显示「今日暂无中文文献」。补充办法：把条目放进 `data/manual/*.json`，或照适配器再加一本刊。
- **韩文依赖 KCI key**：没有 key 时韩文条目只能靠 OpenAlex 的 `language:ko` 兜底。
- **JSTOR 有移动墙**：见上文。
- **CiNii/NDL 在部分网络环境不可达**：抓取失败会跳过，不影响其他源。
- **评分不等于质量**：请把它当作筛选器。

## 设计取舍

- 用 Node 内置的 TypeScript 类型擦除，不引入构建步骤；`pipeline` 与站点共用同一套 `.ts`。
- 站点是纯静态渲染（无框架、无客户端 JS），构建秒级完成，任何静态托管都能放。
- 数据以 JSON/JSONL 提交进仓库，可审计、可回溯、可 diff，不需要数据库。
- 所有外部调用都有超时、重试与降级；单源失败不会阻断出报。

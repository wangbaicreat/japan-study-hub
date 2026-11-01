# 上手清单：四步把日报跑起来

按顺序做，每步都有「怎么做」和「怎么验证」。全部做完大约 40 分钟，其中大部分是等邮件和等部署。

前置：Node.js ≥ 22.9，项目已 `pnpm install`。

本文的命令统一写成 `.\run.cmd <子命令>`（在项目目录里执行）。它只做两件事：找到 node，并加载 `.env`。如果你已经把 Node 加进系统 PATH，把 `.\run.cmd` 换成 `pnpm run` 也一样。

---

## 第 1 步：申请 OpenAlex key（必做，5 分钟）

**为什么**：匿名访问是全网络共享的 $0.10/天额度，跑两三次就会 429；有自己的 key 后是 $1/天，日常用不到十分之一。

**怎么做**

1. 打开 <https://openalex.org/settings/api>，用邮箱注册/登录。
2. 点 **Create API key**，复制生成的字符串。
3. 写进 `.env`：

```bash
OPENALEX_KEY=你的key
```

**怎么验证**

```bash
.\run.cmd doctor
```

应该看到 `OpenAlex     HTTP 200`，且不再出现 `No API key, so this request shares one free daily budget` 的提示。再跑一次 `.\run.cmd collect`，日志里不应出现 429。

> 不想注册也可以用一行命令申请：`curl -X POST https://api.openalex.org/api-keys -H "content-type: application/json" -d '{"email":"你的邮箱"}'`，然后去邮箱点确认链接。

---

## 第 2 步：决定是否接 DeepSeek 生成中文简介（建议做，10 分钟）

**不接会怎样**：日报照常出，但「简介」是原文摘要——英文条目就是英文，日文条目就是日文。功能不缺，只是不统一。

**接了会怎样**：每条生成中文标题 + 80–120 字中文简介，并缓存，重跑不重复花钱。按每天 15 条估算，一个月约 ¥1–3。

**怎么做**

1. 打开 <https://platform.deepseek.com/>，注册并充值（10 元起）。
2. 「API keys」→ 新建，复制。
3. 写进 `.env`：

```bash
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=sk-你的key
LLM_MODEL=deepseek-chat
```

**怎么验证**

```bash
.\run.cmd digest --date 2026-11-01
```

然后打开 `data/digests/2026-11-01.json`，随便找一条看有没有 `titleZh` 和 `introZh`；`stats.llmCalls` 应该大于 0，`stats.costUsd` 是这次的花费。

> 用别的模型也行，只要是 OpenAI 兼容接口（通义、智谱、Kimi、硅基流动都提供）。改 `LLM_BASE_URL` 和 `LLM_MODEL` 即可。

---

## 第 3 步：注册 KCI key 补韩文（可选，10 分钟）

**为什么**：没有 key 时韩文只能靠 OpenAlex 的 `language:ko` 兜底，一天常常只有 0–2 条。

**怎么做**

1. 打开 <https://openci.kci.go.kr>，注册账号（部分流程需要韩国手机号或机构邮箱；没有就跳过这步，不影响其他功能）。
2. 在「OPEN API」里申请认证键。
3. 写进 `.env`：

```bash
KCI_API_KEY=你的key
```

**怎么验证**

```bash
.\run.cmd collect
```

日志里应出现 `[kci] N articles`，而不是 `KCI_API_KEY not set; skipping`。

---

## 第 4 步：推 GitHub + 接 Vercel（必做，15 分钟）

### 4.1 安装 Git

这台机器目前没有 Git。装 [Git for Windows](https://git-scm.com/download/win)，或直接用 [GitHub Desktop](https://desktop.github.com/)。

### 4.2 推到 GitHub

在 GitHub 新建一个空仓库（私有即可），然后在项目目录执行：

```bash
cd nihon-digest
git init
git add .
git commit -m "init: nihon digest"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

`.gitignore` 已经排除了 `node_modules/`、`public/`、`data/cache/`、`data/jstor/*.tsv`，仓库只有几百 KB。

### 4.3 配置 Secrets

仓库 → **Settings → Secrets and variables → Actions → New repository secret**，逐个添加：

| 名称 | 值 |
| --- | --- |
| `OPENALEX_KEY` | 第 1 步的 key |
| `LLM_API_KEY` | 第 2 步的 key（不接就不加） |
| `LLM_BASE_URL` | `https://api.deepseek.com/v1` |
| `LLM_MODEL` | `deepseek-chat` |
| `KCI_API_KEY` | 第 3 步的 key（没有就不加） |
| `EMAIL_PROVIDER` | `buttondown` 或 `resend`；不填则只写本地文件 |

同一页面的 **Variables** 标签下加一个 `SITE_URL`，值是稍后 Vercel 给的域名，例如 `https://nihon-digest.vercel.app`。

### 4.4 接 Vercel

1. <https://vercel.com/new> → 选这个仓库 → Import。
2. Framework Preset 选 **Other**。`vercel.json` 已经写好：
   - Build Command：`node --experimental-strip-types pipeline/cli.ts site`
   - Output Directory：`public`
3. Deploy。首次部署时 `data/` 里已有示例数据，所以能直接出页面。

### 4.5 手动跑一次

仓库 → **Actions → daily-digest → Run workflow**，日期留空（默认今天）。

跑完后检查三处：

- Actions 日志末尾出现 `[email] ... ok=true`；
- 仓库多了一个 `data: digest ...` 的提交；
- Vercel 自动重新部署，首页出现当天的日报。

之后每天 UTC 22:00（北京时间 06:00）自动执行。

---

## 邮件服务（可选）

不想自己维护订阅列表，用 Buttondown：

1. <https://buttondown.email/> 注册，免费档 100 订阅者。
2. Settings → API → 复制 key。
3. Secrets 里加 `BUTTONDOWN_API_KEY`，`EMAIL_PROVIDER` 设为 `buttondown`。

或 Resend（每天 100 封免费）：加 `RESEND_API_KEY`、`EMAIL_FROM`、`EMAIL_TO`，`EMAIL_PROVIDER=resend`。Resend 需要先验证发信域名。

不配置时，邮件会写成 `data/outbox/YYYY-MM-DD.html`，可以直接用浏览器打开看效果。

---

## 常见问题

**Q：OpenAlex 还是 429？**
确认 `.env` 里的 key 没有多余空格；`.\run.cmd doctor` 看是否真的读到了。key 生效后额度是 $1/天，正常一天 20 次请求约 $0.02。

**Q：中文还是天天为零？**
《日本学刊》适配器只抓「本期文章」，一期通常 6 篇，且不一定是历史栏目。历史类文章出现时会被自动收进来。要补更多中文文献，把条目写进 `data/manual/*.json`（格式见该目录的 README），或者照 `pipeline/sources/cnjournals.ts` 再加一本刊。

**Q：JSTOR 一条都匹配不上？**
正常。JSTOR 有 3–5 年移动墙，新刊还没上架；它的作用是确认收录并给出稳定链接，见关于页说明。

**Q：Actions 报 `--test-isolation` 不认识？**
把 `package.json` 里 `test` 脚本的 `--test-isolation=none` 去掉，改为 `node --experimental-strip-types --test "tests/**/*.test.ts"`，CI 里允许子进程，不需要这个参数。

**Q：Vercel 构建失败 `Unknown file extension ".ts"`？**
说明 Node 版本低于 22.6。在 Vercel 项目 Settings → General → Node.js Version 选 22.x。

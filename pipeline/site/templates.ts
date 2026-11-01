import type { Digest, Item } from "../lib/types.ts";
import { escapeHtml, truncate } from "../lib/util.ts";

export const SITE_TITLE = "近代日本史研究日报";
export const SITE_DESCRIPTION =
  "每天从中、英、日、韩四语学术来源中筛选近代日本史（1868 年以后）的新论文与专著，只给标题与简介。";

export function siteUrl(): string {
  return (process.env.SITE_URL ?? "https://nihon-digest.vercel.app").replace(/\/$/, "");
}

export function formatDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}

export function introOf(item: Item): string {
  if (item.introZh) return item.introZh;
  if (item.abstract) {
    return truncate(item.abstract, 180);
  }
  return "（摘要未公开，请见原文。）";
}

function linkOf(item: Item): string {
  return item.jstor?.url ?? item.ids.url;
}

function nav(active: string, prefix: string): string {
  const links: [string, string, string][] = [
    [`${prefix}`, "今日", "home"],
    [`${prefix}archive.html`, "往期", "archive"],
    [`${prefix}books.html`, "专著", "books"],
    [`${prefix}about.html`, "关于", "about"],
  ];
  return `<nav class="top">${links
    .map(
      ([href, label, key]) =>
        `<a href="${href || "./"}"${key === active ? ' aria-current="page"' : ""}>${label}</a>`,
    )
    .join("")}<a href="${prefix}feed.xml">RSS</a></nav>`;
}

export function page(options: {
  title: string;
  description?: string;
  body: string;
  active?: string;
  /** "" for root pages, "../" for pages inside /archive/. */
  prefix?: string;
}): string {
  const prefix = options.prefix ?? "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(options.title)}</title>
<meta name="description" content="${escapeHtml(options.description ?? SITE_DESCRIPTION)}">
<link rel="alternate" type="application/rss+xml" title="${SITE_TITLE}" href="${prefix}feed.xml">
<link rel="stylesheet" href="${prefix}assets/style.css">
</head>
<body>
<div class="wrap">
<header class="site"><div class="bar">
  <a class="brand" href="${prefix || "./"}">近代日本史<span>研究日报</span></a>
  ${nav(options.active ?? "", prefix)}
</div></header>
${options.body}
<footer class="site">
  <span>数据来源：OpenAlex · Crossref · JSTOR · J-STAGE · CiNii · KCI</span>
  <a href="${prefix}feed.xml">RSS</a>
  <a href="${prefix}about.html">方法与局限</a>
</footer>
</div>
</body>
</html>`;
}

function renderItem(item: Item): string {
  const zh = item.titleZh && item.titleZh !== item.title
    ? `<p class="item-title-zh">${escapeHtml(item.titleZh)}</p>`
    : "";
  return `<li>
  <p class="item-title"><a href="${escapeHtml(linkOf(item))}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a></p>
  ${zh}
  <p class="item-intro">${escapeHtml(introOf(item))}</p>
</li>`;
}

function renderSection(title: string, hint: string, items: Item[], emptyText: string): string {
  if (items.length === 0) {
    return `<section class="block"><h2>${title}</h2><div class="hint">${hint}</div><p class="empty">${emptyText}</p></section>`;
  }
  return `<section class="block">
  <h2>${title}</h2>
  <div class="hint">${hint}</div>
  <ol class="items">${items.map(renderItem).join("\n")}</ol>
</section>`;
}

export function digestBody(digest: Digest): string {
  const paperCount = digest.sections.papers.length;
  const bookCount = digest.sections.books.length;
  const notices = digest.notices
    .map((notice) => `<div class="notice">${escapeHtml(notice)}</div>`)
    .join("\n");

  return `<article class="digest-head">
  <h1 class="date">${formatDate(digest.date)}</h1>
  <div class="sub">${SITE_TITLE} · 论文 ${paperCount} 篇 · 专著 ${bookCount} 部</div>
  <div class="rule"></div>
</article>
${notices}
${renderSection("论文", "PAPERS", digest.sections.papers, "今日没有通过筛选的新论文。")}
${renderSection("专著", "BOOKS", digest.sections.books, "今日没有通过筛选的新专著。")}`;
}

export function digestPage(digest: Digest, prefix = "", active = "home"): string {
  return page({
    title: `${formatDate(digest.date)} · ${SITE_TITLE}`,
    body: digestBody(digest),
    active,
    prefix,
  });
}

export function archivePage(digests: Digest[], prefix = ""): string {
  const byMonth = new Map<string, Digest[]>();
  for (const digest of [...digests].reverse()) {
    const month = digest.date.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), digest]);
  }
  const sections = [...byMonth.entries()]
    .map(([month, entries]) => {
      const [year, mon] = month.split("-");
      const rows = entries
        .map((digest) => {
          const count = digest.sections.papers.length + digest.sections.books.length;
          return `<li><a href="${prefix}archive/${digest.date}.html">${formatDate(digest.date)}</a><span class="count">${count} 条</span></li>`;
        })
        .join("");
      return `<div class="month">${year} 年 ${Number(mon)} 月</div><ul class="archive">${rows}</ul>`;
    })
    .join("\n");

  return page({
    title: `往期 · ${SITE_TITLE}`,
    body: `<article class="digest-head"><h1 class="date">往期</h1><div class="sub">共 ${digests.length} 期</div><div class="rule"></div></article>
${sections || '<p class="empty">还没有归档。</p>'}`,
    active: "archive",
  });
}

export function booksPage(digests: Digest[], prefix = ""): string {
  const books = digests.flatMap((digest) => digest.sections.books);
  const seen = new Set<string>();
  const unique = books.filter((book) => {
    if (seen.has(book.id)) return false;
    seen.add(book.id);
    return true;
  });

  return page({
    title: `专著 · ${SITE_TITLE}`,
    body: `<article class="digest-head"><h1 class="date">专著</h1><div class="sub">已收录 ${unique.length} 部</div><div class="rule"></div></article>
<section class="block"><h2>BOOKS</h2><div class="hint">按收录时间倒序</div>
<ol class="items">${unique.map(renderItem).join("\n") || '<li class="empty">暂无。</li>'}</ol></section>`,
    active: "books",
    prefix,
  });
}

export function aboutPage(prefix = ""): string {
  return page({
    title: `关于 · ${SITE_TITLE}`,
    body: `<article class="digest-head"><h1 class="date">关于</h1><div class="rule"></div></article>
<div class="prose">
<p>这是一份每天自动生成的近代日本史（1868 年以后）研究简报，覆盖中文、英文、日文、韩文四种语言的论文与专著。每条只保留<b>标题</b>与<b>两三句简介</b>，不堆砌指标。</p>

<h2>数据从哪里来</h2>
<ul>
  <li><b>OpenAlex</b>：英文及其他语种论文与专著的主力来源，提供摘要与引用数据。</li>
  <li><b>Crossref</b>：学术出版社的新书（ISBN、出版社）。</li>
  <li><b>JSTOR</b>：JSTOR 没有公开检索接口，本站使用其公开的 KBART 书目清单判断某刊/某书是否被收录，再通过官方 OpenURL 生成链接。只有机构持有 Metasearch 许可时才可启用 SRU 检索。</li>
  <li><b>J-STAGE / CiNii / NDL</b>：日文期刊、学位论文与图书。</li>
  <li><b>KCI</b>：韩国学术期刊引文索引。</li>
</ul>

<h2>如何筛选</h2>
<p>先用四种语言的关键词规则判断「是否属于近代日本史」，再用一个综合分数排序：期刊/出版社等级、引用速度、相关度、时效性、是否被多个来源同时收录、是否被 JSTOR 收录。每日固定配额，并保证四种语言都有机会出现。</p>

<h2>「影响力」的局限</h2>
<p>人文社科的引用高峰往往在出版后三到五年，新书新文的引用数接近零。因此这里的分数衡量的是<b>预期影响力</b>（发表在什么刊物、什么出版社、被几个库同时收录），而不是已经发生的影响力。请把它当作筛选器，不要当作评价结论。</p>

<h2>已知缺口</h2>
<ul>
  <li><b>中文覆盖最弱</b>：《近代史研究》《世界历史》等核心刊没有 DOI，也不在 OpenAlex/Crossref 里。项目内置了《日本学刊》的目次适配器，但该刊以当代政治经济为主，历史栏目并非每期都有，因此中文条目仍可能为零，页面会提示「今日暂无中文文献」。可在 <code>data/manual/*.json</code> 手工补录后重新生成。</li>
  <li>JSTOR 的新刊通常有 3–5 年移动墙，日报里的「新」主要由其他来源提供；JSTOR 在这里主要用来确认收录并给出稳定链接。</li>
  <li>没有配置大模型时，简介会退回为原文摘要（不翻译）。配置后可生成中文标题与中文简介。</li>
  <li>韩文依赖 KCI 的免费 key；没有 key 时只能靠 OpenAlex 兜底。</li>
</ul>

<h2>订阅</h2>
<p>RSS：<a href="${prefix}feed.xml">${prefix}feed.xml</a>。邮件订阅需要部署时接入 Buttondown 或 Resend，具体步骤见仓库 README。</p>
<p class="muted">本站只展示题录与短摘要，不转载全文，不绕过任何付费墙。</p>
</div>`,
    active: "about",
    prefix,
  });
}

export function feedXml(digests: Digest[]): string {
  const base = siteUrl();
  const items = [...digests]
    .reverse()
    .slice(0, 60)
    .map((digest) => {
      const body = digestBody(digest);
      return `<item>
  <title>${escapeHtml(`${formatDate(digest.date)} · ${SITE_TITLE}`)}</title>
  <link>${base}/archive/${digest.date}.html</link>
  <guid isPermaLink="true">${base}/archive/${digest.date}.html</guid>
  <pubDate>${new Date(`${digest.date}T06:00:00+08:00`).toUTCString()}</pubDate>
  <description><![CDATA[${body}]]></description>
</item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${escapeHtml(SITE_TITLE)}</title>
  <link>${base}/</link>
  <description>${escapeHtml(SITE_DESCRIPTION)}</description>
  <language>zh-CN</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
  <atom:link href="${base}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
</channel>
</rss>`;
}

/** Inline-styled HTML for email clients. */
export function emailHtml(digest: Digest): string {
  const base = siteUrl();
  const rows = (items: Item[]) =>
    items
      .map(
        (item) => `<tr><td style="padding:18px 0;border-top:1px solid #e6e2d9;">
  <a href="${escapeHtml(linkOf(item))}" style="font-family:Georgia,'Songti SC',serif;font-size:18px;line-height:1.5;color:#1c1b19;text-decoration:none;">${escapeHtml(item.title)}</a>
  ${item.titleZh && item.titleZh !== item.title ? `<div style="color:#6b6862;font-size:14px;margin-top:4px;">${escapeHtml(item.titleZh)}</div>` : ""}
  <div style="color:#35322d;font-size:15px;line-height:1.7;margin-top:8px;">${escapeHtml(introOf(item))}</div>
</td></tr>`,
      )
      .join("");

  const section = (label: string, items: Item[]) =>
    items.length === 0
      ? ""
      : `<tr><td style="padding-top:28px;font-size:12px;letter-spacing:.18em;color:#9b2c2c;text-transform:uppercase;">${label}</td></tr>
<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows(items)}</table></td></tr>`;

  return `<!doctype html><html><body style="margin:0;background:#fbfaf7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbfaf7;"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;padding:32px 24px;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;">
<tr><td style="font-size:20px;font-weight:700;font-family:Georgia,'Songti SC',serif;">近代日本史<span style="color:#9b2c2c;">研究日报</span></td></tr>
<tr><td style="padding-top:18px;font-size:26px;font-weight:700;font-family:Georgia,'Songti SC',serif;">${formatDate(digest.date)}</td></tr>
<tr><td style="color:#6b6862;font-size:13px;padding-top:6px;">论文 ${digest.sections.papers.length} 篇 · 专著 ${digest.sections.books.length} 部</td></tr>
${section("论文", digest.sections.papers)}
${section("专著", digest.sections.books)}
<tr><td style="padding-top:32px;color:#6b6862;font-size:12px;border-top:1px solid #e6e2d9;">
  <a href="${base}/archive/${digest.date}.html" style="color:#9b2c2c;">网页版</a> ·
  <a href="${base}/feed.xml" style="color:#6b6862;">RSS</a> ·
  <a href="${base}/about.html" style="color:#6b6862;">方法与局限</a> ·
  <a href="{{unsubscribe_url}}" style="color:#6b6862;">退订</a>
</td></tr>
</table></td></tr></table></body></html>`;
}

export function emailText(digest: Digest): string {
  const base = siteUrl();
  const lines: string[] = [`${formatDate(digest.date)} · ${SITE_TITLE}`, ""];
  for (const [label, items] of [
    ["论文", digest.sections.papers],
    ["专著", digest.sections.books],
  ] as [string, Item[]][]) {
    if (items.length === 0) continue;
    lines.push(`【${label}】`);
    items.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.title}`);
      if (item.titleZh && item.titleZh !== item.title) lines.push(`   ${item.titleZh}`);
      lines.push(`   ${introOf(item)}`);
      lines.push(`   ${linkOf(item)}`);
      lines.push("");
    });
  }
  lines.push(`网页版：${base}/archive/${digest.date}.html`);
  return lines.join("\n");
}

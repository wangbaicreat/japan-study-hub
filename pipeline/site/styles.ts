export const CSS = `
:root {
  --bg: #fbfaf7;
  --paper: #ffffff;
  --ink: #1c1b19;
  --muted: #6b6862;
  --line: #e6e2d9;
  --accent: #9b2c2c;
  --accent-soft: #f4e7e4;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
    "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif;
  font-size: 16px;
  line-height: 1.75;
}
a { color: inherit; text-decoration: none; }
a:hover { color: var(--accent); }
.wrap { max-width: 760px; margin: 0 auto; padding: 0 24px 80px; }
header.site { border-bottom: 1px solid var(--line); margin-bottom: 36px; }
header.site .bar {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 16px; padding: 22px 0 16px; flex-wrap: wrap;
}
.brand {
  font-family: "Noto Serif SC", "Songti SC", "SimSun", serif;
  font-size: 20px; font-weight: 700; letter-spacing: .04em;
}
.brand span { color: var(--accent); }
nav.top { display: flex; gap: 18px; font-size: 14px; color: var(--muted); }
nav.top a:hover { color: var(--accent); }

.digest-head { margin: 8px 0 28px; }
.digest-head .date {
  font-family: "Noto Serif SC", "Songti SC", "SimSun", serif;
  font-size: 30px; font-weight: 700; letter-spacing: .02em; margin: 0 0 6px;
}
.digest-head .sub { color: var(--muted); font-size: 14px; }
.digest-head .rule { width: 48px; height: 3px; background: var(--accent); margin: 18px 0 0; }

section.block { margin: 40px 0 0; }
section.block h2 {
  font-family: "Noto Serif SC", "Songti SC", "SimSun", serif;
  font-size: 15px; font-weight: 700; letter-spacing: .18em; color: var(--accent);
  margin: 0 0 4px; text-transform: uppercase;
}
section.block .hint { color: var(--muted); font-size: 13px; margin-bottom: 18px; }

ol.items { list-style: none; margin: 0; padding: 0; }
ol.items > li { padding: 22px 0; border-top: 1px solid var(--line); }
ol.items > li:first-child { border-top: none; }
.item-title {
  font-family: "Noto Serif SC", "Songti SC", "SimSun", serif;
  font-size: 19px; line-height: 1.55; font-weight: 600; margin: 0;
}
.item-title a { border-bottom: 1px solid transparent; }
.item-title a:hover { border-bottom-color: var(--accent); color: var(--accent); }
.item-title-zh { color: var(--muted); font-size: 15px; margin: 6px 0 0; }
.item-intro { margin: 10px 0 0; color: #35322d; font-size: 15.5px; }
.item-link { display: inline-block; margin-top: 10px; font-size: 13px; color: var(--accent); }
.item-link::after { content: " ↗"; }

.empty { color: var(--muted); font-size: 15px; padding: 16px 0; }
.notice {
  background: var(--accent-soft); border-left: 3px solid var(--accent);
  padding: 10px 14px; font-size: 13.5px; color: #5c2320; margin: 0 0 20px;
}

footer.site {
  margin-top: 64px; padding-top: 22px; border-top: 1px solid var(--line);
  color: var(--muted); font-size: 13px; display: flex; flex-wrap: wrap; gap: 8px 20px;
}
footer.site a { color: var(--muted); }
footer.site a:hover { color: var(--accent); }

ul.archive { list-style: none; margin: 0; padding: 0; }
ul.archive li {
  display: flex; justify-content: space-between; gap: 16px;
  padding: 13px 0; border-bottom: 1px solid var(--line); font-size: 15px;
}
ul.archive li .count { color: var(--muted); font-size: 13px; white-space: nowrap; }
.month { font-size: 13px; letter-spacing: .16em; color: var(--muted); margin: 30px 0 6px; }

.prose h2 {
  font-family: "Noto Serif SC", "Songti SC", "SimSun", serif;
  font-size: 20px; margin: 34px 0 10px;
}
.prose p, .prose li { font-size: 15.5px; color: #35322d; }
.prose code {
  background: #f1ede4; padding: 1px 6px; border-radius: 4px; font-size: 13.5px;
}
.prose ul { padding-left: 20px; }
.prose .muted { color: var(--muted); font-size: 13.5px; }

@media (max-width: 560px) {
  .wrap { padding: 0 18px 60px; }
  .digest-head .date { font-size: 25px; }
  .item-title { font-size: 17.5px; }
}
`;

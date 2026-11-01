# 手工补录

开放索引覆盖不到的中文文献（例如只在 CNKI、万方、读秀上有的论文或专著），可以放到这个目录，抓取时会自动合并进候选池。

新建一个 `*.json` 文件，内容是一个数组，每个元素结构如下（除 `title`、`url` 外都可省略）：

```json
[
  {
    "source": "manual",
    "type": "article",
    "title": "明治维新与日本近代天皇制的形成",
    "lang": "zh",
    "authors": ["张三"],
    "publishedAt": "2026-09-15",
    "venueName": "世界历史",
    "doi": "10.0000/example",
    "url": "https://example.org/article/123",
    "abstract": "本文讨论……"
  }
]
```

字段说明：

- `type`：`article` | `book` | `chapter` | `review`
- `lang`：`zh` | `en` | `ja` | `ko`
- `publishedAt`：`YYYY-MM-DD`，只写年份或年月也可以
- `venueName`：期刊名或出版社名
- `isbn`：专著填写，便于 JSTOR 等来源匹配
- `abstract`：没有配置大模型时，这段文字会直接作为简介展示

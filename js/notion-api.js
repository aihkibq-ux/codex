/**
 * notion-api.js - Notion API integration layer
 */

const NotionAPI = (() => {
  const CONFIG = {
    workerUrl: "https://restless-wood-e19f.aihkibq.workers.dev/v1",
    databaseId: "32485b780a2580eaa67ecf051676d693",
    pageSize: 9,
  };

  const CATEGORY_ALL = "\u5168\u90e8"; // 全部
  const CATEGORY_TECH = "\u6280\u672f"; // 技术
  const CATEGORY_DESIGN = "\u8bbe\u8ba1"; // 设计
  const CATEGORY_THOUGHTS = "\u968f\u60f3"; // 随想
  const CATEGORY_TUTORIAL = "\u6559\u7a0b"; // 教程
  const CATEGORY_TOOL = "\u5de5\u5177"; // 工具
  const CATEGORY_FAVORITE = "\u6536\u85cf"; // 收藏

  const CATEGORIES = [
    { name: CATEGORY_ALL, emoji: "\uD83D\uDD0D", color: "cyan" },
    { name: CATEGORY_TECH, emoji: "\uD83D\uDCBB", color: "blue" },
    { name: CATEGORY_DESIGN, emoji: "\uD83C\uDFA8", color: "pink" },
    { name: CATEGORY_THOUGHTS, emoji: "\uD83E\uDDE0", color: "purple" },
    { name: CATEGORY_TUTORIAL, emoji: "\uD83D\uDCD8", color: "green" },
    { name: CATEGORY_TOOL, emoji: "\uD83E\uDDF0", color: "orange" },
    { name: CATEGORY_FAVORITE, emoji: "\uD83D\uDD16", color: "orange" },
  ];

  async function fetchFromNotion(category, fetchAll = false) {
    const cacheKey = `notion_query_${category || "all"}_${fetchAll}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < 1000 * 60 * 5) {
          return parsed.data;
        }
      }
    } catch (e) {}

    const body = {
      page_size: fetchAll ? 100 : CONFIG.pageSize,
      sorts: [{ property: "Date", direction: "descending" }],
    };

    if (category && category !== CATEGORY_ALL) {
      body.filter = {
        property: "Category",
        select: { equals: category },
      };
    }

    const res = await fetch(
      `${CONFIG.workerUrl}/databases/${CONFIG.databaseId}/query`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) throw new Error(`Notion API error: ${res.status}`);
    const data = await res.json();
    const mappedData = data.results.map(mapNotionPage);

    try {
      sessionStorage.setItem(
        cacheKey,
        JSON.stringify({
          timestamp: Date.now(),
          data: mappedData,
        }),
      );
    } catch (e) {}

    return mappedData;
  }

  async function liveQueryDatabase({ category, search, page = 1 }) {
    const needAll = Boolean(search);
    let results = await fetchFromNotion(category, needAll);

    if (search) {
      const q = search.toLowerCase();
      results = results.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.excerpt.toLowerCase().includes(q) ||
          (p.tags || []).some((t) => t.toLowerCase().includes(q)),
      );
    }

    const total = results.length;
    const totalPages = Math.max(1, Math.ceil(total / CONFIG.pageSize));
    const currentPage = Math.min(page, totalPages);
    const start = (currentPage - 1) * CONFIG.pageSize;
    const paged = results.slice(start, start + CONFIG.pageSize);

    return { results: paged, total, totalPages, currentPage };
  }

  async function liveGetPage(pageId) {
    const cacheKey = `notion_page_${pageId}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < 1000 * 60 * 10) {
          return parsed.data;
        }
      }
    } catch (e) {}

    const [pageRes, blocksRes] = await Promise.all([
      fetch(`${CONFIG.workerUrl}/pages/${pageId}`),
      fetch(`${CONFIG.workerUrl}/blocks/${pageId}/children?page_size=100`),
    ]);

    if (!pageRes.ok || !blocksRes.ok) throw new Error("Notion API error");

    const page = await pageRes.json();
    const blocks = await blocksRes.json();

    const mappedData = {
      ...mapNotionPage(page),
      content: blocks.results.map(mapNotionBlock),
    };

    try {
      sessionStorage.setItem(
        cacheKey,
        JSON.stringify({
          timestamp: Date.now(),
          data: mappedData,
        }),
      );
    } catch (e) {}

    return mappedData;
  }

  function mapNotionPage(page) {
    const props = page.properties || {};
    const category = props.Category?.select?.name || "";
    const cover = page.cover;
    const coverImage = cover?.external?.url || cover?.file?.url || null;
    return {
      id: page.id,
      title: props.Name?.title?.[0]?.plain_text || "Untitled",
      excerpt: props.Excerpt?.rich_text?.[0]?.plain_text || "",
      category,
      date: props.Date?.date?.start || "",
      readTime: props.ReadTime?.rich_text?.[0]?.plain_text || "",
      coverImage,
      coverEmoji: page.icon?.emoji || "\uD83D\uDCDD",
      coverGradient: gradientForCategory(category),
      tags: props.Tags?.multi_select?.map((t) => t.name) || [],
    };
  }

  function gradientForCategory(category) {
    const map = {
      [CATEGORY_TECH]: "linear-gradient(135deg, #0d1b4b, #1a3a6b)",
      [CATEGORY_DESIGN]: "linear-gradient(135deg, #3b0a45, #6d1a7e)",
      [CATEGORY_THOUGHTS]: "linear-gradient(135deg, #1a0a3b, #3d1a7e)",
      [CATEGORY_TUTORIAL]: "linear-gradient(135deg, #0a2e1a, #1a5c35)",
      [CATEGORY_TOOL]: "linear-gradient(135deg, #2e1a00, #5c3800)",
      [CATEGORY_FAVORITE]: "linear-gradient(135deg, #2e2a00, #5c5200)",
    };
    return map[category] || "linear-gradient(135deg, #1a1a2e, #16213e)";
  }

  function mapNotionBlock(block) {
    const type = block.type;
    const handlers = {
      paragraph: () => ({
        type,
        text: richTextToHtml(block.paragraph.rich_text),
      }),
      heading_1: () => ({
        type,
        text: richTextToHtml(block.heading_1.rich_text),
      }),
      heading_2: () => ({
        type,
        text: richTextToHtml(block.heading_2.rich_text),
      }),
      heading_3: () => ({
        type,
        text: richTextToHtml(block.heading_3.rich_text),
      }),
      bulleted_list_item: () => ({
        type,
        text: richTextToHtml(block.bulleted_list_item.rich_text),
      }),
      numbered_list_item: () => ({
        type,
        text: richTextToHtml(block.numbered_list_item.rich_text),
      }),
      code: () => ({
        type,
        language: block.code.language || "",
        text: richTextToPlain(block.code.rich_text),
      }),
      quote: () => ({
        type,
        text: richTextToHtml(block.quote.rich_text),
      }),
      divider: () => ({ type: "divider" }),
      image: () => ({
        type: "image",
        url: block.image.file?.url || block.image.external?.url || "",
        caption: richTextToPlain(block.image.caption),
      }),
    };
    return handlers[type]?.() ?? { type: "unsupported" };
  }

  function richTextToHtml(richText) {
    if (!richText?.length) return "";
    return richText
      .map((t) => {
        let text = escapeHtml(t.plain_text);
        const ann = t.annotations || {};
        if (ann.code) text = `<code>${text}</code>`;
        if (ann.bold) text = `<strong>${text}</strong>`;
        if (ann.italic) text = `<em>${text}</em>`;
        if (ann.strikethrough) text = `<del>${text}</del>`;
        if (t.href)
          text = `<a href="${escapeHtml(
            t.href,
          )}" target="_blank" rel="noopener">${text}</a>`;
        return text;
      })
      .join("");
  }

  function richTextToPlain(richText) {
    return (richText || []).map((t) => t.plain_text).join("");
  }

  function renderBlocks(blocks) {
    let html = "";
    let listStack = [];

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const nextBlock = blocks[i + 1];
      const isBullet = block.type === "bulleted_list_item";
      const isNumber = block.type === "numbered_list_item";

      if (isBullet || isNumber) {
        const tag = isBullet ? "ul" : "ol";
        if (!listStack.length || listStack[listStack.length - 1] !== tag) {
          html += `<${tag}>`;
          listStack.push(tag);
        }
        html += `<li>${block.text}</li>`;
        const nextSameType = nextBlock?.type === block.type;
        if (!nextSameType) {
          html += `</${listStack.pop()}>`;
        }
        continue;
      }

      while (listStack.length) html += `</${listStack.pop()}>`;

      switch (block.type) {
        case "heading_1":
          html += `<h1>${block.text}</h1>`;
          break;
        case "heading_2":
          html += `<h2>${block.text}</h2>`;
          break;
        case "heading_3":
          html += `<h3>${block.text}</h3>`;
          break;
        case "paragraph":
          html += block.text ? `<p>${block.text}</p>` : "";
          break;
        case "code":
          html += `<pre><code class="language-${block.language}">${escapeHtml(
            block.text,
          )}</code></pre>`;
          break;
        case "quote":
          html += `<blockquote>${block.text}</blockquote>`;
          break;
        case "divider":
          html += "<hr>";
          break;
        case "image":
          html += `<img src="${block.url}" alt="${escapeHtml(
            block.caption,
          )}" loading="lazy">`;
          break;
        default:
          break;
      }
    }

    while (listStack.length) html += `</${listStack.pop()}>`;
    return html;
  }

  function escapeHtml(text) {
    if (!text) return "";
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  return {
    getCategories: () => CATEGORIES,
    queryPosts: (options = {}) => liveQueryDatabase(options),
    getPost: (pageId) => liveGetPage(pageId),
    renderBlocks,
  };
})();

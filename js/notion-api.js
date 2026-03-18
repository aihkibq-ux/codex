/**
 * notion-api.js
 * Notion data adapter for blog list/detail pages.
 */

const NotionAPI = (() => {
  const CATEGORY = {
    ALL: "\u5168\u90e8",
    FEATURED: "\u7cbe\u9009",
    TECH: "\u6280\u672f",
    THOUGHTS: "\u968f\u60f3",
    TUTORIAL: "\u6559\u7a0b",
    TOOLS: "\u5de5\u5177",
    FAVORITES: "\u6536\u85cf",
  };

  const CONFIG = {
    workerUrl: "https://restless-wood-e19f.aihkibq.workers.dev/v1",
    databaseId: "32485b780a2580eaa67ecf051676d693",
    pageSize: 9,
    cacheTTLListMs: 5 * 60 * 1000,
    cacheTTLPostMs: 10 * 60 * 1000,
    requestTimeoutMs: 12000,
    requestRetry: 1,
  };

  const CATEGORIES = [
    { name: CATEGORY.ALL, emoji: "\uD83D\uDCDA", color: "cyan" },
    { name: CATEGORY.FEATURED, emoji: "\u2728", color: "pink" },
    { name: CATEGORY.TECH, emoji: "\uD83D\uDCBB", color: "blue" },
    { name: CATEGORY.THOUGHTS, emoji: "\uD83D\uDCAD", color: "purple" },
    { name: CATEGORY.TUTORIAL, emoji: "\uD83D\uDCD6", color: "green" },
    { name: CATEGORY.TOOLS, emoji: "\uD83E\uDDF0", color: "orange" },
    { name: CATEGORY.FAVORITES, emoji: "\u2B50", color: "orange" },
  ];

  const CATEGORY_STYLE = {
    [CATEGORY.TECH]: {
      badgeInline: "rgba(41, 121, 255, 0.1); color: #2979ff; border-color: rgba(41, 121, 255, 0.2)",
      bg: "rgba(41, 121, 255, 0.1)",
      color: "#2979ff",
      border: "rgba(41, 121, 255, 0.2)",
      gradient: "linear-gradient(135deg, #0d1b4b, #1a3a6b)",
    },
    [CATEGORY.FEATURED]: {
      badgeInline: "rgba(255, 64, 129, 0.1); color: #ff4081; border-color: rgba(255, 64, 129, 0.2)",
      bg: "rgba(255, 64, 129, 0.1)",
      color: "#ff4081",
      border: "rgba(255, 64, 129, 0.2)",
      gradient: "linear-gradient(135deg, #3b0a45, #6d1a7e)",
    },
    [CATEGORY.THOUGHTS]: {
      badgeInline: "rgba(213, 0, 249, 0.1); color: #d500f9; border-color: rgba(213, 0, 249, 0.2)",
      bg: "rgba(213, 0, 249, 0.1)",
      color: "#d500f9",
      border: "rgba(213, 0, 249, 0.2)",
      gradient: "linear-gradient(135deg, #1a0a3b, #3d1a7e)",
    },
    [CATEGORY.TUTORIAL]: {
      badgeInline: "rgba(0, 230, 118, 0.1); color: #00e676; border-color: rgba(0, 230, 118, 0.2)",
      bg: "rgba(0, 230, 118, 0.1)",
      color: "#00e676",
      border: "rgba(0, 230, 118, 0.2)",
      gradient: "linear-gradient(135deg, #0a2e1a, #1a5c35)",
    },
    [CATEGORY.TOOLS]: {
      badgeInline: "rgba(255, 171, 0, 0.1); color: #ffab00; border-color: rgba(255, 171, 0, 0.2)",
      bg: "rgba(255, 171, 0, 0.1)",
      color: "#ffab00",
      border: "rgba(255, 171, 0, 0.2)",
      gradient: "linear-gradient(135deg, #2e1a00, #5c3800)",
    },
    [CATEGORY.FAVORITES]: {
      badgeInline: "rgba(255, 171, 0, 0.1); color: #ffab00; border-color: rgba(255, 171, 0, 0.2)",
      bg: "rgba(255, 171, 0, 0.1)",
      color: "#ffab00",
      border: "rgba(255, 171, 0, 0.2)",
      gradient: "linear-gradient(135deg, #2e2a00, #5c5200)",
    },
    default: {
      badgeInline: "rgba(0, 229, 255, 0.1); color: #00e5ff; border-color: rgba(0, 229, 255, 0.2)",
      bg: "rgba(0, 229, 255, 0.1)",
      color: "#00e5ff",
      border: "rgba(0, 229, 255, 0.2)",
      gradient: "linear-gradient(135deg, #1a1a2e, #16213e)",
    },
  };

  const inflight = new Map();

  function withInflight(key, loader) {
    if (inflight.has(key)) {
      return inflight.get(key);
    }
    const promise = Promise.resolve()
      .then(loader)
      .finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
  }

  function cacheRead(key) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function cacheGet(key, ttl) {
    const data = cacheRead(key);
    if (!data) return null;
    if (Date.now() - data.timestamp > ttl) return null;
    return data.data;
  }

  function cacheGetStale(key) {
    const data = cacheRead(key);
    return data ? data.data : null;
  }

  function cacheSet(key, data) {
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify({
          timestamp: Date.now(),
          data,
        }),
      );
    } catch {
      // ignore quota/disabled session storage
    }
  }

  async function fetchJson(url, options = {}, retry = CONFIG.requestRetry) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.requestTimeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const text = await response.text();
      if (!response.ok) {
        if (response.status === 400) return { results: [] };
        throw new Error(`HTTP ${response.status}`);
      }
      return text ? JSON.parse(text) : {};
    } catch (error) {
      if (retry > 0) {
        return fetchJson(url, options, retry - 1);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function escapeHtml(text) {
    if (!text) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function sanitizeUrl(url) {
    if (!url) return "";
    try {
      const u = new URL(url, window.location.origin);
      if (u.protocol === "http:" || u.protocol === "https:") return u.href;
      return "";
    } catch {
      return "";
    }
  }

  function normalizeSearch(text) {
    return (text || "").toLowerCase().trim();
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }

  function getCategoryStyle(name) {
    return CATEGORY_STYLE[name] || CATEGORY_STYLE.default;
  }

  function richTextToHtml(richText) {
    if (!Array.isArray(richText) || richText.length === 0) return "";
    return richText
      .map((item) => {
        let text = escapeHtml(item.plain_text || "");
        const ann = item.annotations || {};
        if (ann.code) text = `<code>${text}</code>`;
        if (ann.bold) text = `<strong>${text}</strong>`;
        if (ann.italic) text = `<em>${text}</em>`;
        if (ann.strikethrough) text = `<del>${text}</del>`;
        if (ann.underline) text = `<u>${text}</u>`;

        if (item.href) {
          const href = sanitizeUrl(item.href);
          if (href) {
            text = `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
          }
        }
        return text;
      })
      .join("");
  }

  function richTextToPlain(richText) {
    if (!Array.isArray(richText)) return "";
    return richText.map((item) => item.plain_text || "").join("");
  }

  function mapNotionPage(page) {
    const props = page.properties || {};
    const category = props.Category?.select?.name || "";
    const cover = page.cover;
    const coverImage = sanitizeUrl(cover?.external?.url || cover?.file?.url || "");

    return {
      id: page.id || "",
      title: props.Name?.title?.[0]?.plain_text || "Untitled",
      excerpt: props.Excerpt?.rich_text?.[0]?.plain_text || "",
      category,
      date: formatDate(props.Date?.date?.start || ""),
      readTime: props.ReadTime?.rich_text?.[0]?.plain_text || "",
      coverImage,
      coverEmoji: page.icon?.emoji || "\uD83D\uDCC4",
      coverGradient: getCategoryStyle(category).gradient,
      tags: props.Tags?.multi_select?.map((tag) => tag.name) || [],
    };
  }

  function mapNotionBlock(block) {
    const type = block.type;
    const handlers = {
      paragraph: () => ({ type, text: richTextToHtml(block.paragraph.rich_text) }),
      heading_1: () => ({ type, text: richTextToHtml(block.heading_1.rich_text) }),
      heading_2: () => ({ type, text: richTextToHtml(block.heading_2.rich_text) }),
      heading_3: () => ({ type, text: richTextToHtml(block.heading_3.rich_text) }),
      bulleted_list_item: () => ({ type, text: richTextToHtml(block.bulleted_list_item.rich_text) }),
      numbered_list_item: () => ({ type, text: richTextToHtml(block.numbered_list_item.rich_text) }),
      quote: () => ({ type, text: richTextToHtml(block.quote.rich_text) }),
      code: () => ({
        type,
        language: block.code.language || "",
        text: richTextToPlain(block.code.rich_text),
      }),
      divider: () => ({ type: "divider" }),
      image: () => ({
        type: "image",
        url: sanitizeUrl(block.image.file?.url || block.image.external?.url || ""),
        caption: richTextToPlain(block.image.caption),
      }),
    };
    return handlers[type]?.() ?? { type: "unsupported" };
  }

  async function fetchDatabasePages(category, fetchAll) {
    const baseBody = {
      page_size: fetchAll ? 100 : CONFIG.pageSize,
      sorts: [{ property: "Date", direction: "descending" }],
    };

    if (category && category !== CATEGORY.ALL) {
      baseBody.filter = {
        property: "Category",
        select: { equals: category },
      };
    }

    const all = [];
    let cursor = null;
    let hasMore = true;

    while (hasMore) {
      const body = cursor ? { ...baseBody, start_cursor: cursor } : baseBody;
      const data = await fetchJson(`${CONFIG.workerUrl}/databases/${CONFIG.databaseId}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      all.push(...(data.results || []));
      hasMore = Boolean(data.has_more && data.next_cursor && fetchAll);
      cursor = data.next_cursor || null;
    }

    return all.map(mapNotionPage);
  }

  async function fetchFromNotion(category, fetchAll = false) {
    const cacheKey = `notion_query_${CONFIG.databaseId}_${category || "all"}_${fetchAll ? "all" : "page"}`;
    const cached = cacheGet(cacheKey, CONFIG.cacheTTLListMs);
    if (cached) return cached;

    return withInflight(cacheKey, async () => {
      try {
        const mapped = await fetchDatabasePages(category, fetchAll);
        cacheSet(cacheKey, mapped);
        return mapped;
      } catch (error) {
        const stale = cacheGetStale(cacheKey);
        if (stale) return stale;
        throw error;
      }
    });
  }

  async function queryPosts({ category = CATEGORY.ALL, search = "", page = 1 } = {}) {
    const needAll = Boolean(search);
    let results = await fetchFromNotion(category, needAll);

    const q = normalizeSearch(search);
    if (q) {
      results = results.filter((post) => {
        const title = normalizeSearch(post.title);
        const excerpt = normalizeSearch(post.excerpt);
        const tags = (post.tags || []).map((tag) => normalizeSearch(tag));
        return title.includes(q) || excerpt.includes(q) || tags.some((tag) => tag.includes(q));
      });
    }

    const total = results.length;
    const totalPages = Math.max(1, Math.ceil(total / CONFIG.pageSize));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const startIndex = (currentPage - 1) * CONFIG.pageSize;
    const paged = results.slice(startIndex, startIndex + CONFIG.pageSize);

    return { results: paged, total, totalPages, currentPage };
  }

  async function fetchAllBlocks(pageId) {
    const all = [];
    let cursor = null;
    let hasMore = true;

    while (hasMore) {
      const query = cursor
        ? `?page_size=100&start_cursor=${encodeURIComponent(cursor)}`
        : "?page_size=100";
      const data = await fetchJson(`${CONFIG.workerUrl}/blocks/${pageId}/children${query}`);
      all.push(...(data.results || []));
      hasMore = Boolean(data.has_more && data.next_cursor);
      cursor = data.next_cursor || null;
    }

    return all;
  }

  async function getPost(pageId) {
    if (!pageId) return null;

    const cacheKey = `notion_page_${pageId}`;
    const cached = cacheGet(cacheKey, CONFIG.cacheTTLPostMs);
    if (cached) return cached;

    return withInflight(cacheKey, async () => {
      try {
        const [page, blocks] = await Promise.all([
          fetchJson(`${CONFIG.workerUrl}/pages/${pageId}`),
          fetchAllBlocks(pageId),
        ]);
        const mapped = {
          ...mapNotionPage(page),
          content: blocks.map(mapNotionBlock),
        };
        cacheSet(cacheKey, mapped);
        return mapped;
      } catch (error) {
        const stale = cacheGetStale(cacheKey);
        if (stale) return stale;
        throw error;
      }
    });
  }

  function renderBlocks(blocks) {
    let html = "";
    const listStack = [];

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const next = blocks[i + 1];
      const isBullet = block.type === "bulleted_list_item";
      const isNumber = block.type === "numbered_list_item";

      if (isBullet || isNumber) {
        const tag = isBullet ? "ul" : "ol";
        if (!listStack.length || listStack[listStack.length - 1] !== tag) {
          html += `<${tag}>`;
          listStack.push(tag);
        }
        html += `<li>${block.text}</li>`;
        if (next?.type !== block.type) {
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
          html += `<pre><code class="language-${escapeHtml(block.language)}">${escapeHtml(block.text)}</code></pre>`;
          break;
        case "quote":
          html += `<blockquote>${block.text}</blockquote>`;
          break;
        case "divider":
          html += "<hr>";
          break;
        case "image":
          if (block.url) {
            html += `<img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.caption)}" loading="lazy">`;
          }
          break;
        default:
          break;
      }
    }

    while (listStack.length) html += `</${listStack.pop()}>`;
    return html;
  }

  return {
    getCategories: () => CATEGORIES,
    getCategoryStyle,
    queryPosts,
    getPost,
    renderBlocks,
    escapeHtml,
    sanitizeUrl,
    constants: CATEGORY,
  };
})();

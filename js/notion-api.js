/**
 * notion-api.js - Notion data access layer
 */

const NotionAPI = (() => {
  const CONFIG = {
    workerUrl: "https://restless-wood-e19f.aihkibq.workers.dev/v1",
    databaseId: "32485b780a2580eaa67ecf051676d693",
    pageSize: 9,
    requestTimeout: 12000,
  };

  const CACHE_TTL = 1000 * 60 * 30;
  const STALE_TTL = 1000 * 60 * 5;
  const CATEGORY_ALL = "\u5168\u90e8";
  const CATEGORY_FAVORITES = "\u6536\u85cf";

  const CATEGORIES = [
    { name: CATEGORY_ALL, emoji: "\ud83d\udcd6", color: "cyan" },
    { name: "\u7cbe\u9009", emoji: "\ud83c\udf1f", color: "pink" },
    { name: "\u6280\u672f", emoji: "\ud83d\udcbb", color: "blue" },
    { name: "\u968f\u60f3", emoji: "\ud83d\udcad", color: "purple" },
    { name: "\u6559\u7a0b", emoji: "\ud83d\udcda", color: "green" },
    { name: "\u5de5\u5177", emoji: "\ud83d\udee0\ufe0f", color: "orange" },
    { name: CATEGORY_FAVORITES, emoji: "\u2b50", color: "orange" },
  ];

  const CATEGORY_GRADIENTS = {
    "\u6280\u672f": "linear-gradient(135deg, #0d1b4b, #1a3a6b)",
    "\u7cbe\u9009": "linear-gradient(135deg, #3b0a45, #6d1a7e)",
    "\u968f\u60f3": "linear-gradient(135deg, #1a0a3b, #3d1a7e)",
    "\u6559\u7a0b": "linear-gradient(135deg, #0a2e1a, #1a5c35)",
    "\u5de5\u5177": "linear-gradient(135deg, #2e1a00, #5c3800)",
    [CATEGORY_FAVORITES]: "linear-gradient(135deg, #2e2a00, #5c5200)",
  };

  const CATEGORY_COLORS = {
    "\u6280\u672f": {
      bg: "rgba(41, 121, 255, 0.1)",
      color: "#2979ff",
      border: "rgba(41, 121, 255, 0.2)",
    },
    "\u7cbe\u9009": {
      bg: "rgba(255, 64, 129, 0.1)",
      color: "#ff4081",
      border: "rgba(255, 64, 129, 0.2)",
    },
    "\u968f\u60f3": {
      bg: "rgba(213, 0, 249, 0.1)",
      color: "#d500f9",
      border: "rgba(213, 0, 249, 0.2)",
    },
    "\u6559\u7a0b": {
      bg: "rgba(0, 230, 118, 0.1)",
      color: "#00e676",
      border: "rgba(0, 230, 118, 0.2)",
    },
    "\u5de5\u5177": {
      bg: "rgba(255, 171, 0, 0.1)",
      color: "#ffab00",
      border: "rgba(255, 171, 0, 0.2)",
    },
  };

  const DEFAULT_CATEGORY_COLOR = {
    bg: "rgba(0, 229, 255, 0.1)",
    color: "#00e5ff",
    border: "rgba(0, 229, 255, 0.2)",
  };

  const inflightRequests = new Map();

  function withInflight(key, loader) {
    if (inflightRequests.has(key)) {
      return inflightRequests.get(key);
    }

    const request = loader().finally(() => {
      inflightRequests.delete(key);
    });
    inflightRequests.set(key, request);
    return request;
  }

  function getCache(key) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw);
      if (
        !parsed ||
        typeof parsed.timestamp !== "number" ||
        !Object.prototype.hasOwnProperty.call(parsed, "data")
      ) {
        return null;
      }

      return parsed;
    } catch (error) {
      return null;
    }
  }

  function setCache(key, data) {
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify({
          timestamp: Date.now(),
          data,
        }),
      );
    } catch (error) {
      return null;
    }

    return data;
  }

  async function fetchJson(url, options = {}) {
    if (typeof AbortController !== "function") {
      return fetch(url, options);
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, CONFIG.requestTimeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function fetchFromNotion(category, fetchAll = false) {
    const cacheKey = `notion_query_${category || "all"}_${fetchAll}`;
    const cached = getCache(cacheKey);

    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < CACHE_TTL) {
        if (age > STALE_TTL) {
          fetchFromNotionRemote(category, fetchAll, cacheKey).catch(() => {});
        }
        return cached.data;
      }
    }

    return fetchFromNotionRemote(category, fetchAll, cacheKey);
  }

  function fetchFromNotionRemote(category, fetchAll, cacheKey) {
    const requestKey = `query:${cacheKey}`;
    return withInflight(requestKey, async () => {
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

      const response = await fetchJson(
        `${CONFIG.workerUrl}/databases/${CONFIG.databaseId}/query`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        if (response.status === 400) {
          return [];
        }
        throw new Error(`Notion API error: ${response.status}`);
      }

      const data = await response.json();
      const results = Array.isArray(data.results)
        ? data.results.map(mapNotionPage)
        : [];

      setCache(cacheKey, results);
      return results;
    });
  }

  async function liveQueryDatabase({ category, search, page = 1 } = {}) {
    const normalizedCategory = category || CATEGORY_ALL;
    const normalizedSearch = String(search || "").trim().toLowerCase();
    const currentPage = Math.max(1, Number.parseInt(page, 10) || 1);
    const shouldFetchAll = Boolean(normalizedSearch);

    let results = await fetchFromNotion(normalizedCategory, shouldFetchAll);

    if (normalizedSearch) {
      results = results.filter((post) => {
        return (
          post.title.toLowerCase().includes(normalizedSearch) ||
          post.excerpt.toLowerCase().includes(normalizedSearch) ||
          post.tags.some((tag) => tag.toLowerCase().includes(normalizedSearch))
        );
      });
    }

    const total = results.length;
    const totalPages = Math.max(1, Math.ceil(total / CONFIG.pageSize));
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * CONFIG.pageSize;

    return {
      results: results.slice(start, start + CONFIG.pageSize),
      total,
      totalPages,
      currentPage: safePage,
    };
  }

  async function liveGetPage(pageId) {
    const cacheKey = `notion_page_${pageId}`;
    const cached = getCache(cacheKey);

    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < CACHE_TTL) {
        if (age > STALE_TTL) {
          fetchPageRemote(pageId, cacheKey).catch(() => {});
        }
        return cached.data;
      }
    }

    return fetchPageRemote(pageId, cacheKey);
  }

  function fetchPageRemote(pageId, cacheKey) {
    return withInflight(`page:${pageId}`, async () => {
      const [pageResponse, blocksResponse] = await Promise.all([
        fetchJson(`${CONFIG.workerUrl}/pages/${pageId}`),
        fetchJson(`${CONFIG.workerUrl}/blocks/${pageId}/children?page_size=100`),
      ]);

      if (!pageResponse.ok || !blocksResponse.ok) {
        throw new Error("Notion API error");
      }

      const page = await pageResponse.json();
      const blocks = await blocksResponse.json();
      const mappedData = {
        ...mapNotionPage(page),
        content: Array.isArray(blocks.results)
          ? blocks.results.map(mapNotionBlock)
          : [],
      };

      setCache(cacheKey, mappedData);
      return mappedData;
    });
  }

  function mapNotionPage(page) {
    const props = page?.properties || {};
    const category = props.Category?.select?.name || "";
    const cover = page?.cover;
    const coverImage = cover?.external?.url || cover?.file?.url || null;

    return {
      id: page?.id || "",
      title: props.Name?.title?.[0]?.plain_text || "Untitled",
      excerpt: props.Excerpt?.rich_text?.[0]?.plain_text || "",
      category,
      date: props.Date?.date?.start || "",
      readTime: props.ReadTime?.rich_text?.[0]?.plain_text || "",
      coverImage,
      coverEmoji: page?.icon?.emoji || "\ud83d\udcd8",
      coverGradient: gradientForCategory(category),
      tags: props.Tags?.multi_select?.map((tag) => tag.name).filter(Boolean) || [],
    };
  }

  function gradientForCategory(category) {
    return (
      CATEGORY_GRADIENTS[category] ||
      "linear-gradient(135deg, #1a1a2e, #16213e)"
    );
  }

  function mapNotionBlock(block) {
    const type = block?.type;
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
        url: sanitizeUrl(block.image.file?.url || block.image.external?.url || ""),
        caption: richTextToPlain(block.image.caption),
      }),
    };

    return handlers[type]?.() ?? { type: "unsupported" };
  }

  function richTextToHtml(richText) {
    if (!Array.isArray(richText) || !richText.length) {
      return "";
    }

    return richText
      .map((item) => {
        let text = escapeHtml(item.plain_text || "");
        const annotations = item.annotations || {};

        if (annotations.code) {
          text = `<code>${text}</code>`;
        }
        if (annotations.bold) {
          text = `<strong>${text}</strong>`;
        }
        if (annotations.italic) {
          text = `<em>${text}</em>`;
        }
        if (annotations.strikethrough) {
          text = `<del>${text}</del>`;
        }

        const href = sanitizeUrl(item.href);
        if (href) {
          text = `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
        }

        return text;
      })
      .join("");
  }

  function richTextToPlain(richText) {
    return Array.isArray(richText)
      ? richText.map((item) => item.plain_text || "").join("")
      : "";
  }

  function renderBlocks(blocks) {
    const html = [];
    const listStack = [];

    blocks.forEach((block, index) => {
      const nextBlock = blocks[index + 1];
      const isBullet = block.type === "bulleted_list_item";
      const isNumber = block.type === "numbered_list_item";

      if (isBullet || isNumber) {
        const tag = isBullet ? "ul" : "ol";
        if (!listStack.length || listStack[listStack.length - 1] !== tag) {
          html.push(`<${tag}>`);
          listStack.push(tag);
        }

        html.push(`<li>${block.text}</li>`);

        if (nextBlock?.type !== block.type) {
          html.push(`</${listStack.pop()}>`);
        }
        return;
      }

      while (listStack.length) {
        html.push(`</${listStack.pop()}>`);
      }

      switch (block.type) {
        case "heading_1":
          html.push(`<h1>${block.text}</h1>`);
          break;
        case "heading_2":
          html.push(`<h2>${block.text}</h2>`);
          break;
        case "heading_3":
          html.push(`<h3>${block.text}</h3>`);
          break;
        case "paragraph":
          if (block.text) {
            html.push(`<p>${block.text}</p>`);
          }
          break;
        case "code":
          html.push(
            `<pre><code class="language-${escapeHtml(block.language)}">${escapeHtml(block.text)}</code></pre>`,
          );
          break;
        case "quote":
          html.push(`<blockquote>${block.text}</blockquote>`);
          break;
        case "divider":
          html.push("<hr>");
          break;
        case "image":
          if (block.url) {
            html.push(
              `<img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.caption)}" loading="lazy" decoding="async">`,
            );
          }
          break;
        default:
          break;
      }
    });

    while (listStack.length) {
      html.push(`</${listStack.pop()}>`);
    }

    return html.join("");
  }

  function sanitizeUrl(value) {
    if (!value) {
      return "";
    }

    try {
      const url = new URL(value, window.location.href);
      if (!["http:", "https:"].includes(url.protocol)) {
        return "";
      }
      return url.toString();
    } catch (error) {
      return "";
    }
  }

  function escapeHtml(text) {
    if (!text) {
      return "";
    }

    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getCategoryColor(category) {
    return CATEGORY_COLORS[category] || DEFAULT_CATEGORY_COLOR;
  }

  return {
    CATEGORY_ALL,
    CATEGORY_FAVORITES,
    getCategories: () => CATEGORIES.slice(),
    queryPosts: (options = {}) => liveQueryDatabase(options),
    getPost: (pageId) => liveGetPage(pageId),
    renderBlocks,
    escapeHtml,
    getCategoryColor,
  };
})();

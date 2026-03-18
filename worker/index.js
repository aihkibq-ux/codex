/**
 * Cloudflare Worker
 * Notion API proxy with CORS and timeout guards.
 */

const NOTION_API_BASE = "https://api.notion.com";
const NOTION_VERSION = "2022-06-28";
const REQUEST_TIMEOUT_MS = 15000;
const ALLOWED_METHODS = new Set(["GET", "POST", "OPTIONS"]);

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "*";
    const allowedOrigin = env.ALLOWED_ORIGIN || "*";
    const corsOrigin = allowedOrigin === "*" ? origin : allowedOrigin;
    if (allowedOrigin !== "*" && origin !== "*" && origin !== allowedOrigin) {
      return jsonResponse({ error: "Origin not allowed" }, 403, allowedOrigin);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(corsOrigin),
      });
    }

    if (!ALLOWED_METHODS.has(request.method)) {
      return jsonResponse({ error: "Method not allowed" }, 405, corsOrigin);
    }

    if (!env.NOTION_TOKEN) {
      return jsonResponse({ error: "Missing NOTION_TOKEN" }, 500, corsOrigin);
    }

    const url = new URL(request.url);
    if (!url.pathname.startsWith("/v1/")) {
      return jsonResponse({ error: "Not found" }, 404, corsOrigin);
    }

    const upstreamUrl = `${NOTION_API_BASE}${url.pathname}${url.search}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const upstreamRes = await fetch(upstreamUrl, {
        method: request.method,
        headers: {
          Authorization: `Bearer ${env.NOTION_TOKEN}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: request.method === "POST" ? request.body : null,
        signal: controller.signal,
      });

      const payload = await upstreamRes.text();
      const headers = {
        ...corsHeaders(corsOrigin),
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": upstreamRes.ok ? "public, max-age=60" : "no-store",
      };

      return new Response(payload, {
        status: upstreamRes.status,
        headers,
      });
    } catch (error) {
      const message = error?.name === "AbortError" ? "Upstream timeout" : error.message;
      return jsonResponse({ error: message }, 502, corsOrigin);
    } finally {
      clearTimeout(timeout);
    }
  },
};

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

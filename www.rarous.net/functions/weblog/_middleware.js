import { defComments, defWebMentions } from "@rarousnet/website/gryphoon.js";
import { parseHTML } from "linkedom/worker";
import { highlightAllUnder } from "../../src/static/assets/js/prism.js";

/**
 * @typedef {Object} Data
 * @property {Window} window
 * @property {{webmentions: Array, comments: Array}} weblog
 */

/**
 * @param {KVNamespace} weblog
 * @param {string} url
 * @return {Promise<{webmentions: Array, comments: Array}>}
 */
async function getDetail(weblog, url) {
  const payload = (await weblog.get(url, "json")) ?? (await weblog.get(`${url}.html`, "json"));
  return Object.assign({ webmentions: [], comments: [] }, payload);
}

function renderComments(window, comments) {
  const Comments = defComments(window);
  Comments.register();
  const el = window.document.querySelector(Comments.tagName);
  if (!el) return;
  el.data = comments.filter(x => x.isEnabled);
}

function renderWebMentions(window, webmentions) {
  const WebMentions = defWebMentions(window);
  WebMentions.register();
  const el = window.document.querySelector(WebMentions.tagName);
  if (!el) return;
  const myself = new Set([
    "https://twitter.com/alesroubicek",
    "https://x.com/alesroubicek",
    "https://indieweb.social/@alesroubicek",
  ]);
  el.data = webmentions.filter(x => !myself.has(x.author.url));
}

/**
 * @param {EventContext<Env>} context
 */
async function renderWebComponents({ next, request, env }) {
  const resp = await next();
  const contentType = resp.headers.get("content-type");
  if (resp.ok && contentType?.startsWith("text/html")) {
    const html = await resp.text();
    const { document, window } = parseHTML(html);
    const weblog = await getDetail(env.weblog, request.url);
    if (weblog.comments.length || weblog.webmentions.length) {
      renderComments(window, weblog.comments);
      renderWebMentions(window, weblog.webmentions);
    }
    highlightAllUnder(document);
    return new Response(document.toString(), resp);
  }
  return resp;
}

/**
 * @param {EventContext<Env>} context
 * @return {Promise<Response>}
 */
async function renderSocialMediaImages({ next, request, env }) {
  // Handle only PNG image requests
  if (!request.url.endsWith(".png")) return next();
  const headers = {
    "Content-Type": "image/png",
    "Cache-Control": "public, max-age=3600",
  };

  const cards = await env.weblog.get("/weblog/cards", "json");
  const detail = new Map(cards).get(request.url);
  if (!detail) {
    return new Response("Not Found", { status: 404 });
  }

  // try to get cached image
  const { value, metadata } = await env.weblog.getWithMetadata(`/weblog/cards/${detail.hash}`, "arrayBuffer");
  if (value) {
    console.log(`found pre-rendered image in KV /weblog/cards/${detail.hash}`);
    return new Response(value, { headers: metadata?.headers ?? headers });
  }
  const params = new URLSearchParams(Object.entries(detail));
  const screenshotterParams = new URLSearchParams({
    url: `https://www.rarous.net/weblog/card?${params}`,
    selector: "#card",
    type: "png",
    token: env.SCREENSHOTTER_SECRET,
  });
  const resp = await env.screenshotter.fetch(`https://rarous.net/?${screenshotterParams}`, {
    headers: request.headers,
  });
  const buffer = await resp.arrayBuffer();

  // cache image for one month
  await env.weblog.put(`/weblog/cards/${detail.hash}`, buffer, {
    expirationTtl: 2_629_746,
    metadata: { headers },
  });
  return new Response(buffer, { headers });
}

export const onRequest = [renderSocialMediaImages, renderWebComponents];

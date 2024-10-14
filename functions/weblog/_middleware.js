import { parseHTML } from "linkedom/worker";
import { defComments, defWebMentions } from "@rarousnet/website/gryphoon.js";

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
  const payload = (await weblog.get(url, "json"))
    ?? (await weblog.get(url + ".html", "json"));
  return Object.assign({ webmentions: [], comments: [] }, payload);
}

/**
 * @param {EventContext<Env>} context
 */
export async function loadData({ request, env, data, next }) {
  data.weblog = await getDetail(env.weblog, request.url);
  return next();
}

function renderComments(window, comments) {
  const Comments = defComments(window);
  Comments.register();
  const el = window.document.querySelector(Comments.tagName);
  if (!el) return;
  el.data = comments;
}

function renderWebMentions(window, webmentions) {
  const WebMentions = defWebMentions(window);
  WebMentions.register();
  const el = window.document.querySelector(WebMentions.tagName);
  if (!el) return;
  el.data = webmentions;
}

/**
 * @param {EventContext<Env>} context
 */
export async function renderWebComponents({ next, data }) {
  const resp = await next();
  const contentType = resp.headers.get("content-type");
  if (contentType?.startsWith("text/html")) {
    if (data.weblog.comments.length || data.weblog.webmentions.length) {
      const html = await resp.text();
      const { document, window } = parseHTML(html);

      renderComments(window, data.weblog.comments);
      renderWebMentions(window, data.weblog.webmentions);

      return new Response(document.toString(), resp);
    }
  }
  return resp;
}

export const onRequest = [loadData, renderWebComponents];

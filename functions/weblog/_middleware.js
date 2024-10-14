import { parseHTML } from "linkedom/worker";
import { defComments } from "@rarousnet/website/src/esm/gryphoon.js";

/**
 * @typedef {Object} Data
 * @property {Window} window
 * @property {{webmentions: Array, comments: Array}} weblog
 */

/**
 * @param {EventContext<Env>} context
 */
export async function parseDOM({ next, data }) {
  const resp = await next();
  const contentType = resp.headers.get("content-type");
  if (contentType.startsWith("text/html")) {
    const html = await resp.text();
    data.window = parseHTML(html);
  }
  return resp;
}

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

/**
 * @param {EventContext<Env, string, Data>} context
 */
export async function renderComments({ data, next }) {
  const resp = await next();
  if (!data.window) return resp;

  const { document, window } = data.window;
  const Comments = defComments(window);
  Comments.register();
  const el = document.querySelector(Comments.tagName);
  if (el) {
    el.data = data.weblog.comments;
  }
  return resp;
}

/**
 * @param {EventContext<Env, string, Data>} context
 */
export async function renderDOM({ next, data }) {
  const resp = await next();
  if (!data.window) return resp;

  const { document } = data.window;
  return new Response(document.toString(), resp);
}

export const onRequest = [loadData, parseDOM, renderComments, renderDOM];

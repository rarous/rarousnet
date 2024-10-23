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
export async function renderWebComponents({ next, request, env }) {
  const resp = await next();
  const contentType = resp.headers.get("content-type");
  if (resp.ok && contentType?.startsWith("text/html")) {
    const weblog = await getDetail(env.weblog, request.url);
    if (weblog.comments.length || weblog.webmentions.length) {
      const html = await resp.text();
      const { document, window } = parseHTML(html);

      renderComments(window, weblog.comments);
      renderWebMentions(window, weblog.webmentions);

      return new Response(document.toString(), resp);
    }
  }
  return resp;
}

export const onRequest = [renderWebComponents];

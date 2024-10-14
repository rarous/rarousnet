import { parseHTML } from "linkedom/worker";
import { defComments } from "@rarousnet/website/gryphoon.js";

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
  console.log(data);
  return next();
}

/**
 * @param {EventContext<Env>} context
 */
export async function renderWebComponents({ next, data }) {
  const resp = await next();
  const contentType = resp.headers.get("content-type");
  console.log({ headers: Object.fromEntries(resp.headers) });
  if (contentType?.startsWith("text/html")) {
    if (data.weblog.comments.length) {
      console.log("Read HTML response")
      const html = await resp.text();
      console.log("Parse HTML into DOM");
      const { document, window } = parseHTML(html);

      const Comments = defComments(window);
      Comments.register();
      const el = document.querySelector(Comments.tagName);
      if (el) {
        el.data = data.weblog.comments;
      }
      return new Response(document.toString(), resp);
    }
  }
  return resp;
}

export const onRequest = [loadData, renderWebComponents];

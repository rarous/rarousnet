import { parseHTML } from "linkedom/worker";
import { defDiscogs } from "../../website/assets/esm/discogs.js";

/**
 * @typedef {import("../env.d.ts").Env} Env
 */

/**
 * @param {EventContext<Env>} context
 */
export async function onRequestGet({ request, env }) {
  const resp = await env.ASSETS.fetch(request);
  const html = await resp.text();
  const window = parseHTML(html);
  const Discogs = defDiscogs(window);
  Discogs.register("rarous-discogs");
  const { document } = window;
  const discogs = document.querySelector("rarous-discogs");
  discogs.data = await env.weblog.get("/kolekce/vinyly", "json");
  return new Response(document.toString(), resp);
}

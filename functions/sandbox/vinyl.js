import { parseHTML } from "linkedom/worker";
import { defDiscogs } from "../../website/assets/esm/discogs.js";

/**
 * @typedef {import("../env.d.ts").Env} Env
 */

/**
 * @param {EventContext<Env>} context
 */
export async function onRequestGet({ env }) {
  const resp = await env.ASSETS.fetch("https://www.rarous.net/kolekce/vinyly");
  const html = await resp.text();
  const window = parseHTML(html);
  defDiscogs(window).register("rarous-discogs");
  const { document } = window;
  const discogs = document.querySelector("rarous-discogs");
  discogs.data = await env.weblog.get("/kolekce/vinyly", "json");
  return new Response(document.toString(), resp);
}

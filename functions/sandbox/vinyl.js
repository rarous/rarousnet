import { parseHTML } from "linkedom/worker";
import { Discogs } from "../../website/assets/esm/discogs.js";

/**
 * @typedef {import("../env.d.ts").Env} Env
 */

/**
 * @param {EventContext<Env>} context
 */
export async function onRequestGet({ env }) {
  const resp = await env.ASSETS.fetch("/kolekce/vinyly.html");
  const { document, customElements } = parseHTML(await resp.text());
  customElements.customElements.define("rarous-discogs", Discogs);
  const discogs = document.querySelector("rarous-discogs");
  discogs.data = await env.weblog.get("/kolekce/vinyly", "json");
  return new Response(document.toString(), {
    headers: {
      "content-type": "text/html",
    },
  });
}

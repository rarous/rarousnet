import { DOMParser } from "linkedom";

async function getFeed(url) {
  const resp = await fetch(url);
  const text = await resp.text();
  return new DOMParser().parseFromString(text, "text/xml");
}

function getAuthor(entry) {
  const name =
    entry.querySelector("author>name")?.textContent ?? entry.querySelector("source>title")?.textContent ?? "";
  return name.split("\n").at(0).trim();
}

function parseEntry(entry) {
  const link = entry.querySelector("link").getAttribute("href");
  const hostname = new URL(link).hostname;
  const author = getAuthor(entry);
  const title = entry.querySelector("title").textContent;
  const published = entry.querySelector("published").textContent;
  return {
    author,
    title,
    link,
    hostname,
    published,
  };
}

async function* getEntries(url) {
  const feed = await getFeed(url);
  const entries = feed.querySelectorAll("entry");
  for (const entry of entries) {
    yield parseEntry(entry);
  }
}

/**
 * @param {Env} env
 */
async function updateArticlesFeed(env) {
  const current = await env.w3b.get("/latest", "json");
  const data = new Map(Object.entries(current));
  for await (const entry of getEntries("https://feeds.feedburner.com/rarous/w3b")) {
    if (data.has(entry.link)) continue;
    data.set(entry.link, { entry, stats: { clicks: 0, likes: 0 } });
  }
  const result = Object.fromEntries(data);
  await env.weblog.put("/latest", JSON.stringify(result));
}

export default {
  /**
   * @param {ScheduledEvent} event
   * @param {Env} env
   * @param {ExecutionContext} ctx
   */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(updateArticlesFeed(env));
  },

  async fetch(request, env, ctx) {
    await updateArticlesFeed(env);
    return new Response(null, { status: 202 });
  },
};

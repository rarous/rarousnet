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
  await env.w3b.put("/latest", JSON.stringify(result));
}

// TODO: move into KV
const authorsIgnoreList = new Set(["solidpixels., https://www.solidpixels.com"]);
const authorsMap = new Map([
  ["noreply@example.com (Irena Zatloukalová)", "Irena Zatloukalová"]
]);

function processExtractedData(data) {
  console.log("Extracted data:", data);
  let image = data.metatags["twitter:image"]?.[0] ?? data.metatags["og:image"]?.[0] ?? "";
  if (image && !image.startsWith("http")) {
    image = new URL(image, data.url).href;
  }
  let author = data.metatags["article:author"]?.[0] ?? data.metatags["author"]?.[0] ?? "";
  if (authorsIgnoreList.has(author)) {
    author = null;
  }
  return {
    url: data.url,
    lang: data.lang,
    title: data.metatags["twitter:title"]?.[0] ?? data.metatags["og:title"]?.[0] ?? data.title,
    description: data.metatags["twitter:description"]?.[0] ?? data.metatags["og:description"]?.[0] ?? data.metatags["description"]?.[0] ?? "",
    author: author,
    tags: data.metatags["article:tag"]?.join(", ") ?? data.metatags["keywords"]?.[0] ?? "",
    image
  }
}

function mergeData(entry, extractedData) {
  const data = processExtractedData(extractedData);
  return {
    link: entry.link,
    lang: data.lang,
    title: data.title || entry.title,
    description: data.description,
    author: data.author || (authorsMap.get(entry.author) ?? entry.author),
    tags: data.tags,
    image: data.image,
    hostname: entry.hostname,
    published: entry.published,
  }
}

async function extractMetadata(entry, env) {
  const params = new URLSearchParams({
    url: entry.link,
    token: env.SEMANTIC_EXTRACTOR_SECRET
  });
  const resp = await env.extractor.fetch(`https://w3blogy.cz/?${params}`);
  return resp.json();
}

/**
 * @param {Env} env
 */
async function updateArticlesFeedWithScrapedData(env) {
  const current = await env.w3b.get("/latest", "json");
  const data = new Map(Object.entries(current));
  for await (const entry of getEntries("https://feeds.feedburner.com/rarous/w3b")) {
    const extractedData = await extractMetadata(entry, env);
    data.set(entry.link, {
      entry: mergeData(entry, extractedData),
      stats: data[entry.link]?.stats ?? { clicks: 0, likes: 0 }
    });
  }
  const result = Object.fromEntries(data);
  await env.w3b.put("/latest", JSON.stringify(result));
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
    await updateArticlesFeedWithScrapedData(env);
    return new Response(null, { status: 202 });
  },
};

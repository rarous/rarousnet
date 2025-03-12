import { DOMParser } from "linkedom/worker";

async function getFeed(url) {
  const resp = await fetch(url);
  const text = await resp.text();
  return new DOMParser().parseFromString(text, "text/xml", { location: new URL(url) });
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
  const title = entry.querySelector("title").innerText;
  const published = entry.querySelector("published").textContent;
  return { author, title, link, hostname, published };
}

async function* getEntries(url) {
  const feed = await getFeed(url);
  const entries = feed.querySelectorAll("entry");
  for (const entry of entries) {
    yield parseEntry(entry);
  }
}

// TODO: move into KV
const authorsIgnoreList = new Set(["solidpixels., https://www.solidpixels.com"]);
const authorsMap = new Map([["noreply@example.com (Irena Zatloukalová)", "Irena Zatloukalová"]]);

function val(prop) {
  if (Array.isArray(prop)) return prop[0];
  return prop;
}

function kw(kw) {
  if (Array.isArray(kw)) return kw.join(", ");
  return kw;
}

function getByType({ jsonld, microdata }, types) {
  for (const type of types) {
    const result =
      val(jsonld[type]) ?? val(microdata[`http://schema.org/${type}`]) ?? val(microdata[`https://schema.org/${type}`]);
    if (result) return result;
  }
  return null;
}

function processExtractedData(data) {
  console.log("Extracted data:", data);
  const { lang, metatags, title: docTitle, url } = data;
  const article = getByType(data, [
    "NewsArticle",
    "Article",
    "BlogPosting",
    "Blog",
    "VideoObject",
    "PresentationDigitalDocument",
    "SoftwareSourceCode",
  ]);
  let image =
    val(val(article?.image)?.url) ??
    val(article?.image) ??
    val(metatags["twitter:image"]) ??
    val(metatags["og:image"]) ??
    "";
  if (image && !image.startsWith("http")) {
    image = new URL(image, url).href;
  }
  let author =
    val(article?.author?.name) ??
    val(article?.author) ??
    val(metatags["article:author"]) ??
    val(metatags["author"]) ??
    "";
  if (authorsIgnoreList.has(author)) {
    author = null;
  }
  const description =
    val(article?.abstract) ??
    val(article?.description) ??
    val(metatags["twitter:description"]) ??
    val(metatags["og:description"]) ??
    val(metatags["description"]) ??
    "";
  const tags = kw(article?.keywords) ?? kw(metatags["article:tag"]) ?? val(metatags["keywords"]) ?? "";
  const title =
    val(article?.headline) ??
    val(article?.name) ??
    val(metatags["twitter:title"]) ??
    val(metatags["og:title"]) ??
    docTitle;
  return { url, lang, title, description, author, tags, image };
}

function mergeData(entry, extractedData) {
  const data = processExtractedData(extractedData);
  return {
    link: entry.link,
    lang: data.lang,
    title: data.title || entry.title,
    description: data.description || entry.description,
    author: data.author || (authorsMap.get(entry.author) ?? entry.author),
    tags: data.tags,
    image: data.image,
    hostname: entry.hostname,
    published: entry.published,
  };
}

async function extractMetadata(entry, env, { nodeObjects } = {}) {
  const params = new URLSearchParams({
    url: entry.link,
    token: env.SEMANTIC_EXTRACTOR_SECRET,
    nodeObjects,
  });
  const resp = await env.extractor.fetch(`https://w3blogy.cz/?${params}`);
  return resp.json();
}

/**
 * @param {Env} env
 */
async function updateArticlesFeed(env) {
  const current = await env.w3b.get("/latest", "json");
  const data = new Map(Object.entries(current));
  for await (const entry of getEntries(env.FEED_URL)) {
    if (data.has(entry.link)) continue;
    const extractedData = await extractMetadata(entry, env);
    data.set(entry.link, {
      entry: mergeData(entry, extractedData),
      stats: { clicks: 0, likes: 0 },
    });
  }
  const result = Object.fromEntries(data);
  await env.w3b.put("/latest", JSON.stringify(result));
}

/**
 * @param {Env} env
 */
async function updateArticlesFeedWithScrapedData(env) {
  const current = await env.w3b.get("/latest", "json");
  const data = new Map(Object.entries(current));
  const notEnhanced = Array.from(data.values()).filter(x => !x.entry.description);
  for (const { entry, stats } of notEnhanced) {
    const extractedData = await extractMetadata(entry, env);
    data.set(entry.link, {
      entry: mergeData(entry, extractedData),
      stats: stats ?? { clicks: 0, likes: 0 },
    });
  }
  const result = Object.fromEntries(data);
  await env.w3b.put("/latest", JSON.stringify(result));
}

/**
 * @param {Env} env
 */
async function extractStructuredData(env) {
  const current = await env.w3b.get("/latest", "json");
  const data = new Map(Object.entries(current));
  for (const { entry, stats } of Array.from(data.values())) {
    const extractedData = await extractMetadata(entry, env, { nodeObjects: 1 });
    data.set(entry.link, {
      entry: mergeData(entry, extractedData),
      extractedData,
      stats: stats ?? { clicks: 0, likes: 0 },
    });
  }
  return Object.fromEntries(data);
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
    const result = await extractStructuredData(env);
    return Response.json(result);
  },
};

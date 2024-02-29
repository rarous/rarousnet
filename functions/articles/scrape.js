import { DOMParser } from "linkedom/worker";

async function getFeed(url) {
  const resp = await fetch(url);
  const text = await resp.text();
  return new DOMParser().parseFromString(text, "text/xml");
}

function parseExcerpt(html) {
  const document = new DOMParser().parseFromString(html, "text/html");
  return document.querySelector("p").textContent;
}

function getAuthor(entry) {
  const name = entry.querySelector("author>name")?.textContent ?? entry.querySelector("source>title")?.textContent
    ?? "";
  return name.split("\n").at(0).trim();
}

function parseEntry(entry) {
  const html = entry.querySelector("content").textContent;
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
    excerpt: parseExcerpt(html),
    html,
  };
}

async function* getEntries(url) {
  console.log(url);
  const feed = await getFeed(url);
  const nextFeedUrl = feed.querySelector("link[rel=next]")?.getAttribute("href");
  console.log(feed.querySelector("link[rel=next]"));
  const entries = feed.querySelectorAll("entry");
  console.log(entries.length)
  for (const entry of entries) {
    yield parseEntry(entry);
  }
  console.log(nextFeedUrl);
  if (!nextFeedUrl) return;
  yield* getEntries(nextFeedUrl);
}

/**
 * @param {EventContext<Env>} context
 */
export async function onRequestGet({ env }) {
  const promises = [];
  for await (const entry of getEntries("https://feeds.feedburner.com/rarous/w3b")) {
    promises.push(env.w3b.put(entry.link, JSON.stringify({ entry, stats: { clicks: 0, likes: 0 } })));
  }
  await Promise.all(promises);
  return new Response("ok");
}

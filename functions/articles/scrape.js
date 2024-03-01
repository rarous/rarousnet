import { DOMParser } from "linkedom/worker";

async function getFeed(url) {
  const resp = await fetch(url, {
    headers: {
      accept: "text/xml",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0",
    },
  });
  const text = await resp.text();
  console.log({ url, status: resp.status });
  if (!resp.ok) console.log(text);
  return new DOMParser().parseFromString(text, "text/xml");
}

function parseExcerpt(html) {
  const document = new DOMParser().parseFromString(html, "text/html");
  return document.querySelector("p").textContent;
}

function getAuthor(entry) {
  const authorName = entry.querySelector("author > name")?.textContent;
  const sourceTitle = entry.querySelector("source > title")?.textContent;
  const name = authorName ?? sourceTitle ?? "";
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
  const feed = await getFeed(url);
  const nextFeedUrl = feed.querySelector("link[rel=next]")?.getAttribute("href");
  console.log({ link: feed.querySelector("link[rel=next]") });
  const entries = feed.querySelectorAll("entry");
  console.log({ entriesCount: entries.length });
  for (const entry of entries) {
    yield parseEntry(entry);
  }
  console.log({ nextFeedUrl });
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

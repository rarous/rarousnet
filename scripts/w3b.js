import { DOMParser } from "https://esm.sh/linkedom";

async function getFeed(url) {
  const resp = await fetch(url);
  const text = await resp.text();
  return new DOMParser().parseFromString(text, "text/xml");
}

function parseExcerpt(html) {
  try {
    const document = new DOMParser().parseFromString(html, "text/html");
    const p = document.querySelector("p");
    return p?.textContent ?? html;
  } catch (e) {
    console.error("Error parsing", html, e);
  }
}

function getAuthor(entry) {
  const name =
    entry.querySelector("author>name")?.textContent ?? entry.querySelector("source>title")?.textContent ?? "";
  return name.split("\n").at(0).trim();
}

function parseEntry(entry) {
  //const html = entry.querySelector("content").textContent;
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
    //excerpt: parseExcerpt(html),
    //html,
  };
}

async function* getEntries(url) {
  const feed = await getFeed(url);
  const nextFeedUrl = feed.querySelector("link[rel=next]")?.getAttribute("href");
  const entries = feed.querySelectorAll("entry");
  for (const entry of entries) {
    yield parseEntry(entry);
  }
  if (!nextFeedUrl) return;
  yield* getEntries(nextFeedUrl);
}

const result = {};
for await (const entry of getEntries("https://feeds.feedburner.com/rarous/w3b")) {
  result[entry.link] = { entry, stats: { clicks: 0, likes: 0 } };
}
console.log(JSON.stringify(result));

// deno run --allow-net=feeds.feedburner.com,feedly.com w3b.js

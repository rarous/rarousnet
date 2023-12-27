import { Feed } from "feed";

/**
 * @typedef {import("../env.d.ts").Env} Env
 */

/**
 * @param {EventContext<Env>} context
 */
export async function onRequestGet({ env }) {
  const items = (await env.weblog.get("/weblog/comments", "json")) ?? [];
  const feed = new Feed({
    id: "https://www.rarous.net/weblog/",
    title: "rarouš.weblog - komentáře k článkům",
    link: "https://www.rarous.net/weblog/",
    description: "Komentáře k článkům rarouš.weblog.",
    copyright: `© 2004 - ${new Date().getFullYear()} Aleš Roubíček. All rights reserved`,
    generator: "Gryphoon Weblog v3.5",
  });
  for (const item of items.filter(x => x.isEnabled)) {
    feed.addItem({
      author: item.author.name,
      title: "Komentář k článku " + item.article?.title,
      guid: item.href,
      link: item.href,
      pubDate: item.created,
      description: item.text,
    });
  }
  return new Response(feed.rss2(), {
    headers: {
      "content-type": "application/rss+xml",
      "cache-control": "max-age=3600",
    },
  });
}
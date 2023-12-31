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
    language: "cs-CZ",
  });
  for (const item of items.filter(x => x.isEnabled)) {
    feed.addItem({
      author: [{ email: "noreply@example.com", name: item.author.name }],
      title: "Komentář k článku " + item.article?.title,
      link: item.href,
      date: new Date(item.created),
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

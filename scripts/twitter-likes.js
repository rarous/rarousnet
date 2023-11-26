import { parse } from "https://deno.land/std@0.205.0/flags/mod.ts";

async function main({ token }) {
  const { default: data } = await import("./data/twitter-likes.json", {
    with: { type: "json" },
  });
  const target = "https://www.rarous.net/weblog/2023/11/14/peopleops-4.html";
  const source = "https://twitter.com/alesroubicek/status/1724388917762203682";
  const { entries } = data.favoriters_timeline.timeline.instructions[0];
  const users = entries
    .filter((x) => x.content.entryType === "TimelineTimelineItem")
    .map((x) => x.content.itemContent.user_results.result);
  for (const { legacy: user, rest_id } of users) {
    const resp = await fetch("https://www.rarous.net/webhooks/webmentions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: token,
        source,
        target,
        post: {
          type: "entry",
          author: {
            name: user.name,
            photo: user.profile_image_url_https,
            url: `https://twitter.com/${user.screen_name}`,
          },
          url: `${source}#favorited-by-${rest_id}`,
          published: null,
          name: `like of ${source}`,
          "like-of": source,
          "wm-property": "like-of",
        },
      }),
    });
    console.log(resp);
  }
}

await main(parse(Deno.args));

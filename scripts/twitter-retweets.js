import { parse } from "https://deno.land/std@0.205.0/flags/mod.ts";

async function main({ token }) {
  const {
    default: { data },
  } = await import("./data/twitter-retweets.json", {
    with: { type: "json" },
  });
  const target = "https://www.rarous.net/weblog/2023/10/23/pagefind.html";
  const source = "https://twitter.com/alesroubicek/status/1716417697607455226";
  const { entries } = data.retweeters_timeline.timeline.instructions[0];
  const users = entries
    .filter((x) => x.content.entryType === "TimelineTimelineItem")
    .map((x) => x.content.itemContent.user_results.result);
  console.log(`importing ${users.length} user retweets`);
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
            photo: `https://res.cloudinary.com/rarous/image/fetch/dpr_auto,f_auto/${user.profile_image_url_https}`,
            url: `https://twitter.com/${user.screen_name}`,
          },
          url: `${source}#retweeted-by-${rest_id}`,
          published: null,
          name: `repost of ${source}`,
          "repost-of": source,
          "wm-property": "repost-of",
        },
      }),
    });
    console.log(user.screen_name, resp.status);
  }
}

await main(parse(Deno.args));

// deno run --allow-read=data --allow-net=www.rarous.net twitter-retweets.js --token="$(op read 'op://rarous.net/rarousnet webmentions webhook/credential')"

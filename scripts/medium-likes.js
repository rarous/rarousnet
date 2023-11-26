import { parse } from "https://deno.land/std@0.205.0/flags/mod.ts";

async function main({ token }) {
  const {
    default: [{ data }],
  } = await import("./data/medium-likes.json", {
    with: { type: "json" },
  });
  const target = "https://www.rarous.net/weblog/2020/12/14/hlidace-shopu-pro-socialni-site.html";
  const source = data.post.mediumUrl;
  const { items } = data.post.voters;
  const users = items.map((x) => x.user);
  for (const user of users) {
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
            photo: `https://miro.medium.com/v2/resize:fill:80:80/${user.imageId}`,
            url: user.hasSubdomain
              ? `https://${user.username}.medium.com/`
              : `https://medium.com/@${user.username}`,
          },
          url: `${source}#liked-by-${user.id}`,
          published: "2019-11-08T03:38:09+00:00",
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

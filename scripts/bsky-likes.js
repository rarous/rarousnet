import { delay } from "jsr:@std/async/delay";
import { parseArgs } from "jsr:@std/cli/parse-args";

// Open Network tab in Dev Tools, open reactions list by clicking on Names under post, there will be `graphql?variables=` request.
// Reactions are returned with a custom MIME type not decoded in Browser Network view.
// Copy it as cURL and `> ./data/bsy-likes.json` it, it's just plain JSON.

async function main({ token }) {
  const {
    default: { likes },
  } = await import("./data/bsky-likes.json", { with: { type: "json" } });
  const target = "https://www.rarous.net/weblog/2025/02/03/apify-keboola-uploader.html";
  const source = "https://bsky.app/profile/did:plc:o5rb2pctvr4fevekac7ig5yx/post/3lhb3upuwsc2v";
  for (const reaction of likes) {
    const user = reaction.actor;
    const userId = user.did;
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
            name: user.displayName,
            photo: user.avatar,
            url: `https://bsky.app/profile/${user.handle}`,
          },
          url: `${source}#liked-by-${userId}`,
          published: reaction.createdAt,
          name: `like of ${source}`,
          "like-of": source,
          "wm-property": "like-of",
        },
      }),
    });
    console.log(user.handle, resp.status);
    await delay(200);
  }
}

await main(parseArgs(Deno.args));

// deno run --allow-read=data --allow-net=www.rarous.net bsky-likes.js --token="$(op read 'op://rarous.net/rarousnet webmentions webhook/credential')"

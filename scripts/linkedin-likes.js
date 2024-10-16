import { parse } from "https://deno.land/std@0.205.0/flags/mod.ts";

// Open Network tab in Dev Tools, open reactions list by clicking on Names under post, there will be `graphql?variables=` request.
// Reactions are returned with a custom MIME type not decoded in Browser Network view.
// Copy it as cURL and `> ./data/li-likes.json` it, it's just plain JSON.

async function main({ token }) {
  const { default: { included }} = await import("./data/li-likes.json", { with: { type: "json" }});
  const target = "https://www.rarous.net/weblog/2024/10/14/renderovani-webovych-komponent-ve-workerech";
  const source = "https://www.linkedin.com/feed/update/urn:li:activity:7251837350995984384/";
  const reactions = included.filter(x => x["$type"] === "com.linkedin.voyager.dash.social.Reaction")
  for (const reaction of reactions) {
    const userId = reaction.actorUrn;
    const user = reaction.reactorLockup;
    let detailData = user.image.attributes[0].detailData;
    const image = detailData.nonEntityProfilePicture?.vectorImage ?? detailData.nonEntityCompanyLogo.vectorImage;
    const { rootUrl } = image;
    const imageId = image.artifacts[0].fileIdentifyingUrlPathSegment;
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
            name: user.title.text,
            photo: `${rootUrl}${imageId}`,
            url: user.navigationUrl,
          },
          url: `${source}#liked-by-${userId}`,
          published: new Date().toISOString(),
          name: `like of ${source}`,
          "like-of": source,
          "wm-property": "like-of",
        },
      }),
    });
    console.log(user.title.text, resp.status)
  }
}

await main(parse(Deno.args));
// deno run --allow-read=data --allow-net=www.rarous.net linkedin-likes.js --token="$(op read 'op://rarous.net/rarousnet webmentions webhook/credential')"

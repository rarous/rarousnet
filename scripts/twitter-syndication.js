const blogMentions = tweets
  .filter(({ tweet }) =>
    tweet.entities.urls.some(({ display_url }) =>
      display_url.startsWith("rarous.net/weblog/")
    )
  )
  .map(({ tweet }) => ({
    url:
      tweet.entities.urls.find(({ display_url }) =>
        display_url.startsWith("rarous.net/weblog/")
      ).expanded_url,
    tweet: `https://twitter.com/alesroubicek/status/${tweet.id}`,
  }));
const syndications = new Map();
for (const { url, tweet } of blogMentions) {
  const values = syndications.get(url) ?? [];
  values.push(tweet);
  syndications.set(url, values);
}
const input = Array.from(syndications).sort((a, b) => a[0].localeCompare(b[0]));
const output = {};
for (
  const [url, syndication] of input
) {
  output[url] = { syndication };
}
await Deno.writeTextFile(
  "./data/syndication.json",
  JSON.stringify(output, null, 2),
);

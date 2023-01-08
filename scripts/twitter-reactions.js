import { parse } from "https://deno.land/std@0.140.0/flags/mod.ts";
async function main({ token }) {
  const webmentions = [];
  for (let i = 0; i < 3; i++) {
    const resp = await fetch(
      `https://webmention.io/api/mentions.jf2?token=${token}&page=${i}}`,
    );
    const { children } = await resp.json();
    webmentions.push(...children);
  }

  const blogMentions = new Map();
  for (const entry of webmentions) {
    const url = entry["wm-target"];
    const values = blogMentions.get(url) ?? [];
    values.push(entry);
    blogMentions.set(url, values);
  }

  const input = Array.from(blogMentions).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  const output = {};
  for (
    const [url, webmentions] of input
  ) {
    output[url] = { webmentions };
  }

  await Deno.writeTextFile(
    "./data/webmentions.json",
    JSON.stringify(output, null, 2),
  );
}

await main(parse(Deno.args));

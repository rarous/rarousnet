import { parse } from "https://deno.land/std@0.210.0/flags/mod.ts";

async function getReleases(page, token) {
  const params = new URLSearchParams({
    page,
    per_page: 100,
    sort: "artist"
  });
  const resp = await fetch(`https://api.discogs.com/users/rarous/collection/folders/1/releases?${params}`, {
    headers: { "Authorization": `Discogs token=${token}` }
  });
  return resp.json();
}

async function main({ token }) {
  const result = [];

  let page = 1;
  let stop = false;

  do {
    const { pagination, releases } = await getReleases(page, token);
    result.push(...releases);
    stop = pagination.pages === page++;
  } while (!stop);

  console.log(JSON.stringify(result));
}

await main(parse(Deno.args));

// deno run --allow-net=api.discogs.com discogs.js --token="$(op read 'op://Private/Discogs/API/Access Token')"

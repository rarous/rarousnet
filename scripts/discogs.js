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
    const items = releases.map(x => x.basic_information).map(x => ({
      id: x.id,
      title: x.title,
      image: x.cover_image,
      year: x.year,
      artist: { id: x.artists[0].id, name: x.artists[0].name }
    }));
    result.push(...items);
    stop = pagination.pages === page++;
  } while (!stop);

  console.log(JSON.stringify(result));
}

await main(parse(Deno.args));

// deno run --allow-net=api.discogs.com discogs.js --token="$(op read 'op://Private/Discogs/API/Access Token')"

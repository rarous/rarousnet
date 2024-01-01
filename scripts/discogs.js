import { parse } from "https://deno.land/std@0.210.0/flags/mod.ts";

async function getReleases(page, token) {
  const params = new URLSearchParams({
    page,
    per_page: 100,
    sort: "artist",
  });
  const resp = await fetch(`https://api.discogs.com/users/rarous/collection/folders/1/releases?${params}`, {
    headers: { "Authorization": `Discogs token=${token}` },
  });
  return resp.json();
}

function cleanArtistName(name) {
  return name.replace(/\s\(\d+\)$/, "");
}

async function searchAlbumOnSpotify(q, spotifyToken) {
  const params = new URLSearchParams({
    q,
    type: "album,track",
    limit: 1,
  });
  const resp = await fetch(`https://api.spotify.com/v1/search?${params}`, {
    headers: { Authorization: `Bearer ${spotifyToken}` },
  });
  const { albums } = await resp.json();
  return albums;
}

async function main({ token, spotifyToken }) {
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
      artist: { id: x.artists[0].id, name: cleanArtistName(x.artists[0].name) },
    }));
    result.push(...items);
    stop = pagination.pages === page++;
  } while (!stop);

  function byArtistAndYear(a, b) {
    const comparison = a.artist.name.localeCompare(b.artist.name);
    if (comparison !== 0) return comparison;
    return a.year - b.year;
  }

  for (const item of result.sort(byArtistAndYear)) {
    let albums = await searchAlbumOnSpotify(
      `artist:${item.artist.name} album:${item.title} year:${item.year}`,
      spotifyToken,
    );
    if (!albums.items.length) {
      // if we don't find album for exact release year, try to search for any year
      albums = await searchAlbumOnSpotify(`artist:${item.artist.name} album:${item.title}`, spotifyToken);
    }
    item.spotifyUri = albums.items?.[0]?.uri;
  }

  console.log(JSON.stringify(result));
}

await main(parse(Deno.args));

// deno run --allow-net=api.discogs.com,api.spotify.com discogs.js --token="$(op read 'op://Private/Discogs/API/Access Token')"

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

async function* getAllReleases(token) {
  let page = 1;
  let done = false;
  do {
    const { pagination, releases } = await getReleases(page, token);
    yield releases;
    done = pagination.pages === page++;
  } while (!done);
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
  let result = null;
  do {
    const resp = await fetch(`https://api.spotify.com/v1/search?${params}`, {
      headers: { Authorization: `Bearer ${spotifyToken}` },
    });
    const { error, albums } = await resp.json();
    if (error) {
      const retryAfter = Number.parseInt(resp.headers.get("Retry-After"), 10) * 1000;
      await new Promise(resolve => setTimeout(resolve, retryAfter));
    }
    else {
      result = albums;
    }
  } while (!result);
  return result;
}

async function authSpotify({ clientId, clientSecret }) {
  const resp = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  return resp.json();
}

function byArtistAndYear(a, b) {
  const comparison = a.artist?.name.localeCompare(b.artist?.name);
  if (comparison !== 0) return comparison;
  return a.year - b.year;
}

async function main({ token, clientId, clientSecret }) {
  const result = [];
  for await (const releases of getAllReleases(token)) {
    const items = releases.map(x => x.basic_information).map(x => ({
      id: x.id,
      title: x.title,
      image: x.cover_image,
      year: x.year,
      artist: { id: x.artists[0].id, name: cleanArtistName(x.artists[0].name) },
    }));
    result.push(...items);
  }

  const { error, access_token: spotifyToken } = await authSpotify({ clientId, clientSecret });

  for (const item of result) {
    if (error) {
      console.error(error);
      break;
    }
    let albums = await searchAlbumOnSpotify(
      `artist:${item.artist.name} album:${item.title} year:${item.year}`,
      spotifyToken,
    );
    if (!albums?.items?.length) {
      // if we don't find album for exact release year, try to search for any year
      albums = await searchAlbumOnSpotify(`artist:${item.artist.name} album:${item.title}`, spotifyToken);
    }
    if (!albums) console.warn(`No albums found for artis:${item.artist.name} album:${item.title}`);
    else item.spotifyUri = albums.items?.[0]?.uri;
  }

  console.log(JSON.stringify(result.sort(byArtistAndYear)));
}

await main(parse(Deno.args));

// deno run --allow-net=api.discogs.com,api.spotify.com,accounts.spotify.com discogs.js --token="$(op read 'op://rarous.net/Discogs/credential')" --clientId="$(op read 'op://rarous.net/Spotify/username')" --clientSecret "$(op read 'op://rarous.net/Spotify/credential')"

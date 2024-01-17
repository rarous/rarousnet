/** @typedef {import("@cloudflare/worker-types/2023-07-01").ScheduledEvent} ScheduledEvent */

/** @typedef {import("@cloudflare/worker-types/2023-07-01").ExecutionContext} ExecutionContext */
/** @typedef {import("./env.d.ts").Env} Env */

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

async function authSpotify(clientId, clientSecret) {
  const resp = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  return resp.json();
}

/**
 * @param {Env} env
 */
async function updateDiscogsCollection(env) {
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
    const comparison = a.artist?.name.localeCompare(b.artist?.name);
    if (comparison !== 0) return comparison;
    return a.year - b.year;
  }

  const { access_token: spotifyToken } = await authSpotify(clientId, clientSecret);

  for (const item of result) {
    let albums = await searchAlbumOnSpotify(
      `artist:${item.artist.name} album:${item.title} year:${item.year}`,
      spotifyToken,
    );
    if (!albums?.items?.length) {
      // if we don't find album for exact release year, try to search for any year
      albums = await searchAlbumOnSpotify(`artist:${item.artist.name} album:${item.title}`, spotifyToken);
    }
    item.spotifyUri = albums.items?.[0]?.uri;
  }

  await env.weblog.put("/kolekce/vinyly", JSON.stringify(result.sort(byArtistAndYear)));
}

export default {
  /**
   * @param {ScheduledEvent} event
   * @param {Env} env
   * @param {ExecutionContext} ctx
   */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(updateDiscogsCollection(env));
  },
};

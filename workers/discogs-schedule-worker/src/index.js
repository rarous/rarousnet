import { parseHTML } from "linkedom/worker";

/**
 * @param {string} page
 * @param {string} token
 * @returns Promise<DiscogsReleaseResponse>
 */
async function getReleases(page, token) {
  const params = new URLSearchParams({
    page,
    per_page: 100,
    sort: "artist",
  });
  const resp = await fetch(`https://api.discogs.com/users/rarous/collection/folders/0/releases?${params}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Discogs token=${token}`,
      "User-Agent": "rarous.net vinyl collection",
    },
  });
  return resp.json();
}

/**
 * @param {string} token
 * @returns {AsyncGenerator<Release[], never, void>}
 */
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

function byArtistAndYear(a, b) {
  const comparison = a.artist?.name.localeCompare(b.artist?.name);
  if (comparison !== 0) return comparison;
  return a.year - b.year;
}

async function findItunesId(name, title) {
  const resp = await fetch(
    `https://itunes.apple.com/search?term=${encodeURIComponent(name)}+${encodeURIComponent(title)}&entity=album`,
  );
  const data = await resp.json();
  if (data.resultCount === 0) return null;
  return data.results[0].collectionId;
}

async function getAlbumLinks(itunesId) {
  const resp = await fetch(`https://album.link/i/${itunesId}`);
  const html = await resp.text();
  const { document } = parseHTML(html);
  return Array.from(document.querySelectorAll("main>div:nth-of-type(2)>div:nth-of-type(2)>a"), x => ({
    link: x.href,
    title: x.textContent,
    label: x.getAttribute("aria-label"),
    icon: x.querySelector("svg").toString(),
  }));
}

/**
 * @param {Env} env
 */
async function updateDiscogsCollection(env) {
  const current = await env.weblog.get("/kolekce/vinyly", "json");
  const knownItunesIds = new Map(current.map(x => [x.id, x.itunesId]));
  const knownAlbumLinks = new Map(current.map(x => [x.id, x.links]));

  const result = [];
  for await (const releases of getAllReleases(env.DISCOGS_TOKEN)) {
    const items = releases
      .map(x => x.basic_information)
      .map(x => ({
        id: x.id,
        title: x.title,
        image: x.cover_image,
        year: x.year,
        artist: {
          id: x.artists[0].id,
          name: cleanArtistName(x.artists[0].name),
        },
        itunesId: knownItunesIds.get(x.id),
        links: knownAlbumLinks.get(x.id),
      }));
    result.push(...items);
  }

  for (const item of result) {
    if (!item.itunesId) item.itunesId = await findItunesId(item.artist.name, item.title);
    if (!item.links && item.itunesId) item.links = await getAlbumLinks(item.itunesId);
  }

  await env.weblog.put("/kolekce/vinyly", JSON.stringify(result.sort(byArtistAndYear)));
}

export default {
  /**
   * @param {ScheduledEvent} event
   * @param {Env} env
   * @param {ExecutionContext} ctx
   */
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(updateDiscogsCollection(env));
  },
};

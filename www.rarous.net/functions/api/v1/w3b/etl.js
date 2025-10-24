/**
 * @param {EventContext<Env>} context
 * @returns {Promise<Response>}
 */
export async function onRequestGet({ env }) {
  const index = await env.w3b.get("/latest", "json");

  for (const entry of Object.values(index).map(x => Object.assign(x, { entry: Object.assign(x.entry, { link: undefined, url: x.entry.link }) }))) {
    const resp = await fetch(`https://gryphoon.work/api/v1/w3blogy.cz/articles/share`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(entry)
    });
  }
  return new Response();
}

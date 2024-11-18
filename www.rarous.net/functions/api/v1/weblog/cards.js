/**
 * @param {EventContext<Env>} context
 */
export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    if (body.secret !== env.RAROUS_WEBLOG_CARDS_SECRET) {
      return new Response("Invalid secret", { status: 403 });
    }
    await env.weblog.put("/weblog/cards", JSON.stringify(body.items));
    return new Response(null, { status: 202 });
  } catch (err) {
    console.log(err);
    return Response.error();
  }
}

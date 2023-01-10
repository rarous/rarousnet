import { Hono } from "hono";

const app = new Hono();

async function getPayload(weblog, url) {
  const payload = await weblog.get(url);
  if (payload) return JSON.parse(payload);
  return { webmentions: [] };
}

async function setPayload(weblog, url, payload) {
  return weblog.put(url, JSON.stringify(payload));
}

app.post("/webhooks/webmentions", async (c) => {
  try {
    const { env, req } = c;
    const secret = env.WEBMENTIONS_WEBHOOK_SECRET;
    const body = await req.json();
    if (body.secret !== secret) return c.status(403);
    const { post, target, deleted } = body;
    const payload = await getPayload(env.weblog, target);
    const webmentions = new Map(payload.webmentions.map((x) => [x.url, x]));
    if (deleted) {
      webmentions.delete(post.url);
    } else {
      webmentions.set(post.url, post);
    }
    payload.webmentions = Array.from(webmentions.values());
    await setPayload(env.weblog, target, payload);
    return c.status(202);
  } catch (err) {
    console.log(err);
    return c.status(500);
  }
});

export default app;

import { Hono } from "hono";

const app = new Hono();

async function getPayload(weblog, url) {
  const payload = await weblog.get(url);
  if (payload) return JSON.parse(payload);
  return { webmentions: [] };
}

async function setPayload(weblog, url, payload) {
  return weblog.set(url, JSON.stringify(payload));
}

app.post("/webhooks/webmentions", async (c) => {
  const { env, req } = c;
  const secret = env.WEBMENTIONS_WEBHOOK_SECRET;
  const body = await req.json();
  if (body.secret !== secret) return c.status(403);
  const { post, target } = body;
  const payload = await getPayload(env.weblog, target);
  payload.webmentions.push(post);
  await setPayload(env.weblog, target, payload);
  return c.status(202);
});

export default app;

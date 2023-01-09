import { Hono } from "hono";

const app = new Hono();

app.post("/webhooks/webmentions", async (c) => {
  const { env, req } = c;
  const secret = env.WEBMENTIONS_WEBHOOK_SECRET;
  const body = await req.json();
  if (body.secret !== secret) return c.status(403);
  console.log(body);
  return c.status(202);
});

export default app;

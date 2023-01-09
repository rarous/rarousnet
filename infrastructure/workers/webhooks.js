import { Hono } from "hono";

const app = new Hono();

app.post("webmentions", async (c) => {
  const { env, req } = c;
  const secret = env.WEBMENTIONS_WEBHOOK_SECRET;
  const body = await req.json();
  if (body.secret !== secret) return c.status(403);
  return c.status(202);
});

export default app;

import { Hono } from "hono";

const app = new Hono();

async function getPayload(weblog, url) {
  const payload = await weblog.get(url);
  if (payload) return JSON.parse(payload);
  return { webmentions: [] };
}

app.get("/api/v1/weblog", async (c) => {
  try {
    const { env, req } = c;
    const target = req.query("url");
    const payload = await getPayload(env.weblog, target);
    return c.json(payload);
  } catch (err) {
    console.log(err);
    return c.status(500);
  }
});

export default app;

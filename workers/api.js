/** @see https://honojs.dev/ */
import { Hono } from "hono";

const app = new Hono();

async function getDetail(weblog, url) {
  const payload = await weblog.get(url);
  if (payload) return JSON.parse(payload);
  return { webmentions: [] };
}

app.get("/api/v1/weblog", async (c) => {
  try {
    const { env, req } = c;
    const target = req.query("url");
    const detail = await getDetail(env.weblog, target);
    detail.webmentions = detail.webmentions.filter((x) =>
      x.author.url !== "https://twitter.com/alesroubicek"
    );
    return c.json(detail);
  } catch (err) {
    console.log(err);
    return c.status(500);
  }
});

export default app;

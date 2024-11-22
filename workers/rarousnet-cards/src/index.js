import puppeteer from "@cloudflare/puppeteer";

const headers = {
  "Content-Type": "image/png",
  "Cache-Control": "public, max-age=3600",
};

export default {
  /*
   * @param {Request} request
   * @param {Env} env
   * @param {ExecutionContext} ctx
   */
  async fetch(request, env, ctx) {
    const cards = await env.weblog.get("/weblog/cards", "json");
    const detail = new Map(cards).get(request.url);
    if (!detail) {
      return new Response("Not Found", { status: 404 });
    }

    // try to get cached image
    const cachedImage = await env.weblog.get(`/weblog/cards/${detail.hash}`, "stream");
    if (cachedImage) {
      console.log(`found pre-rendered image in KV /weblog/cards/${detail.hash}`);
      return new Response(cachedImage, { headers });
    }

    const browser = await puppeteer.launch(env.browser);
    try {
      const page = await browser.newPage();
      // set data via GET parameters
      const params = new URLSearchParams(Object.entries(detail));
      const url = `https://www.rarous.net/weblog/card?${params}`;
      console.log(`rendering card: ${url}`);
      await page.goto(url);
      // take a screenshot of card element
      const card = await page.waitForSelector("#card");
      const buffer = await card.screenshot({ encoding: "binary" });
      // cache image for one month
      await env.weblog.put(`/weblog/cards/${detail.hash}`, buffer, {
        expirationTtl: 2_629_746,
      });
      return new Response(buffer, { headers });
    } finally {
      await browser.close();
    }
  },
};

import puppeteer from "@cloudflare/puppeteer";

const headers = {
  "Content-Type": "image/png",
  "Cache-Control": "public, max-age=3600",
};

export default {
  async fetch(request, env, ctx) {
    // Try to get cached image
    const cachedImage = await env.weblog.get(request.url, "stream");
    if (cachedImage) {
      return new Response(cachedImage, {
        status: 200,
        headers,
      });
    }

    const [page, cards] = await Promise.all([
      puppeteer.launch(env.browser).then(x => x.newPage()),
      env.weblog.get("/weblog/cards", "json"),
    ]);
    const detail = new Map(cards).get(request.url);
    // Set data via GET parameters
    const params = new URLSearchParams(Object.entries(detail));
    const url = `https://www.rarous.net/weblog/card?${params}`;
    console.log(`rendering card: ${url}`);
    await page.goto(url);
    // take a screenshot of card element
    const card = await page.waitForSelector("#card");
    const buffer = await card.screenshot({ encoding: "binary" });
    // cache image for one hour
    await env.weblog.put(request.url, buffer, { expirationTtl: 3600 });
    return new Response(buffer, { headers });
  },
};

import { getSVG } from "qreator/lib/svg.js";

export async function onRequestGet({ request }) {
  const { searchParams } = new URL(request.url);
  const text = searchParams.get("text");
  if (!text) return new Response("Missing required parameter: text", { status: 400 });

  const buffer = await getSVG(text);
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      'Access-Control-Allow-Origin': 'www.rarous.net',
    },
  });
}

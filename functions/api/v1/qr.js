import { getSVG } from "qreator/lib/svg";

export async function onRequestGet({ request }) {
  const { searchParams } = new URL(request.url);
  const text = searchParams.get("t") ?? searchParams.get("text");
  if (!text) return new Response("Missing required parameter: text", { status: 400 });

  const color = searchParams.get("c") ?? searchParams.get("color");
  const bgColor = searchParams.get("bg") ?? searchParams.get("bgColor");
  const borderRadius = searchParams.get("br") ?? searchParams.get("borderRadius");
  const buffer = await getSVG(text, { color, bgColor, borderRadius });
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      'Access-Control-Allow-Origin': 'www.rarous.net',
    },
  });
}

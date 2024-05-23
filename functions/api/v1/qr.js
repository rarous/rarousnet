import { getSVG } from "qreator/lib/svg";

/**
 * Generates QR code for given `text`. `color`, `bgColor` and `borderRadius` can be changed via GET parameters.
 * @param {EventContext<Env>} context
 * @returns {Promise<Response>}
 */

export async function onRequestGet({ request }) {
  const { searchParams } = new URL(request.url);
  const text = searchParams.get("t") ?? searchParams.get("text");
  if (!text) return new Response("Missing required parameter: text", { status: 400 });

  const color = searchParams.get("c") ?? searchParams.get("color") ?? "#000000";
  const bgColor = searchParams.get("bg") ?? searchParams.get("bgColor") ?? "#ffffff";
  const borderRadius = parseInt(searchParams.get("br") ?? searchParams.get("borderRadius") ?? "0");
  const buffer = await getSVG(text, { color, bgColor, borderRadius });
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      'Access-Control-Allow-Origin': 'www.rarous.net',
    },
  });
}

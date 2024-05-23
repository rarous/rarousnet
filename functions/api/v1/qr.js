import { imageSync } from "qr-image";

export async function onRequestGet({ request }) {
  const { searchParams } = new URL(request.url);
  const text = searchParams.get("text");
  const size = parseInt(searchParams.get("size") ?? "200");
  if (!text) return new Response("Missing required parameter: text", { status: 400 });

  const buffer = imageSync(text, { type: "png", size });
  return new Response(buffer, {
    headers: { "Content-Type": "image/png" },
  });
}

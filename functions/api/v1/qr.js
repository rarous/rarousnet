import { imageSync } from "qr-image";

export async function onRequestGet({ request }) {
  const { searchParams } = new URL(request.url);
  const text = searchParams.get("text");
  if (!text) return new Response("Missing parameter text", { status: 400 });
  const buffer = imageSync(text, { type: "png" });
  return new Response(buffer, {
    headers: { "Content-Type": "image/png" },
  });
}

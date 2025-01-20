import { createCookie } from "../lib/auth.js";

/**
 * @param {EventContext<Env>} context
 * @returns {Promise<Response>}
 */
export async function onRequestGet({ request, env }) {
  const origin = request.headers.get("Origin") ?? request.headers.get("Referer") ?? `https://${env.HOSTNAME}/`;

  const authCookie = createCookie("", {
    expires: new Date(0),
    domain: env.domain,
    path: "/",
    // For local development and PWA, we need to relax Cross site security
    sameSite: "Lax",
    secure: true,
    httpOnly: true,
  });
  return new Response(null, {
    status: 302,
    headers: {
      Location: origin,
      "Set-Cookie": authCookie,
    },
  });
}

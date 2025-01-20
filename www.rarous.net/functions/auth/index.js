import { createCookie, signJWT } from "../lib/auth.js";
import { verifyGoogleAuth } from "../lib/gauth.js";

/**
 * @param {EventContext<Env>} context
 * @returns {Promise<Response>}
 */
export async function onRequestPost({ request, env }) {
  const { error, profile, credential } = await verifyGoogleAuth(request, env);
  if (error) {
    return new Response(error, { status: 400 });
  }

  const isAdmin = profile.email === "ales.roubicek@hckr.studio";
  const payload = {
    "https://www.rarous.net/email": profile.email,
    "https://www.rarous.net/is_admin": isAdmin,
    "https://google.com/access_token": credential,
  };
  const idToken = await signJWT(payload, env.PRIVATE_KEY);
  // TODO: support for local development
  const cookie = createCookie(idToken, {
    maxAge: 1_209_600,
    domain: env.domain,
    path: "/",
    // For local development and PWA, we need to relax Cross site security
    sameSite: "Lax",
    secure: true,
    httpOnly: true,
  });
  let targetUrl = `https://${env.HOSTNAME}/`;
  const referrer = request.headers.get("Referer");
  if (referrer) {
    const returnUrl = new URL(referrer).searchParams.get("returnUrl");
    if (returnUrl) targetUrl = returnUrl;
  }
  return new Response(null, {
    status: 303,
    headers: {
      Location: targetUrl,
      "Set-Cookie": cookie,
    },
  });
}

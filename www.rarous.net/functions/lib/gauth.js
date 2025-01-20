import { parse } from "cookie";

async function verify(credential, { clientId, domain }) {
  const resp = await fetch(
    `https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${credential}`
  );
  if (!resp.ok) return null;
  const { aud, hd, email, name, picture } = await resp.json();
  const domains = new Set([domain, "hckr.studio"]);
  if (clientId !== aud || !domains.has(hd)) return null;
  return { email, name, image: picture };
}

export async function verifyGoogleAuth(request, env) {
  const cookies = parse(request.headers.get("cookie") ?? "");
  const csrfCookie = cookies["g_csrf_token"];
  if (!csrfCookie) {
    return { error: "No CSRF token in Cookie." };
  }

  const params = await request.formData();
  const csrfToken = params.get("g_csrf_token");
  if (!csrfToken) {
    return { error: "No CSRF token in post body." };
  }
  if (csrfToken !== csrfCookie) {
    return { error: "Failed to verify double submit cookie." };
  }

  const credential = params.get("credential");
  const profile = await verify(credential, env);
  return { profile, credential };
}

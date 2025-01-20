import { parse, serialize } from "cookie";
import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";

/** @typedef {import("cookie").SerializeOptions} SerializeOptions */

const COOKIE_NAME = "rarous-id";
const options = {
  audience: "https://www.rarous.net/",
  issuer: "https://www.rarous.net/",
  expiresIn: "14 days",
};

export function signJWT(payload, privateKey) {
  const secret = new TextEncoder().encode(privateKey);
  const jwt = new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(options.issuer)
    .setAudience(options.audience)
    .setExpirationTime(options.expiresIn);
  return jwt.sign(secret);
}

async function verify(secret, token) {
  const key = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, key, {
    issuer: options.issuer,
    audience: options.audience,
  });
  return payload;
}

export async function validateToken(token, secret) {
  if (token == null) return false;
  try {
    return await verify(secret, token);
  } catch (err) {
    console.error(err);
    return null;
  }
}

export function getCookies(headers) {
  const cookie = headers.get("cookie");
  if (cookie) return parse(cookie);
  return null;
}

function getAuthorization(headers) {
  return headers.get("authorization");
}

export function getToken(headers) {
  const cookies = getCookies(headers);
  if (cookies?.[COOKIE_NAME]) return cookies[COOKIE_NAME];

  const authorization = getAuthorization(headers);
  if (!authorization?.startsWith("Bearer ")) return null;
  const [, token] = authorization.split("Bearer ");
  return token;
}

/**
 * @param {string} idToken
 * @param {SerializeOptions} options
 * @return {string}
 */
export function createCookie(idToken, options) {
  return serialize(COOKIE_NAME, idToken, options);
}

/**
 * @typedef {import("../env.d.ts").Env} Env
 */

/**
 * @param {EventContext<Env>} context
 */
export async function onRequest({ next, request }) {
  console.log({ url: request.url, event: "middleware" });
  return next();
}

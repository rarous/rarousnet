import turnstilePlugin from "@cloudflare/pages-plugin-turnstile";

/**
 * @param {EventContext<Env>} context
 */
export async function onRequestPost(context) {
  if (context.request.headers.get("content-type") === "application/json") return context.next();
  return turnstilePlugin({ secret: context.env.TURNSTILE_SECRET_KEY })(context);
}

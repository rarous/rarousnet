import { Rollbar } from "../lib/rollbar.js";

/**
 * @param {EventContext} context
 * @returns {Promise<Response>}
 */
export async function onRequest(context) {
  const { pluginArgs, ...ctx } = context;
  context.data.rollbar = new Rollbar({
    context: ctx,
    pluginArgs
  });

  try {
    return await context.next();
  } catch (thrown) {
    context.data.rollbar.error(thrown);
    throw thrown;
  }
}

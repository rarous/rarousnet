export default {
  fetch(request, env, ctx) {
    const secret = env.WEBMENTIONS_WEBHOOK_SECRET;
    return new Response();
  },
};

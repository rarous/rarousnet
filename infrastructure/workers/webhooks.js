export default {
  fetch(request, env, ctx) {
    return new Response(env.WEBMENTIONS_WEBHOOK_SECRET);
  },
};

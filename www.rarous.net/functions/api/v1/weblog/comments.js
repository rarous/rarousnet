import turnstilePlugin from "@cloudflare/pages-plugin-turnstile";
import { Texy } from "../../../lib/texy/Texy.js";
import { Configurator } from "../../../lib/texy/Configurator.js";
import { Syntax } from "../../../lib/texy/Syntax.js";

async function processText(text, references) {
  const texy = new Texy();
  Configurator.safeMode(texy);

  texy.allowed[Syntax.Inserted] = true;   // phrase/ins
  texy.allowed[Syntax.Superscript] = true; // phrase/sup
  texy.allowed[Syntax.Deleted] = true;    // phrase/del
  texy.allowed[Syntax.Subscript] = true;  // phrase/sub

  texy.htmlPolicy.allowedTags = false;
  texy.headingModule.top = 4;

  for (const [index, comment] of references.entries()) {
    if (!('link' in comment)) continue;
    texy.linkModule.addDefinition(String(index + 1), comment.link, comment.label);
  }

  return texy.process(text);
}

/**
 * @param {KVNamespace} weblog
 * @param {string} url
 */
async function getDetail(weblog, url) {
  const payload = (await weblog.get(url, "json")) ?? (await weblog.get(url + ".html", "json"));
  return Object.assign({ webmentions: [], comments: [] }, payload);
}

/**
 * @param {EventContext<Env>} context
 */
export const onRequestPost = [
  async context => turnstilePlugin({ secret: context.env.TURNSTILE_SECRET_KEY })(context),
  async context => {
    const now = new Date();
    const { env, request } = context;
    if (!request.cf.botManagement.jsDetection.passed) {
      // CF classified bot, skip
      return new Response(null, { status: 451 });
    }

    const url = new URL(request.url);
    const target = url.searchParams.get("url");
    if (target.startsWith("https:/www.rarous.net")) {
      // spam with broken URL
      return new Response(null, { status: 451 });
    }

    const [detail, comment] = await Promise.all([getDetail(env.weblog, target), request.formData()]);
    // TODO: validate comment
    if (/^\p{Script=Cyrillic}+$/u.test(comment.get("text"))) {
      // russian spam
      return new Response(null, { status: 451 });
    }
    const comments = detail?.comments ?? [];
    const references = comments
      .filter(x => x.isEnabled)
      .map((x, i) => [
        i.toString(),
        {
          link: `#komentar-${new Date(x.created).valueOf()}`,
          label: `#${i + 1} @${x.author.name}`,
        },
      ]);
    const textResult = processText(comment.get("text"), references);
    const created = now.toISOString();
    const author = {
      name: comment.get("name"),
      email: comment.get("email"),
      web: comment.get("web"),
    };
    const text = await textResult;
    const isEnabled = !(
      text.includes("Coinbase") ||
      text.includes(".ru/") ||
      text.includes(".su/") ||
      author.web?.includes(".ru")
    ); // TODO: check for spam, hate etc. -> isEnabled = false;
    const insert = { author, created, text, isEnabled };
    comments.push(insert);

    const upsert = Object.assign({}, detail, { comments });
    await env.weblog.put(target, JSON.stringify(upsert));

    const lastComments = (await env.weblog.get("/weblog/comments", "json")) ?? [];
    lastComments.push(
      Object.assign(
        {
          href: `${target}#komentar-${now.valueOf()}`,
          article: { title: comment.get("article-title") ?? "" },
        },
        insert,
      ),
    );
    if (lastComments.length > 10) lastComments.shift();
    await env.weblog.put("/weblog/comments", JSON.stringify(lastComments));

    const accept = request.headers.get("accept");
    if (accept === "application/json") {
      return Response.json(insert);
    }
    return Response.redirect(`${target}#komentar-${now.valueOf()}`);
  },
];

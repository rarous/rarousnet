import { parse } from "rollbar/src/errorParser.js";

export async function postItem(token, data) {
  console.log(data)
  const resp = await fetch("https://api.rollbar.com/api/1/item/", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-Rollbar-Access-Token": token,
    },
    body: JSON.stringify({ data }),
  });
  const message = await resp.json();
  console.log(message);
  return message;
}

/**
 * @param {Request} request
 * @param {Params} params
 */
function dumpRequest(request, params) {
  const { searchParams } = new URL(request.url);
  return {
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(request.headers),
    params,
    GET: Object.fromEntries(searchParams),
    query_string: searchParams.toString()
    // TODO: POST, body
  };
}

export class Rollbar {
  constructor({ context, token, custom }) {
    this.token = token;
    this.context = context;
    this.custom = custom;
  }

  log(level, item) {
    console[level]?.(item.body.message?.body ?? item.body.trace.exception.message);
    const request = dumpRequest(this.context.request, this.context.params);
    const uuid = crypto.randomUUID();
    const context = this.context.functionPath;
    const custom = Object.assign({ cf: this.context.request.cf }, this.custom);
    const { CF_PAGES, CF_PAGES_COMMIT_SHA } = this.context.env;
    return postItem(
      this.token,
      Object.assign({ level, request, uuid, context, custom }, item, {
        environment: CF_PAGES == 1 ? "production" : "development",
        code_version: CF_PAGES_COMMIT_SHA,
        platform: "cloudflare-pages",
        language: "javascript",
        notifier: { name: "Cloudflare Pages Functions" },
      }),
    );
  }

  info(message) {
    return this.log("info", {
      timestamp: Date.now(),
      body: { message: { body: message } },
    });
  }

  error(exception) {
    return this.log("error", {
      timestamp: Date.now(),
      body: {
        trace: {
          frames: parse(exception).stack,
          exception: {
            class: exception.name,
            message: exception.message
          }
        }
      } ,
    });
  }
}

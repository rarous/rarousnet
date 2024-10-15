import {parse} from "rollbar/src/errorParser.js";

export async function postItem(token, data) {
  const resp = await fetch("https://api.rollbar.com/api/1/item/", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-Rollbar-Access-Token": token,
    },
    body: JSON.stringify({ data }),
  });
  return resp.json();
}

function dumpRequest(request) {
  return undefined;
}

export class Rollbar {
  constructor({ context, token }) {
    this.token = token;
    this.context = context;
  }

  log(level, item) {
    console[level]?.(item);
    const request = dumpRequest(this.context.request);
    const uuid = crypto.randomUUID();
    return postItem(
      this.token,
      // TODO: transform context to something usable
      Object.assign({ level, request, uuid }, item, {
        language: "javascript",
        framework: "",
        notifier: { name: "Cloudflare Pages Functions" },
      }),
    );
  }

  info(message) {
    this.log("info", {
      timestamp: Date.now(),
      body: { message: { body: message } },
    });
  }

  error(exception) {
    this.log("error", {
      timestamp: Date.now(),
      stackInfo: parse(exception),
    });
  }
}

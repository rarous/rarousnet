import * as pr from "../src/static/assets/js/prism.js";

export async function onRequestGet() {
  const txt = `pr = ${pr}
  self.Prism = ${self.Prism}
  globalThis.Prism = ${globalThis.Prism}`;
  return new Response(txt);
}

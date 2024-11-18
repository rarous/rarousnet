import { spawn } from "node:child_process";
import projectPath from "@hckr_/blendid/lib/projectPath.mjs.mjs";
import DefaultRegistry from "undertaker-registry";

export class GryphoonRegistry extends DefaultRegistry {
  constructor(config, pathConfig, mode) {
    super();
    this.config = config;
    this.mode = mode;
    this.paths = {
      cards: projectPath(pathConfig.dest, "..", "cards.json"),
    };
  }

  /**
   * @param {Gulp} gulp
   */
  init({ task }) {
    task("generate-content", done => {
      const clj = spawn("clojure", ["-M", "-m", "rarousnet.generator", "../"], {
        cwd: projectPath("../generator"),
      });
      clj.stdout.on("data", data => process.stdout.write(data));
      clj.stderr.on("data", data => process.stderr.write(data));
      clj.on("close", done);
    });
    task("upload-cards", async () => {
      const { default: contents } = await import(this.paths.cards, {
        with: { type: "json" },
      });
      await fetch("https://www.rarous.net/api/v1/weblog/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: process.env.RAROUS_WEBLOG_CARDS_SECRET,
          items: contents.map(x => [x.url, x]),
        }),
      });
    });
  }
}

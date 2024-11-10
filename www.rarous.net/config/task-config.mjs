import { spawn } from "node:child_process";
import postcssGamutMapping from "@csstools/postcss-gamut-mapping";
import projectPath from "@hckr_/blendid/lib/projectPath.mjs";
import { getPathConfig } from "@hckr_/blendid/lib/getPathConfig.mjs";
import OpenProps from "open-props";
import jitProps from "postcss-jit-props";
import DefaultRegistry from "undertaker-registry";

/** @typedef {import("@types/nunjucks").Environment} Environment */
/** @typedef {import("@types/gulp").Gulp} Gulp */

const pathConfig = await getPathConfig();

class GryphoonRegistry extends DefaultRegistry {
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
      const { default: contents } = await import(this.paths.cards, { with: { type: "json" } });
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

export default {
  images: true,
  cloudflare: true,
  cloudinary: false,
  fonts: true,
  svgSprite: true,

  static: {
    srcConfig: {
      encoding: false,
    },
  },

  stylesheets: {
    postcss: {
      plugins: [postcssGamutMapping(), jitProps(OpenProps)],
    },
  },

  html: {
    nunjucksRender: {
      filters: {
        isoDate(x) {
          return new Date(x).toISOString();
        },
        longDate(x) {
          return new Intl.DateTimeFormat("cs-CZ", {
            day: "numeric",
            month: "long",
          }).format(new Date(x));
        },
        shortDate(x) {
          return new Intl.DateTimeFormat("cs-CZ", {
            day: "numeric",
            month: "numeric",
          }).format(new Date(x));
        },
      },
    },
    htmlmin: {
      collapseBooleanAttributes: true,
      collapseWhitespace: true,
      preserveLineBreaks: true,
      minifyJS: true,
      removeAttributeQuotes: true,
      removeComments: true,
      removeOptionalTags: true,
      removeRedundantAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
    },
  },

  vite: {
    server: { port: 3001 },
    browser: "firefox developer edition",
    browserArgs: "--ignore-certificate-errors --allow-insecure-localhost",
  },

  production: {
    rev: {
      exclude: ["_headers", "_redirects", "weblog/articles.rss", "weblog/sitemap.xml"],
    },
  },

  registries: [new GryphoonRegistry({}, pathConfig)],

  additionalTasks: {
    development: {
      posthtml: ["generate-content"],
    },
    production: {
      posthtml: ["generate-content", "upload-cards"],
    },
  },
};

import { spawn } from "node:child_process";
import postcssGamutMapping from "@csstools/postcss-gamut-mapping";
import projectPath from "@hckr_/blendid/lib/projectPath.mjs";
import OpenProps from "open-props";
import jitProps from "postcss-jit-props";
import DefaultRegistry from "undertaker-registry";
import { getPathConfig } from "@hckr_/blendid/lib/getPathConfig.mjs";

let meCardTags = new Map([
  ["email", "EMAIL"],
  ["name", "N"],
  ["phone", "TEL"],
  ["web", "URL"]
]);

function meCard(card) {
  const builder = ["MECARD:"];
  for (const [key, value] of Object.entries(card)) {
    builder.push(`${meCardTags.get(key) ?? "key"}:${value}`);
  }
  builder.push(";");
  return builder.join(";");
}

class GryphoonRegistry extends DefaultRegistry {
  constructor(config, pathConfig) {
    super();
    this.config = config;
    this.paths = {
      dest: projectPath(pathConfig.src, pathConfig.html.src)
    }
  }

  init({ task }) {
    task("generate-content", (done) => {
      const clj = spawn("clojure", ["-M", "-m", "rarousnet.generator", "../"], {
        cwd: projectPath("../generator")
      });
      clj.stdout.on('data', (data) => process.stdout.write(data));
      clj.stderr.on('data', (data) => process.stderr.write(data));
      clj.on("close", done);
    });
  }
}

/** @typedef {import("@types/nunjucks").Environment} Environment */

export default {
  images: true,
  cloudinary: false,
  fonts: true,
  svgSprite: true,
  javascripts: false,
  workboxBuild: false,

  stylesheets: {
    postcss: {
      postcss: {
        plugins: [
          postcssGamutMapping(),
          jitProps(OpenProps),
        ]
      }
    }
  },

  static: {
    srcConfig: {
      encoding: false
    }
  },

  html: {
    dataFile: "global.mjs",
    nunjucksRender: {
      globals: {
        currentYear: new Date().getFullYear(),
        meCard
      },
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
        }
      },
    },
    htmlmin: {
      collapseBooleanAttributes: true,
      collapseWhitespace: true,
      minifyJS: true,
      removeAttributeQuotes: true,
      removeComments: true,
      removeOptionalTags: true,
      removeRedundantAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
    }
  },

  vite: {
    server: { port: 3001 },
    browser: "google chrome canary",
    browserArgs: "--ignore-certificate-errors --allow-insecure-localhost",
  },

  production: {
    rev: true,
  },

  registries: [
    new GryphoonRegistry({}, getPathConfig())
  ],

  additionalTasks: {
    development: {
      prebuild: ["generate-content"],
    },
    production: {
      prebuild: ["generate-content"],
    },
  },
};

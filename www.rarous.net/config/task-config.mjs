import { spawn } from "node:child_process";
import postcssGamutMapping from "@csstools/postcss-gamut-mapping";
import projectPath from "@hckr_/blendid/lib/projectPath.mjs";
import { getPathConfig } from "@hckr_/blendid/lib/getPathConfig.mjs";
import OpenProps from "open-props";
import jitProps from "postcss-jit-props";
import DefaultRegistry from "undertaker-registry";

/** @typedef {import("@types/nunjucks").Environment} Environment */

const pathConfig = await getPathConfig();

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

export default {
  images: true,
  cloudflare: true,
  cloudinary: false,
  fonts: true,
  svgSprite: true,

  static: {
    srcConfig: {
      encoding: false
    }
  },

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
    browser: "firefox developer edition",
    browserArgs: "--ignore-certificate-errors --allow-insecure-localhost",
  },

  registries: [new GryphoonRegistry({}, pathConfig)],

  additionalTasks: {
    development: {
      prebuild: ["generate-content"],
    },
    production: {
      prebuild: ["generate-content"],
    },
  },
};

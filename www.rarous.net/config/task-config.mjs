import { texyTypography } from "@hckr_/blendid/lib/texy.mjs";
import OpenProps from "open-props";
import jitProps from "postcss-jit-props";
import { GryphoonRegistry } from "./gryphoon-registry.mjs";

/** @typedef {import("@types/nunjucks").Environment} Environment */
/** @typedef {import("@types/gulp").Gulp} Gulp */

/**
 * @param {Record<string, *>} pathConfig
 * @param {{development: function(): boolean, production: function(): boolean}} mode
 * @param {Boolean} verbose
 */
export default function (pathConfig, mode, verbose) {
  return {
    images: true,
    cloudflare: true,
    cloudinary: false,
    fonts: true,
    svgSprite: true,
    esbuild: true,

    static: {
      srcConfig: {
        encoding: false,
      },
    },

    stylesheets: {
      postcss: {
        plugins: [jitProps(OpenProps)],
      },
    },

    html: {
      markedExtensions: [texyTypography("cs")],
      data: { collections: [] },
      htmlmin: {
        collapseBooleanAttributes: true,
        collapseWhitespace: true,
        preserveLineBreaks: true,
        // TODO: reimplement as function with PostCSS
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

    registries: [new GryphoonRegistry({}, pathConfig, mode)],

    additionalTasks: {
      development: {
        posthtml: ["generate-content"],
      },
      production: {
        posthtml: ["generate-content", "upload-cards"],
      },
    },
  };
}

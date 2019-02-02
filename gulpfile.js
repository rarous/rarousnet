"use strict";

const { src, dest, parallel, series, watch } = require("gulp");
const hash = require("gulp-hash");
const references = require("gulp-hash-references");
const htmlMin = require("gulp-htmlmin");
const postcss = require("gulp-postcss");
const autoprefixer = require("autoprefixer");
const browserSync = require("browser-sync");
const cssnano = require("cssnano");

function css() {
  const plugins = [
    autoprefixer({ browsers: ["> 5%", "last 4 versions", "IE 8"] }),
    cssnano()
  ];
  return src("./static/**/*.css")
    .pipe(postcss(plugins))
    .pipe(dest("./dist/"))
    .pipe(browserSync.stream());
}

function hashStyles() {
  return src("./dist/**/*.css")
    .pipe(hash())
    .pipe(dest("./dist"))
    .pipe(hash.manifest("assets-manifest.json"))
    .pipe(dest("./out"));
}

function html() {
  return src("./dist/**/*.html")
    .pipe(references("./out/assets-manifest.json"))
    .pipe(
      htmlMin({
        collapseBooleanAttributes: true,
        collapseWhitespace: true,
        minifyJS: true,
        removeAttributeQuotes: true,
        removeComments: true,
        removeOptionalTags: true,
        removeRedundantAttributes: true,
        removeScriptTypeAttributes: true,
        removeStyleLinkTypeAttributes: true
      })
    )
    .pipe(dest("./dist"));
}

function run() {
  browserSync.init({
    server: "./dist"
  });

  watch("static/**/*.css", css);
  watch("dist/**/*.html").on("change", browserSync.reload);
}

exports.dev = parallel(css, run);
exports.default = series(css, hashStyles, html);

"use strict";

const stream = require("stream");
const util = require("util");
const { src, dest, parallel, series, watch } = require("gulp");
const hash = require("gulp-rev");
const references = require("gulp-rev-replace");
const deleteNotHashed = require("gulp-rev-delete-original");
const htmlMin = require("gulp-htmlmin");
const notify = require("gulp-notify");
const plumber = require("gulp-plumber");
const postcss = require("gulp-postcss");
const sizereport = require("gulp-sizereport");
const autoprefixer = require("autoprefixer");
const browserSync = require("browser-sync");
const cssnano = require("cssnano");

const pipeline = util.promisify(stream.pipeline);

function css() {
  const plugins = [
    autoprefixer(),
    cssnano()
  ];
  return pipeline(
    src("./static/**/*.css"),
    postcss(plugins),
    plumber({ errorHandler: notify.onError("Error: <%= error.message %>") }),
    dest("./dist/")
  );
}

function hashStyles() {
  return pipeline(
    src("./dist/**/*.css"),
    hash(),
    deleteNotHashed(),
    dest("./dist"),
    hash.manifest("assets-manifest.json", { merge: true }),
    dest("./out")
  );
}

function html() {
  const manifest = src("./out/assets-manifest.json");
  return pipeline(
    src("./dist/**/*.html"),
    references({ manifest }),
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
    }),
    dest("./dist")
  );
}

function size() {
  return pipeline(
    src(["./dist/**/*.css", "./dist/**/*.js"]),
    sizereport({ gzip: true })
  );
}

function run(done) {
  browserSync.init({
    server: "./dist"
  });

  watch("static/**/*.css", css);
  watch(["dist/**/*.css", "dist/**/*.js", "dist/**/*.html"]).on(
    "change",
    browserSync.reload
  );
  done();
}

exports.dev = series(css, run);
exports.default = series(css, hashStyles, html, size);

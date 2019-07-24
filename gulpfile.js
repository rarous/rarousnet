"use strict";

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

function css() {
  const plugins = [
    autoprefixer(),
    cssnano()
  ];
  return src("./static/**/*.css")
    .pipe(postcss(plugins))
    .pipe(
      plumber({ errorHandler: notify.onError("Error: <%= error.message %>") })
    )
    .pipe(dest("./dist/"));
}

function hashStyles() {
  return src("./dist/**/*.css")
    .pipe(hash())
    .pipe(deleteNotHashed())
    .pipe(dest("./dist"))
    .pipe(
      hash.manifest("assets-manifest.json", {
        merge: true
      })
    )
    .pipe(dest("./out"));
}

function html() {
  const manifest = src("./out/assets-manifest.json");
  return src("./dist/**/*.html")
    .pipe(references({ manifest }))
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

function size() {
  return src(["./dist/**/*.css", "./dist/**/*.js"]).pipe(
    sizereport({
      gzip: true
    })
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

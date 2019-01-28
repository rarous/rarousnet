"use strict";

const { src, dest, parallel, series, watch } = require("gulp");
const hash = require("gulp-hash");
const references = require("gulp-hash-references");
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
    .pipe(dest("./dist/"));
}

function hashStyles() {
  return src("./dist/**/*.css")
    .pipe(hash())
    .pipe(dest("./dist"))
    .pipe(hash.manifest("assets-manifest.json"))
    .pipe(dest("./out"));
}

function updateReferences() {
  return src("./dist/**/*.html")
    .pipe(references("./out/assets-manifest.json"))
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
exports.default = series(css, hashStyles, updateReferences);

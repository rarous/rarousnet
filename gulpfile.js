import browserSync from "browser-sync";
import cssnano from "cssnano";
import gulp from "gulp";
import htmlMin from "gulp-htmlmin";
import notify from "gulp-notify";
import plumber from "gulp-plumber";
import postcss from "gulp-postcss";
import hash from "gulp-rev";
import deleteNotHashed from "gulp-rev-delete-original";
import references from "gulp-rev-replace";
import sizereport from "gulp-sizereport";
import stream from "node:stream";
import util from "node:util";
import OpenProps from "open-props";
import jitProps from "postcss-jit-props";
import presetEnv from "postcss-preset-env";

const pipeline = util.promisify(stream.pipeline);
const { dest, series, src, watch } = gulp;

function css() {
  const plugins = [
    presetEnv({
      minimumVendorImplementations: 2,
    }),
    cssnano(),
    jitProps(OpenProps),
  ];
  return pipeline(
    src("./website/assets/**/*.css"),
    postcss(plugins),
    plumber({ errorHandler: notify.onError("Error: <%= error.message %>") }),
    dest("./.gryphoon/dist/assets/"),
  );
}

function js() {
  return pipeline(src("./website/assets/**/*.js"), dest("./.gryphoon/dist/assets/"));
}

function staticHtml() {
  return pipeline(src("./website/**/*.html"), dest("./.gryphoon/dist/"));
}

function hashAssets() {
  return pipeline(
    src(["./.gryphoon/dist/assets/**/*.css", "./.gryphoon/dist/assets/**/*.js"], { base: ".gryphoon/dist" }),
    hash(),
    deleteNotHashed(),
    dest("./.gryphoon/dist"),
    hash.manifest("assets-manifest.json", { merge: true }),
    dest("./.gryphoon"),
  );
}

function html() {
  const manifest = src("./.gryphoon/assets-manifest.json");
  return pipeline(
    src("./.gryphoon/dist/**/*.html"),
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
      removeStyleLinkTypeAttributes: true,
    }),
    dest("./.gryphoon/dist"),
  );
}

function size() {
  return src(["./.gryphoon/dist/**/*.css", "./.gryphoon/dist/**/*.js", "./.gryphoon/dist/**/*.woff2"]).pipe(
    sizereport({ gzip: true }),
  );
}

function run(done) {
  browserSync.init({
    server: "./.gryphoon/dist",
    browser: "Firefox Developer Edition",
  });

  watch("website/assets/**/*.css", css);
  watch("website/assets/**/*.js", js);
  watch("website/**/*.html", staticHtml);
  watch([".gryphoon/dist/**/*.css", ".gryphoon/dist/**/*.js", ".gryphoon/dist/**/*.html"]).on(
    "change",
    browserSync.reload,
  );
  done();
}

export const dev = series(css, js, staticHtml, run);
const prod = series(css, js, hashAssets, html, size);
export default prod;

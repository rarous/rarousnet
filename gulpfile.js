import stream from "node:stream";
import util from "node:util";
import gulp from "gulp";
import hash from "gulp-rev";
import references from "gulp-rev-replace";
import deleteNotHashed from "gulp-rev-delete-original";
import htmlMin from "gulp-htmlmin";
import notify from "gulp-notify";
import plumber from "gulp-plumber";
import postcss from "gulp-postcss";
import sizereport from "gulp-sizereport";
import browserSync from "browser-sync";
import cssnano from "cssnano";
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
    dest("./dist/assets/"),
  );
}

function js() {
  return pipeline(src("./website/assets/**/*.js"), dest("./dist/assets/"));
}

function hashStyles() {
  return pipeline(
    src("./dist/**/*.css"),
    hash(),
    deleteNotHashed(),
    dest("./dist"),
    hash.manifest("assets-manifest.json", { merge: true }),
    dest("./out"),
  );
}

function hashScripts() {
  return pipeline(
    src("./dist/**/*.js"),
    hash(),
    deleteNotHashed(),
    dest("./dist"),
    hash.manifest("assets-manifest.json", { merge: true }),
    dest("./out"),
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
      removeStyleLinkTypeAttributes: true,
    }),
    dest("./dist"),
  );
}

function size() {
  return src(["./dist/**/*.css", "./dist/**/*.js", "./dist/**/*.woff2"]).pipe(
    sizereport({ gzip: true }),
  );
}

function run(done) {
  browserSync.init({
    server: "./dist",
    browser: "Firefox Developer Edition",
  });

  watch("static/**/*.css", css);
  watch("website/assets/**/*.css", css);
  watch("website/assets/**/*.js", js);
  watch(["dist/**/*.css", "dist/**/*.js", "dist/**/*.html"]).on(
    "change",
    browserSync.reload,
  );
  done();
}

export const dev = series(css, js, run);
const prod = series(css, js, hashStyles, hashScripts, html, size);
export default prod;

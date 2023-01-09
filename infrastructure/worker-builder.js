import esbuild from "esbuild";
import { NodeModulesPolyfillPlugin } from "@esbuild-plugins/node-modules-polyfill";
import pulumi from "@pulumi/pulumi";

export function build(entrypoint, minify) {
  const result = esbuild.buildSync({
    plugins: [NodeModulesPolyfillPlugin()],
    platform: "browser",
    conditions: ["worker", "browser"],
    entryPoints: [entrypoint],
    sourcemap: true,
    logLevel: "warning",
    format: "esm",
    target: "es2020",
    bundle: true,
    minify,
    write: false,
    define: {
      IS_CLOUDFLARE_WORKER: "true",
    },
  });
  return result.outputFiles[0].text;
}

export function buildCodeAsset(
  entrypoint,
  minify = false,
) {
  return new pulumi.asset.AssetArchive({
    "index.js": new pulumi.asset.StringAsset(build(entrypoint, minify)),
  });
}

import cloudflare from "@pulumi/cloudflare";
import pulumi from "@pulumi/pulumi";
import path from "node:path";
import { build } from "./worker-builder.js";

const config = new pulumi.Config();
const domain = config.require("domain");

function buildAsset(fileName) {
  return build(
    path.join(import.meta.dirname, "../workers", fileName),
    true,
  );
}

const account = new cloudflare.Account(
  "rarous",
  {
    accountId: config.require("cloudflare-accountId"),
    name: "rarous",
    enforceTwofactor: true,
  },
  { protect: true },
);

const zone = new cloudflare.Zone(
  "rarous.net",
  {
    accountId: account.id,
    plan: "free",
    zone: "rarous.net",
  },
  { protect: true },
);

new cloudflare.ZoneSettingsOverride(`${domain}/zone-settings`, {
  zoneId: zone.id,
  settings: {
    alwaysUseHttps: "on",
    automaticHttpsRewrites: "on",
    minTlsVersion: "1.2",
    http3: "on",
    zeroRtt: "on",
    ipv6: "on",
    brotli: "on",
    securityHeader: {
      enabled: true,
      includeSubdomains: true,
      nosniff: true,
      preload: true,
      maxAge: 31536000,
    },
  },
});

new cloudflare.Record(`${domain}/dns-record-keybase`, {
  zoneId: zone.id,
  name: "@",
  type: "TXT",
  content: "keybase-site-verification=_lI_PhjeUoBF2OaSpbJaYtzjdKSf2YoPsCcAXBAewbs",
  ttl: 3600,
});

const weblogBucket = new cloudflare.R2Bucket("weblog-bucket", {
  accountId: account.id,
  name: "rarousnet",
});

const weblogNS = new cloudflare.WorkersKvNamespace("weblog-kv-ns", {
  accountId: account.id,
  title: "rarous-net-weblog",
});

const w3bNS = new cloudflare.WorkersKvNamespace("w3b-kv-ns", {
  accountId: account.id,
  title: "rarous-net-w3b",
});

const turnstile = new cloudflare.TurnstileWidget("rarousnet", {
  accountId: account.id,
  name: "rarousnet",
  domains: [zone.zone],
  mode: "invisible",
});

const weblogPages = new cloudflare.PagesProject("weblog", {
  accountId: account.id,
  name: "rarousnet",
  productionBranch: "trunk",
  source: {
    type: "github",
    config: {
      owner: "rarous",
      repoName: "rarousnet",
      deploymentsEnabled: false,
      productionDeploymentEnabled: false,
      productionBranch: "trunk",
      previewBranchIncludes: ["*"],
      prCommentsEnabled: false,
    },
  },
  buildConfig: {
    buildCommand: "yarn build",
    destinationDir: "dist",
  },
  deploymentConfigs: {
    production: {
      compatibilityDate: "2023-09-29",
      compatibilityFlags: ["nodejs_compat"],
      secrets: {
        TURNSTILE_SECRET_KEY: turnstile.secret,
        WEBMENTIONS_WEBHOOK_SECRET: config.require("webhook-secret"),
      },
      kvNamespaces: {
        weblog: weblogNS.id,
        w3b: w3bNS.id,
      },
      r2Buckets: {
        storage: weblogBucket.name,
      },
    },
  },
});

const wwwRecord = new cloudflare.Record(`${domain}/dns-record`, {
  zoneId: zone.id,
  name: "www",
  type: "CNAME",
  content: weblogPages.domains[0],
  ttl: 1,
  proxied: true,
});
const weblogPagesDomain = new cloudflare.PagesDomain("weblog-domain", {
  accountId: account.id,
  domain: wwwRecord.hostname,
  projectName: weblogPages.name,
});

const discogsScheduleWorker = new cloudflare.WorkerScript("discogs-schedule-worker", {
  accountId: account.id,
  name: "discogs-schedule-worker",
  content: buildAsset("discogs-schedule.js"),
  module: true,
  kvNamespaceBindings: [{ name: "weblog", namespaceId: weblogNS.id }],
  plainTextBindings: [{ name: "SPOTIFY_CLIENT_ID", text: config.require("spotify-clientId") }],
  secretTextBindings: [
    { name: "DISCOGS_TOKEN", text: config.require("discogs-apiToken") },
    { name: "SPOTIFY_CLIENT_SECRET", text: config.require("spotify-clientSecret") },
  ],
});
const discogsScheduleTrigger = new cloudflare.WorkerCronTrigger("discogs-schedule-trigger", {
  accountId: account.id,
  scriptName: discogsScheduleWorker.name,
  schedules: ["0 0 * * *"],
});

export const accountId = account.id;
export const zoneId = zone.id;
export const nameServers = zone.nameServers;
export const websiteUri = `https://${domain}`;
export const weblogDomains = weblogPages.domains;
export const weblogKvNsId = weblogNS.id;
export const weblogBucketName = weblogBucket.name;
export const w3bKvNsId = w3bNS.id;
export const turnstileSecretKey = turnstile.secret;
export const turnstileSiteKey = turnstile.id;

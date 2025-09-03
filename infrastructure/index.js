import path from "node:path";
import cloudflare from "@pulumi/cloudflare";
import pulumi from "@pulumi/pulumi";
import { build } from "./worker-builder.js";

const config = new pulumi.Config();
const domain = config.require("domain");

function buildAsset(fileName) {
  return build(path.join(import.meta.dirname, "../workers", fileName), true);
}

const account = new cloudflare.Account(
  "rarous",
  {
    accountId: config.require("cloudflare-accountId"),
    name: "rarous",
    enforceTwofactor: true,
    type: "standard",
  },
  { protect: true },
);

const zone = new cloudflare.Zone(
  "rarous.net",
  {
    account: { id: account.id },
    name: "rarous.net",
    type: "full",
  },
  { protect: true },
);

// new cloudflare.ZoneDnsSettings(`${domain}/zone-settings`, {
//   zoneId: zone.id,
//   settings: {
//     alwaysUseHttps: "on",
//     automaticHttpsRewrites: "on",
//     minTlsVersion: "1.2",
//     http3: "on",
//     zeroRtt: "on",
//     ipv6: "on",
//     brotli: "on",
//     securityHeader: {
//       enabled: true,
//       includeSubdomains: true,
//       nosniff: true,
//       preload: true,
//       maxAge: 31536000,
//     },
//   },
// });

new cloudflare.DnsRecord(`${domain}/dns-record-keybase`, {
  zoneId: zone.id,
  name: "@",
  type: "TXT",
  content: "keybase-site-verification=_lI_PhjeUoBF2OaSpbJaYtzjdKSf2YoPsCcAXBAewbs",
  ttl: 3600,
});

const weblogBucket = new cloudflare.R2Bucket(
  "weblog-bucket",
  {
    accountId: account.id,
    name: "rarousnet",
  },
  { protect: true },
);

const weblogNS = new cloudflare.WorkersKvNamespace("weblog-kv-ns", {
  accountId: account.id,
  title: "rarous-net-weblog",
});

const w3bNS = new cloudflare.WorkersKvNamespace("w3b-kv-ns", {
  accountId: account.id,
  title: "rarous-net-w3b",
});

const turnstile = new cloudflare.TurnstileWidget(
  "rarousnet",
  {
    accountId: account.id,
    name: "rarousnet",
    domains: [zone.name],
    mode: "invisible",
  },
  { dependsOn: [account, zone] },
);

const weblogPages = new cloudflare.PagesProject(
  "weblog",
  {
    accountId: account.id,
    name: "rarousnet",
    productionBranch: "trunk",
    buildConfig: {
      buildCommand: "yarn build",
      destinationDir: "../.gryphoon/dist",
    },
    deploymentConfigs: {
      production: {
        compatibilityDate: "2025-09-01",
        compatibilityFlags: ["nodejs_compat"],
        envVars: {
          clientId: {
            value: config.require("google-auth-clientId"),
            type: "plain_text",
          },
          domain: { value: "hckr.studio", type: "plain_text" },
          HOSTNAME: { value: domain, type: "plain_text" },
          ROLLBAR_TOKEN: {
            value: config.require("rollbar-token"),
            type: "plain_text",
          },
          PRIVATE_KEY: {
            value: config.require("private-key"),
            type: "secret_text",
          },
          RAROUS_WEBLOG_CARDS_SECRET: {
            value: config.require("weblog-cards-secret"),
            type: "plain_text",
          },
          SCREENSHOTTER_SECRET: {
            value: config.require("screenshotter-secret"),
            type: "plain_text",
          },
          TURNSTILE_SECRET_KEY: { value: turnstile.secret, type: "secret_text" },
          WEBMENTIONS_WEBHOOK_SECRET: {
            value: config.require("webhook-secret"),
            type: "plain_text",
          },
        },
        kvNamespaces: {
          weblog: { namespaceId: weblogNS.id },
          w3b: { namespaceId: w3bNS.id },
        },
        r2Buckets: {
          storage: {
            name: weblogBucket.name,
          },
        },
        services: {
          screenshotter: {
            service: "hckr-screenshotter",
            environment: "production",
          },
        },
      },
    },
  },
  { dependsOn: [account, weblogBucket, weblogNS, w3bNS] },
);

const wwwRecord = new cloudflare.DnsRecord(
  `${domain}/dns-record`,
  {
    zoneId: zone.id,
    name: "www",
    type: "CNAME",
    content: weblogPages.domains[0],
    ttl: 1,
    proxied: true,
  },
  { dependsOn: [zone, weblogPages] },
);
const _weblogPagesDomain = new cloudflare.PagesDomain(
  "weblog-domain",
  {
    accountId: account.id,
    name: pulumi.interpolate`${wwwRecord.name}.${zone.name}`,
    projectName: weblogPages.name,
  },
  { dependsOn: [account, wwwRecord, weblogPages] },
);

const discogsScheduleWorker = new cloudflare.WorkersScript(
  "discogs-schedule-worker",
  {
    accountId: account.id,
    scriptName: "discogs-schedule-worker",
    content: buildAsset("discogs-schedule-worker/src/index.js"),
    compatibilityDate: "2025-09-01",
    mainModule: "index.js",
    bindings: [
      { name: "DISCOGS_TOKEN", type: "secret_text", text: config.require("discogs-apiToken") },
      { name: "weblog", type: "kv_namespace", namespaceId: weblogNS.id },
    ],
  },
  { dependsOn: [account, weblogNS] },
);
const discogsScheduleTrigger = new cloudflare.WorkersCronTrigger(
  "discogs-schedule-trigger",
  {
    accountId: account.id,
    scriptName: discogsScheduleWorker.scriptName,
    schedules: [{ cron: "0 0 * * *" }],
  },
  { dependsOn: [account, discogsScheduleWorker] },
);

const w3bScheduleWorker = new cloudflare.WorkersScript(
  "w3b-schedule-worker",
  {
    accountId: account.id,
    scriptName: "w3b-schedule-worker",
    mainModule: "index.js",
    content: buildAsset("w3b-schedule-worker/src/index.js"),
    compatibilityDate: "2025-09-01",
    bindings: [
      { name: "FEED_URL", type: "plain_text", text: config.require("w3b-feed-url") },
      { name: "SEMANTIC_EXTRACTOR_SECRET", type: "secret_text", text: config.require("semantic-extractor-secret") },
      { name: "w3b", type: "kv_namespace", namespaceId: w3bNS.id },
      { name: "extractor", type: "service", service: "hckr-semantic-extractor", environment: "production" },
    ],
  },
  { dependsOn: [account, w3bNS] },
);
const w3bScheduleTrigger = new cloudflare.WorkersCronTrigger(
  "w3b-schedule-trigger",
  {
    accountId: account.id,
    scriptName: w3bScheduleWorker.scriptName,
    schedules: [{ cron: "0 * * * *" }],
  },
  { dependsOn: [account, w3bScheduleWorker] },
);

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

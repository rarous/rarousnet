import path from "node:path";
import cloudflare from "@pulumi/cloudflare";
import pulumi from "@pulumi/pulumi";
import { build } from "./worker-builder.js";

const config = new pulumi.Config();
const domain = config.require("domain");
const cloudflarePagesConfig = new pulumi.Config("cloudflare-pages");
const compatibilityDate = cloudflarePagesConfig.require("compatibility-date");
const cloudflareInfraConfig = new pulumi.Config("cloudflare-infra");
const redirectIPv4 = cloudflareInfraConfig.require("redirect-ipv4");
const redirectIPv6 = cloudflareInfraConfig.require("redirect-ipv6");

function buildAsset(fileName) {
  return build(path.join(import.meta.dirname, "../workers", fileName), true);
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
    account: { id: account.id },
    name: "rarous.net",
    type: "full",
  },
  { protect: true },
);

new cloudflare.ZoneSetting(`${domain}/zone-setting-https`, {
  zoneId: zone.id,
  settingId: "always_use_https",
  value: "on",
});

new cloudflare.ZoneSetting(`${domain}/zone-setting-https-rewrites`, {
  zoneId: zone.id,
  settingId: "automatic_https_rewrites",
  value: "on",
});

new cloudflare.ZoneSetting(`${domain}/zone-setting-http3`, {
  zoneId: zone.id,
  settingId: "http3",
  value: "on",
});

new cloudflare.ZoneSetting(`${domain}/zone-setting-zero-rtt`, {
  zoneId: zone.id,
  settingId: "0rtt",
  value: "on",
});

new cloudflare.ZoneSetting(`${domain}/zone-setting-ipv6`, {
  zoneId: zone.id,
  settingId: "ipv6",
  value: "on",
});

new cloudflare.ZoneSetting(`${domain}/zone-setting-min-tls`, {
  zoneId: zone.id,
  settingId: "min_tls_version",
  value: "1.2",
});

new cloudflare.ZoneSetting(`${domain}/zone-setting-tls13`, {
  zoneId: zone.id,
  settingId: "tls_1_3",
  value: "on",
});

new cloudflare.ZoneSetting(`${domain}/zone-setting-brotli`, {
  zoneId: zone.id,
  settingId: "brotli",
  value: "on",
});

new cloudflare.ZoneSetting(`${domain}/zone-setting-security-header`, {
  zoneId: zone.id,
  settingId: "security_header",
  value: {
    strict_transport_security: {
      enabled: true,
      include_subdomains: true,
      nosniff: true,
      preload: true,
      maxAge: 31536000,
    },
  },
});

// for more settings @see https://developers.cloudflare.com/api/resources/zones/subresources/settings/models/font_settings/#(schema)
// APEX records for redirect to www (redirect is currently handled in hckr.studio/webs stack)
new cloudflare.DnsRecord(`${domain}/apex-dns-record`, {
  zoneId: zone.id,
  name: "@",
  type: "A",
  content: redirectIPv4,
  ttl: 1,
  proxied: true,
});

new cloudflare.DnsRecord(`${domain}/apex-ipv6-dns-record`, {
  zoneId: zone.id,
  name: "@",
  type: "AAAA",
  content: redirectIPv6,
  ttl: 1,
  proxied: true,
});

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
      preview: { failOpen: false },
      production: {
        failOpen: false,
        compatibilityDate,
        compatibilityFlags: ["nodejs_compat"],
        envVars: {
          clientId: { type: "plain_text", value: config.require("google-auth-clientId") },
          domain: { type: "plain_text", value: "hckr.studio" },
          HOSTNAME: { type: "plain_text", value: domain },
          ROLLBAR_TOKEN: { type: "plain_text", value: config.require("rollbar-token") },
          PRIVATE_KEY: { type: "secret_text", value: config.require("private-key") },
          RAROUS_WEBLOG_CARDS_SECRET: { type: "plain_text", value: config.require("weblog-cards-secret") },
          SCREENSHOTTER_SECRET: { type: "plain_text", value: config.require("screenshotter-secret") },
          TURNSTILE_SECRET_KEY: { type: "secret_text", value: turnstile.secret },
          WEBMENTIONS_WEBHOOK_SECRET: { type: "plain_text", value: config.require("webhook-secret") },
        },
        kvNamespaces: {
          weblog: { namespaceId: weblogNS.id },
          w3b: { namespaceId: w3bNS.id },
        },
        r2Buckets: {
          storage: { name: weblogBucket.name },
        },
        services: {
          screenshotter: { service: "hckr-screenshotter", environment: "production" },
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
    compatibilityDate,
    mainModule: "index.js",
    bindings: [
      { type: "secret_text", name: "DISCOGS_TOKEN", text: config.require("discogs-apiToken") },
      { type: "kv_namespace", name: "weblog", namespaceId: weblogNS.id },
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
    compatibilityDate,
    bindings: [
      { type: "plain_text", name: "FEED_URL", text: config.require("w3b-feed-url") },
      { type: "secret_text", name: "SEMANTIC_EXTRACTOR_SECRET", text: config.require("semantic-extractor-secret") },
      { type: "kv_namespace", name: "w3b", namespaceId: w3bNS.id },
      { type: "service", name: "extractor", service: "hckr-semantic-extractor", environment: "production" },
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

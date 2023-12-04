import aws from "@pulumi/aws";
import cloudflare from "@pulumi/cloudflare";
import pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();
const domain = config.require("domain");

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
    minify: {
      css: "on",
      html: "on",
      js: "on",
    },
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
  value: "keybase-site-verification=_lI_PhjeUoBF2OaSpbJaYtzjdKSf2YoPsCcAXBAewbs",
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
      environmentVariables: {
        TURNSTILE_SECRET_KEY: turnstile.secret,
        WEBMENTIONS_WEBHOOK_SECRET: config.require("webhook-secret"),
      },
      kvNamespaces: {
        weblog: weblogNS.id,
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
  value: weblogPages.domains[0],
  ttl: 1,
  proxied: true,
});
const weblogPagesDomain = new cloudflare.PagesDomain("weblog-domain", {
  accountId: account.id,
  domain: wwwRecord.hostname,
  projectName: weblogPages.name,
});

export const accountId = account.id;
export const zoneId = zone.id;
export const nameServers = zone.nameServers;
export const websiteUri = `https://${domain}`;
export const weblogDomains = weblogPages.domains;
export const weblogKvNsId = weblogNS.id;
export const weblogBucketName = weblogBucket.name;
export const turnstileSecretKey = turnstile.secret;
export const turnstileSiteKey = turnstile.id;

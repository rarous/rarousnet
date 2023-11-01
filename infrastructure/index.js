import pulumi from "@pulumi/pulumi";
import aws from "@pulumi/aws";
import cloudflare from "@pulumi/cloudflare";

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

// TODO: migrate to R2 and proxy via function

const bucket = new aws.s3.Bucket(`${domain}/bucket`, {
  bucket: domain,
  acl: "public-read",
  website: {
    indexDocument: "index.html",
    errorDocument: "404.html",
  },
});

new aws.s3.BucketPolicy(`${domain}/bucket-policy`, {
  bucket: bucket.bucket,
  policy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "PublicReadGetObject",
        Effect: "Allow",
        Principal: {
          AWS: "*",
        },
        Action: "s3:GetObject",
        Resource: `arn:aws:s3:::${domain}/*`,
        Condition: {
          IpAddress: {
            "aws:SourceIp": [
              "2400:cb00::/32",
              "2405:8100::/32",
              "2405:b500::/32",
              "2606:4700::/32",
              "2803:f800::/32",
              "2c0f:f248::/32",
              "2a06:98c0::/29",
              "103.21.244.0/22",
              "103.22.200.0/22",
              "103.31.4.0/22",
              "104.16.0.0/12",
              "108.162.192.0/18",
              "131.0.72.0/22",
              "141.101.64.0/18",
              "162.158.0.0/15",
              "172.64.0.0/13",
              "173.245.48.0/20",
              "188.114.96.0/20",
              "190.93.240.0/20",
              "197.234.240.0/22",
              "198.41.128.0/17",
            ],
          },
        },
      },
    ],
  }),
});

new cloudflare.Record(`${domain}/dns-record-keybase`, {
  zoneId: zone.id,
  name: "@",
  type: "TXT",
  value:
    "keybase-site-verification=_lI_PhjeUoBF2OaSpbJaYtzjdKSf2YoPsCcAXBAewbs",
  ttl: 3600,
});

const weblogNS = new cloudflare.WorkersKvNamespace("weblog-kv-ns", {
  accountId: account.id,
  title: "rarous-net-weblog",
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
        WEBMENTIONS_WEBHOOK_SECRET: config.require("webhook-secret"),
      },
      kvNamespaces: {
        weblog: weblogNS.id,
      },
    },
  },
});

new cloudflare.Record(`${domain}/dns-record`, {
  zoneId: zone.id,
  name: "www",
  type: "CNAME",
  value: bucket.websiteEndpoint,
  ttl: 1,
  proxied: true,
});

//const wwwRecord = new cloudflare.Record(`${domain}/dns-record`, {
//  zoneId: zone.id,
//  name: "www",
//  type: "CNAME",
//  value: weblogPages.domains[0],
//  ttl: 1,
//  proxied: true,
//});
//const weblogPagesDomain = new cloudflare.PagesDomain("weblog-domain", {
//  accountId: account.id,
//  domain: wwwRecord.hostname,
//  projectName: weblogPages.name,
//});

export const accountId = account.id;
export const zoneId = zone.id;
export const nameServers = zone.nameServers;
export const bucketUri = bucket.bucket.apply((x) => `s3://${x}`);
export const websiteTestUri = bucket.websiteEndpoint.apply(
  (x) => `http://${x}`,
);
export const websiteUri = `https://${domain}`;
export const weblogDomains = weblogPages.domains;
export const weblogKvNsId = weblogNS.id;

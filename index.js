import pulumi from "@pulumi/pulumi";
import aws from "@pulumi/aws";
import cloudflare from "@pulumi/cloudflare";

const config = new pulumi.Config();
export const zoneId = config.require("zone_id");
const domain = config.require("domain");

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

const record = new cloudflare.Record(`${domain}/dns-record`, {
  name: "www",
  zoneId: zoneId,
  type: "CNAME",
  value: bucket.websiteEndpoint,
  ttl: 1,
  proxied: true,
});

new cloudflare.Record(`${domain}/dns-record-keybase`, {
  name: "@",
  zoneId: zoneId,
  type: "TXT",
  value: "keybase-site-verification=_lI_PhjeUoBF2OaSpbJaYtzjdKSf2YoPsCcAXBAewbs",
  ttl: 3600
});

new cloudflare.ZoneSettingsOverride(`${domain}/zone-settings`, {
  zoneId: zoneId,
  settings: {
    alwaysUseHttps: "on",
    automaticHttpsRewrites: "on",
    brotli: "on",
    http3: "on",
    minTlsVersion: "1.2",
    zeroRtt: "on",
    securityHeader: {
      enabled: true,
      includeSubdomains: true,
      nosniff: true,
      preload: true,
      maxAge: 31536000,
    },
  },
});

export const bucketUri = bucket.bucket.apply((x) => `s3://${x}`);
export const websiteTestUri = bucket.websiteEndpoint.apply((x) => `http://${x}`);
export const websiteUri = `https://${domain}`;

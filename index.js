"use strict";

const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const cloudflare = require("@pulumi/cloudflare");

const config = new pulumi.Config();
const zoneId = config.require("zone_id");
const domain = config.require("domain");

const bucket = new aws.s3.Bucket(`${domain}/bucket`, {
  bucket: domain,
  acl: "public-read",
  website: {
    indexDocument: "index.html",
    errorDocument: "404.html",
  },
});

const bucketPolicy = new aws.s3.BucketPolicy(`${domain}/bucket-policy`, {
  bucket: bucket.bucket,
  policy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "1",
        Effect: "Allow",
        Principal: {
          AWS: "*",
        },
        Action: "s3:GetObject",
        Resource: `arn:aws:s3:::${domain}/*`,
      },
    ],
  }),
});

const record = new cloudflare.Record(`${domain}/dns-record`, {
  name: "www",
  zoneId: zoneId,
  type: "CNAME",
  value: bucket.websiteEndpoint,
  ttl: 3600,
  proxied: true,
});

exports.bucketUri = bucket.bucket.apply((x) => `s3://${x}`);
exports.websiteTestUri = bucket.websiteEndpoint.apply((x) => `http://${x}`);
exports.zoneId = record.zoneId;
exports.websiteUri = `https://${domain}`;

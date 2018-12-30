"use strict";
const pulumi = require("@pulumi/pulumi");
const cloud = require("@pulumi/cloud");

const bucket = new cloud.Bucket("texy-outputs");
const bucketName = bucket.bucket.id;

const texy = new cloud.Task("texy", {
  build: "./lambdas/texy",
  memoryReservation: 512
});

const texyApi = new cloud.API("texy-api");

texyApi.post("/", async (req, res) => {
  const crypto = require("crypto");
  const hash = crypto.createHash("sha256");

  hash.update(req.body.toString());
  const inputFile = `${hash.digest("hex").substr(0, 12)}.texy`;
  const outputFile = inputFile.replace(".texy", ".html");

  console.log(`uploading file ${inputFile} to S3 bucket ${bucketName.get()}`);
  try {
    await bucket.put(inputFile, req.body);
    console.log("OK");
    res.status(200).json({
      input: `s3.//${bucketName.get()}/${inputFile}`,
      output: `s3://${bucketName.get()}/${outputFile}`
    });
  } catch (ex) {
    console.error(ex);
    res.status(500).write(ex.message);
  }
});

bucket.onPut(
  "newTexyFile",
  async args => {
    const file = args.key;
    const result = file.replace(".texy", ".html");
    texy.run({
      environment: {
        INPUT_FILE: file,
        S3_BUCKET: bucketName.get(),
        OUTPUT_FILE: result
      }
    });
  },
  { keySuffix: ".texy" }
);

exports.apiEndpoint = texyApi.publish().url;
exports.bucketName = bucketName;

import { S3 } from "@aws-sdk/client-s3";
import { partition } from "@thi.ng/transducers";
import md5File from "md5-file";
import mimetypes from "mime-types";
import fs from "node:fs";
import path from "node:path";

function* getFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of entries) {
    if (file.isDirectory()) {
      yield* getFiles(path.join(dir, file.name, "/"));
    } else {
      yield Object.assign(file, { path: path.join(dir, file.name) });
    }
  }
}

const bucket = process.argv[2].replace("s3://", "");
const root = path.resolve(process.argv[3]);
const s3 = new S3({ region: "eu-central-1" });

async function readStoredHash(key) {
  try {
    const resp = await s3.headObject({
      Bucket: bucket,
      Key: key,
    });
    return resp.Metadata.hash;
  } catch (e) {}
}

async function uploadFile(key, file, hash) {
  console.log("Uploading file", key);
  await s3.putObject({
    Bucket: bucket,
    Key: key,
    Body: fs.readFileSync(file.path),
    ContentType: mimetypes.lookup(file.path) || "application/octet-stream",
    Metadata: { hash },
  });
}

async function processFile(file) {
  const key = path.relative(root, file.path);
  const [storedHash, computedHash] = await Promise.all([
    readStoredHash(key),
    md5File(file.path),
  ]);
  if (computedHash === storedHash) return;
  await uploadFile(key, file, computedHash);
}

for (const chunk of partition(16, true, getFiles(root))) {
  await Promise.all(chunk.map((file) => processFile(file)));
}

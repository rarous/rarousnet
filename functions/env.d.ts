export interface Env {
  storage: R2Bucket;
  weblog: KVNamespace;
  WEBMENTIONS_WEBHOOK_SECRET: string;
}

export interface Env {
  storage: R2Bucket;
  weblog: KVNamespace;
  w3b: KVNamespace;
  TURNSTILE_SECRET_KEY: string;
  WEBMENTIONS_WEBHOOK_SECRET: string;
}

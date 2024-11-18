export interface Env {
  storage: R2Bucket;
  weblog: KVNamespace;
  w3b: KVNamespace;
  cards: Service;
  TURNSTILE_SECRET_KEY: string;
  WEBMENTIONS_WEBHOOK_SECRET: string;
  RAROUS_WEBLOG_CARDS_SECRET: string;
}

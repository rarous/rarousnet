export interface Env {
  domain: string;
  screenshotter: Service;
  storage: R2Bucket;
  w3b: KVNamespace;
  weblog: KVNamespace;
  HOSTNAME: string;
  PRIVATE_KEY: string;
  RAROUS_WEBLOG_CARDS_SECRET: string;
  ROLLBAR_TOKEN: string;
  SCREENSHOTTER_SECRET: string;
  TURNSTILE_SECRET_KEY: string;
  WEBMENTIONS_WEBHOOK_SECRET: string;
}

# rarousnet

[![Build status](https://circleci.com/gh/rarous/rarousnet.svg?style=shield)](https://circleci.com/gh/rarous/rarousnet)
[![CodeFactor](https://www.codefactor.io/repository/github/rarous/rarousnet/badge)](https://www.codefactor.io/repository/github/rarous/rarousnet)
[![CodeScene Code Health](https://codescene.io/projects/783/status-badges/code-health)](https://codescene.io/projects/783)
[![CodeScene System Mastery](https://codescene.io/projects/783/status-badges/system-mastery)](https://codescene.io/projects/783)
[![CodeScene Missed Goals](https://codescene.io/projects/783/status-badges/missed-goals)](https://codescene.io/projects/783)

Sources for https://www.rarous.net/ website.

## Site generator

Site generator is a Clojure program in `generator/`, entry point `rarousnet.generator`. It reads files in `content/weblog` and templates in `www.rarous.net/src/html/weblog` and `generator/templates/weblog` and generates the weblog site into `.gryphoon/dist`. Run it with `yarn generate`. See [generator/README.md](generator/README.md) for details.

## Build

```bash
yarn build
```

## Run local development for HTML/CSS/JS hot reloading

```bash
yarn start
```

## Run wrangler for local development of Cloudflare Pages Functions

```bash
cd www.rarous.net
op run --env-file=../.env --no-masking -- wrangler pages dev ../.gryphoon/dist --kv=weblog --r2=storage --compatibility-flag=nodejs_compat --compatibility-date=2023-09-29 
```

## Run wrangler for local development of CRON scripts

```bash
op run --env-file=.env  --no-masking -- wrangler dev --test-scheduled workers/discogs-schedule.js 
```

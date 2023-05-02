# rarousnet

[![Build status](https://circleci.com/gh/rarous/rarousnet.svg?style=shield)](https://circleci.com/gh/rarous/rarousnet)

Sources for https://www.rarous.net/ website.


## Site generator

Site generator is Clojure program that reads files in `content/weblog` and related templates in `generator/templates/weblog` and generates
weblog site. Content is Texy with embedded EDN data in header. Texy is PHP library, that is used via CLI from the Clojure program.

## Cards Generator

Cards generator is Node.js program that uses Playwright to generate Social media share images for every blogpost.

## Build

```
yarn build
```

## Run

```
yarn start
```

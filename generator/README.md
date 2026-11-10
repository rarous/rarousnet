# Gryphoon Blog Generator

## Prerequisites

```shell
brew install clojure
```

## Generator

Entry point is `rarousnet.generator`, run as `clojure -M -m rarousnet.generator ../`
from the `generator/` directory, or `yarn generate` from the repo root.

It reads articles in `content/weblog` — Texy with embedded EDN data in the
front matter header — and templates in `www.rarous.net/src/html/weblog` and
`generator/templates/weblog`, and generates the weblog into `.gryphoon/dist`:
article pages, the weblog index, tag and time indexes, RSS and syndication
feeds, sitemap, `cards.json` for Open Graph images and redirects.

Content is converted by the `work.gryphoon/texy-clj` dependency (namespaces
under `work.gryphoon.texy`), the Clojure port of Texy that lives in the
`gryphoon` repository under `packages/texy-clj` — see that project's README
for its usage, options, custom handlers, architecture and conformance details.

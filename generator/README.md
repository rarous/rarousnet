# Gryphoon Blog Generator

The rarouš.weblog site wiring for the generic blog generator: an EDN settings
file, the enlive theme and the Texy setup. The engine is generic and lives in
the `gryphoon` repository under `packages/weblog`
(`work.gryphoon.weblog.generator`), along with the Clojure Texy port
(`packages/texy-clj`, `work.gryphoon.texy`).

- `gryphoon.edn` — the site settings: URL, section paths, locale, date
  formats, authors, index page labels, feed and syndication options,
  `:theme`.
- `src/rarousnet/weblog.clj` — the theme: a `WeblogTheme` protocol
  implementation (the `theme` var) with enlive templates over the built HTML
  (`weblog/index.html`, `weblog/blogpost.html`, `weblog/category.html` off
  the classpath) and the site's Texy setup.
- `src/rarousnet/texy.clj` — the production Texy configuration (custom
  directives, image handling, Prism code rendering).

The RSS channel (`gryphoon/index.rss`) is a package resource of the engine;
its channel metadata comes from `gryphoon.edn`'s `:rss` settings.

## Prerequisites

```shell
brew install clojure
```

## Generate

```bash
yarn generate
```

Runs `clojure -M -m work.gryphoon.weblog.generator` from this directory: the
settings fall back to `gryphoon.edn` here, the site root to the parent
directory. It reads articles in `../content/weblog` — Texy with embedded EDN
data in the front matter header — and generates the weblog into
`../../.gryphoon/dist`: article pages, the weblog index, tag and time
indexes, RSS and syndication feeds, sitemap, `cards.json` for Open Graph
images and redirects.

The same runs as the `generate-content` blendid task of the website build
(see `www.rarous.net/config/gryphoon-registry.mjs`), which must render the
HTML templates first: the enlive theme consumes the built template files
from `.gryphoon/dist/weblog/`.

A settings file is injectable as the first CLI argument:

```bash
clojure -M -m work.gryphoon.weblog.generator another-site.edn path/to/site-root
```

See the gryphoon repository's `packages/weblog` README for the engine's
settings reference and the theme contract.

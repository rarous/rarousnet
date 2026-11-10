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

Content is converted by the Clojure port of Texy described below.

## Texy for Clojure

A Clojure port of [Texy](https://texy.nette.org), driven by
[docs/porting.md](../../docs/porting.md) as the requirements document.
It covers a well-defined subset of the pipeline:

```
normalize -> parse (block + inline engine -> AST of plain maps)
           -> transform passes (directives, HTML pairing + sanitization,
              link/image reference resolution, heading level balancing,
              typography)
           -> render (AST -> hiccup vectors -> jsoup well-forming
              -> huff2 serialization)
```

Not implemented: hyphenation (deliberately out of scope); typography is
on by default, like the reference. The global well-forming phase is
jsoup's HTML5 tree construction (see `texy.dom` and Deviations); 28 of
the 31 original test sources pass conformance - in both fixture sets,
typography off and typography on - the three gaps are documented in
`known-gaps` in `test/texy/conformance_test.clj`.

## Usage

```clojure
(require '[texy.core :as texy])

(texy/process (texy/->texy) "Hello **world**!")   ; => HTML string

(def doc (texy/parse (texy/->texy) "Hello **world**!"))  ; => AST map
(texy/render-html doc)                            ; AST -> HTML string
(texy/render-hiccup doc)                          ; AST -> hiccup vectors
(texy/render-text doc)                            ; AST -> plain text
```

`(texy/to-text (texy/->texy) "...")` is the one-call form. With
`:single-line true` the text parses as one inline line, like the
reference's `process($text, singleLine: true)`.

Converter options: `:merge-lines` (default true), `:top`,
`:fixed-leveling`, `:generate-ids` / `:id-prefix` (heading ids for a
`{toc:}`), `:image-root` (default `"images/"`), `:link-root`,
`:link-no-follow`, `:link-pattern` / `:image-pattern` (URL scheme policy -
a disallowed link drops to its content, a disallowed image drops its
`src`), `:shorten-urls` (default true), `:emoticons` (opt-in, like the
reference), `:typography` (default true), `:typography-locale`
(default "cs"; unknown falls back to English), `:phrase-tags`
(replaces the phrase tag mapping, the reference Config::phraseTags),
`:figure-class` (default `"figure"`, the reference Config::figureClass);
render options may be
given per `process` call.

## Custom handlers

The port's counterpart of the reference's `addLineSyntax` /
`addBlockSyntax` / `addPass`:

```clojure
;; a custom inline syntax: name, pattern, handler -> node(s) or nil
(def smiley (-> (texy/->texy)
                (texy/add-line-syntax "smiley" #":-?\)"
                                      (fn [_ _] {:type :smiley}))))

;; custom node types render through the multimethod
(defmethod texy.render/render-node :smiley [_]
  [[:span {:class "smiley"} ":-)"]])

(texy/process smiley "hi :)!")  ; => <p>hi <span class="smiley">:-)</span>!</p>
```

- `add-line-syntax` - an inline syntax. At the same offset the longer
  match wins, then earlier registration (custom syntaxes run after the
  built-ins). The handler `(fn [ctx groups])` returns a node map, a
  vector of nodes, or nil to refuse the match (other syntaxes at that
  position then get their turn, or the text stays plain).
- `add-block-syntax` - a block syntax. The pattern is compiled with the
  multiline flag (like the built-ins); the handler may consume
  continuation lines through the block parser
  (`texy.engine/block-next`, `texy.engine/block-move-backward`).
- `add-pass` - a transform pass, a function document -> document run
  after the built-in passes (heading balancing, link resolution);
  `texy.passes/transform-nodes` is the natural helper for writing one.

**Script (directive) handlers** - the `{{name ...}}` syntax, the port of
the reference's DirectiveModule:

```clojure
(def texy (-> (texy/->texy)
              (texy/add-directive "note"
                                  (fn [value args _]
                                    {:type :text :text (str "note: " value)}))
              ;; or catch directives with no named handler:
              (texy/set-fallback-directive some-handler)))

(texy/process texy "see {{note: hi}}")  ; => <p>see note: hi</p>
```

The directive pass runs first (before heading balancing):
`{{texy: a, b}}` is consumed into the document `:meta`; a registered
handler receives `(value args node)` (value is the raw argument string,
nil for a bare `{{name}}`; args are its comma-separated parts) and its
node replaces the directive - nil removes it; a directive with no
handler stays in the document and renders as the author wrote it.
See `test/texy/directive_test.clj`.

See `test/texy/custom_syntax_test.clj` for working examples, and
`test/texy/blog_setup_test.clj` for the translation of a full Texy 3
production setup: script handlers (directives), an image handler
(a pass), a block handler (a render-node override) and the module
configuration.

## Architecture

- `texy.normalize` - line endings, trailing whitespace (the reference
  `Texy::normalize`).
- `texy.patterns` - the reference PCRE grammar translated to
  `java.util.regex` by hand: extended mode stripped, the ungreedy flag (U)
  inverted into explicit lazy quantifiers, possessive `++` kept.
- `texy.modifier` - the `.(title)[class]{style}<>^` modifier. The extent is
  found with a Java regex, the parts are structured by an
  [instaparse](https://github.com/engelenberg/instaparse) grammar - the one
  syntax in Texy that is a genuine CFG. `{name: value}` pairs become HTML
  attributes for names in the reference's `Modifier::ElAttrs` (or with a
  `data-`/`aria-` prefix), CSS styles otherwise.
- `texy.engine` - the two parsers: a stateful block parser exposed to
  handlers (they consume continuation lines via `block-next`, rewind via
  `block-move-backward`) and a leftmost-longest inline parser where a
  handler may refuse its match. Nodes are plain maps with a `:type` key;
  no source offsets/ranges are kept (documented simplification).
- `texy.modules` - the syntax handlers: paragraphs (line joining, hard
  breaks, whitespace-indented continuations), headings (underlined and
  surrounded, with dynamic level balancing), horizontal rules,
  blockquotes (a bare `>` line continues the quote, like the reference's
  empty /x alternative), (definition) lists, fenced code and `/--`
  blocks (code/div/html/text/comment/texysource - the reference's PCRE
  `(?0)` recursion is a depth-tracking line scanner, and the outdent
  strips per line only the prefix characters a line actually shares),
  tables (rowspan `^` continuation, colspan, column-modifier
  inheritance, head separators, multiline cells), phrases, wiki/markdown
  links, link and image definitions (`[ref]: url`, `[*ref*]: url`),
  images, figures (`[*img*]:link *** caption .mod`, the image part is
  atomic like the reference's `(?>...)`, so a line with two images is a
  paragraph, not a figure), autolinks, emoticons (opt-in), `{{...}}`
  directives (lazy matching - a directive closes at the first `}}`).
- `texy.html` - the HTML passthrough: tag/comment/entity line syntaxes,
  the HtmlPolicy port (tag whitelist, a/img validation, attribute
  filtering), and the pairing / sanitize passes. Entity decoding
  delegates to jsoup's full HTML5 entity table. Pairing keeps the
  reference's strict flatten semantics per content container - it is
  load-bearing, not jsoup-replaceable: the sanitize pass rejects
  paired elements by rendering BOTH tags as text, while jsoup would
  drop the orphan close tag. The global tag-stream repair is not done
  here - jsoup owns it at serialization time.
- `texy.passes` - bottom-up AST transforms (`transform-nodes` walks
  `:content`, `:items`, `:caption`, `:image`, `:rows` and `:cells`):
  heading balancing (with webalized ids for `{toc:}`), link-reference
  resolution (`[ref]` / `[*img*]` URLs resolve to their inner name; the
  `[*img*]` form additionally marks the link to use the image root, and
  the `[*ref*]::` self-link resolves against the image definitions).
- `texy.dom` - the HTML transform phase: a hicory-style facade over
  [jsoup](https://jsoup.org) (the jsoup-Document-to-hiccup conversion
  inlined). The rendered hiccup is serialized, parsed by jsoup - its
  HTML5 tree construction repairs the global tag stream (unclosed and
  crossed tags, prohibited nesting, raw script and style islands) -
  and converted back to hiccup. Tag-free raw blobs (the e-mail
  obfuscation entity, comment payloads) survive the parse round trip
  through base64 `<texy-raw>` placeholders. huff's void-element
  serialization is overridden to the HTML5 style here (`<br>`, not
  the XHTML `<br />`).
- `texy.typography` - typographic corrections (TypographyModule):
  the locale quote catalog and the substitution patterns over the
  TextRunPass marker alphabet (\x15 protected text, \x16 replaced
  content, \x17 markup boundary), plus the TextRunPass port itself:
  each inline container becomes one text image, block-level passthrough
  markup splits it into segments, the transformed image is written back
  into the text nodes. Runs as parse()'s last step, default on;
  `core/apply-typography` is the reference applyTypography.
- `texy.render` - the AST rendered to hiccup vectors, serialized by
  [huff2](https://github.com/escherize/huff) (`huff2.core/html`, a plain
  function over runtime data - no macro expansion), with jsoup's
  well-forming in between (see `texy.dom`). Serialization-time
  details of the reference renderer are ported: e-mail obfuscation (on
  by default), URL shortening for autolink display text (on by
  default), the `nofollow` class moving onto `rel="nofollow"`, text-run
  shrinking, and a render-time prohibited-ancestor pass (an `<a>`
  produced inside a link's content drops its tag, the text stays).
  The parse-only fragment path (`texy.render/to-html-fragment`, the
  `/--texysource` display) skips jsoup, like the reference's
  finalizeFragment.
- `texy.text` - the plain-text renderer (the reference Output/Text
  Renderer): markup dropped, blocks separated by blank lines, list
  items one per line, table cells joined with tabs.

## Conformance

The conformance suite renders each original source
(`tests/Texy/sources/*.texy`) and compares with reference HTML generated
by the PHP oracle with typography, hyphenation **and well-former
formatting disabled**:

```
php ../node.js/tools/transform-oracle.php --render-flat
```

writes `fixtures/render-flat/` (indent off, line wrap off) - matching this
port's flat serialization. Both sides are normalized for serialization
differences (attribute order).

The same suite runs a second time with typography on against
`fixtures/render-typo/` (`php ../node.js/tools/transform-oracle.php
--render-typo-flat` - typography on, flat formatting), exercising the
typography module and the TextRunPass port.

## Deviations from the reference

- **The global well-forming phase is jsoup's HTML5 tree construction**,
  not a port of the reference WellFormer (`texy.dom`): no indentation,
  no 80-column line wrapping - hence the flat oracle fixtures. The
  repairs mostly coincide, and jsoup additionally guarantees
  well-formed output; the accepted disagreements are the three
  conformance gaps:
  - nested `<a>` closes the outer link and opens a new one (adoption
    agency) where the reference drops the inner start tag; crossed
    inline tags nest rather than flatten;
  - `<script>`/`<style>` content stays raw until its real close tag,
    where the reference auto-closes at the first embedded comment;
  - an implicit `<tbody>` is inserted into passthrough tables
    (`<table><tr>` becomes `<table><tbody><tr>`);
  - bare boolean attributes (`<embed test>`) serialize as
    `test=""` (a DOM has no authorless attributes).
- **Entity decoding** delegates to jsoup's full HTML5 entity table -
  the same table the reference decodes with - plus the reference's
  `html_entity_decode` refusal semantics (refused codepoints stay
  literal, a NUL reference maps to U+FFFD, `&#12;` renders empty).
- **No hyphenation** (deliberately out of scope), so no image
  dimensions read from the filesystem either.
- **Locale independence**: every case conversion goes through the Unicode
  ROOT locale (texy.normalize/lower-case), like the reference's
  mb_strtolower (Texy never sets a locale) - the JVM default locale
  (Turkish, say) cannot change tag matching, directive/reference
  lookups or webalized ids. Clojure's str/lower-case uses the default
  locale and is not used.
- **Escaping** is done by this port (huff's own escaping is disabled):
  display text and code with `& < >` only (the reference's `ENT_NOQUOTES`
  - apostrophes stay literal); attribute values with `& " < >` (the
  reference's `formatAttrs`). The jsoup round trip decodes and re-encodes
  with the same functions (`texy.dom/wellform` receives them), so the
  escaping semantics are unchanged; tag-free raw blobs bypass the round
  trip entirely.
- E-mail obfuscation and URL shortening are on by default, like the
  reference renderer's defaults.
- No HTML safe mode / `Configurator::safeMode` equivalent; the HtmlPolicy
  port keeps the tag whitelist and attribute filtering, and the URL
  scheme policy is configurable via `:link-pattern` / `:image-pattern`.
- Ordered list flavors render as `<ol>` with a `list-style-type` style,
  like the reference; the figure `div` appends the `figure` class after
  the modifier classes and turns the image alignment into a `float`
  style, also like the reference.
- `alt` is always emitted on `<img>` (empty when no title) - the value is
  passed as a huff raw string so the empty attribute survives huff's
  omission of empty values.

## Tests

```
clojure -M:test        # clojure.test suite (unit + conformance), non-zero exit on failure

# first-difference printer for failing conformance sources (dev tool):
clojure -M:dev -e "(require 'texy.diff) (texy.diff/-main)"
```

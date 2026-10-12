(ns texy.typography
  "Typographic corrections (port of TypographyModule and the TextRunPass
  machinery it runs through): locale-dependent quotes, dashes, ellipsis,
  arrows, dimension and degree signs, and non-breaking spaces.

  The transformations operate on TextRunPass text images: a block's
  inline content flattened to a string where the marker bytes \\x15
  (protected text), \\x16 (replaced content) and \\x17 (markup boundary)
  stand in for non-text nodes - the alphabet the patterns are written
  over. The patterns never create nor destroy marker bytes, so the
  write-back can use them as delimiters.

  Java notes: the reference quote patterns use PCRE's ungreedy flag
  (U); Java's (?U) is a different feature, so the ungreedy semantics
  are spelled out with explicit lazy quantifiers (possessives
  unchanged), like the rest of the port."
  (:require [clojure.string :as str]
            [texy.html :as html]
            [texy.normalize :as norm]))

(def locales
  "Quotes per locale: the open/close pair for the nested (single) and
  primary (double) level. Guillemet languages nest curly quotes inside
  «»; Japanese uses corner brackets. The reference
  TypographyModule::locales catalog, plus sk/nl/da/hr/fi kept in sync
  with the Node.js port's catalog (the reference itself falls back to
  English for those)."
  {"bg" {:single-quotes ["\u201A" "\u2018"] :double-quotes ["\u201E" "\u201C"]}
   "cs" {:single-quotes ["\u201A" "\u2018"] :double-quotes ["\u201E" "\u201C"]}
   "da" {:single-quotes ["\u203A" "\u2039"] :double-quotes ["\u00BB" "\u00AB"]} ; »« with the inner level reversed
   "de" {:single-quotes ["\u201A" "\u2018"] :double-quotes ["\u201E" "\u201C"]}
   ;; languages using guillemets nest the inner level in singleQuotes
   "el" {:single-quotes ["\u201C" "\u201D"] :double-quotes ["\u00AB" "\u00BB"]}
   "en" {:single-quotes ["\u2018" "\u2019"] :double-quotes ["\u201C" "\u201D"]}
   "es" {:single-quotes ["\u201C" "\u201D"] :double-quotes ["\u00AB" "\u00BB"]}
   "fi" {:single-quotes ["\u2019" "\u2019"] :double-quotes ["\u201D" "\u201D"]}
   "fr" {:single-quotes ["\u2039" "\u203A"] :double-quotes ["\u00AB" "\u00BB"]}
   "hr" {:single-quotes ["\u201A" "\u2019"] :double-quotes ["\u201E" "\u201D"]}
   "hu" {:single-quotes ["\u201A" "\u2019"] :double-quotes ["\u201E" "\u201D"]}
   "it" {:single-quotes ["\u201C" "\u201D"] :double-quotes ["\u00AB" "\u00BB"]}
   ;; Japanese corner brackets: 「…」 primary, 『…』 nested
   "ja" {:single-quotes ["\u300E" "\u300F"] :double-quotes ["\u300C" "\u300D"]}
   "nl" {:single-quotes ["\u2018" "\u2019"] :double-quotes ["\u201C" "\u201D"]}
   "pl" {:single-quotes ["\u201A" "\u2019"] :double-quotes ["\u201E" "\u201D"]}
   ;; Brazilian usage, which is what the pt documentation follows
   "pt" {:single-quotes ["\u2018" "\u2019"] :double-quotes ["\u201C" "\u201D"]}
   "ro" {:single-quotes ["\u201A" "\u2019"] :double-quotes ["\u201E" "\u201D"]}
   "ru" {:single-quotes ["\u201E" "\u201C"] :double-quotes ["\u00AB" "\u00BB"]}
   "sk" {:single-quotes ["\u201A" "\u2018"] :double-quotes ["\u201E" "\u201C"]}
   "sl" {:single-quotes ["\u201A" "\u2018"] :double-quotes ["\u201E" "\u201C"]}
   "tr" {:single-quotes ["\u2018" "\u2019"] :double-quotes ["\u201C" "\u201D"]}
   "uk" {:single-quotes ["\u201E" "\u201C"] :double-quotes ["\u00AB" "\u00BB"]}})

(defn- build-patterns
  "Search => replacement pairs over the text image; the quote pairs are
  filled with the locale quotes (the reference's :ldq: placeholder
  trick, inlined here)."
  [{:keys [single-quotes double-quotes]}]
  [[#"(?mu)(?<![.\x{2026}])\.{3,4}(?![.\x{2026}])" "\u2026"]                 ; ellipsis  ...
   [#"(?<=[\d ]|^)-(?=[\d ]|$)" "\u2013"]                                    ; en dash 123-123
   [#"(?<=[^!*+,/:;<=>@\\\\_|-])--(?=[^!*+,/:;<=>@\\\\_|-])" "\u2013"]       ; en dash alphanum--alphanum
   [#",-" ",\u2013"]                                                          ; en dash ,-
   [#"(?<!\d)(\d{1,2}\.) (\d{1,2}\.) (\d\d)" "$1\u00A0$2\u00A0$3"]            ; date 23. 1. 1978
   [#"(?<!\d)(\d{1,2}\.) (\d{1,2}\.)" "$1\u00A0$2"]                           ; date 23. 1.
   [#" --- " "\u00A0\u2014 "]                                                 ; em dash ---
   [#"(?u) ([\u2013\u2014])" "\u00A0$1"]                                      ; nbsp behind dash (dash stays at line end)
   [#" <-{1,2}> " " \u2194 "]                                                 ; left right arrow <-->
   [#"-+> " "\u2192 "]                                                        ; right arrow -->
   [#" <-+" " \u2190 "]                                                       ; left arrow <--
   [#"=+> " "\u21D2 "]                                                        ; right arrow ==>
   [#"\+-" "\u00B1"]                                                          ; +-
   [#"(\d+) x (?=\d)" "$1\u00A0\u00D7\u00A0"]                                 ; dimension sign 123 x 123...
   [#"(\d+)x(?=\d)" "$1\u00D7"]                                               ; dimension sign 123x123...
   [#"(?m)(?<=\d)x(?= |,|\.|$)" "\u00D7"]                                     ; dimension sign 123x
   [#"(?i)(\S ?)\(TM\)" "$1\u2122"]                                           ; trademark (TM)
   [#"(?i)(\S ?)\(R\)" "$1\u00AE"]                                            ; registered (R)
   [#"(?i)\(C\)( ?\S)" "\u00A9$1"]                                            ; copyright (C)
   [#"\(EUR\)" "\u20AC"]                                                      ; Euro (EUR)
   [#"(\d) (?=\d{3})" "$1\u00A0"]                                             ; (phone) number 1 123 123 123...

   ;; the text image alphabet: \x15 protected text, \x16 replaced, \x17 markup
   [#"(?u)(?<=[^\s\x17])\s++(\x17++)(?=\s)" "$1"]                             ; remove intermarkup space phase 1
   [#"(?u)(?<=\s)(\x17++)\s++" "$1"]                                          ; remove intermarkup space phase 2

   [#"(?us)(?<=.{50})\s++(?=\x17*\S{1,6}\x17*$)" "\u00A0"]                    ; space before last short word

   ;; nbsp between number (optionally with dot) and word, symbol,
   ;; currency symbol - % and letters kept as \p{L} (the long form
   ;; \p{Letter} is unavailable: java.util.regex has no long category
   ;; names - the JS sibling uses the full name there; a deliberate
   ;; extension beyond the reference's legacy A-Za-z/Latin/Greek/Cyrillic
   ;; ranges: it covers all scripts), plus the reference's
   ;; U+00B0-U+00BE and U+2020-U+214F symbol blocks (°, …, €, ...) -
   ;; these have no faithful Unicode class, so they stay ranges
   ;; (\p{P} would wrongly match ",")
   [#"(?mu)(?<=^| |\.|,|-|\+|\x16|\(|\d\x{A0})(\x17*\d++\.?\x17*)\s++(?=\x17*[%\p{L}\u00B0-\u00BE\u2020-\u214F])"
    "$1\u00A0"]
   ;; space between preposition and word
   [#"(?mus)(?<=^|[^0-9\p{L}])(\x17*[ksvzouiKSVZOUIA]\x17*)\s++(?=\x17*[0-9\p{L}])"
    "$1\u00A0"]

   ;; double ""
   [#"(?u)(?<!\"|\w)\"(?![ \"])((?:[^\"]++|\")+?)(?<![ \"])\"(?![\"\p{L}])"
    (str (first double-quotes) "$1" (second double-quotes))]
   ;; single ''
   [#"(?u)(?<!'|\w)'(?![ '])((?:[^']+|')+?)(?<![ '])'(?!['\p{L}])"
    (str (first single-quotes) "$1" (second single-quotes))]])

;; compiled once per locale, like the reference localizedReplacements cache
(def ^:private patterns (memoize build-patterns))

(defn process-typo
  "Applies the typographic corrections to one text image (the reference
  TypographyModule::postLine). Unknown locale falls back to English,
  like the reference. With :preserve-spaces true the leading tab and
  multiple-space shrinking is skipped (the reference toText path)."
  ([input] (process-typo input {:locale "cs"}))
  ([input {:keys [locale preserve-spaces]}]
   (let [s (if preserve-spaces
             input
             (-> input
                 (str/replace "\t" " ")
                 (str/replace #" {2,}" " ")))
         quotes (or (get locales locale) (get locales "en"))]
     (reduce (fn [s [m r]] (str/replace s m r))
             s
             (patterns quotes)))))


;;----------------------------------------------------------------
;; TextRunPass: builds a text image per inline container, transforms it,
;; writes the result back (the reference Passes/TextRunPass)

(def ^:private textual "\u0015")   ; protected text (code, URLs)
(def ^:private replaced "\u0016")  ; replaced content (images, br)
(def ^:private markup "\u0017")    ; markup boundary

(def ^:private inline-types
  "The inline node types (the reference Nodes\\InlineNode)."
  #{:text :raw-text :line-break :phrase :link :image :url :email
    :emoticon :directive :html-tag :html-element :html-comment})

(def ^:private collect-types
  "The inline containers collect descends into (their content joins the
  image between markup boundaries)."
  #{:phrase :link :html-element})

(defn- textual-run
  "Opaque textual run whose length approximates the visible length,
  capped so it stays a cheap marker (the reference textualRun)."
  [visible]
  (apply str (repeat (max 1 (min 8 (count visible))) textual)))

(defn- extract-text
  "The visible text of a node subtree (the reference Helpers::extractText)."
  [node]
  (case (:type node)
    (:text :raw-text) (:text node)
    :directive (:text node)
    (str/join (keep extract-text (:content node)))))

(declare collect)

(defn- collect-children
  [children]
  (into [] (mapcat collect) children))

(defn- collect
  "One inline node to image pieces [text target-node-or-nil]; a nil
  target marks a marker piece. The ::break piece splits the image at
  block-level markup (segments process independently)."
  [node]
  (case (:type node)
    (:text :raw-text) [[(:text node) node]]
    :phrase (if (= "phrase/code" (:syntax node))
              ;; protected from typography; the run length mirrors the
              ;; visible length so length-sensitive patterns judge fairly
              [[(textual-run (extract-text node)) nil]]
              (concat [[markup nil]] (collect-children (:content node)) [[markup nil]]))
    :link (concat [[markup nil]] (collect-children (:content node)) [[markup nil]])
    :html-tag (let [t (get html/inline-elements (norm/lower-case (:name node)))]
                (cond
                  (nil? t) [[:break nil]]                 ; block-level tag ends the segment
                  (= 1 t) [[replaced nil]]
                  :else [[markup nil]]))
    :html-element (let [t (get html/inline-elements (norm/lower-case (:name node)))]
                    (if (nil? t)                          ; block element splits, content still forms its own segments
                      (concat [[:break nil]] (collect-children (:content node)) [[:break nil]])
                      (let [b (if (= 1 t) replaced markup)]
                        (concat [[b nil]] (collect-children (:content node)) [[b nil]]))))
    :html-comment [[markup nil]]
    :url [[(textual-run (:url node)) nil]]               ; display text is protected
    :email [[(textual-run (:email node)) nil]]
    :directive [[(textual-run (:text node)) nil]]
    (:image :line-break :emoticon) [[replaced nil]]
    ;; definitions and block comments render to nothing
    (:link-definition :image-definition :block-comment) []
    []))

(defn- write-back
  "Distributes the transformed image back into the writable pieces,
  using the marker pieces (never created nor destroyed by the
  patterns) as delimiters: text between two markers belongs to the
  writable runs of that gap, the first run receives everything. A
  marker that cannot be located means a pattern ate markers - the
  segment is left untouched."
  [pieces transformed]
  (loop [pieces pieces, pos 0, gap [], writes []]
    (if (seq pieces)
      (let [[text target] (first pieces)]
        (if (some? target)
          (recur (rest pieces) pos (conj gap target) writes)
          (if-some [idx (str/index-of transformed text pos)]
            (let [writes (into writes
                              (map-indexed (fn [i node]
                                             [node (if (zero? i) (subs transformed pos idx) "")]))
                              gap)]
              (recur (rest pieces) (+ idx (count text)) [] writes))
            nil)))
      (into writes
            (map-indexed (fn [i node]
                           [node (if (zero? i) (subs transformed pos) "")]))
            gap))))

(defn- process-segment
  "Transforms one segment image through the transformers (nil when
  nothing to do)."
  [pieces transformers]
  (when (some #(some? (second %)) pieces)
    (let [image (str/join (map first pieces))
          image' (reduce (fn [s f] (f s)) image transformers)]
      (when-not (= image image')
        (write-back pieces image')))))

(defn- rebuild
  "Applies the planned writes to the subtree (identity compare - two
  equal text nodes are different nodes); collect-descended containers
  rebuild their content."
  [node writes]
  (or (some (fn [[n text]] (when (identical? n node) (assoc node :text text))) writes)
      (if (contains? collect-types (:type node))
        (update node :content #(mapv (fn [c] (rebuild c writes)) %))
        node)))

(defn- process-content
  "Processes one all-inline children collection as a text-run unit."
  [children transformers]
  (let [pieces (collect-children children)
        writes (->> (partition-by #(= :break (first %)) pieces)
                    (remove #(= :break (first (first %))))
                    (keep #(process-segment % transformers))
                    (apply concat)
                    doall)]
    (mapv #(rebuild % writes) children)))

(defn- transform-titles
  "Title transformation for isolated strings: modifier titles and the
  {toc:} label (the reference transformTitle) - typography only, never
  hyphenation (titles are not line text)."
  [node title-transformer]
  (cond-> node
    (and title-transformer (string? (get-in node [:modifier :title])))
    (update-in [:modifier :title] title-transformer)

    (and title-transformer (string? (:title-override node)))
    (update :title-override title-transformer)))

(defn- transform-titles-deep
  [node title-transformer]
  (let [node (transform-titles node title-transformer)]
    (if (contains? collect-types (:type node))
      (update node :content #(mapv (fn [c] (transform-titles-deep c title-transformer)) %))
      node)))

(declare walk)

(defn- walk-children
  [node opts]
  (reduce (fn [node key]
            (let [v (get node key)]
              (cond
                (nil? v) node
                (and (map? v) (contains? v :type)) (assoc node key (walk v opts))
                (sequential? v) (update node key #(mapv (fn [c] (walk c opts)) %))
                :else node)))
          node
          [:content :items :caption :image :rows :cells]))

(defn- walk
  [node {:keys [transformers title-transformer]}]
  (let [node (transform-titles node title-transformer)
        content (:content node)]
    (if (and (sequential? content) (seq content)
             (every? (comp inline-types :type) content))
      (assoc node :content
             (process-content (mapv #(transform-titles-deep % title-transformer) content)
                             transformers))
      (walk-children node {:transformers transformers
                           :title-transformer title-transformer}))))

(defn text-run-pass
  "Runs the text transformers over every inline container of the
  document (the reference TextRunPass, run by applyAstTypography as
  parse()'s last step): each container's inline content becomes one
  text image, block-level passthrough markup splits it into
  independent segments, and the transformed image is written back into
  the text nodes. The transformers run in order - typography first,
  then hyphenation (the reference applyAstTypography order); the
  title-transformer (typography only) handles modifier titles and the
  {toc:} label as isolated strings, nil leaves them untouched."
  [doc {:keys [transformers title-transformer]}]
  (walk doc {:transformers transformers :title-transformer title-transformer}))

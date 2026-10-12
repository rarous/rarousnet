(ns texy.html
  "HTML passthrough (port of HtmlModule, HtmlPolicy, HtmlPairingPass,
  HtmlSanitizePass and the Output/Html/Schema data): the tag, comment and
  entity syntaxes, tag validation, and the pairing + sanitize passes.

  Entity decoding delegates to jsoup's full HTML5 entity table - the
  same table the reference decodes with (html_entity_decode,
  ENT_HTML5)."
  (:require [clojure.string :as str]
            [texy.normalize :as norm]
            [texy.passes :as passes])
  (:import (org.jsoup.nodes Entities)))

;;----------------------------------------------------------------
;; Schema data (the reference Output/Html/Schema, extracted via the oracle)

(def known-tags
  "Tags the default tag whitelist accepts (Schema::Elements minus
  html/head/body/style); an unknown tag renders as text."
  #{"a" "abbr" "audio" "b" "bdi" "bdo" "cite" "code" "data" "datalist"
    "del" "dfn" "em" "i" "ins" "kbd" "label" "map" "mark" "q" "ruby" "s"
    "samp" "slot" "small" "span" "strong" "sub" "sup" "template" "time"
    "u" "var" "area" "br" "embed" "img" "input" "link" "meta" "wbr"
    "button" "canvas" "iframe" "math" "meter" "noscript" "object"
    "output" "picture" "progress" "script" "select" "svg" "textarea"
    "video" "p" "h1" "h2" "h3" "h4" "h5" "h6" "pre" "address" "article"
    "aside" "blockquote" "details" "div" "fieldset" "figure" "footer"
    "form" "header" "hr" "main" "nav" "section" "table" "caption"
    "colgroup" "col" "thead" "tbody" "tfoot" "tr" "td" "th" "ul" "ol"
    "li" "dl" "dt" "dd" "figcaption" "legend" "summary" "option"
    "optgroup" "param" "source" "track" "base"})

(def void-elements
  "Void elements: no end tag, leaves by definition in the pairing pass."
  #{"area" "br" "embed" "img" "input" "link" "meta" "wbr" "hr" "col"
    "param" "source" "track" "base"})

(def inline-elements
  "Phrasing elements: 1 = replaced (img, br, ...), 0 = inline markup."
  {"a" 0 "abbr" 0 "audio" 0 "b" 0 "bdi" 0 "bdo" 0 "cite" 0 "code" 0
   "data" 0 "datalist" 0 "del" 0 "dfn" 0 "em" 0 "i" 0 "ins" 0 "kbd" 0
   "label" 0 "map" 0 "mark" 0 "q" 0 "ruby" 0 "s" 0 "samp" 0 "slot" 0
   "small" 0 "span" 0 "strong" 0 "sub" 0 "sup" 0 "template" 0 "time" 0
   "u" 0 "var" 0 "area" 0 "br" 1 "embed" 1 "img" 1 "input" 1 "link" 0
   "meta" 0 "wbr" 0 "button" 1 "canvas" 1 "iframe" 1 "math" 1 "meter" 1
   "noscript" 1 "object" 1 "output" 1 "picture" 1 "progress" 1 "script" 1
   "select" 1 "svg" 1 "textarea" 1 "video" 1})

(defn inline? [tag] (contains? inline-elements tag))
(defn replaced? [tag] (= 1 (get inline-elements tag)))
(defn void? [tag] (contains? void-elements tag))

;;----------------------------------------------------------------
;; Entities

(def entity-pattern
  "&(?:#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});")

(defn- strip-control-chars
  "Control characters a numeric entity reference may smuggle in (the
  reference stripControlChars; tab, LF and CR stay)."
  [^String s]
  (str/replace s #"[\x00-\x08\x0B\x0C\x0E-\x1F]++" ""))

(def ^:private refused-codepoints
  "Numeric references the reference's html_entity_decode refuses (and so
  leaves literal): C0 controls except tab, LF and FF, plus DEL and the
  127-159 cp1252-remap zone - jsoup would remap those (HTML5), PHP does
  not."
  (into #{} (concat (range 1 9) [11 13] (range 14 32) (range 127 160))))

(defn- numeric-ref-code
  "The codepoint of a numeric reference, nil for named entities."
  [^String ref]
  (when (str/starts-with? ref "&#")
    (let [body (subs ref 2 (dec (count ref)))]
      (if (contains? #{\x \X} (first body))
        (Long/parseLong (subs body 1) 16)
        (Long/parseLong body)))))

(defn decode-entity
  "Decodes one entity reference to its text, nil when it is not a known
  entity (the syntax then refuses the match and it stays literal). A
  NUL reference maps to U+FFFD; the reference's html_entity_decode
  refuses the codepoints in refused-codepoints, and a decode that
  leaves only strippable control characters accepts as empty text
  (&#12; renders nothing, like the reference). jsoup carries the full
  HTML5 entity table for the rest."
  [^String ref]
  (if (re-matches #"&\#(?:0+|[xX]0+);" ref)
    "\uFFFD"
    (let [d (Entities/unescape ref)]
      (when (and (not= d ref)
                 (not (and (str/starts-with? ref "&#")
                           (contains? refused-codepoints (numeric-ref-code ref)))))
        (strip-control-chars d)))))

(defn unescape-html
  "Decodes all recognized entities (jsoup's full HTML5 table)."
  [^String s]
  (if (str/includes? s "&")
    (Entities/unescape s)
    s))

;;----------------------------------------------------------------
;; Tag/comment syntaxes

(def ^:private tag-pattern
  (re-pattern (str "(?i)<(/?)([a-z][a-z0-9_:-]{0,50})"
                   "((?:\\s++[a-z0-9_:-]++|=\\s*+\\x22[^\\x22]*+\\x22|=\\s*+'[^']*+'|=[^\\s>]++)*)"
                   "\\s*+(/?)>")))

(defn parse-attrs
  "Parses an attribute string into {lowercased-name value}; boolean
  attributes get true, values are entity-decoded and trimmed (the
  reference parseAttributes)."
  [^String s]
  (let [m (re-matcher (re-pattern (str "(?is)([a-z0-9_:-]+)\\s*"
                                       "(?:=\\s*('[^']*'|\\x22[^\\x22]*\\x22|[^'\\x22\\s]+))?"))
                      s)]
    (loop [res {}]
      (if (.find m)
        (let [value (.group m 2)
              value' (cond
                       (nil? value) true
                       (or (str/starts-with? value "'") (str/starts-with? value "\""))
                       (str/trim (unescape-html (subs value 1 (dec (count value)))))
                       :else (str/trim (unescape-html value)))]
          (recur (assoc res (norm/lower-case (.group m 1)) value')))
        res))))

(defn parse-tag
  "The <tag attr=...> handler: an :html-tag node, or nil to refuse (a
  closing tag with attributes, a self-closing closing tag)."
  [_ groups]
  (let [[_ m-end m-tag m-attr m-empty] groups
        closing (= "/" m-end)
        self-closing? (= "/" m-empty)
        [m-attr self-closing?] (if (and (not self-closing?)
                                        (str/ends-with? (or m-attr "") "/"))
                                 [(subs m-attr 0 (dec (count m-attr))) true]
                                 [m-attr self-closing?])
        m-attr (str/trim (str/replace (or m-attr "") "\n" " "))]
    (when-not (or (and self-closing? closing)
                  (and closing (not (str/blank? m-attr))))
      {:type :html-tag
       :name m-tag
       :attrs (if closing {} (parse-attrs m-attr))
       :closing closing
       :self-closing self-closing?})))

(defn html-syntaxes
  "The tag, comment and entity line syntaxes (module order: before image
  and phrases)."
  []
  [{:name "html/tag" :pattern tag-pattern :handler parse-tag}
   {:name "html/comment"
    :pattern #"(?is)<!--(.*?)-->"
    :handler (fn [_ groups] {:type :html-comment :text (second groups)})}
   {:name "html/entity"
    :pattern (re-pattern entity-pattern)
    :handler (fn [_ groups]
               (when-some [decoded (decode-entity (first groups))]
                 {:type :text :text decoded}))}])

;;----------------------------------------------------------------
;; Policy

(defn- url-scheme [^String url]
  (re-find #"(?is)\s*[a-z][a-z0-9+.-]{0,20}:" url))

(defn- url-allowed? [url pattern]
  (or (nil? pattern)
      (not (url-scheme url))
      (boolean (re-find (re-pattern pattern) url))))

(defn validate-tag
  "Security validation of a tag: true = valid, false = escape as text,
  :drop = reject entirely (the reference validateTag)."
  [tag attrs closing {:keys [link-pattern image-pattern]}]
  (let [tag (norm/lower-case tag)]
    (cond
      (and (= "a" tag) (not closing)
           (not (or (contains? attrs "href") (contains? attrs "name") (contains? attrs "id"))))
      false
      (and (= "a" tag) (not closing)
           (string? (get attrs "href"))
           (not (url-allowed? (get attrs "href") link-pattern)))
      :drop
      (and (= "img" tag)
           (not (and (contains? attrs "src")
                     (not (and (string? (get attrs "src")) (str/blank? (str/trim (get attrs "src"))))))))
      false
      (and (= "img" tag)
           (string? (get attrs "src"))
           (not (url-allowed? (get attrs "src") image-pattern)))
      :drop
      :else true)))

(defn tag-allowed?
  "The tag whitelist. The default accepts every known tag; a custom
  whitelist is a map {tag [attr names...]}, with '*' listing attributes
  acceptable on any element, :all meaning all attributes."
  [tag {:keys [allowed-tags]}]
  (cond
    (false? allowed-tags) false
    (or (nil? allowed-tags) (= :all allowed-tags)) (contains? known-tags tag)
    :else (contains? allowed-tags tag)))

(defn filter-attrs
  "Drops attributes the whitelist does not name for the tag (the '*'
  key lists attributes allowed on any element)."
  [tag attrs {:keys [allowed-tags]}]
  (let [tag (norm/lower-case tag)]
    (cond
      (or (nil? allowed-tags) (= :all allowed-tags)) attrs
      (false? allowed-tags) {}
      :else (let [names (concat (get allowed-tags tag []) (get allowed-tags "*" []))]
              (if (or (= :all (get allowed-tags tag)) (= :all (get allowed-tags "*")))
                attrs
                (into {} (filter #(contains? (set names) (key %))) attrs))))))

(defn tag-acceptable?
  "Is the (opening or closing) tag acceptable for the transform phase?"
  [tag attrs closing options]
  (and (tag-allowed? tag options)
       (let [v (validate-tag tag attrs closing options)]
         (and (not= false v) (not= :drop v)))))

(defn reconstruct-tag
  "The original tag source text (the reference reconstructTag)."
  [node]
  (str "<" (when (:closing node) "/") (:name node)
       (str/join (map (fn [[k v]]
                        (if (true? v) (str " " k) (str " " k "=\"" v "\"")))
                      (:attrs node)))
       (when (:self-closing node) " /")
       ">"))

;;----------------------------------------------------------------
;; Pairing pass

(defn- emit
  "Emits a node into the innermost open frame or the output list."
  [out frames node]
  (if (seq frames)
    [out (assoc frames (dec (count frames))
                (update (peek frames) :children conj node))]
    [(conj out node) frames]))

(defn- flatten-frame
  "Pops the innermost frame and re-emits its open tag and children
  unpaired (crossed or unmatched tags)."
  [out frames]
  (let [{:keys [tag children]} (peek frames)
        frames (pop frames)
        [out frames] (emit out frames tag)]
    (reduce (fn [[out frames] n] (emit out frames n)) [out frames] children)))


(defn- pair-strict
  "The transform-time pairing (the reference HtmlPairingPass): tolerant
  per-container pairing - crossed or unmatched tags stay standalone,
  void elements are leaves."
  [children]
  (loop [children children out [] frames []]
    (if (empty? children)
      (if (seq frames)
        (let [[out frames] (flatten-frame out frames)]
          (recur children out frames))
        out)
      (let [c (first children)]
        (cond
          (not= :html-tag (:type c))
          (let [[out frames] (emit out frames c)]
            (recur (rest children) out frames))

          (and (not (:closing c)) (not (:self-closing c))
               (not (void? (norm/lower-case (:name c)))))
          (recur (rest children) out (conj frames {:tag c :children []}))

          (not (:closing c))
          (let [[out frames] (emit out frames c)]
            (recur (rest children) out frames))

          :else
          (let [name (norm/lower-case (:name c))
                found (some (fn [i] (when (= name (norm/lower-case (:name (:tag (frames i))))) i))
                            (range (dec (count frames)) -1 -1))]
            (if (nil? found)
              (let [[out frames] (emit out frames c)]
                (recur (rest children) out frames))
              (let [[out frames]
                    (loop [out out frames frames]
                      (if (> (dec (count frames)) found)
                        (let [[out frames] (flatten-frame out frames)]
                          (recur out frames))
                        [out frames]))
                    frame (nth frames found)
                    frames (into (subvec frames 0 found) (subvec frames (inc found)))
                    element {:type :html-element
                             :name (get-in frame [:tag :name])
                             :attrs (get-in frame [:tag :attrs])
                             :content (vec (:children frame))}
                    [out frames] (emit out frames element)]
                (recur (rest children) out frames)))))))))

(defn pairing-pass
  "Pairs passthrough tags into element trees, per content container
  (the reference HtmlPairingPass)."
  [doc]
  (passes/transform-content
    (fn [children] (if (some #(= :html-tag (:type %)) children)
                     (pair-strict children)
                     children))
    doc))


;;----------------------------------------------------------------
;; Sanitize pass

(defn- sanitize-children [children options]
  (let [text (fn [node] {:type :text
                         :text (unescape-html (reconstruct-tag node))})]
    (into []
          (mapcat (fn [child]
                    (case (:type child)
                      :html-tag
                      (if (tag-acceptable? (norm/lower-case (:name child))
                                           (:attrs child) (:closing child) options)
                        [(assoc child :attrs (filter-attrs (norm/lower-case (:name child))
                                                           (:attrs child) options))]
                        [(text child)])

                      :html-element
                      (if (tag-acceptable? (norm/lower-case (:name child))
                                           (:attrs child) false options)
                        [(assoc child :attrs (filter-attrs (norm/lower-case (:name child))
                                                           (:attrs child) options))]
                        ;; rejected element: open tag as text, children
                        ;; sanitized and spliced, close tag as text
                        (concat
                          [(text (select-keys child [:name :attrs :self-closing]))]
                          (sanitize-children (:content child) options)
                          [(text {:type :html-tag :name (:name child)
                                  :attrs {} :closing true :self-closing false})]))

                      [child])))
          children)))

(defn sanitize-pass
  "Evaluates the tag whitelist and validation over the paired tree:
  rejected tags and elements become text with the reconstructed source,
  kept tags keep only their whitelisted attributes."
  [doc options]
  (passes/transform-content #(sanitize-children % options) doc))

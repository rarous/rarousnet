(ns texy.render
  "HTML rendering as hiccup vectors serialized with huff2. Every render
  method returns a VECTOR of forms (an element vector, a string, or
  several forms to splice). Escaping is done by this port with the
  reference's exact semantics (text: only & < >, ENT_NOQUOTES; attribute
  values: & \" < >); huff's own escaping is disabled - the security
  boundary for display text is escape-html."
  (:require [clojure.string :as str]
            [texy.normalize :as norm]
            [huff2.core :as huff]
            [texy.dom :as dom]
            [texy.engine :as engine]
            [texy.html :as html]
            [texy.modifier :as mod]
            [texy.wellformer :as wellformer]))

(def ^:dynamic *options*
  "Rendering options: :image-root (default \"images/\"), :link-root,
  :link-no-follow."
  {})

(def phrase-tags
  {"phrase/strong" :strong
   "phrase/em" :em
   "phrase/em-alt" :em
   "phrase/em-alt2" :em
   "phrase/ins" :ins
   "phrase/del" :del
   "phrase/sup" :sup
   "phrase/sup-alt" :sup
   "phrase/sub" :sub
   "phrase/sub-alt" :sub
   "phrase/span" :span
   "phrase/span-alt" :span
   "phrase/quote" :q
   "phrase/code" :code
   "phrase/acronym" :abbr
   "phrase/acronym-alt" :abbr})

(defn- escape-html
  "Escapes display text like the reference: only & < > (ENT_NOQUOTES),
  quotes and apostrophes stay literal."
  ^String [^String s]
  (-> s
      (str/replace "&" "&amp;")
      (str/replace "<" "&lt;")
      (str/replace ">" "&gt;")))

(defn- escape-attr
  "Escapes an attribute value like the reference formatAttrs: & \" < > and
  @ (the e-mail obfuscation)."
  [v]
  (-> (str v)
      (str/replace "&" "&amp;")
      (str/replace "\"" "&quot;")
      (str/replace "<" "&lt;")
      (str/replace ">" "&gt;")
      (str/replace "@" "&#64;")))

(defn- escape-attrs
  "Escapes every attribute value; raw strings (empty alt) pass through."
  [m]
  (into {} (map (fn [[k v]] (if (huff/raw-string? v) [k v] [k (escape-attr v)]))) m))

(defn- ^String url-scheme
  "The scheme part of an URL, nil when there is none (a relative URL)."
  [^String url]
  (re-find #"(?is)\s*[a-z][a-z0-9+.-]{0,20}:" url))

(defn- url-allowed?
  "The URL scheme policy (the reference UrlPolicy): a nil pattern allows
  everything, scheme-less (relative) URLs always pass, otherwise the
  pattern (a regex source, e.g. \"https?:|ftp:|mailto:\") must match."
  [url pattern]
  (or (nil? pattern)
      (not (url-scheme url))
      (boolean (re-find (re-pattern pattern) url))))

(def ^:private link-url-attrs #{"href" "cite" "ping" "itemid" "itemtype"})
(def ^:private image-url-attrs #{"src" "srcset"})

(defn- filter-url-attrs
  "URL-bearing attributes survive only if the URL policy accepts them
  (the reference filterUrls): javascript: must not get through even on a
  permissive-looking modifier."
  [m]
  (into {}
        (keep (fn [[k v]]
                (let [n (name k)]
                  (cond
                    (contains? link-url-attrs n) (when (url-allowed? (str v) (:link-pattern *options*)) [k v])
                    (contains? image-url-attrs n) (when (url-allowed? (str v) (:image-pattern *options*)) [k v])
                    :else [k v]))))
        m))

(defn- decorate
  "Modifier decoration with the safe-mode gates: :allowed-classes false
  drops the class and id (the reference allowedClasses = None),
  :allowed-styles false drops the style (allowedStyles = None)."
  [modifier]
  (let [d (or (some-> modifier mod/decorate) {})]
    (cond-> d
      (false? (:allowed-classes *options*)) (dissoc :class :id)
      (false? (:allowed-styles *options*)) (dissoc :style))))

(defn- attrs [node]
  (-> (decorate (:modifier node))
      (filter-url-attrs)
      (escape-attrs)))

(defn- element
  "A hiccup element with the modifier attrs of node."
  [tag node children]
  (let [a (attrs node)]
    (into (if (empty? a) [tag] [tag a]) children)))

(declare render-node)

(defn- render-children [node]
  (mapcat render-node (get node :content [])))

(defn- is-relative?
  "Is the URL relative? The reference checks the URL START only
  (PCRE's A flag): no scheme, no leading / ? # - a query string does
  not make an URL absolute."
  [url]
  (nil? (re-find #"(?i)\A(?:[a-z][a-z0-9+.-]{0,20}:|[#/?])" url)))

(defn- prepend-root [url root]
  (if (and root (is-relative? url))
    (str (str/replace root #"[/\\]+$" "") "/" url)
    url))

(defn- normalize-www [url]
  (if (and (>= (count url) 4) (= "www." (norm/lower-case (subs url 0 4))))
    (str "http://" url)
    url))

(defn- shorten-url
  "Shortens a URL for display (the reference Helpers::shortenUrl): the
  scheme and host stay, a path longer than 16 chars keeps an ellipsis
  and its last 12 chars, and a long query (or, without one, a long
  fragment) collapses to ?... / #... ."
  [^String url]
  (let [raw (if (= "www." (norm/lower-case (subs url 0 (min 4 (count url)))))
              (str "none://" url)
              url)
        m (re-matches
            #"^(?:(?<scheme>[a-z]+):)?(?://(?<host>[^/?#]+))?(?:(?<path>(?:/|^(?!//))[^?#]*))?(?:\?(?<query>[^#]*))?(?:\#(?<fragment>.*))?$"
            raw)]
    (if-not m
      url
      (let [[_ scheme host path query fragment] m
            scheme (case scheme "none" nil scheme)
            path' (when (and path (> (count path) 16))
                    (str "/\u2026" (subs path (- (count path) 12))))
            tail (cond
                   (and query (not (str/blank? query)))
                   (if (> (count query) 4) "?\u2026" (str "?" query))

                   (and fragment (not (str/blank? fragment)))
                   (if (> (count fragment) 4) "#\u2026" (str "#" fragment)))]
        (str (when scheme (str scheme "://"))
             host
             (or path' path)
             (or tail ""))))))


(defmulti render-node
  "Renders an AST node: returns a vector of hiccup forms."
  :type)

(defmethod render-node :document [node]
  (render-children node))

(defmethod render-node :text [node]
  ;; display text: escaped explicitly (hiccup 1.0 inserts strings raw)
  [(escape-html (:text node))])

(defmethod render-node :raw-text [node]
  [(escape-html (:text node))])

(defmethod render-node :line-break [_] [[:br]])

(defn- analyze-content
  "The has-text/has-replaced/has-markup/has-other analysis of paragraph
  content (the reference analyzeContent): links wrapping images count
  as replaced content, passthrough tags count as markup (replaced when
  they are replaced inline elements), everything else counts as other."
  [children]
  (reduce
    (fn [acc node]
      (case (:type node)
        :text (if (str/blank? (:text node)) acc (assoc acc :has-text true))
        :image (assoc acc :has-replaced true)
        :html-comment (assoc acc :has-markup true)
        :html-tag (let [inline-type (get html/inline-elements (norm/lower-case (:name node)))]
                    (cond-> acc
                      (= 1 inline-type) (assoc :has-replaced true)
                      (not= 1 inline-type) (assoc :has-markup true)))
        :html-element (let [inline-type (get html/inline-elements (norm/lower-case (:name node)))]
                        (cond-> acc
                          (= 1 inline-type) (assoc :has-replaced true)
                          (not= 1 inline-type) (assoc :has-markup true)))
        :link (let [inner (analyze-content (get node :content []))]
                (cond-> acc
                  (or (:has-text inner) (:has-other inner)) (assoc :has-other true)
                  (:has-replaced inner) (assoc :has-replaced true)))
        (assoc acc :has-other true)))
    {:has-text false :has-replaced false :has-markup false :has-other false}
    children))

(defn- contains-block-passthrough
  "A top-level block passthrough tag/element (a transparent inline
  wrapper counts when it holds one) - the reference
  containsBlockPassthrough."
  [children]
  (some (fn [node]
          (case (:type node)
            :html-tag (and (not (:closing node))
                           (not (html/inline? (norm/lower-case (:name node)))))
            :html-element (or (not (html/inline? (norm/lower-case (:name node))))
                              (contains-block-passthrough (get node :content [])))
            false))
        children))

(defmethod render-node :paragraph [node]
  (let [children (get node :content [])
        info (analyze-content children)]
    (cond
      ;; block HTML content: no <p> wrapper, children splice directly
      (and (:block-html node) (contains-block-passthrough children))
      (render-children node)

      ;; whole content renders to nothing (blank text only, no modifier)
      (and (nil? (:modifier node))
           (every? #(and (= :text (:type %)) (str/blank? (:text %))) children))
      []

      ;; only markup (HTML tags/comments) without text: no <p> wrapper
      (and (not (:has-text info)) (not (:has-other info))
           (:has-markup info) (nil? (:modifier node)))
      (render-children node)

      ;; only replaced content (images) - no text, no other: a <div>
      ;; (the reference nontextParagraph), images must not sit in <p>
      (and (:has-replaced info) (not (:has-text info)) (not (:has-other info)))
      [(element :div node (render-children node))]

      :else [(element :p node (render-children node))])))

(defmethod render-node :heading [node]
  ;; the generated id (heading pass) is not subject to the modifier
  (let [a (cond-> (attrs node)
            (and (:id node) (nil? (get-in node [:modifier :id]))) (assoc :id (:id node)))]
    [(into [(keyword (str "h" (:level node))) a] (render-children node))]))

(defmethod render-node :blockquote [node]
  [(element :blockquote node (mapcat render-node (get node :content [])))])

(defmethod render-node :horizontal-rule [node]
  [(element :hr node nil)])

(defn- render-passthrough
  "Renders content with only the HTML tag/comment/entity syntaxes
  (the reference renderHtmlPassthrough for block/html and block/pre).
  A trailing space is part of the fragment (the reference ->add(' ')),
  and unclosed elements are auto-closed at the fragment end, like the
  reference's WellFormer finalization."
  ([^String content] (render-passthrough content false))
  ([^String content trailing-space?]
   (let [ctx (engine/make-context {:line-syntaxes (html/html-syntaxes)
                                  ;; the same allowed gating as the main
                                  ;; parse context (safe mode disables
                                  ;; comments here too)
                                  :allowed (:allowed *options*)
                                  :options *options*})
         nodes (engine/parse-inline ctx content)
         ;; tags the policy rejects become text (the reference's
         ;; transform-time sanitize, re-checked at render time)
         acceptable? (fn [node]
                       (and (html/tag-allowed? (norm/lower-case (:name node)) *options*)
                            (let [v (html/validate-tag (norm/lower-case (:name node))
                                                        (:attrs node) (:closing node) *options*)]
                              (and (not= false v) (not= :drop v)))))
         nodes (map #(if (and (= :html-tag (:type %)) (not (acceptable? %)))
                      {:type :text :text (html/unescape-html (html/reconstruct-tag %))}
                      %)
                    nodes)
         nodes (if trailing-space? (conj (vec nodes) {:type :text :text " "}) (vec nodes))]
     (vec (mapcat render-node nodes)))))

(defn- format-attrs
  "Attribute map to a string like the reference Element::formatAttrs
  (\" key=\\\"value\\\"\", boolean attributes bare)."
  [attrs]
  (str/join (map (fn [[k v]]
                   (if (true? v) (str " " k) (str " " k "=\"" (escape-attr v) "\"")))
                 attrs)))

(defn- filter-html-attrs
  "URL-bearing and whitelisted attributes of a passthrough tag survive
  only if the URL policy accepts them (string-keyed attrs)."
  [tag attrs]
  (into {}
        (keep (fn [[k v]]
                (cond
                  (contains? #{"href" "cite" "ping" "itemid" "itemtype"} k)
                  (when (url-allowed? (str v) (:link-pattern *options*)) [k v])
                  (contains? #{"src" "srcset"} k)
                  (when (url-allowed? (str v) (:image-pattern *options*)) [k v])
                  :else [k v])))
        (html/filter-attrs tag attrs *options*)))

(defn- html-tag-source
  "The rendered form of an :html-tag node: raw markup for acceptable
  tags (defense in depth: the sanitize pass has normally already handled
  rejected ones), escaped text otherwise."
  [node]
  (let [tag (norm/lower-case (:name node))]
    (if-not (html/tag-acceptable? tag (:attrs node) (:closing node) *options*)
      [(escape-html (html/unescape-html (html/reconstruct-tag node)))]
      (if (:closing node)
        [(huff/raw (str "</" tag ">"))]
        [(huff/raw (str "<" tag
              (format-attrs (filter-html-attrs tag (:attrs node)))
              (when (:self-closing node) " /")
              ">"))]))))

(defmethod render-node :html-tag [node]
  ;; nofollow for passthrough <a href> links
  (let [tag (norm/lower-case (:name node))
        node (if (and (not (:closing node))
                      (= "a" tag)
                      (string? (get (:attrs node) "href"))
                      (:link-no-follow *options*)
                      (str/includes? (get (:attrs node) "href") "//"))
               (assoc-in node [:attrs "rel"]
                         (str/join " " (distinct (concat (when-let [rel (get (:attrs node) "rel")]
                                                           (str/split rel #"\s+"))
                                                         ["nofollow"]))))
               node)]
    (html-tag-source node)))

(defmethod render-node :html-element [node]
  (concat (html-tag-source {:type :html-tag :name (:name node) :attrs (:attrs node)
                            :closing false :self-closing false})
          (render-children node)
          (html-tag-source {:type :html-tag :name (:name node) :attrs {}
                            :closing true :self-closing false})))

(defmethod render-node :html-comment [node]
  ;; raw output, not subject to the text shrinking (the reference Raw)
  (let [content (-> (:text node)
                    (str/replace #"-{2,}" " - ")
                    (str/replace #"^-+|-+$" ""))]
    [(huff/raw (str "<!--" content "-->"))]))

(defmethod render-node :block-comment [_] [])

(defmethod render-node :section [node]
  [(element (if (= "div" (:subtype node)) :div :section) node (render-children node))])

(declare shrink-string shrink-element)

(defn- shrink-outside-tags
  "Shrinks runs of spaces/newlines in the text between tags, like the
  reference WellFormer's raw() tokenizer."
  [^String s]
  (let [m (re-matcher #"<[^<>]*+>" s)
        sb (StringBuilder.)]
    (loop [start 0]
      (if (.find m)
        (do (.append sb (shrink-string (subs s start (.start m))))
            (.append sb (.group m))
            (recur (.end m)))
        (do (.append sb (shrink-string (subs s start)))
            (str sb))))))

(defmethod render-node :code-block [node]
  (let [style (:style node :code)
        mod-decorated (decorate (:modifier node))]
    (cond
      ;; block/texysource: parse as texy, then display the resulting
      ;; HTML escaped as source code, in <pre class="html ...">
      (= :texysource style)
      (let [html' (str/trim ((get *options* :render-texy-fn identity) (:code node)))
            ;; the html class is prepended before the modifier classes
            a (assoc mod-decorated :class
                     (str/trim (str "html " (:class mod-decorated))))]
        [(into [:pre (escape-attrs a)] [[:code (escape-html html')]])])

      ;; block/html - parse HTML tags/comments, escape the rest
      (= :html style)
      (render-passthrough (:code node) true)

      ;; block/text - plain text with <br> for newlines (no wrapper)
      (= :text style)
      [(huff/raw (shrink-outside-tags
                   (str (str/replace (escape-html (:code node)) "\n" "<br>") " ")))]

      :else
      (let [inner (if (= :pre style)
                    (render-passthrough (:code node))
                    (let [escaped (escape-html (:code node))]
                      (if (= :code style)
                        [[:code escaped]]
                        [escaped])))
            ;; the language class is prepended before the modifier classes
            a (if (:language node)
                (assoc mod-decorated :class
                       (str/trim (str (:language node) " " (:class mod-decorated))))
                mod-decorated)]
        [(into [:pre (escape-attrs a)] (into [] inner))]))))

(def ^:private list-type->style
  "Ordered-list flavors render as <ol> with a list-style-type style, like
  the reference (ol for decimal, styled ol for roman/alpha)."
  {:ol nil :upper-roman "upper-roman" :lower-roman "lower-roman"
   :upper-alpha "upper-alpha" :lower-alpha "lower-alpha"})

(defn- unwrap
  "The reference splices the opening of a plain leading paragraph into the
  list item (and unwraps a single plain paragraph in a description).
  Returns the rendered children as a flat seq."
  [node]
  (let [children (get node :content [])
        first-child (first children)]
    (if (and (not (:term node))
             (= :paragraph (:type first-child))
             (nil? (:modifier first-child)))
      (concat (mapcat render-node (get first-child :content []))
              (mapcat render-node (rest children)))
      (mapcat render-node children))))

(defmethod render-node :list [node]
  (let [style (get list-type->style (:list-type node))
        tag (if (= :ul (:list-type node)) :ul :ol)
        a (cond-> (attrs node)
            (and (:start node) (> (:start node) 1)) (assoc :start (str (:start node)))
            style (assoc :style (str (when-let [s (:style (attrs node))] (str s ";"))
                                    "list-style-type:" style)))]
    [(into (if (empty? a) [tag] [tag a])
           (map (fn [item] (into [:li (or (attrs item) {})] (unwrap item)))
                (get node :items [])))]))

(defmethod render-node :definition-list [node]
  [(element :dl node
            (mapcat (fn [item]
                      [(element (if (:term item) :dt :dd) item (unwrap item))])
                    (get node :items [])))])

(defmethod render-node :table [node]
  ;; thead/tbody parts: the switch from thead to tbody is one-way; header
  ;; rows after a tbody stay in it (their cells render as th). A table
  ;; with only head rows becomes a tbody (tbody is required, thead optional).
  (let [row-el (fn [row]
                 (into [:tr (attrs row)]
                       (map (fn [cell]
                              (let [a (cond-> (attrs cell)
                                        (> (or (:colspan cell) 1) 1) (assoc :colspan (str (:colspan cell)))
                                        (> (or (:rowspan cell) 1) 1) (assoc :rowspan (str (:rowspan cell))))]
                                (into [(if (:header cell) :th :td) (escape-attrs a)]
                                      (mapcat render-node (get cell :content [])))))
                            (get row :cells []))))
        parts (reduce (fn [parts row]
                        (cond
                          (empty? parts) [{:header (:header row) :rows [row]}]
                          (and (:header (peek parts)) (not (:header row)))
                          (conj parts {:header false :rows [row]})
                          :else (update parts (dec (count parts)) update :rows conj row)))
                      []
                      (get node :rows []))
        parts (if (and (= 1 (count parts)) (:header (first parts)))
               [(update (first parts) :header not)]
               parts)]
    [(element :table node
              (concat
                (when-some [caption (:caption node)]
                  [(into [:caption] (mapcat render-node caption))])
                (map (fn [part]
                       (into [(if (:header part) :thead :tbody)]
                             (map row-el (:rows part))))
                     parts)))]))
(defmethod render-node :phrase [node]
  ;; :phrase-tags replaces the whole tag mapping (the reference
  ;; Config::phraseTags)
  (let [tag (get (or (:phrase-tags *options*) phrase-tags) (:syntax node) :span)]
    (cond
      ;; code phrases hold literal text, no recursive rendering
      (= "phrase/code" (:syntax node))
      [(element tag node (map (comp escape-html :text) (get node :content [])))]

      ;; strong+em: the reference nests em inside strong
      (= "phrase/strong+em" (:syntax node))
      [(element :strong node
                [(element :em {:modifier nil} (render-children node))])]

      :else
      [(element tag node (render-children node))])))

(defmethod render-node :link [node]
  (let [raw-url (normalize-www (:url node))
        href (prepend-root raw-url
                           (if (:image-link node) (:image-root *options*) (:link-root *options*)))]
    (if-not (url-allowed? raw-url (:link-pattern *options*))
      ;; URL fails the scheme filter: just the content, no link
      (render-children node)
      ;; the nofollow class moves onto rel="nofollow" (the reference
      ;; renderLink); the class list loses it
      (let [decorated (decorate (:modifier node))
            classes (-> decorated (:class "") (str/split #"\s+"))
            nofollow? (some #(= "nofollow" %) classes)
            class' (str/trim (str/join " " (remove #(= "nofollow" %) classes)))
            base (cond-> decorated
                   (seq class') (assoc :class class')
                   (not (seq class')) (dissoc :class))
            a (cond-> (escape-attrs (filter-url-attrs base))
                true (assoc :href (escape-attr href))
                (or nofollow?
                    (and (:link-no-follow *options*) (str/includes? href "//")))
                (assoc :rel "nofollow"))]
        [(into [:a a] (render-children node))]))))

(defmethod render-node :figure [node]
  (let [image (:image node)
        ;; the image's alignment is applied to the figure wrapper instead
        inner (if (= :link (:type image)) (first (:content image)) image)
        h-align (get-in inner [:modifier :h-align])
        clear (fn [img] (update img :modifier #(some-> % (dissoc :h-align))))
        image (if (= :link (:type image)) (update image :content #(mapv clear %)) (clear image))
        a (escape-attrs
            (cond-> (decorate (:modifier node))
              ;; the figure class is appended after the modifier classes
              ;; (:figure-class, the reference Config::figureClass)
              true (assoc :class (str/trim (str (some-> (decorate (:modifier node)) :class)
                                                   " " (or (:figure-class *options*) "figure"))))
              ;; no alignClasses configured: alignment becomes a float style
              h-align (assoc :style (str (when-let [s (:style (decorate (:modifier node)))] (str s ";"))
                                         "float:" (name h-align)))))]
    [(into [:div a]
           (concat (render-node image)
                   (when-some [caption (:caption node)]
                     [(into [:p] (mapcat render-node caption))])))]))

(defmethod render-node :image [node]
  ;; the modifier's title becomes the alt text and its alignment a float
  ;; style - both cleared from the modifier, as in the reference; custom
  ;; {alt:...} / {title:...} attributes override
  (let [title (get-in node [:modifier :title])
        h-align (get-in node [:modifier :h-align])
        mod* (some-> (:modifier node) (dissoc :title :h-align))
        decorated (decorate mod*)
        ;; alt is a raw string so that alt="" survives huff's omission of
        ;; empty attribute values (the reference always emits alt)
        a (escape-attrs
            (merge (filter-url-attrs decorated)
                   (if (url-allowed? (:url node) (:image-pattern *options*))
                     {:src (prepend-root (:url node) (:image-root *options*))}
                     {})
                   {:alt (huff/raw (escape-attr (get decorated :alt (or title ""))))}
                   (when (:width node) {:width (:width node)})
                   (when (:height node) {:height (:height node)})))
        a (cond-> a
            h-align (update :style (fn [s] (str (when s (str s ";")) "float:" (name h-align)))))]
    [[:img a]]))

(defmethod render-node :url [node]
  (let [href (normalize-www (:url node))]
    [[:a (cond-> (escape-attrs {:href href})
           (and (:link-no-follow *options*) (str/includes? href "//"))
           (assoc :rel "nofollow"))
       ;; the display text is the (optionally shortened) URL, raw like
       ;; the reference's Raw node
       (huff/raw (if (:shorten-urls *options* true) (shorten-url (:url node)) (:url node)))]]))

(defmethod render-node :directive [node]
  ;; an unhandled directive stays in the document and renders as the
  ;; author wrote it (the reference renderDirective)
  [(escape-html (str "{{" (:text node) "}}"))])

(defmethod render-node :link-definition [_] [])
(defmethod render-node :image-definition [_] [])

(defmethod render-node :emoticon [node]
  ;; the resolved emoji (filled at parse time, like the reference's
  ;; resolveEmoticons pass); no emoticonClass is configured by default
  [(escape-html (or (:resolved node) (:emoticon node)))])

(defmethod render-node :email [node]
  ;; e-mail obfuscation is on by default (the reference obfuscateEmail):
  ;; @ becomes &#64;<!-- --> in the text, &#64; in the href
  [[:a (escape-attrs {:href (str "mailto:" (:email node))})
    (huff/raw (str/replace (:email node) "@" "&#64;<!-- -->"))]])

(defmethod render-node :default [node]
  (concat (mapcat render-node (get node :content []))
          (mapcat render-node (get node :items []))))


;;----------------------------------------------------------------
;; Entry points

(defn- shrink-string
  "Runs of spaces and newlines shrink to a single space, like the
  reference WellFormer's buffered text (pre/textarea preserve spaces)."
  [^String s]
  (str/replace s #"[ \n]+" " "))

(defn- drop-prohibited
  "Drops <a>/<button> start tags nested inside an open <a>/<button>, and
  <form> inside <form> (the reference WellFormer's prohibited
  ancestors - the tag disappears, the content stays). Runs over the
  rendered tree because nesting created at render time (an autolink
  inside a link's content, say) is invisible to the AST-level
  well-forming pass."
  ([forms] (drop-prohibited #{} forms))
  ([seen forms]
   (mapcat (fn [form]
             (if (and (vector? form) (keyword? (first form)))
               (let [[tag & tail] form
                     attrs? (map? (first tail))
                     children (if attrs? (rest tail) tail)
                     prohibited? (or (and (contains? #{:a :button} tag)
                                          (some #{:a :button} seen))
                                     (and (= :form tag) (contains? seen :form)))]
                 (if prohibited?
                   (drop-prohibited seen children)
                   (let [seen' (if (contains? #{:a :button :form} tag)
                                (conj seen tag)
                                seen)]
                     [(into (if attrs? [tag (first tail)] [tag])
                            (drop-prohibited seen' children))])))
               [form]))
           forms)))

(defn render
  "Renders a parsed document to a vector of hiccup forms."
  ([doc] (render doc {}))
  ([doc options]
   (binding [*options* options]
     (vec (render-node doc)))))

(defn- serialize
  "The fragment pipeline: render the node's children (for a document,
  one group per child; anything else is one group), drop prohibited
  nesting (an <a> produced inside a link's content loses its tag),
  format through the well-former fragment path (the children separated
  by text newlines, trimmed at both ends) - no jsoup well-forming, so
  unclosed author tags stay as written."
  [node options]
  (binding [*options* options
            huff/*escape?* false]
    (let [children (if (= :document (:type node)) (:content node) [node])
          groups (map #(drop-prohibited (render-node %)) children)]
      (wellformer/serialize-fragment groups options))))

(defn to-html-fragment
  "Serializes a node WITHOUT the jsoup well-forming pass - the
  parse-only fragment path (the /--texysource display, the reference's
  finalizeFragment), where unclosed tags must stay as the author wrote
  them. The WellFormer formatting still applies (the reference
  finalizeFragment runs the same formatter)."
  ([node] (to-html-fragment node {}))
  ([node options] (serialize node options)))

(defn to-html
  "Renders a parsed document and serializes through the well-forming
  and formatting stage: jsoup's HTML5 tree construction repairs the
  tag stream (the reference WellFormer's pairing half, texy.dom),
  then the formatter indents block elements with tabs and wraps
  lines (the reference WellFormer's formatting half, texy.wellformer).
  Options :indent (default true), :line-wrap (default 80, 0 disables),
  :base-indent (default 0); {:indent false :line-wrap 0} selects flat
  output. huff's own escaping is disabled: this port escapes display
  text and attributes itself, with the reference's exact semantics
  (text keeps apostrophes literal)."
  ([doc] (to-html doc {}))
  ([doc options]
   (binding [*options* options
             huff/*escape?* false]
     (let [forms (drop-prohibited (render-node doc))]
       (wellformer/serialize (dom/wellform forms escape-html escape-attr)
                             options)))))

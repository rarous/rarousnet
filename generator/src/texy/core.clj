(ns texy.core
  "Texy! for Clojure - text to hiccup/HTML (port of Texy\\Texy).

  <code>
  (def texy (texy.core/->Texy))
  (texy.core/process texy \"Hello **world**!\")       ; -> HTML string
  (texy.core/parse texy \"...\")                       ; -> document (AST as data)
  (texy.core/render doc)                               ; -> hiccup vectors
  </code>"
  (:require [clojure.string :as str]
            [texy.engine :as engine]
            [texy.html :as html]
            [texy.modules :as modules]
            [texy.normalize :as normalize]
            [texy.passes :as passes]
            [texy.patterns :as p]
            [texy.typography :as typography]
            [texy.render :as render]
            [texy.text :as text]))

(defrecord Texy [options])

(defn ->texy
  "A converter: a map of options.

  :merge-lines       join consecutive paragraph lines (default true)
  :top               top heading level, 1..6 (default 1)
  :more-means-higher surrounded headings: more # means higher (default true)
  :fixed-leveling    disable dynamic heading balancing (default false)
  :image-root        root path for image URLs (default \"images/\")
  :link-root         root path for link URLs (default none)
  :link-no-follow    add rel=\"nofollow\" to external links (default false)
  :link-pattern      allowed URL scheme regex for links (default allow all)
  :image-pattern     allowed URL scheme regex for images (default allow all)
  :shorten-urls      shorten autolink display text (default true)
  :typography        typographic corrections (default true, the reference default)
  :typography-locale locale for quote substitution (default \"cs\", like the
                     reference module; unknown falls back to English)
  :generate-ids      generate heading ids for a {toc:} (default false)
  :id-prefix         heading id prefix (default \"toc-\")
  :emoticons         resolve emoticons to their emoji (default false)

  Extension syntaxes and passes are registered with add-line-syntax,
  add-block-syntax and add-pass (they ride in the options map, so custom
  contexts must pass them through)."
  ([] (->texy {}))
  ([options] (->Texy options)))

(defn add-line-syntax
  "Registers a custom line (inline) syntax, like the reference's
  addLineSyntax: `name` identifies it (collisions at the same offset
  prefer the longer match, then earlier registration - custom syntaxes run
  after the built-ins), `pattern` is a Java-regex string, and `handler`
  is (fn [ctx groups]) returning a node map, a vector of nodes, or nil to
  refuse the match (the text is then offered to other syntaxes, or stays
  plain text). Returns the updated converter."
  [^Texy texy name pattern handler]
  (update-in texy [:options :custom-line-syntaxes]
             (fnil conj [])
             {:name name :pattern (re-pattern pattern) :handler handler}))

(defn add-block-syntax
  "Registers a custom block syntax, like the reference's addBlockSyntax.
  The pattern is compiled with the multiline flag (so ^ anchors at line
  starts, like the built-in block patterns) and must match the whole line;
  the handler may consume continuation lines through the block parser
  (engine/block-next, engine/block-move-backward). Returns the updated
  converter."
  [^Texy texy name pattern handler]
  (update-in texy [:options :custom-block-syntaxes]
             (fnil conj [])
             {:name name :pattern (modules/compile-m pattern) :handler handler}))

(defn add-pass
  "Registers a custom transform pass, like the reference's addPass: a
  function document -> document, applied to the AST after the built-in
  passes (heading balancing, link reference resolution), before rendering.
  passes/transform-nodes is the natural helper for writing one. Returns
  the updated converter."
  [^Texy texy pass]
  (update-in texy [:options :passes] (fnil conj []) pass))

(defn add-directive
  "Registers a handler for the {{name ...}} directive (\"script\") syntax,
  like the reference's directiveModule->addDirective: `name` is matched
  case-insensitively. The handler is (fn [value args node]) - the raw
  argument string (nil for a bare {{name}}), its parts split on commas,
  and the :directive node - and returns a replacement node or nil to
  remove the directive. Returns the updated converter."
  [^Texy texy name handler]
  (update-in texy [:options :directives] (fnil assoc {})
             (normalize/lower-case name) handler))

(defn set-fallback-directive
  "Registers a handler for directives with no named handler (add-directive),
  like the reference's directiveModule->setFallback: it receives the same
  (value args node) arguments; the directive's name is read from the node
  (modules/parse-directive-content). Passing nil unregisters it. Returns
  the updated converter."
  [^Texy texy handler]
  (assoc-in texy [:options :directive-fallback] handler))

(defn- process-directives
  "The directive pass, the port of DirectiveModule::processDirectives. Runs
  first, before heading balancing. {{texy: ...}} is consumed into the
  document :meta; a registered handler's result replaces the directive
  (nil removes it); a directive with no handler stays in the document and
  renders as the author wrote it. A handler returning a directive node
  gets it handled too (no deep re-scan of other returned nodes, unlike
  the reference's traverser)."
  [^Texy texy doc]
  (let [meta (atom {})
        directives (get-in texy [:options :directives])
        fallback (get-in texy [:options :directive-fallback])
        doc (passes/transform-nodes
              (fn [node]
                (loop [node node]
                  (if (not= :directive (:type node))
                    node
                    (let [{:keys [name value args]}
                          (modules/parse-directive-content (:text node))]
                      (cond
                        (and (= "texy" name) (seq args))
                        (do (doseq [arg args] (swap! meta assoc arg true))
                            nil)                     ; consumed into :meta
                        :else
                        (if-some [handler (or (get directives (normalize/lower-case name))
                                             fallback)]
                          (let [node' (handler value args node)]
                            (if (= :directive (:type node')) (recur node') node'))
                          node))))))
              doc)]
    (if (seq @meta) (assoc doc :meta @meta) doc)))

(defn- convert-email-url
  "Converts e-mail link URLs to the mailto: scheme (the reference
  convertEmailUrl): requires a full e-mail address, optionally with a
  ?query, so wiki-style targets containing @ are left alone."
  [{:keys [image-link] :as node}]
  (let [url (:url node)]
    (if (and (string? url)
             (not image-link)
             (not (str/includes? url "/"))
             (not (re-matches #"(?i)[a-z][a-z0-9+.-]*:.+" url))
             (re-matches (re-pattern (str p/email "(\\?\\S*)?")) url))
      (assoc node :url (str "mailto:" url))
      node)))

(defn- resolve-references
  "The link-reference and image-reference passes: [ref]: url and [*ref*]:
  url definitions are collected and every image, link and [*img*]-link
  reference resolved against them (the #fragment / ?query suffix of a
  reference is carried over to the resolved URL). An unresolved reference
  name becomes the URL itself; e-mail URLs gain the mailto: scheme.
  Definition nodes stay in the tree but render to nothing."
  [doc]
  (let [find (fn [type] (filter #(= type (:type %)) (engine/node-seq doc)))
        link-defs (into {} (map (fn [n] [(normalize/lower-case (:reference n)) (:url n)]))
                       (find :link-definition))
        img-defs (into {} (map (fn [n] [(normalize/lower-case (:reference n)) n]))
                       (find :image-definition))
        resolve-def (fn [identifier]
                      (let [key (normalize/lower-case identifier)
                            hash (str/index-of key "#")
                            query (str/index-of key "?")
                            pos (cond (and hash query) (min hash query)
                                      hash hash
                                      query query)]
                        (or (get link-defs key)
                            (when (and pos (get link-defs (subs key 0 pos)))
                              (str (get link-defs (subs key 0 pos))
                                   (subs identifier pos))))))
        resolve-image (fn [node]
                        (let [key (normalize/lower-case (str/trim (:url node)))]
                          (if-some [def (get img-defs key)]
                            (let [def-mod (:modifier def)]
                              (-> (assoc node :ref (str/trim (:url node))
                                          :url (:url def))
                                  (update :width #(or % (:width def)))
                                  (update :height #(or % (:height def)))
                                  (update :modifier (fn [m]
                                                      (cond
                                                        (nil? m) def-mod
                                                        (and def-mod (nil? (:title m)))
                                                        (assoc m :title (:title def-mod))
                                                        :else m)))))
                            node)))]
    (passes/transform-nodes
      (fn [node]
        (case (:type node)
          :image (resolve-image node)
          :link (let [raw0 (:url node)
                      ;; the [*ref*]:: self-link: the link URL equals the
                      ;; reference of the wrapped image, so it resolves
                      ;; against the image definitions too (the reference
                      ;; ImageModule::resolveReferences); the image child
                      ;; is already resolved (bottom-up) and keeps its
                      ;; original reference in :ref
                      self-def (when-let [[img & _] (:content node)]
                                 (when (= :image (:type img))
                                   (let [k (normalize/lower-case (str/trim (str raw0)))
                                         img-k (normalize/lower-case (str/trim (str (or (:ref img) (:url img)))))]
                                     (when (and (= k img-k) (get img-defs k))
                                       (get img-defs k)))))
                      raw (if self-def (:url self-def) raw0)
                      node (assoc node :url raw)
                      len (count raw)
                      image-link (and (> len 4) (= \[ (first raw)) (= \* (second raw))
                                      (= \] (last raw))
                                      (contains? #{\* \< \>} (nth raw (- len 2))))
                      ref (and (> len 2) (= \[ (first raw)) (= \] (last raw)))]
                  (cond
                    ;; [*img*] - resolve against image definitions
                    image-link
                    (let [img-ref (str/trim (subs raw 2 (- len 2)))
                          def (get img-defs (normalize/lower-case img-ref))]
                      (assoc node :url (if def (:url def) img-ref)
                                 :ref img-ref :image-link true))
                    ;; [ref] - resolve against link definitions
                    ref
                    (let [ref-name (subs raw 1 (dec len))]
                      (-> (assoc node :url (or (resolve-def ref-name) ref-name)
                                 :ref ref-name)
                          convert-email-url))
                    :else (convert-email-url node)))
          node))
      doc)))

(defn parse
  "Parses normalized text into a document (the AST, as plain maps with
  :type keys), with the reference's transform passes applied in its pass
  order: directives (custom handlers), HTML pairing + sanitization,
  reference resolution, heading balancing - then the custom passes
  (add-pass) - and typography as the last step (the reference
  applyAstTypography). With :single-line true the text parses as one inline
  line (the reference parse(text, singleLine))."
  ([^Texy texy text] (parse texy text nil))
  ([^Texy texy text {:keys [single-line]}]
   (let [text (normalize/normalize text)
         ctx (modules/make-context (:options texy))
         content (if single-line
                   (engine/parse-inline ctx text)
                   (engine/parse-block ctx text))
         doc {:type :document :content (vec content)}
         doc (process-directives texy doc)
         doc (html/pairing-pass doc)
         doc (html/sanitize-pass doc (:options texy))
         doc (reduce (fn [doc pass] (pass doc))
                     (-> doc
                         resolve-references
                         (passes/balance-headings
                           {:top (get-in texy [:options :top] 1)
                            :dynamic (not (get-in texy [:options :fixed-leveling]))
                            :generate-ids (get-in texy [:options :generate-ids])
                            :id-prefix (get-in texy [:options :id-prefix] "toc-")}))
                     (get-in texy [:options :passes] []))]
     ;; typography runs as parse()'s last step (the reference
     ;; applyAstTypography), default on; :meta :typographed marks the
     ;; document so titles are not transformed twice
     (if (get-in texy [:options :typography] true)
       (-> doc
           (typography/typography-pass {:locale (get-in texy [:options :typography-locale] "cs")})
           (assoc-in [:meta :typographed] true))
       doc))))

(def ^:private void-elements-regex
  "Void element serializations. Fragments (the /--texysource display)
  skip the jsoup well-forming, so an author-written XHTML-style void
  (<br />) would keep its slash; the reference serializes voids
  HTML5-style (<br>) - normalize to match."
  #"(<(?:area|base|br|col|command|embed|hr|img|input|keygen|link|meta|param|source|track|wbr)\b[^>]*?) />")

(declare fragment-renderer)

(defn- render-opts
  "The base render options every serialization path gets: the URL roots
  with their defaults, the nofollow flag and the /--texysource
  fragment renderer."
  [texy]
  (merge (:options texy)
         {:image-root (get-in texy [:options :image-root] "images/")
          :link-root (get-in texy [:options :link-root] nil)
          :link-no-follow (get-in texy [:options :link-no-follow] nil)
          ;; renders /--texysource blocks: a parse-only fragment (no
          ;; transform passes - the reference finalizeFragment),
          ;; children joined with a space
          :render-texy-fn (fragment-renderer texy)}))

(defn- fragment-renderer
  "Renders a texy fragment for /--texysource: parse phase only (no
  heading balancing or other passes, exactly like the reference's
  finalizeFragment), children rendered and joined."
  [^Texy texy]
  (fn [s]
    (let [text (normalize/normalize s)
          ctx (modules/make-context (:options texy))
          content (engine/parse-block ctx text)
          opts (render-opts texy)]
      ;; the fragment path skips the jsoup well-forming (the reference
      ;; finalizeFragment renders fragments unrepaired)
      (str/trim (str/replace (str/join " " (map #(render/to-html-fragment % opts) content))
                             void-elements-regex "$1>")))))
(defn render-hiccup
  "Renders a parsed document to a vector of hiccup forms."
  ([doc] (render-hiccup doc {}))
  ([doc options] (render/render doc options)))

(defn render-html
  "Renders a parsed document to an HTML string (huff2 serialization)."
  ([doc] (render-html doc {}))
  ([doc options] (render/to-html doc options)))

(defn render-text
  "Renders a parsed document to a plain-text string."
  [doc]
  (text/to-text doc))

(defn to-text
  "Converts text to a plain-text rendition (parse + render-text)."
  [^Texy texy text]
  (render-text (parse texy text)))

(defn apply-typography
  "Makes only typographic corrections to raw text (the reference
  applyTypography): normalize, then process-typo with spaces preserved.
  No parsing, no markup handling."
  ([^Texy texy text] (apply-typography texy text {}))
  ([^Texy texy text {:keys [locale]}]
   (let [text (normalize/normalize text)]
     (if (get-in texy [:options :typography] true)
       (typography/process-typo text
                                {:locale (or locale (get-in texy [:options :typography-locale] "cs"))
                                 :preserve-spaces true})
       text))))

(defn process
  "Converts text to an HTML string. The :image-root / :link-root options
  may be given on the converter or per call; with :single-line true the
  text parses as one inline line (the reference process(text,
  singleLine))."
  ([^Texy texy text] (process texy text {}))
  ([^Texy texy text render-options]
   (render-html (parse texy text (when (:single-line render-options)
                                   {:single-line true}))
               (merge (render-opts texy) render-options))))


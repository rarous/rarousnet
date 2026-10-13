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
            [texy.hyphenation :as hyphenation]
            [texy.modifier :as mod]
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
  :hyphenation       soft-hyphen breaking of long words (default true, the
                     reference default)
  :word-limit        minimum word length to hyphenate (default 20, like the
                     reference module's wordLimit)
  :indent            indent block elements with tabs in the HTML output
                     (default true, the reference default)
  :line-wrap        line wrap width of the HTML output, 0 disables
                     (default 80, the reference default)
  :base-indent      starting indent level of the HTML output (default 0)
  :allowed           syntax gating by name, the reference allowed[]
                     (ins/del/sup/sub phrases are opt-in by default;
                     \"link/reference\" - the bare [ref] syntax - is
                     opt-in too); see also safe-mode and add-definition
  :legacy-references the Texy 3 reference semantics, off by default
                     (the 4-dev reference deprecates them): definition
                     labels/modifiers apply, %s reference URLs, image
                     definition modifiers on [*img*] targets - implies
                     the bare [ref] syntax (link/reference), always
                     allowed in Texy 3
                     (see texy.references-test)
  :well-forming     the HTML pairing half of the renderer: :jsoup (default,
                     HTML5 tree construction - spec-conformant, inserts an implicit
                     <tbody> in passthrough tables, serializes bare boolean
                     attributes as name=\"\"), or :direct (the call-driven WellFormer
                     of the node.js sibling - no round-trip, reference behavior
                     for tbody and bare booleans); may also be given per call
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

(defn- form-urlencode
  "application/x-www-form-urlencoded encoding - the platform's native
  form-encoder (spaces become '+'). One deliberate deviation from the
  PHP urlencode() that Texy 3 used for %s reference URLs: '*' stays
  literal (URLEncoder leaves it) - it is a valid URL sub-delim (RFC
  3986) and %2A decodes to the same value for every spec-compliant
  consumer. Used by the %s reference-URL substitution."
  ^String [^String s]
  (java.net.URLEncoder/encode s "UTF-8"))

(defn- resolve-references
  "The link-reference and image-reference passes: [ref]: url and [*ref*]:
  url definitions are collected and every image, link and [*img*]-link
  reference resolved against them (the #fragment / ?query suffix of a
  reference is carried over to the resolved URL). An unresolved reference
  name becomes the URL itself; e-mail URLs gain the mailto: scheme.
  Definition nodes stay in the tree but render to nothing.

  With :legacy-references true the Texy 3 semantics apply: a %s in a
  reference URL takes the use-site text (form-url-encoded), the
  definition's modifier merges under the use-site one, and a bare [ref]
  use (the opt-in link/reference syntax) shows the definition's label
  inline-parsed (circular labels render raw - the livelock) or the
  textual URL as content."
  [doc {:keys [link-definitions image-definitions legacy-references options]}]
  (let [find (fn [type] (filter #(= type (:type %)) (engine/node-seq doc)))
        ;; user definitions (add-definition) come first; document
        ;; definitions overwrite them, like the reference
        user-link-defs (or link-definitions {})
        user-img-defs (or image-definitions {})
        link-defs (into user-link-defs
                       (into {} (map (fn [n] [(normalize/lower-case (:reference n)) n]))
                             (find :link-definition)))
        img-defs (into user-img-defs
                       (into {} (map (fn [n] [(normalize/lower-case (:reference n)) n]))
                             (find :image-definition)))
        resolve-def (fn [identifier]
                      (let [key (normalize/lower-case identifier)
                            hash (str/index-of key "#")
                            query (str/index-of key "?")
                            pos (cond (and hash query) (min hash query)
                                      hash hash
                                      query query)]
                        (or (get link-defs key)
                            (when-let [base (and pos (get link-defs (subs key 0 pos)))]
                              (assoc base :url (str (:url base) (subs identifier pos)))))))
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
                            node)))
        legacy? legacy-references
        ;; the label content parses with the same context (custom
        ;; syntaxes included); the livelock breaks circular labels
        ctx (when legacy? (modules/make-context options))
        livelock (atom #{})
        ;; the use-site text for the %s substitution
        label-text (fn [node]
                     (engine/extract-text {:type :document :content (:content node)}))
        resolve-link (fn resolve-link [node]
                       (let [apply-legacy (fn [node def bare?]
                                            (let [node (cond-> node
                                                        (and (not bare?)
                                                             (str/includes? (str (:url node)) "%s"))
                                                        (update :url #(str/replace (str %) "%s"
                                                                                   (form-urlencode (label-text node))))

                                                        (:modifier def)
                                                        (update :modifier (fn [m]
                                                                            (mod/merge-modifiers (:modifier def) m))))]
                                              (if-not bare?
                                                node
                                                (if-some [label (:label def)]
                                                  (let [key (normalize/lower-case (:reference def))]
                                                    (if (contains? @livelock key)
                                                      ;; circular - the raw label text
                                                      (assoc node :content [{:type :text :text label}])
                                                      (do (swap! livelock conj key)
                                                          (let [content (engine/parse-inline ctx label)
                                                                ;; references inside the label
                                                                ;; resolve too, recursively
                                                                content (:content (passes/transform-nodes
                                                                                    (fn [n] (if (= :link (:type n))
                                                                                              (resolve-link n)
                                                                                              n))
                                                                                    {:type :document :content (vec content)}))]
                                                            (swap! livelock disj key)
                                                            (assoc node :content content)))))
                                                  ;; no label: the textual URL display
                                                  ;; (the Texy 3 textualUrl) - an autolink
                                                  ;; node; the well-forming suppresses
                                                  ;; its nested <a>, leaving the display
                                                  (assoc node :content [{:type :url :url (str (:url node))}])))))]
                         (let [raw0 (:url node)
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
                                   def (get img-defs (normalize/lower-case img-ref))
                                   url (if def (:url def) img-ref)]
                               (cond-> (assoc node :url url :ref img-ref :image-link true)
                                 ;; the image definition's modifier applies to the
                                 ;; <a> too (the Texy 3 factoryLink); %s as above
                                 (and legacy? def (:modifier def))
                                 (update :modifier #(mod/merge-modifiers (:modifier def) %))

                                 (and legacy? def (str/includes? (str url) "%s"))
                                 (assoc :url (str/replace url "%s" (form-urlencode (label-text node))))))

                             ;; [ref] - resolve against link definitions
                             ref
                             (let [ref-name (subs raw 1 (dec len))
                                   ;; the bare [ref] form carries :ref since
                                   ;; parsing; phrase targets never do
                                   bare? (contains? node :ref)
                                   def (resolve-def ref-name)]
                               (-> (assoc node :url (if def (:url def) ref-name)
                                          :ref ref-name)
                                   (cond-> (and legacy? def) (apply-legacy def bare?))
                                   convert-email-url))

                             :else (convert-email-url node)))))]
    (passes/transform-nodes
      (fn [node]
        (case (:type node)
          :image (resolve-image node)
          :link (resolve-link node)
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
                         (resolve-references {:link-definitions (get-in texy [:options :link-definitions])
                                              :image-definitions (get-in texy [:options :image-definitions])
                                              :legacy-references (get-in texy [:options :legacy-references])
                                              :options (:options texy)})
                         (passes/balance-headings
                           {:top (get-in texy [:options :top] 1)
                            :dynamic (not (get-in texy [:options :fixed-leveling]))
                            :generate-ids (get-in texy [:options :generate-ids])
                            :id-prefix (get-in texy [:options :id-prefix] "toc-")}))
                     (get-in texy [:options :passes] []))]
     ;; the text-run pass runs as parse()'s last step (the reference
     ;; applyAstTypography), typography and hyphenation default on;
     ;; :meta :typographed marks the document so titles are not
     ;; transformed twice
     (let [typo (get-in texy [:options :typography] true)
           hyph (get-in texy [:options :hyphenation] true)
           word-limit (get-in texy [:options :word-limit] 20)
           typo-locale (get-in texy [:options :typography-locale] "cs")
           typo-fn (when typo
                     #(typography/process-typo % {:locale typo-locale}))]
       (if (or typo hyph)
         (-> doc
             (typography/text-run-pass
               {:transformers (cond-> []
                               typo (conj typo-fn)
                               hyph (conj #(hyphenation/post-line % word-limit)))
                :title-transformer typo-fn})
             (assoc-in [:meta :typographed] true))
         doc)))))

(def ^:private void-elements-regex
  "Void element serializations. Fragments (the /--texysource display)
  skip the jsoup well-forming, so an author-written XHTML-style void
  (<br />) would keep its slash; the reference serializes voids
  HTML5-style (<br>) - normalize to match."
  #"(<(?:area|base|br|col|command|embed|hr|img|input|keygen|link|meta|param|source|track|wbr)\b[^>]*?) />")

(def safe-tags
  "The safe-mode tag whitelist (the reference Configurator::SafeTags):
  tag => allowed attribute names."
  {"a" ["href" "title"]
   "abbr" ["title"]
   "b" [] "br" [] "cite" [] "code" [] "em" [] "i" [] "strong" [] "sub" []
   "sup" [] "q" [] "small" []})

(defn safe-mode
  "Configures the converter for untrusted input (the reference
  Configurator::safeMode): the safe tag whitelist (with title/lang/dir
  acceptable on any element), no classes/ids/styles from modifiers, URL
  schemes restricted, images, [ref]: definitions and HTML comments
  disabled, rel=nofollow on external links."
  [^Texy texy]
  (-> texy
      (assoc-in [:options :allowed-tags]
                (merge safe-tags {"*" ["title" "lang" "dir"]}))
      (assoc-in [:options :allowed-classes] false)
      (assoc-in [:options :allowed-styles] false)
      (assoc-in [:options :link-pattern] "https?:|ftp:|mailto:")
      (assoc-in [:options :image-pattern] "https?:")
      (assoc-in [:options :link-no-follow] true)
      (update-in [:options :allowed] merge
                 {"image" false "link-definition" false "html/comment" false})))

(defn add-definition
  "Adds a user-defined link reference (the reference
  LinkReferenceModule::addDefinition): persists across process calls,
  document [ref]: definitions overwrite it. The label and modifier
  arities are the Texy 3 Link::$label / Link::$modifier carriers -
  they apply when :legacy-references is on (a bare [ref] use shows the
  label as content, the modifier applies to every use site); the
  modifier string is written as in the text (with or without the
  leading dot). The 5-arity version adds an image definition."
  ([^Texy texy name url]
   (update-in texy [:options :link-definitions]
              (fnil assoc {}) (normalize/lower-case name)
              {:reference name :url url}))
  ([^Texy texy name url label]
   (add-definition texy name url label nil))
  ([^Texy texy name url label modifier-text]
   (update-in texy [:options :link-definitions]
              (fnil assoc {}) (normalize/lower-case name)
              (cond-> {:reference name :url url}
                label (assoc :label label)
                modifier-text (assoc :modifier (mod/parse (str/replace-first modifier-text #"^\." ""))))))
  ([^Texy texy name url width height modifier]
   (update-in texy [:options :image-definitions]
              (fnil assoc {}) (normalize/lower-case name)
              {:reference name :url url :width width :height height
               :modifier modifier})))

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
  finalizeFragment), all children through ONE formatter - the
  reference feeds the whole fragment to the WellFormer."
  [^Texy texy]
  (fn [s]
    (let [text (normalize/normalize s)
          ctx (modules/make-context (:options texy))
          content (engine/parse-block ctx text)
          opts (render-opts texy)]
      ;; the fragment path skips the jsoup well-forming (the reference
      ;; finalizeFragment renders fragments unrepaired); author-written
      ;; XHTML voids normalize to the HTML5 style
      (str/replace (render/to-html-fragment {:type :document :content (vec content)} opts)
                   void-elements-regex "$1>"))))
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
  applyTypography): normalize, then process-typo with spaces preserved
  and hyphenation. No parsing, no markup handling."
  ([^Texy texy text] (apply-typography texy text {}))
  ([^Texy texy text {:keys [locale]}]
   (let [text (normalize/normalize text)]
     (cond-> text
       (get-in texy [:options :typography] true)
       (typography/process-typo
         {:locale (or locale (get-in texy [:options :typography-locale] "cs"))
          :preserve-spaces true})

       (get-in texy [:options :hyphenation] true)
       (hyphenation/post-line (get-in texy [:options :word-limit] 20))))))

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


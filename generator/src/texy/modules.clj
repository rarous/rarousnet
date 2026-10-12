(ns texy.modules
  "The syntax modules (port of Texy\\Modules\\* - the ported subset):
  paragraph (the block gap handler), headings, horizontal rules,
  blockquotes, lists and definition lists, fenced code, phrases, images
  and autolinks.

  Syntax ids are the reference's Texy\\Syntax constants. Handlers receive
  (context, groups) and return a node (a map), a vector of nodes (spliced)
  or nil to refuse the match."
  (:require [clojure.string :as str]
            [texy.normalize :as norm]
            [texy.engine :as engine]
            [texy.html :as html]
            [texy.modifier :as mod]
            [texy.patterns :as p]))

(def M java.util.regex.Pattern/MULTILINE)
(def CI java.util.regex.Pattern/CASE_INSENSITIVE)
(defn compile-m [^String s] (java.util.regex.Pattern/compile s M))
(defn compile-ci [^String s] (java.util.regex.Pattern/compile s CI))

(defn- strip-shy [s] (str/replace s "\u00AD" ""))


;;----------------------------------------------------------------
;; Paragraph module (the block gap handler)

(declare expand-line-breaks)

(defn- parse-paragraph
  "A single paragraph: trailing modifier (aligns allowed - MODIFIER_H
  cannot span lines, so it sits at the end of some line, followed by \\n
  or end; the first such match wins, like the reference), edge trimming,
  line joining, inline parse, hard-break expansion."
  [^String text]
  (let [mod-re (compile-m (str "[ \t]*(?<=[\t ]|^)\\.((?:\\((?:\\\\\\)|[^)\\n])+\\)|\\[[^\\]\\n]+\\]|"
                               "\\{[^}\\n]+\\}|<>|>|=|<){1,4})(?=\\n|\\z)"))
        m (re-matcher mod-re text)]
    (if (.find m)
      [(mod/parse (.group m 1))
       (str (subs text 0 (.start m)) (subs text (.end m)))]
      [nil text])))

(defn- join-lines
  "Join with ' ' (merged lines) or \"\\r\" (hard break: merge-lines off, or
  a whitespace-indented continuation line, whose indentation is stripped)."
  [lines merge-lines]
  (loop [acc (first lines) lines (rest lines)]
    (if (seq lines)
      (let [line (first lines)]
        (recur (cond
                 (not merge-lines) (str acc "\r" line)
                 (re-matches #"[ \t].+" line) (str acc "\r" (str/replace line #"^[ \t]+" ""))
                 :else (str acc " " line))
               (rest lines)))
      acc)))

(defn- expand-line-breaks
  "Expands \\r hard-break markers in text nodes into :line-break nodes,
  recursing into phrase/link content."
  [nodes]
  (mapcat (fn [node]
            (cond
              (= :text (:type node))
              (let [parts (str/split (:text node) #"\r" -1)]
                (into []
                      (mapcat (fn [[i part]]
                                 (cond-> []
                                   (pos? i) (conj {:type :line-break})
                                   (not= "" part) (conj {:type :text :text part}))))
                      (map-indexed vector parts)))

              (and (contains? #{:phrase :link} (:type node)) (:content node))
              [(assoc node :content (expand-line-breaks (:content node)))]

              :else
              [node]))
          nodes))

(defn- starts-with-block-element?
  "True when the text starts with a known block-level HTML element (not
  an inline one) - the reference startsWithBlockElement."
  [^String text]
  (when-some [[_ tag] (re-find #"(?i)^<([a-z][a-z0-9]*)\b" text)]
    (not (html/inline? (norm/lower-case tag)))))

(defn- contains-block-html-tag?
  "True when the paragraph's top level holds a non-closing block-level
  passthrough tag (the reference containsBlockHtmlTag)."
  [children]
  (some #(and (= :html-tag (:type %))
              (not (:closing %))
              (not (html/inline? (norm/lower-case (:name %)))))
        children))

(defn paragraph-node [ctx ^String text merge-lines]
  (let [[modifier text'] (parse-paragraph text)
        lines (->> (str/split text' #"\n")
                   (drop-while str/blank?)
                   (reverse)
                   (drop-while str/blank?)
                   (reverse)
                   vec)]
    (when (seq lines)
      (cond
        ;; text starting with a known block element: no soft line-break
        ;; processing, no modifier - parse inline as-is (parseBlockHtml)
        (starts-with-block-element? (str/trim text'))
        (let [content (vec (engine/parse-inline ctx (str/trim text')))]
          {:type :paragraph :content content :modifier nil :block-html true})

        :else
        (let [lines (-> lines
                        (update 0 #(str/replace % #"^[ \t]+" ""))
                        (update (dec (count lines)) #(str/replace % #"[ \t]+$" "")))
              joined (join-lines lines merge-lines)
              content (vec (expand-line-breaks (engine/parse-inline ctx joined)))
              visible? (fn [n] (if (= :text (:type n)) (not (str/blank? (:text n))) true))]
          (when (some visible? content)
            (cond-> {:type :paragraph :content content :modifier modifier}
              (contains-block-html-tag? content) (assoc :block-html true))))))))

(defn gap-handler [ctx ^String text]
  (->> (str/split text #"\n{2,}")
       (keep #(paragraph-node ctx % (get-in ctx [:options :merge-lines] true)))
       vec))


;;----------------------------------------------------------------
;; Heading module

(def heading-levels {\# 0 \* 1 \= 2 \- 3})

(defn- heading-underlined [ctx groups]
  (let [[_ content mod-parts line] groups]
    {:type :heading
     :level (get heading-levels (first line))
     :subtype :underlined
     :content (engine/parse-inline ctx (str/trim content))
     :modifier (mod/parse mod-parts)}))

(defn- heading-surrounded [ctx groups]
  (let [[_ line content mod-parts] groups
        level (-> (count line) (max 2) (min 7))
        level (if (get-in ctx [:options :more-means-higher] true) (- 7 level) (- level 2))
        content (str/replace (str/trim content) (compile-m (str "[" line " ]+$")) "")]
    {:type :heading
     :level level
     :subtype :surrounded
     :content (engine/parse-inline ctx content)
     :modifier (mod/parse mod-parts)}))

(defn heading-syntaxes []
  [{:name "heading/underlined"
    :pattern (compile-m (str "^(\\S.{0,1000}?)(?:" p/modifier-h ")?\\n"
                             "((?:\\#{3,}+|\\*{3,}+|={3,}+|-{3,}+))$"))
    :handler heading-underlined}
   {:name "heading/surrounded"
    :pattern (compile-m (str "^((?:\\#{2,}+|={2,}+))(.+?)(?:" p/modifier-h ")?$"))
    :handler heading-surrounded}])


;;----------------------------------------------------------------
;; Horizontal rule module

(defn- horizontal-rule [_ groups]
  (let [[_ line mod-parts] groups]
    {:type :horizontal-rule :marker (first line) :modifier (mod/parse mod-parts)}))

(defn hr-syntax []
  {:name "horizline"
   :pattern (compile-m (str "^((?:\\*{3,}+|-{3,}+))[ \t]*(?:" p/modifier ")?$"))
   :handler horizontal-rule})


;;----------------------------------------------------------------
;; Blockquote module

(defn- blockquote-handler [ctx groups]
  (let [[_ mod-parts prefix content] groups
        spaces (max 1 (count prefix))
        ;; the reference continuation `^>(?: | (...))$` has an EMPTY first
        ;; alternative under PCRE /x, so a bare > line continues the
        ;; quote with empty content
        continuation (compile-m (str "^>(?:|([ \\t]{1," spaces "}|:)(.*?))$"))
        parser (:block-parser ctx)
        lines (loop [acc [content]]
                (if-some [next (engine/block-next parser continuation)]
                  (recur (conj acc (or (nth (second next) 2) "")))
                  acc))
        children (engine/parse-block ctx (str/trim (str/join "\n" lines)))]
    (when (seq children)
      {:type :blockquote :content children :modifier (mod/parse mod-parts)})))

(defn blockquote-syntax []
  {:name "blockquote"
   :pattern (compile-m (str "^(?:(?:" p/modifier-h ")\\n)?>([ \\t]++|:)(\\S.*+)$"))
   :handler blockquote-handler})


;;----------------------------------------------------------------
;; List module

(def list-bullets
  "The bullets table (reference order: it drives both the block pattern
  alternation and marker recognition). :next is the wider continuation
  marker for ordered lists, recognized after the first item."
  [{:key "*" :pattern "\\*[ \t]" :type :ul}
   {:key "-" :pattern "[\\x{2013}-](?![>-])" :type :ul}
   {:key "+" :pattern "\\+[ \t]" :type :ul}
   {:key "1." :pattern "1\\.[ \t]" :next "\\d{1,3}\\.[ \t]" :type :ol}
   {:key "1)" :pattern "\\d{1,3}\\)[ \t]" :type :ol}
   {:key "I." :pattern "I\\.[ \t]" :next "[IVX]{1,4}\\.[ \t]" :type :upper-roman}
   {:key "I)" :pattern "[IVX]+\\)[ \t]" :type :upper-roman}
   {:key "a)" :pattern "[a-z]\\)[ \t]" :type :lower-alpha}
   {:key "A)" :pattern "[A-Z]\\)[ \t]" :type :upper-alpha}])

(defn- ul-patterns []
  (str/join "|" (map :pattern (filter (comp #{:ul} :type) list-bullets))))

(defn- recognize-bullet [^String bullet]
  (->> list-bullets
       (filter #(re-matches (re-pattern (:pattern %)) bullet))
       first))

(defn- list-start
  "The start index of an ordered list when the first item is not the first
  of its series (13) -> 13, b) -> 2)."
  [key ^String bullet]
  (let [num (re-find #"\d+" bullet)]
    (cond
      (and (str/starts-with? key "1") num (> (parse-long num) 1)) (parse-long num)
      (and (= key "a)") (pos? (compare (.charAt bullet 0) \a))) (- (int (.charAt bullet 0)) 96)
      (and (= key "A)") (pos? (compare (.charAt bullet 0) \A))) (- (int (.charAt bullet 0)) 64)
      :else nil)))

(defn- list-item
  "A single list item with continuation lines. `bullet` is the bullet
  pattern (the wider :next pattern for some ordered lists); `indented?`
  switches the definition-description mode (base indentation required)."
  [ctx bullet indented?]
  (let [parser (:block-parser ctx)
        base (if indented? "[ \t]{1,}" "")
        item-pattern (compile-m (str "^\\n?(" base ")(" bullet ")[ \t]*(\\S.*?)?(?:" p/modifier-h ")?$"))
        first-match (engine/block-next parser item-pattern)
        [_ m-indent _ m-content mod-parts] (second first-match)]
    (when m-indent
      (let [indent-str m-indent
            content (loop [content (or m-content "") spaces ""]
                      (if-some [next (engine/block-next
                                       parser
                                       (compile-m (str "^(\\n*?)" (java.util.regex.Pattern/quote indent-str)
                                                       "([ \t]{1," spaces "})(.*?)$")))]
                        (let [[_ m-blank m-spaces m-next-content] (second next)]
                          (recur (str content "\n" m-blank m-next-content)
                                 ;; the indent width is fixed after the first
                                 ;; continuation line (the reference stores the
                                 ;; number as a string too)
                                 (if (str/blank? spaces) (str (count m-spaces)) spaces)))
                        content))]
        {:type :list-item
         :content (engine/parse-block ctx (str/trim content))
         :term false
         :modifier (mod/parse mod-parts)}))))

(defn- list-handler [ctx groups]
  (let [[_ mod-parts m-bullet] groups
        desc (recognize-bullet m-bullet)]
    (when desc
      (let [parser (:block-parser ctx)
            bullet-pattern (or (:next desc) (:pattern desc))
            min-items (if (:next desc) 2 1)
            start (list-start (:key desc) m-bullet)]
        (engine/block-move-backward parser)
        (loop [items []]
          (if-some [item (list-item ctx bullet-pattern false)]
            (recur (conj items item))
            (when (>= (count items) min-items)
              {:type :list
               :items items
               :list-type (:type desc)
               :start start
               :modifier (mod/parse mod-parts)})))))))

(defn- deflist-handler [ctx groups]
  (let [[_ mod-parts _ _ _ m-bullet] groups
        desc (recognize-bullet m-bullet)]
    (when desc
      (let [parser (:block-parser ctx)
            bullet-pattern (or (:next desc) (:pattern desc))
            term-pattern (compile-m (str "^\\n?(\\S.*?):[ \t]*(?:" p/modifier-h ")?$"))]
        (engine/block-move-backward parser 2)
        (loop [items []]
          (if-some [item (list-item ctx bullet-pattern true)]
            (recur (conj items item))
            (if-some [term (engine/block-next parser term-pattern)]
              (let [[_ term-content term-mod-parts] (second term)]
                (recur (conj items {:type :list-item
                                    :content (engine/parse-inline ctx term-content)
                                    :term true
                                    :modifier (mod/parse term-mod-parts)})))
              (when (seq items)
                {:type :definition-list
                 :items items
                 :modifier (mod/parse mod-parts)}))))))))

(defn list-syntaxes []
  [{:name "list"
    :pattern (compile-m (str "^(?:(?:" p/modifier-h ")\\n)?(" (str/join "|" (map :pattern list-bullets))
                         ")[ \t]*+\\S.*$"))
    :handler list-handler}
   {:name "list/definition"
    :pattern (compile-m (str "^(?:(?:" p/modifier-h ")\\n)?(\\S.{0,2000}?):[ \t]*(?:" p/modifier-h ")?\\n"
                         "([ \t]++)(" (ul-patterns) ")[ \t]*+\\S.*$"))
    :handler deflist-handler}])


;;----------------------------------------------------------------
;; Block module: ```language fenced code

(defn- parse-fenced [_ groups]
  (let [[_ _ info content] groups
        info' (or info "")
        [mod-parts info''] (if-let [[_ parts] (re-find (re-pattern (str "(?:" p/modifier ")$")) info')]
                             [parts (str/replace info' #"[ \t]*\.[^\n]*$" "")]
                             [nil info'])
        language (-> info'' str/trim (str/split #"\s+") first)]
    {:type :code-block
     :style :code
     :code (subs content 1)                     ; drop the separator \n
     :language (when-not (str/blank? language) language)
     :modifier (mod/parse mod-parts)}))

(defn fenced-syntax []
  {:name "block/fenced"
   :pattern (compile-m "^(`{3,})[ \t]*+([^\n`]*)((?:\n(?!(?:\\1)`*+[ \t]*+$).*+)*)(?:\n(?:\\1)`*+[ \t]*+$|\\z)")
   :handler parse-fenced})


;;----------------------------------------------------------------
;; Block module: /-- code, html, text, div, texysource blocks
;;
;; The reference pattern matches nested blocks with PCRE recursion
;; ((?0)); Java regex cannot, so the opening line is a block match and
;; the handler scans the content lines itself, tracking the nesting
;; depth - a /-- line opens a nested block, a \-- line closes the
;; innermost one, and an unclosed block runs to the end of input.

(defn- common-prefix-len [^String a ^String b]
  (count (take-while true? (map = a b))))

(defn outdent
  "Strips the whitespace prefix shared by all lines - or the first line's
  indent with :first-line - after dropping blank edge lines (the
  reference Helpers::outdent)."
  ([^String s] (outdent s false))
  ([^String s first-line]
   (let [lines (-> (str/replace s #"^\n+|\n+$" "") (str/split #"\n" -1))
         lines (reverse (drop-while #(= "" %) (reverse (drop-while #(= "" %) lines))))
         first (or (first lines) "")
         prefix (if first-line
                  (subs first 0 (count (take-while #(contains? #{\space \tab} %) first)))
                  (reduce (fn [prefix line]
                            ;; only lines with a non-whitespace character
                            ;; after the indentation participate; the
                            ;; prefix starts as the first line's indent
                            (let [ws (count (take-while #(contains? #{\space \tab} %) line))]
                              (if (= ws (count line))
                                prefix
                                (if (nil? prefix)
                                  (subs line 0 ws)
                                  (subs prefix 0 (min (count prefix)
                                                      (common-prefix-len prefix line)))))))
                          nil
                          lines))]
     (let [prefix (or prefix "")]
       ;; every line loses the prefix only up to the characters it
       ;; actually shares with it (the reference commonPrefixLength
       ;; strip - a first-line prefix can be deeper than a later line's
       ;; indent, e.g. " \--" under a "  " prefix keeps its backslash)
       (str/join "\n"
                 (map #(subs % (common-prefix-len % prefix)) lines)
                 )))))

(defn- parse-slash-block [ctx groups]
  (let [[_ m-param m-mod-parts] groups
        parser (:block-parser ctx)
        any-line (compile-m "^(.*)$")
        open-line #"^/--++.*"
        close-line #"^\\--.*"
        ;; scan content lines, tracking the block nesting depth
        lines (loop [depth 1 lines []]
                (if (zero? depth)
                  lines
                  (if-some [line (engine/block-next parser any-line)]
                    (let [l (nth (second line) 1)]
                      (cond
                        (re-matches open-line l) (recur (inc depth) (conj lines l))
                        (re-matches close-line l) (if (= depth 1)
                                                    (recur (dec depth) lines)  ; the closing line is not content
                                                    (recur (dec depth) (conj lines l)))
                        :else (recur depth (conj lines l))))
                    lines)))
        content (str/join "\n" lines)
        [type-name param] (str/split (str/trim (or m-param "")) #"\s+" 2)
        param (when-not (str/blank? (or param "")) param)
        blocktype (if (str/blank? type-name) "block/default" (str "block/" (norm/lower-case type-name)))]
    (letfn [(code-block [style code language]
              (when-not (and (= style :texysource) (= code ""))
                {:type :code-block :style style :code code
                 :language language :modifier (mod/parse m-mod-parts)}))]
      (case blocktype
        "block/code" (code-block :code (outdent content) param)
        "block/default" (code-block :default (outdent content) param)
        "block/pre" (code-block :pre (outdent content) param)
        "block/comment" (when-not (= "" content) {:type :block-comment :text content})
        "block/html" (code-block :html (str/replace content #"^\n+|\n+$" "") nil)
        "block/text" (code-block :text (str/replace content #"^\n+|\n+$" "") nil)
        "block/div" (let [content' (outdent content true)]
                      (when-not (= "" content')
                        {:type :section :subtype "div"
                         :content (vec (engine/parse-block ctx content'))
                         :modifier (mod/parse m-mod-parts)}))
        "block/texysource" (code-block :texysource (outdent content) nil)
        ;; /--php and friends: a code block in that language; anything
        ;; that does not look like a language name refuses and degrades
        ;; to visible text
        (if (re-matches #"(?i)^[a-z][a-z0-9_+#-]*$" type-name)
          (code-block :code (outdent content) type-name)
          nil)))))

(defn slash-block-syntax []
  {:name "block/slash"
   :pattern (compile-m (str "^/--++[ \\t]*+(.*?)(?:" p/modifier-h ")?$"))
   :handler parse-slash-block})


;;----------------------------------------------------------------
;; Phrase module

(def phrase-specs
  "Paired phrases, in the reference's registration order."
  [{:syntax "phrase/strong+em" :open "\\*\\*\\*" :char "\\*" :guard "\\\\\\\\" :link true :multiline true}
   {:syntax "phrase/strong" :open "\\*\\*" :char "\\*" :guard "\\\\\\\\" :link true :multiline true}
   {:syntax "phrase/em" :open "//" :char "/" :guard ":" :link true :multiline true}
   {:syntax "phrase/em-alt" :open "\\*" :char "\\*" :guard "\\\\\\\\" :link true :multiline true
    :content "\\s\\*" :content-pair "\\*"}
   {:syntax "phrase/em-alt2" :open "\\*" :char "\\*" :guard "\\\\\\\\" :link true :multiline true
    :before-open "[^\\s.,;:<>()\"'\\-]" :after-close "[^\\s.,;:<>()\"'?!\\-]"}
   {:syntax "phrase/ins" :open "\\+\\+" :char "\\+"}
   ;; < and > guard the arrows <-- and -->
   {:syntax "phrase/del" :open "--" :char "\\-" :guard "<" :guard-after ">"}
   {:syntax "phrase/sup" :open "\\^\\^" :char "\\^"}
   {:syntax "phrase/sub" :open "__" :char "_"}
   {:syntax "phrase/span" :open "\"" :char "\"" :link true
    :after-open "\\s" :before-close "\\s" :content "\\r \"" :content-pair " "}
   {:syntax "phrase/span-alt" :open "\\~" :char "\\~" :link true
    :after-open "\\s" :before-close "\\s" :content "\\r \\~" :content-pair " "}
   {:syntax "phrase/quote" :open ">>" :close "<<" :char ">" :close-char "<" :link true}])

(defn- parse-phrase [syntax ctx groups]
  (let [[_ m-content m-mod-parts m-link] groups]
    (cond
      ;; phrase/span and phrase/span-alt: URL makes it a link; a modifier is required otherwise
      (contains? #{"phrase/span" "phrase/span-alt"} syntax)
      (if m-link
        {:type :link :url (strip-shy m-link)
         :content (engine/parse-inline ctx (str/trim m-content))
         :modifier (mod/parse m-mod-parts)}
        (when m-mod-parts
          {:type :phrase :syntax syntax
           :content (engine/parse-inline ctx (str/trim m-content))
           :modifier (mod/parse m-mod-parts)}))

      :else
      (let [content (engine/parse-inline ctx (str/trim m-content))]
        (if m-link
          {:type :link :url (strip-shy m-link)
           :content [{:type :phrase :syntax syntax :content content
                     :modifier (mod/parse m-mod-parts)}]}
          {:type :phrase :syntax syntax :content content
           :modifier (mod/parse m-mod-parts)})))))

(defn- parse-code-phrase [_ groups]
  (let [[_ m-content m-mod-parts] groups]
    {:type :phrase :syntax "phrase/code"
     :content [{:type :text :text m-content}]
     :modifier (mod/parse m-mod-parts)}))

(defn- parse-sup-sub [syntax _ groups]
  (let [[_ m-content] groups
        content (str/replace m-content "-" "−")]
    {:type :phrase :syntax syntax
     :content [{:type :text :text content}]
     :modifier nil}))

(defn- parse-acronym [syntax _ groups]
  (let [[_ m-content m-mod-parts m-title] groups
        mod-parts (str (or m-mod-parts "") "(" m-title ")")]
    {:type :phrase :syntax syntax
     :content [{:type :text :text (str/trim m-content)}]
     :modifier (mod/parse mod-parts)}))

(defn- parse-no-texy [_ groups]
  {:type :raw-text :text (second groups)})

(defn- parse-inline-link [ctx groups]
  (let [[_ m-content m-link] groups]
    {:type :link :url (strip-shy (str/trim m-link))
     :content (engine/parse-inline ctx (str/trim m-content))
     :modifier nil}))

(defn- parse-markdown-link [ctx groups]
  (let [[_ m-content _m-mod m-link] groups]
    {:type :link :url (strip-shy (str/trim m-link))
     :content (engine/parse-inline ctx (str/trim m-content))
     :modifier nil}))

(defn- parse-wikilink [ctx groups]
  (let [[_ m-content m-link] groups]
    {:type :link :url (strip-shy (str/trim m-link))
     :content (engine/parse-inline ctx (str/trim m-content))
     :modifier nil}))

(defn phrase-syntaxes []
  (into []
        cat
        [(for [{:keys [syntax] :as spec} phrase-specs]
           {:name syntax
            :pattern (re-pattern (p/build-phrase-pattern spec))
            :handler (partial parse-phrase syntax)})
         [{:name "phrase/sup-alt"
           :pattern (compile-ci "(?<=[a-zA-Z0-9])\\^([n0-9+-]{1,4})(?![a-zA-Z0-9])")
           :handler (partial parse-sup-sub "phrase/sup-alt")}
          {:name "phrase/sub-alt"
           :pattern (compile-ci "(?<=[a-zA-Z])_([n0-9]{1,3})(?![a-zA-Z0-9])")
           :handler (partial parse-sup-sub "phrase/sub-alt")}
          {:name "phrase/acronym"
           :pattern (compile-ci (str "(?<![" p/letter "])((?:[" p/letter "]{2,}))()\\(\\("
                                   "((?:[^\\n )]++|[ )])+?)\\)\\)"))
           :handler (partial parse-acronym "phrase/acronym")}
          {:name "phrase/acronym-alt"
           :pattern (compile-ci (str "(?<!\")\"(?!\\s)((?:[^\\r\\n \"]++|[ ])+?)(?:" p/modifier ")?"
                                   "(?<!\\s)\"(?!\")\\(\\((.+?)\\)\\)"))
           :handler (partial parse-acronym "phrase/acronym-alt")}
          {:name "phrase/notexy"
           :pattern (re-pattern "(?<!')''(?![\\s'])((?:[^\\r\\n']++|')+?)(?<![\\s'])''(?!')")
           :handler parse-no-texy}
          {:name "phrase/code"
           :pattern (re-pattern (str "`(\\S(?:[^\\r\\n `]++|[ `])*?)(?:" p/modifier ")?"
                                      "(?<!\\s)`(?::(" p/link-url "))?"))
           :handler parse-code-phrase}
          {:name "phrase/quicklink"
           :pattern (re-pattern (str "([" p/letter "0-9@#$%&.,_-]++):(?=\\[)(" p/link-url ")"))
           :handler parse-inline-link}
          {:name "phrase/wikilink"
           :pattern (re-pattern (str "(?<!\\[)\\[(?![\\s*])([^|\\r\\n\\]]++)\\|"
                                      "((?:[^|\\r\\n \\]]++|[ ])+?)(?:" p/modifier ")?(?<!\\s)](?!])"))
           :handler parse-wikilink}
          {:name "phrase/markdown"
           :pattern (re-pattern (str "(?<![\\[.])\\[(?![\\s*])((?:[^|\\r\\n \\]]++|[ ])+?)(?:" p/modifier ")?"
                                      "(?<!\\s)]\\(((?:[^\\r )]++|[ ])+?)\\)"))
           :handler parse-markdown-link}
          {:name "phrase/escaped-asterix"
           :pattern (re-pattern "\\\\\\*")
           :handler (fn [_ _] {:type :text :text "*"})}]]))


;;----------------------------------------------------------------
;; Image module

(defn- parse-image-content
  "\"url 100x200\" -> [url width height]; dims may be ?"
  [^String content]
  (if-let [[_ url w h] (re-matches #"(.*?) (\d+|\?) ?[xX] ?(\d+|\?) ?" content)]
    [(str/trim url)
     (when (not= w "?") (parse-long w))
     (when (not= h "?") (parse-long h))]
    [content nil nil]))

(defn- image-node
  "The image part shared by the image and figure syntaxes: the image
  node, or the link node wrapping it when the pattern has a :link part
  (a bare : means the image links to itself)."
  [m-urls m-mod-parts m-align m-link]
  (let [[url width height] (parse-image-content m-urls)
        ;; the image closing is *, > or <; only > and < are align parts
        align (when (contains? #{">" "<" "<>"} m-align) m-align)
        image {:type :image :url url :width width :height height
               :modifier (mod/parse (str (or m-mod-parts "") (or align "")))}]
    (if m-link
      {:type :link
       :url (if (= m-link ":") url (strip-shy m-link))
       :image-link (= m-link ":")
       :content [image]}
      image)))

(defn- parse-image [_ groups]
  (let [[_ m-urls m-mod-parts m-align m-link] groups]
    (image-node m-urls m-mod-parts m-align m-link)))

(def ^:private image-core-pattern
  (str "\\[\\*[ \t]*+([^\\n]{1,1000}?)(?:" p/modifier ")?[ \t]*+"
       "(\\*|(?<!<)>|<)](?::(" p/link-url "|:))?"))

(defn image-syntax []
  [{:name "image"
    :pattern (re-pattern image-core-pattern)
    :handler parse-image}])

;;----------------------------------------------------------------
;; Figure module: [*image*]:link *** caption .(title) - a line starting
;; with an image is a figure (the caption and the link are optional)

(defn- parse-figure [ctx groups]
  (let [[_ m-urls m-mod-parts m-align m-link m-caption m-fig-mod] groups
        image (image-node m-urls m-mod-parts m-align m-link)]
    {:type :figure
     :image image
     :caption (when-not (str/blank? m-caption)
                (engine/parse-inline ctx (str/trim m-caption)))
     :modifier (mod/parse m-fig-mod)}))

(defn figure-syntax []
  [{:name "figure"
    :pattern (compile-m (str "^(?>" image-core-pattern ")"
                             "(?:[ \t]++\\*\\*\\*[ \t]++(.*?))?(?:" p/modifier-h ")?$"))
    :handler parse-figure}])


;;----------------------------------------------------------------
;; Autolink module

(defn- parse-url [_ groups]
  {:type :url :url (strip-shy (first groups))})

(defn- parse-email [_ groups]
  {:type :email :email (strip-shy (first groups))})

(defn autolink-syntaxes []
  [{:name "link/url"
    :pattern (re-pattern (str "(?<=^|[\\s(\\[<:])(?:https?://|www\\.|ftp://)[0-9." p/letter "-]"
                              "[/\\d" p/letter "+.~%&?@=_:;#$!,*()\\x{ad}-]{1,1000}"
                              "[/\\d" p/letter "+~?@=_#$*]"))
    :handler parse-url}
   {:name "link/email"
    :pattern (re-pattern (str "(?<=^|[\\s(\\[<])" p/email))
    :handler parse-email}])

;;----------------------------------------------------------------
;; Directive module ({{script}} commands - "scripts" in Texy 3)

(defn- parse-directive [_ groups]
  (let [text (second groups)]
    (when-not (str/blank? text)
      {:type :directive :text text})))

(defn directive-syntax []
  [{:name "directive"
    :pattern (re-pattern "\\{\\{((?:[^}]++|})+?)}}")
    :handler parse-directive}])

;;----------------------------------------------------------------
;; Emoticon module (opt-in; the reference disables it by default)

(def default-emoticons
  "Emoticon -> emoji mapping (the reference EmoticonModule::$icons)."
  {":-)" "🙂" ":-(" "☹" ";-)" "😉" ":-D" "😁" "8-O" "😮" "8-)" "😄"
   ":-?" "😕" ":-x" "😶" ":-P" "😛" ":-|" "😐"})

(defn emoticon-syntax
  "The emoticon line syntax, built from the icon table: keys sorted
  longest-first, the last character may repeat (:-)) matches as :-) plus
  one; the lookbehind keeps emoticons off word boundaries. Returns an
  empty vector when :emoticons is not enabled."
  [options]
  (if-not (true? (:emoticons options))
    []
    (let [icons (merge default-emoticons (:emoticon-icons options))
          ;; krsort: reverse key order, like the reference
          keys-sorted (sort (fn [a b] (compare b a)) (keys icons))
          pattern (re-pattern (str "(?<=^|[\\x00-\\x20])("
                                   (str/join "|" (map #(str (java.util.regex.Pattern/quote %) "+")
                                                      keys-sorted))
                                   ")"))]
      [{:name "emoticon"
        :pattern pattern
        :handler (fn [_ groups]
                   ;; the longest icon the match starts with, like the
                   ;; reference parse (the + suffix is not part of it)
                   (let [match (second groups)
                         icon (first (filter #(str/starts-with? match %) keys-sorted))]
                     (when icon
                       {:type :emoticon
                        :emoticon icon
                        :resolved (get icons icon icon)})))}])))

(defn parse-directive-content
  "Parses directive content into {:name ... :value ... :args ...} (the
  reference DirectiveNode::parseContent): {{name}}, {{name: a, b}} or
  {{name(a, b)}} - the value is the raw argument string (nil for a bare
  name), the args its parts split on the separator (, by default)."
  ([^String text] (parse-directive-content text ","))
  ([^String text ^String separator]
   (let [cmd (str/trim text)
         m (re-find #"(?i)^([a-z_][a-z0-9_-]*)\s*(?:\(([^()]*)\)|:(.*))$" cmd)]
     (if m
       (let [value (str/trim (or (nth m 3) (nth m 2) ""))]
         {:name (nth m 1)
          :value (when-not (str/blank? value) value)
          :args (if (str/blank? value) []
                    (str/split value (re-pattern (str "\\s*"
                                                      (java.util.regex.Pattern/quote separator)
                                                      "\\s*"))))})
       {:name cmd :value nil :args []}))))


;;----------------------------------------------------------------
;; Table module

(defn- parse-caption
  "The optional |## Text line at the table start (it is the very line
  that matched the table block pattern - the handler moves back to it)."
  [ctx]
  (let [caption-re (compile-m "^\\|([\\#=])[\\#=](?![|\\#=+])(.+?)[\\#=]*\\|?[ \\t]*$")
        parser (:block-parser ctx)]
    (when-some [line (engine/block-next parser caption-re)]
      (let [text (str/trimr (nth (second line) 2))]
        (when-not (str/blank? text)
          (vec (engine/parse-inline ctx (str/triml text))))))))

(defn- cell-split
  "Splits a row into cells: escaped pipes (the \\| escape and the |
  inside modifiers) are protected with the \\x13 marker (the reference
  uses the same internal byte), then the row splits on |."
  [^String content]
  (let [protected (-> content
                     (str/replace "\\|" "\u0013")
                     ((fn [s] (str/replace s #"(\[[^]]*)\|" "$1\u0013"))))]
    (mapv #(str/replace % "\u0013" "|") (str/split protected #"\|"))))

(defn- parse-cell-parts
  "Cell text into [head? leading-mod-parts trailing-mod content]: the
  head mark *, an optional leading modifier (the column modifier), the
  content and an optional trailing modifier (the reference cell
  pattern)."
  ;; the content keeps its leading whitespace (the reference's ungreedy
  ;; [ \t]* prefix does not eat it) - the multiline-cell outdent and the
  ;; single-line ltrim handle it
  [^String cell]
  (let [head? (str/starts-with? cell "*")
        cell' (if head? (subs cell 1) cell)
        lead (re-find (re-pattern (str "^[ \t]*(?:" p/modifier-hv ")")) cell')
        cell'' (if lead (subs cell' (count (first lead))) cell')
        ;; the reference cell pattern allows [ \t]* between the trailing
        ;; modifier and the $ anchor, so cells keep their trailing whitespace
        [mod-trail content] (or (mod/extract (str/trimr cell'') 5) [nil cell''])]
    [head?
     (when lead (mod/parse (second lead)))
     mod-trail
     (str/trimr content)]))

;; parse-table replacement - validated standalone before splicing
;; parse-table replacement - validated standalone before splicing
;; parse-table replacement - validated standalone before splicing
(defn- parse-table [ctx groups]
  (when-not (get-in ctx [:options :disable-tables])
    (let [parser (:block-parser ctx)
          head-sep (compile-m "^\\|([=-])[+|=-]{2,}$")
          row-line (compile-m (str "^(\\|)(.*?)(?:\\|[ \\t]*"
                                   "(?:" p/modifier-hv ")?)?$"))
          caption (do (engine/block-move-backward parser)
                      (parse-caption ctx))
          cells* (atom {})      ; id -> cell map (rowspan/colspan mutate)
          texts* (atom {})      ; id -> collected text lines
          col-mod* (atom {})    ; column modifier inheritance
          rows* (atom [])
          is-head* (atom false)
          prev-row* (atom {})   ; col -> cell id
          col-counter* (atom 0)]
      (loop []
        (cond
          ;; head/tail separator line toggles the header mode
          (engine/block-next parser head-sep)
          (do (reset! is-head* (not @is-head*))
              (reset! prev-row* {})
              (recur))

          :else
          (if-some [line (engine/block-next parser row-line)]
            (let [[_ _ m-content m-row-mod] (second line)
                  content (or m-content "")
                  ;; smarter head detection: a first row followed by a
                  ;; separator line is a head row
                  _ (when (and (empty? @rows*) (not @is-head*)
                               (engine/block-next parser head-sep))
                      (engine/block-move-backward parser)
                      (reset! is-head* true))
                  cells (cell-split content)
                  row-cells (atom [])
                  last-cell-id (atom nil)
                  col (atom 0)]
              (doseq [cell cells]
                (let [col' @col
                      prev-id (get @prev-row* col')
                      prev-cell (when prev-id (get @cells* prev-id))
                      rowspan-match (and prev-cell
                                         (or (re-matches #"\^[ \t]*" cell)
                                             (re-find #"\*?(.*?)[ \t]+\^$" cell)))]
                  (cond
                    ;; rowspan: append text to the cell above
                    rowspan-match
                    (let [text (or (second (re-find #"\*?(.*?)[ \t]+\^$" cell)) "")]
                      (swap! cells* update-in [prev-id :rowspan] inc)
                      (swap! texts* update prev-id conj text)
                      (reset! col (+ col' (or (:colspan prev-cell) 1)))
                      (reset! last-cell-id nil))

                    ;; colspan: an empty cell extends the previous one
                    (and (= "" cell) (some? @last-cell-id))
                    (do (swap! cells* update-in [@last-cell-id :colspan] inc)
                        (swap! prev-row* dissoc col')
                        (swap! col inc))

                    :else
                    (let [[head? lead-mod mod-trail content'] (parse-cell-parts cell)
                          _ (when lead-mod
                              (swap! col-mod* assoc col' lead-mod))
                          cell-mod (mod/merge-modifiers (get @col-mod* col') mod-trail)
                          id (gensym "cell")]
                      (swap! cells* assoc id {:type :table-cell
                                              :header (or @is-head* head?)
                                              :colspan 1 :rowspan 1
                                              :modifier cell-mod})
                      (swap! texts* assoc id [content'])
                      (swap! row-cells conj id)
                      (swap! prev-row* assoc col' id)
                      (swap! col inc)
                      (reset! last-cell-id id)))))
              ;; even up with empty cells
              (while (< @col @col-counter*)
                (let [id (gensym "cell")]
                  (swap! cells* assoc id {:type :table-cell :header @is-head*
                                          :colspan 1 :rowspan 1
                                          :modifier (or (get @col-mod* @col) {})})
                  (swap! texts* assoc id [""])
                  (swap! row-cells conj id)
                  (swap! prev-row* assoc @col id)
                  (swap! col inc)))
              (if (seq @row-cells)
                (do (swap! rows* conj {:cells @row-cells :header @is-head*
                                        :modifier (mod/parse m-row-mod)})
                    (reset! col-counter* @col))
                ;; redundant row - decrement the pending rowspans
                (doseq [[_col id] @prev-row*]
                  (swap! cells* update-in [id :rowspan] dec)))
              (recur))
            nil)))
      (when (seq @rows*)
        {:type :table
         :rows (mapv (fn [row]
                       {:type :table-row
                        :header (:header row)
                        :modifier (:modifier row)
                        :cells (mapv (fn [id]
                                       (let [cell (get @cells* id)
                                             lines (or (get @texts* id) [""])]
                                         (assoc cell
                                                :content
                                                (let [lines (reverse (drop-while str/blank? (reverse lines)))
                                                      content (cond
                                                                (empty? lines) []
                                                                (= 1 (count lines))
                                                                (vec (engine/parse-inline ctx (str/triml (first lines))))
                                                                :else
                                                                (vec (engine/parse-block
                                                                       (assoc-in ctx [:options :disable-tables] true)
                                                                       (outdent (str/join "\n" lines)))))]
                                                  ;; an empty cell renders as a non-breaking space
                                                  (if (empty? content)
                                                    [{:type :text :text "\u00A0"}]
                                                    content))
                                                :text nil)))
                                     (:cells row))})
                     @rows*)
         :caption caption
         :modifier (mod/parse (second groups))}))))

(defn table-syntax []
  {:name "table"
   :pattern (compile-m (str "^(?:" p/modifier-hv "\\n)?\\|.*$"))
   :handler parse-table})

;;----------------------------------------------------------------
;; Reference definitions ([ref]: url, [*ref*]: url) and the bare [ref]

(defn- parse-link-definition [_ groups]
  (let [[_ m-ref m-url m-label m-mod-parts] groups
        label (some-> m-label str/trim (as-> l (when-not (str/blank? l) l)))]
    (cond-> {:type :link-definition :reference m-ref :url (strip-shy m-url)}
      ;; the Texy 3 label and modifier carriers (legacy-references
      ;; applies them; the label group swallows the modifier when both
      ;; are present - the shared definition regex shape)
      label (assoc :label label)
      m-mod-parts (assoc :modifier (mod/parse m-mod-parts)))))

(defn- parse-reference
  "The opt-in bare [ref] line syntax (the reference link/reference,
  default off like it): resolves against the link definitions like
  \"text\":[ref] - including the Texy 3 label semantics when enabled."
  [ctx groups]
  (let [[_ m-ref] groups]
    (when (get (:allowed ctx) "link/reference")
      {:type :link :url (str "[" m-ref "]")
       :content [{:type :text :text (html/unescape-html m-ref)}]
       :ref m-ref})))

(defn reference-syntaxes []
  [{:name "link/reference"
    :pattern (compile-m "(?<![.\\#\\[])\\[([^\\[\\]*|\\n]++)\\]")
    :handler parse-reference}])

(defn parse-image-definition [_ groups]
  (let [[_ m-ref m-urls m-mod-parts] groups
        [url width height] (parse-image-content m-urls)]
    {:type :image-definition :reference (str/trim m-ref)
     :url url :width width :height height
     :modifier (mod/parse m-mod-parts)}))

(defn definition-syntaxes []
  ;; image definitions register before the figure syntax (the reference's
  ;; module order): a [*ref*]: url line is a definition, not a figure
  [{:name "image-definition"
    :pattern (compile-m (str "^\\[\\*([^\\n]{1,100})\\*\\]:[ \\t]+(.{1,1000}?)"
                             "[ \\t]*(?:" p/modifier ")?\\s*$"))
    :handler parse-image-definition}
   {:name "link-definition"
    ;; the label group is a LAZY optional with a lazy body (the
    ;; reference's U-ungreedy flag): the modifier prefers to match,
    ;; the label only grows when the line cannot anchor otherwise; the
    ;; modifier's own parts group (like the reference's capture) is
    ;; group 4, without the leading dot and space
    :pattern (compile-m (str "^\\[([^\\[\\]#?*\\n]{1,100})\\]:[ \\t]++(\\S{1,1000})"
                             "(?:([ \\t].{1,1000}?))??(?:" p/modifier ")?\\s*$"))
    :handler parse-link-definition}])

;;----------------------------------------------------------------
;; Assembly (the reference's module registration order)

(defn line-syntaxes []
  ;; the reference's module registration order: directive, html, image,
  ;; link references, phrases, autolink; emoticons are opt-in (appended
  ;; in make-context); the bare [ref] is opt-in too (the handler refuses
  ;; unless allowed["link/reference"] is set)
  (into []
        cat
        [(directive-syntax)
         (html/html-syntaxes)
         (image-syntax)
         (reference-syntaxes)
         (phrase-syntaxes)
         (autolink-syntaxes)]))

(defn block-syntaxes []
  ;; the reference's registration order: definitions, figure, blocks
  ;; (slash, fenced), hr, blockquote, table, headings, lists
  (into []
        cat
        [(definition-syntaxes)
         (figure-syntax)
         [(slash-block-syntax)]
         [(fenced-syntax)]
         [(hr-syntax)]
         [(blockquote-syntax)]
         [(table-syntax)]
         (heading-syntaxes)
         (list-syntaxes)]))

(defn make-context [options]
  (let [;; the reference's allowed[] defaults: ins/del/sup/sub are
        ;; opt-in; a caller's :allowed map merges per key over them
        allowed (merge {"phrase/ins" false "phrase/del" false
                        "phrase/sup" false "phrase/sub" false}
                       (:allowed options {}))]
    (engine/make-context
      (-> (merge {:gap-handler gap-handler
                  ;; custom syntaxes registered via texy.core/add-line-syntax
                  ;; and add-block-syntax run after the built-ins (collision
                  ;; resolution: longer match wins, then earlier registration)
                  :line-syntaxes (into (into (line-syntaxes) (emoticon-syntax options))
                                       (:custom-line-syntaxes options []))
                  :block-syntaxes (into (block-syntaxes) (:custom-block-syntaxes options []))
                  :options (merge {:merge-lines true :more-means-higher true} options)}
                 options)
          (assoc :allowed allowed)))))

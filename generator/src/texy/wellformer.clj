(ns texy.wellformer
  "The serialization-time formatting of the reference WellFormer: block
  indentation with tabs, blank lines between block siblings, line
  wrapping at a width (80 by default). The pairing/content-model half
  of the WellFormer has two implementations here: jsoup's HTML5 tree
  construction (texy.dom, the to-html path) and the call-driven driver
  ported from the Node.js sibling (serialize-direct / to-html-direct,
  no round-trip).

  The output buffer is a list of segments; the whitespace fix-ups the
  reference encoded with control bytes are explicit operations here,
  ported one-to-one from the reference (see the Node.js sibling):
  - :pre segments (preserved text: pre/textarea/script/code/samp/kbd
    content, comments) are exempt from trims and wrapping;
  - a :barrier-eat marks a former \\x07 site: blocks trims,
    transparent to back-tab eating;
  - a :barrier-close marks a former \\x08 site: blocks trims and
    back-tab eating.

  Attribute values and preserved text carry their whitespace frozen
  (\\u0001-\\u0004) for the wrapping pass, so a line never breaks
  inside a value - only between attributes; finish unfreezes."
  (:require [clojure.string :as str]
            [huff2.core :as huff]
            [texy.html :as html]))

;; Pre-compiled regex patterns for performance
(def ^:private ^java.util.regex.Pattern re-wrap-lines #"(?m)^(\t*)(.*)$")
(def ^:private ^java.util.regex.Pattern re-leading-spaces #"^ +")
(def ^:private ^java.util.regex.Pattern re-trailing-tab-spaces #"\t? *$")
(def ^:private ^java.util.regex.Pattern re-whitespace-runs #"[ \n]+")
(def ^:private ^java.util.regex.Pattern re-trailing-whitespace-eol #"[\t ]+(?=\n)")
(def ^:private ^java.util.regex.Pattern re-trailing-whitespace-end #"[\t ]+\z")
(def ^:private ^java.util.regex.Pattern re-leading-newlines #"^\n+")

(def ^:private preserve-spaces
  "Elements whose content keeps whitespace verbatim (the reference
  Config::preserveSpaces)."
  #{"textarea" "pre" "script" "code" "samp" "kbd"})

(defn freeze-spaces
  "Encodes whitespace as non-breakable control bytes (the reference
  Helpers::freezeSpaces)."
  ^String [^String s]
  (-> s
      (str/replace " " "\u0001")
      (str/replace "\t" "\u0002")
      (str/replace "\r" "\u0003")
      (str/replace "\n" "\u0004")))

(defn unfreeze-spaces
  "Reverts the frozen control bytes back to whitespace."
  ^String [^String s]
  (-> s
      (str/replace "\u0001" " ")
      (str/replace "\u0002" "\t")
      (str/replace "\u0003" "\r")
      (str/replace "\u0004" "\n")))

(defn wordwrap
  "PHP-compatible wordwrap(): counts UTF-8 BYTES and checks the width
  at every byte position, including inside a multibyte character. A
  line breaks at the last space of the current line, consuming it;
  words longer than the width are not cut."
  (^String [^String s width] (wordwrap s width "\n"))
  (^String [^String s width ^String brk]
   (if (= "" s)
     s
     (let [n (count s)
           cum (int-array (inc n))]
       (loop [i 0, c 0]
         (when (< i n)
           (let [ch (int (.charAt s i))
                 d (cond (< ch 0x80) 1
                         (< ch 0x800) 2
                         (and (>= ch 0xD800) (< ch 0xDC00)) 3 ; high surrogate
                         (and (>= ch 0xDC00) (< ch 0xE000)) 1 ; low surrogate
                         :else 3)]
             (aset cum (inc i) (+ c d))
             (recur (inc i) (+ c d)))))
       (let [out (StringBuilder.)]
         (loop [i 0, laststart 0, lastspace -1]
           (if (>= i n)
             (do (.append out (subs s laststart))
                 (str out))
             (let [lastspace (if (= 0x20 (int (.charAt s i))) i lastspace)]
               (if (and (> lastspace laststart)
                        (> (- (aget cum (inc i)) (aget cum laststart)) width))
                 (do (.append out (subs s laststart lastspace))
                     (.append out brk)
                     (recur (inc i) (inc lastspace) lastspace))
                 (recur (inc i) laststart lastspace))))))))))


;;----------------------------------------------------------------
;; the formatting machine state

(defn- init-state [config]
  {:segs []                 ; [type ^String text], :normal/:pre/:barrier-eat/:barrier-close
   :text ""                 ; buffered text since the last tag
   :fragment-start [0 0]   ; position of the last tag boundary
   :eat-spaces false
   :soft-mark nil
   :soft-collapsed false
   :space (:base-indent config 0)
   :tag-used {}             ; open element counts, the preserving context
   :stack ()                ; open element frames, newest first
   :config config})

(defn- end-pos
  "The [segment-count, offset] position of the buffer end (the
  reference endPos)."
  [state]
  (let [segs (:segs state)]
    [(count segs) (count (second (peek segs)))]))

(defn- end-fragment
  [state]
  (assoc state :fragment-start (end-pos state)))

(defn- append
  "Appends markup/text, consuming leading spaces while the eat-spaces
  mode (set right after an indented open tag or <br>) is on."
  [state ^String s]
  (cond
    (= "" s) state

    (:eat-spaces state)
    (let [s' (str/replace s re-leading-spaces "")]
      (if (= "" s')
        state                                              ; fully eaten, keep eating
        (append (assoc state :eat-spaces false) s')))

    :else
    (let [segs (:segs state)]
      (if (and (seq segs) (= :normal (first (peek segs))))
        (assoc-in state [:segs (dec (count segs)) 1] (str (second (peek segs)) s))
        (update state :segs conj [:normal s])))))

(defn- eat-barrier
  "Marks a former \\x07 site: blocks the final right-trim across it
  and turns on eating of the spaces that follow."
  [state]
  (-> state
      (update :segs conj [:barrier-eat ""])
      (assoc :eat-spaces true)))

(defn- append-pre
  "Appends preserved text: exempt from space eating, trims and
  wrapping."
  [state ^String s]
  (if (= "" s)
    state
    (-> state
        (assoc :eat-spaces false)
        (update :segs conj [:pre s]))))

(defn- rtrim
  "Strips trailing characters from a string (PHP rtrim with a char
  list)."
  ^String [^String s chars]
  (let [class (str/join (map #(format "\\x%02x" (int %)) chars))]
    (str/replace s (re-pattern (str "[" class "]+$")) "")))

(defn- strip-tail
  "Strips trailing characters from the buffer, walking segments
  backward; stops at any barrier or preserved segment, and at limit
  (a fragment-start position)."
  ([state chars] (strip-tail state chars nil))
  ([state chars limit]
   (loop [i (dec (count (:segs state))), state state]
     (if (neg? i)
       state
       (let [[type ^String s] (nth (:segs state) i)]
         (if (not= :normal type)
           state
           (cond
             (and limit (= (dec (first limit)) i))
             ;; the fragment starts inside this segment
             (let [off (second limit)]
               (assoc-in state [:segs i 1]
                         (str (subs s 0 off) (rtrim (subs s off) chars))))

             (and limit (> (dec (first limit)) i))
             state                                                ; before the fragment entirely

             :else
             (let [t (rtrim s chars)]
               (if (= "" t)
                 (recur (dec i) (assoc-in state [:segs i 1] t)) ; emptied, keep walking
                 (assoc-in state [:segs i 1] t))))))))))

(defn- backtab-eat
  "Removes spaces and at most one tab immediately before a block
  closing tag. Passes through eat-barriers, stops at close barriers
  and preserved text."
  [state]
  (loop [i (dec (count (:segs state)))]
    (if (neg? i)
      state
      (let [[type s] (nth (:segs state) i)]
        (cond
          (or (= type :barrier-eat) (and (= type :normal) (= "" s)))
          (recur (dec i))                                       ; transparent

          (= type :normal)
          (assoc-in state [:segs i 1] (str/replace s re-trailing-tab-spaces ""))

          :else state)))))                                      ; eaten chars are contiguous

(defn- soft-newline
  "Soft newline around empty block voids (the former \\r): trailing
  tabs and spaces before it are trimmed, and two adjacent soft
  newlines collapse into a single newline."
  [state]
  (let [state (strip-tail state " \t")
        pos (end-pos state)]
    (if (and (some? (:soft-mark state))
             (= (:soft-mark state) pos)
             (not (:soft-collapsed state)))
      (assoc state :soft-collapsed true)
      (let [state (append state "\n")]
        (assoc state :soft-mark (end-pos state)
               :soft-collapsed false)))))

(defn- preserving-open?
  "Is an element whose content keeps whitespace verbatim open?"
  [state]
  (some (fn [[tag n]] (when (and (pos? n) (contains? preserve-spaces tag)) tag))
        (:tag-used state)))

(defn- escaped-text
  "Already escaped text content: buffered until the next tag, so the
  whitespace shrinking spans the whole inter-tag fragment."
  [state ^String s]
  (update state :text str s))

(defn- flush-text
  "Shrinks the buffered inter-tag fragment to single spaces (or keeps
  it verbatim inside preserving elements)."
  [state]
  (let [s (:text state)]
    (if (= "" s)
      state
      (let [state (assoc state :text "")]
        (if (preserving-open? state)
          (append-pre state s)
          (append state (str/replace s re-whitespace-runs " ")))))))

(defn- emit-comment
  "An HTML comment: preserved inner content between < and >."
  [state inner]
  (-> state
      flush-text
      (append "<")
      (append-pre inner)
      (append ">")
      end-fragment))


;;----------------------------------------------------------------
;; tags

(defn- format-attrs
  "Attributes to a string: values keep their (already escaped)
  content with the whitespace frozen, so line wrapping can break
  between attributes but never inside a value."
  [attrs]
  (reduce-kv (fn [^String s k v]
               (cond
                 (or (nil? v) (false? v)) s                   ; dropped attributes
                 (true? v) (str s " " (name k))                ; bare boolean attribute
                 :else (str s " " (name k) "=\"" (freeze-spaces (str v)) "\"")))
             ""
             (or attrs {})))

(defn- start-tag-body
  "Emits a start tag. Void elements never enter the stack; block
  elements open an indent level, inline elements stay on the line."
  [state tag attr void?]
  (let [{:keys [config space]} state
        indent? (and (:indent config) (not (preserving-open? state)))]
    (if void?
      (-> (cond
            (and indent? (= tag "br"))
            ;; <br> ends the line; only the current fragment trims
            (-> state
                (strip-tail " \t\n\r\u0000\u000b" (:fragment-start state))
                (append (str "<" tag attr ">\n" (str/join (repeat (max 0 (dec space)) "\t"))))
                eat-barrier)

            (and indent? (not (html/inline? tag)))
            (let [tabs (str/join (repeat space "\t"))]
              (-> state
                  soft-newline
                  (append (str tabs "<" tag attr ">"))
                  soft-newline
                  (append tabs)))

            :else
            (append state (str "<" tag attr ">")))
          end-fragment)

      (let [block? (and (:indent config) (not (html/inline? tag)))
            state (if block?
                    (-> state
                        (append (str "\n" (str/join (repeat space "\t")) "<" tag attr ">"))
                        eat-barrier
                        (update :space inc))
                    (append state (str "<" tag attr ">")))]
        (-> state
            (update :stack conj {:tag tag
                                 :close (str "</" tag ">")
                                 :close-indent (when block? space)
                                 :indent (if block? 1 0)})
            (update-in [:tag-used tag] (fnil inc 0))
            end-fragment)))))

(defn- start-tag
  [state tag attr void?]
  (-> state flush-text (start-tag-body tag attr void?)))

(defn- emit-close
  "Emits the closing tag of the top stack frame; block closes eat the
  preceding indentation tab and re-indent for the parent. A nil close
  (a transparent frame the driver opened for a disallowed tag) emits
  nothing."
  [state {:keys [tag close close-indent indent]}]
  (let [state (cond
                (nil? close) state
                close-indent
                (-> state
                    backtab-eat
                    (update :segs conj [:barrier-close ""])
                    (append (str close "\n" (str/join (repeat close-indent "\t"))))
                    (update :space - indent))
                :else (append state close))]
    (-> state
        (update-in [:tag-used tag] dec)
        (update :stack rest))))

(defn- end-tag
  [state tag]
  (let [state (flush-text state)]
    (if (and (seq (:stack state)) (= tag (:tag (first (:stack state)))))
      (-> state (emit-close (first (:stack state))) end-fragment)
      (end-fragment state))))


;;----------------------------------------------------------------
;; the tree walk

(def ^:private raw-token
  "The tag grammar the reference raw() tokenizes handler-supplied HTML
  with (the U ungreedy flag spelled with lazy quantifiers, the attrs
  alternative lazy-optional so a self-close slash stays out of it).
  Groups: 1 text, 2 comment, 3 end-tag slash, 4 tag name, 5 attributes,
  6 self-closing slash."
  #"(?si)([^<]*+)<(?:(!--.*?--)|(/?)([a-z][a-z0-9._:-]*)([ \n].*?)??\s*?(/?))>")

(defn- feed-raw
  "Tokenizes a raw HTML fragment: text chunks join the buffer,
  comments are preserved verbatim, tags pass through the stack (the
  reference WellFormer::raw). After the jsoup well-forming only the
  e-mail obfuscation blob reaches this with markup; the fragment path
  also sends author tags here (unclosed ones auto-close at finish)."
  [state ^String s]
  (let [m (re-matcher raw-token s)
        matched? (fn [n] (pos? (count (or (.group m n) ""))))]
    (loop [offset 0, state state]
      (if-not (.find m)
        ;; unmatched trailing text bypassed the tokenizer
        (escaped-text state (subs s offset))
        (let [start (.start m)
              gap (subs s offset start)
              state (if (= "" gap)
                      state
                      (-> state flush-text (append gap) end-fragment))
              text (.group m 1)
              state (if (= "" text) state (escaped-text state text))
              cmt (.group m 2)
              state (if cmt
                      (emit-comment state cmt)
                      (let [end? (matched? 3)
                            tag (.group m 4)
                            attr (or (.group m 5) "")
                            empty? (boolean (or (matched? 6) (html/void? tag)))]
                        (cond
                          (and empty? end?)
                          ;; a void element cannot be closed; still ends the fragment
                          (-> state flush-text end-fragment)

                          end?
                          (end-tag state tag)

                          :else
                          (start-tag state tag attr empty?))))]
          (recur (.end m) state))))))

(defn- feed
  "Feeds one rendered form: elements recurse, text joins the buffer,
  raw strings tokenize by the reference tag grammar."
  [state form]
  (cond
    (huff/raw-string? form)
    (feed-raw state (str form))

    (vector? form)
    (let [[tag & tail] form
          attrs? (map? (first tail))
          children (if attrs? (rest tail) tail)
          tag-name (name tag)
          void? (html/void? tag-name)]
      (let [state (start-tag state tag-name (format-attrs (when attrs? (first tail))) void?)]
        (if void?
          state
          (let [state (reduce #(feed %1 %2) state (remove nil? children))]
            (end-tag state tag-name)))))

    (sequential? form)
    (reduce #(feed %1 %2) state form)

    :else
    (escaped-text state (str form))))


;;----------------------------------------------------------------
;; finish

(defn- wrap-lines
  "Wraps every line at the width, repeating its leading tabs on the
  continuation lines (the reference WellFormer::wrap)."
  [^String s width]
  (str/replace s re-wrap-lines
               (fn [[_ tabs line]]
                 (str tabs (wordwrap line width (str "\n" tabs))))))

(defn- finish
  "Flushes open tags and finalizes the output: right-trims the tab
  runs the block layout left behind, wraps the lines, unfreezes."
  [state]
  (let [state (reduce #(emit-close %1 %2) (flush-text state) (:stack state))
        segs (:segs state)
        wrap? (pos? (get-in state [:config :line-wrap] 80))
        s (str/join
            (map-indexed (fn [i [type ^String text]]
                           (case type
                             :pre (if wrap? (freeze-spaces text) text)
                             :normal (cond-> (str/replace text re-trailing-whitespace-eol "")
                                       (= i (dec (count segs))) (str/replace re-trailing-whitespace-end ""))
                             ""))                           ; barriers contribute nothing
                         segs))
        s (if wrap? (wrap-lines s (get-in state [:config :line-wrap] 80)) s)]
    (unfreeze-spaces s)))

(defn serialize
  "Serializes the well-formed hiccup tree to formatted HTML (the
  formatting half of the reference WellFormer + the Renderer's
  finalize): block indentation with tabs, blank lines between block
  siblings, line wrapping. Options:
  :indent      indent block elements? (default true)
  :line-wrap   wrap width, 0 disables (default 80, the reference)
  :base-indent starting indent level (default 0)"
  ([forms] (serialize forms {}))
  ([forms opts]
   (let [config (merge {:indent true :line-wrap 80 :base-indent 0} opts)
         state (init-state config)
         state (reduce #(feed %1 %2) state forms)]
     ;; the leading newline of the first block is layout noise - the
     ;; reference Renderer.finalize ltrims it
     (str/replace (finish state) re-leading-newlines ""))))

(defn serialize-fragment
  "Finalizes a standalone fragment (the reference finalizeFragment):
  the rendered CHILDREN (groups of forms) feed the formatter
  separated by text newlines, and the result is trimmed at both ends.
  The fragment tree bypassed the jsoup well-forming, so raw tag blobs
  pass through the raw tokenizer instead."
  ([groups] (serialize-fragment groups {}))
  ([groups opts]
   (let [config (merge {:indent true :line-wrap 80 :base-indent 0} opts)
         groups (vec groups)
         state (loop [gi 0, state (init-state config)]
                 (if (= gi (count groups))
                   state
                   (let [state (if (pos? gi) (escaped-text state "\n") state)]
                     (recur (inc gi) (reduce feed state (nth groups gi))))))]
     (str/trim (finish state)))))


;;----------------------------------------------------------------
;; the call-driven well-forming half (the Node.js sibling's
;; WellFormer.js: content models, auto-close of optional-end
;; containers, prohibited nesting, auto-close-and-reopen on unmatched
;; end tags). The jsoup path gets this from HTML5 tree construction
;; (texy.dom); this driver feeds the rendered tree straight into the
;; formatter with no serialize->parse->convert round-trip.

;; GENERATED by implementations/node.js/tools/dump-schema-clj.mjs - do not edit by hand.
;; :content - [:phrasing-default] category default is the phrasing-content set;
;;        [:flow-default] - the flow-content set;
;;        [:explicit [children...]] - a fixed model (:\%TEXT marks where text is allowed);
;;        [:transparent [own-additions...]] - inherits the parent model plus these.
(def ^:private elements*
{
	"a" {:inline :inline :void false :optional-end false :content [:transparent []]}
	"abbr" {:inline :inline :void false :optional-end false :content [:phrasing-default]}
	"address" {:inline :block :void false :optional-end false :content [:flow-default]}
	"area" {:inline :inline :void true :optional-end false :content [:phrasing-default]}
	"article" {:inline :block :void false :optional-end false :content [:flow-default]}
	"aside" {:inline :block :void false :optional-end false :content [:flow-default]}
	"audio" {:inline :inline :void false :optional-end false :content [:transparent [:source :track]]}
	"b" {:inline :inline :void false :optional-end false :content [:phrasing-default]}
	"base" {:inline :block :void true :optional-end false :content [:flow-default]}
	"bdi" {:inline :inline :void false :optional-end false :content [:phrasing-default]}
	"bdo" {:inline :inline :void false :optional-end false :content [:phrasing-default]}
	"blockquote" {:inline :block :void false :optional-end false :content [:flow-default]}
	"body" {:inline :block :void false :optional-end true :content [:flow-default]}
	"br" {:inline :replaced :void true :optional-end false :content [:phrasing-default]}
	"button" {:inline :replaced :void false :optional-end false :content [:phrasing-default]}
	"canvas" {:inline :replaced :void false :optional-end false :content [:phrasing-default]}
	"caption" {:inline :block :void false :optional-end false :content [:phrasing-default]}
	"cite" {:inline :inline :void false :optional-end false :content [:phrasing-default]}
	"code" {:inline :inline :void false :optional-end false :content [:phrasing-default]}
	"col" {:inline :block :void true :optional-end false :content [:flow-default]}
	"colgroup" {:inline :block :void false :optional-end true :content [:explicit [:col :%TEXT]]}
	"data" {:inline :inline :void false :optional-end false :content [:phrasing-default]}
	"datalist" {:inline :inline :void false :optional-end false :content [:phrasing-default]}
	"dd" {:inline :block :void false :optional-end true :content [:flow-default]}
	"del" {:inline :inline :void false :optional-end false :content [:transparent []]}
	"details" {:inline :block :void false :optional-end false :content [:transparent [:summary]]}
	"dfn" {:inline :inline :void false :optional-end false :content [:phrasing-default]}
	"div" {:inline :block :void false :optional-end false :content [:flow-default]}
	"dl" {:inline :block :void false :optional-end false :content [:explicit [:dt :dd :%TEXT]]}
	"dt" {:inline :block :void false :optional-end true :content [:flow-default]}
	"em" {:inline :inline :void false :optional-end false :content [:phrasing-default]}
	"embed" {:inline :replaced :void true :optional-end false :content [:phrasing-default]}
	"fieldset" {:inline :block :void false :optional-end false :content [:transparent [:legend]]}
	"figcaption" {:inline :block :void false :optional-end false :content [:phrasing-default]}
	"figure" {:inline :block :void false :optional-end false :content [:transparent [:figcaption]]}
	"footer" {:inline :block :void false :optional-end false :content [:flow-default]}
	"form" {:inline :block :void false :optional-end false :content [:flow-default]}
	"h1" {:inline :block :void false :optional-end false :content [:phrasing-default]}
	"h2" {:inline :block :void false :optional-end false :content [:phrasing-default]}
	"h3" {:inline :block :void false :optional-end false :content [:phrasing-default]}
	"h4" {:inline :block :void false :optional-end false :content [:phrasing-default]}
	"h5" {:inline :block :void false :optional-end false :content [:phrasing-default]}
	"h6" {:inline :block :void false :optional-end false :content [:phrasing-default]}
	"head" {:inline :block :void false :optional-end true :content [:flow-default]}
	"header" {:inline :block :void false :optional-end false :content [:flow-default]}
	"hr" {:inline :block :void true :optional-end false :content [:flow-default]}
	"html" {:inline :block :void false :optional-end true :content [:flow-default]}
	"i" {:inline :inline :void false :optional-end false :content [:phrasing-default]}
	"iframe" {:inline :replaced :void false :optional-end false :content [:explicit []]}
	"img" {:inline :replaced :void true :optional-end false :content [:phrasing-default]}
	"input" {:inline :replaced :void true :optional-end false :content [:phrasing-default]}
	"ins" {:inline :inline :void false :optional-end false :content [:transparent []]}
	"kbd" {:inline :inline :void false :optional-end false :content [:phrasing-default]}
	"label" {:inline :inline :void false :optional-end false :content [:phrasing-default]}
	"legend" {:inline :block :void false :optional-end false :content [:phrasing-default]}
	"li" {:inline :block :void false :optional-end true :content [:flow-default]}
	"link" {:inline :inline :void true :optional-end false :content [:phrasing-default]}
	"main" {:inline :block :void false :optional-end false :content [:flow-default]}
	"map" {:inline :inline :void false :optional-end false :content [:phrasing-default]}
	"mark" {:inline :inline :void false :optional-end false :content [:phrasing-default]}
	"math" {:inline :replaced :void false :optional-end false :content [:phrasing-default]}
	"meta" {:inline :inline :void true :optional-end false :content [:phrasing-default]}
	"meter" {:inline :replaced :void false :optional-end false :content [:phrasing-default]}
	"nav" {:inline :block :void false :optional-end false :content [:flow-default]}
	"noscript" {:inline :replaced :void false :optional-end false :content [:transparent []]}
	"object" {:inline :replaced :void false :optional-end false :content [:transparent [:param]]}
	"ol" {:inline :block :void false :optional-end false :content [:explicit [:li :%TEXT]]}
	"optgroup" {:inline :block :void false :optional-end false :content [:explicit [:option :%TEXT]]}
	"option" {:inline :block :void false :optional-end true :content [:flow-default]}
	"output" {:inline :replaced :void false :optional-end false :content [:phrasing-default]}
	"p" {:inline :block :void false :optional-end true :content [:phrasing-default]}
	"param" {:inline :block :void true :optional-end false :content [:flow-default]}
	"picture" {:inline :replaced :void false :optional-end false :content [:phrasing-default]}
	"pre" {:inline :block :void false :optional-end false :content [:phrasing-default]}
	"progress" {:inline :replaced :void false :optional-end false :content [:phrasing-default]}
	"q" {:inline :inline :void false :optional-end false :content [:phrasing-default]}
	"ruby" {:inline :inline :void false :optional-end false :content [:phrasing-default]}
	"s" {:inline :inline :void false :optional-end false :content [:phrasing-default]}
	"samp" {:inline :inline :void false :optional-end false :content [:phrasing-default]}
	"script" {:inline :replaced :void false :optional-end false :content [:explicit [:%TEXT]]}
	"section" {:inline :block :void false :optional-end false :content [:flow-default]}
	"select" {:inline :replaced :void false :optional-end false :content [:explicit [:option :optgroup :%TEXT]]}
	"slot" {:inline :inline :void false :optional-end false :content [:phrasing-default]}
	"small" {:inline :inline :void false :optional-end false :content [:phrasing-default]}
	"source" {:inline :block :void true :optional-end false :content [:flow-default]}
	"span" {:inline :inline :void false :optional-end false :content [:phrasing-default]}
	"strong" {:inline :inline :void false :optional-end false :content [:phrasing-default]}
	"style" {:inline :block :void false :optional-end false :content [:explicit [:%TEXT]]}
	"sub" {:inline :inline :void false :optional-end false :content [:phrasing-default]}
	"summary" {:inline :block :void false :optional-end false :content [:phrasing-default]}
	"sup" {:inline :inline :void false :optional-end false :content [:phrasing-default]}
	"svg" {:inline :replaced :void false :optional-end false :content [:phrasing-default]}
	"table" {:inline :block :void false :optional-end false :content [:explicit [:caption :colgroup :thead :tbody :tfoot :tr :%TEXT]]}
	"tbody" {:inline :block :void false :optional-end true :content [:explicit [:tr :%TEXT]]}
	"td" {:inline :block :void false :optional-end true :content [:flow-default]}
	"template" {:inline :inline :void false :optional-end false :content [:phrasing-default]}
	"textarea" {:inline :replaced :void false :optional-end false :content [:explicit [:%TEXT]]}
	"tfoot" {:inline :block :void false :optional-end true :content [:explicit [:tr :%TEXT]]}
	"th" {:inline :block :void false :optional-end true :content [:flow-default]}
	"thead" {:inline :block :void false :optional-end true :content [:explicit [:tr :%TEXT]]}
	"time" {:inline :inline :void false :optional-end false :content [:phrasing-default]}
	"tr" {:inline :block :void false :optional-end true :content [:explicit [:th :td :%TEXT]]}
	"track" {:inline :block :void true :optional-end false :content [:flow-default]}
	"u" {:inline :inline :void false :optional-end false :content [:phrasing-default]}
	"ul" {:inline :block :void false :optional-end false :content [:explicit [:li :%TEXT]]}
	"var" {:inline :inline :void false :optional-end false :content [:phrasing-default]}
	"video" {:inline :replaced :void false :optional-end false :content [:transparent [:source :track]]}
	"wbr" {:inline :inline :void true :optional-end false :content [:phrasing-default]}
})
(def ^:private phrasing-content*
  #{:a :abbr :audio :b :bdi :bdo :cite :code :data :datalist :del :dfn :em :i :ins :kbd :label :map :mark :q :ruby :s :samp :slot :small :span :strong :sub :sup :template :time :u :var :area :br :embed :img :input :link :meta :wbr :button :canvas :iframe :math :meter :noscript :object :output :picture :progress :script :select :svg :textarea :video :%TEXT})
(def ^:private flow-content*
  #{:a :abbr :audio :b :bdi :bdo :cite :code :data :datalist :del :dfn :em :i :ins :kbd :label :map :mark :q :ruby :s :samp :slot :small :span :strong :sub :sup :template :time :u :var :area :br :embed :img :input :link :meta :wbr :button :canvas :iframe :math :meter :noscript :object :output :picture :progress :script :select :svg :textarea :video :p :h1 :h2 :h3 :h4 :h5 :h6 :pre :address :article :aside :blockquote :details :div :fieldset :figure :footer :form :header :hr :main :nav :section :body :head :html :table :ul :ol :dl :%TEXT})
(def ^:private prohibited*
  {"a" #{"a" "button"}
   "button" #{"a" "button"}
   "form" #{"form"}})

;; string-keyed views (tags at runtime are strings)
(def ^:private elements
  (update-vals elements*
               #(update % :content (fn [[kind kids]] [kind (mapv name kids)]))))
(def ^:private phrasing-content (into #{} (map name) phrasing-content*))
(def ^:private flow-content (into #{} (map name) flow-content*))


(defn- child-content
  "The content model of a known tag in the given parent model (the
  node sibling's Schema.childContent): transparent elements inherit
  the parent model plus their own additions."
  [tag parent-content]
  (let [[kind kids] (:content (get elements tag))]
    (case kind
      :phrasing-default phrasing-content
      :flow-default flow-content
      :explicit (into #{} kids)
      :transparent (into parent-content kids))))


(defn- emit-frame
  "Emits a frame's closing tag WITHOUT popping the stack and WITHOUT
  adjusting the indent counter - the driven loops do both, like the
  node sibling's emitClose callers."
  [state {:keys [close close-indent]}]
  (cond
    (nil? close) state
    close-indent
    (-> state
        backtab-eat
        (update :segs conj [:barrier-close ""])
        (append (str close "\n" (str/join (repeat close-indent "\t")))))
    :else (append state close)))


(defn- flush-text-driven
  "Flushes the text buffer; text that the top container's content model
  does not allow is dropped (the node sibling's %TEXT check)."
  [state]
  (let [s (:text state)]
    (if (= "" s)
      state
      (let [top (first (:stack state))]
        (if (and top (not (contains? (:dtd-content top flow-content) "%TEXT")))
          (assoc state :text "")
          (flush-text state))))))




(defn- close-optional-tags
  "Closes open containers whose content model cannot host the incoming
  tag: optional-end containers close silently, a locked container stops
  the walk. Returns [state, the content model to check the tag
  against] (the node sibling's closeOptionalTags)."
  [state tag dtd]
  (loop [frames (seq (:stack state)), removed 0, state state]
    (if (empty? frames)
      [(update state :stack (partial drop removed)) flow-content]
      (let [item (first frames)
            dtd' (:dtd-content item flow-content)]
        (if (or (contains? dtd' tag)
                (and (some? (:close item))
                     (not (:optional-end (get elements (:tag item))))
                     (not (html/inline? (:tag item)))))
          [(update state :stack (partial drop removed)) dtd']
          (recur (next frames)
                 (inc removed)
                 (-> state
                     (emit-frame item)
                     (update :space - (:indent item))
                     (update-in [:tag-used (:tag item)] (fnil dec 0)))))))))


(defn- start-tag-body-driven
  "Emits a start tag through the content-model decision: a disallowed
  tag opens a transparent frame - its children still render, the tag
  itself does not (the node sibling's startTagBody)."
  [state tag attr void? allowed dtd-content]
  (let [{:keys [config space]} state
        indent? (and (:indent config) (not (preserving-open? state)))]
    (if void?
      (if-not allowed
        state
        (-> (cond
              (and indent? (= tag "br"))
              ;; <br> ends the line; only the current fragment trims
              (-> state
                  (strip-tail " \t\n\r\u0000\u000b" (:fragment-start state))
                  (append (str "<" tag attr ">\n" (str/join (repeat (max 0 (dec space)) "\t"))))
                  eat-barrier)

              (and indent? (not (html/inline? tag)))
              (let [tabs (str/join (repeat space "\t"))]
                (-> state
                    soft-newline
                    (append (str tabs "<" tag attr ">"))
                    soft-newline
                    (append tabs)))

              :else
              (append state (str "<" tag attr ">")))
            end-fragment))

      (let [block? (and allowed (:indent config) (not (html/inline? tag)))
            [state open close close-indent indent]
            (if-not allowed
              [state nil nil nil 0]
              (let [open (str "<" tag attr ">")
                    close (str "</" tag ">")
                    [state close-indent indent]
                    (if block?
                      [(-> state
                           (append (str "\n" (str/join (repeat space "\t")) open))
                           eat-barrier
                           (update :space inc))
                       space
                       1]
                      [(append state open) nil 0])]
                [state open close close-indent indent]))
            dtd-content (if (and allowed (contains? elements tag))
                          (child-content tag dtd-content)
                          dtd-content)]
        (-> state
            (update :stack conj {:tag tag :open open :close close :close-indent close-indent
                                 :indent indent :dtd-content dtd-content})
            (update-in [:tag-used tag] (fnil inc 0))
            end-fragment)))))


(defn- start-tag-driven
  "Feeds a start tag through the driver (the node sibling's startTag):
  optional-end containers auto-close, prohibited nesting and content
  models can drop the tag itself (its children still render)."
  [state tag attr void?]
  (let [state (flush-text-driven state)]
    (if-not (contains? elements tag)
      ;; unknown tags are transparent wrappers: always allowed,
      ;; inheriting the parent's content model
      (start-tag-body-driven state tag attr void? true
                             (or (some-> (:stack state) first :dtd-content)
                                 flow-content))
      (let [[state dtd] (close-optional-tags state tag flow-content)
            prohibited (get prohibited* tag)
            allowed (and (contains? dtd tag)
                         (or (nil? prohibited)
                             (not (some #(pos? (get (:tag-used state) % 0))
                                        prohibited))))]
        (start-tag-body-driven state tag attr void? allowed dtd)))))


(defn- reopen
  "Reopens the frames an unmatched end tag interrupted (the node
  sibling's autoopen): all-inline reopen in document order when the
  container allows them again."
  [state tmp back?]
  (if (or (not back?) (empty? tmp))
    state
    (let [dtd (or (some-> (:stack state) first :dtd-content) flow-content)]
      (if-not (contains? dtd (:tag (first tmp)))
        state
        (reduce (fn [state r]
                  (-> state
                      (cond-> (:open r) (append (:open r)))
                      (update :space + (:indent r))
                      (update-in [:tag-used (:tag r)] (fnil inc 0))
                      (update :stack conj r)))
                state
                tmp)))))


(defn- process-end-tag
  "Closes the stack down to the tag's frame, emitting closes for the
  elements it interrupts; if those are all inline, they reopen after
  it (the node sibling's processEndTag)."
  [state tag]
  (if-not (pos? (get (:tag-used state) tag 0))
    state
    (loop [frames (seq (:stack state)), tmp [], back? true, removed 0, state state]
      (if (empty? frames)
        (reopen (update state :stack (partial drop removed)) tmp back?)
        (let [item (first frames)
              state' (-> state
                         (emit-frame item)
                         (update :space - (:indent item))
                         (update-in [:tag-used (:tag item)] (fnil dec 0)))
              back?' (and back? (html/inline? (:tag item)))
              removed' (inc removed)]
          (if (= tag (:tag item))
            (-> (update state' :stack (partial drop removed'))
                (reopen tmp back?'))
            (recur (next frames) (into [item] tmp) back?' removed' state')))))))


(defn- end-tag-driven
  [state tag]
  (-> state flush-text-driven (process-end-tag tag) end-fragment))


(defn- feed-raw-driven
  "Tokenizes a raw HTML fragment through the driver (the node
  sibling's raw: tags pass the content-model machinery too)."
  [state ^String s]
  (let [m (re-matcher raw-token s)
        matched? (fn [n] (pos? (count (or (.group m n) ""))))]
    (loop [offset 0, state state]
      (if-not (.find m)
        (escaped-text state (subs s offset))
        (let [start (.start m)
              gap (subs s offset start)
              state (if (= "" gap)
                      state
                      (-> state flush-text-driven (append gap) end-fragment))
              text (.group m 1)
              state (if (= "" text) state (escaped-text state text))
              cmt (.group m 2)
              state (if cmt
                      (emit-comment state cmt)
                      (let [end? (matched? 3)
                            tag (.group m 4)
                            attr (or (.group m 5) "")
                            empty? (boolean (or (matched? 6) (html/void? tag)))]
                        (cond
                          (and empty? end?) (-> state flush-text-driven end-fragment)
                          end? (end-tag-driven state tag)
                          :else (start-tag-driven state tag attr empty?))))]
          (recur (.end m) state))))))


(defn- feed-driven
  "Feeds one rendered form through the driver: elements recurse, text
  joins the buffer, raw strings tokenize by the reference tag grammar."
  [state form]
  (cond
    (huff/raw-string? form)
    (feed-raw-driven state (str form))

    (vector? form)
    (let [[tag & tail] form
          attrs? (map? (first tail))
          children (if attrs? (rest tail) tail)
          tag-name (name tag)
          void? (html/void? tag-name)]
      (let [state (start-tag-driven state tag-name (format-attrs (when attrs? (first tail))) void?)]
        (if void?
          state
          (let [state (reduce #(feed-driven %1 %2) state (remove nil? children))]
            (end-tag-driven state tag-name)))))

    (sequential? form)
    (reduce #(feed-driven %1 %2) state form)

    :else
    (escaped-text state (str form))))


(defn serialize-direct
  "Serializes the rendered tree straight through the call-driven
  well-forming driver - no jsoup serialize->parse->convert round-trip
  (the node.js sibling's architecture). Same options as serialize."
  ([forms] (serialize-direct forms {}))
  ([forms opts]
   (let [config (merge {:indent true :line-wrap 80 :base-indent 0} opts)
         state (reduce feed-driven (init-state config) forms)]
     ;; the leading newline of the first block is layout noise
     (str/replace (finish state) re-leading-newlines ""))))


(ns texy.wellformer
  "The serialization-time formatting of the reference WellFormer: block
  indentation with tabs, blank lines between block siblings, line
  wrapping at a width (80 by default). The pairing/content-model half
  of the WellFormer is jsoup's HTML5 tree construction in this port
  (texy.dom), so this namespace consumes the already well-formed
  hiccup tree and only formats it.

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
    (let [s' (str/replace s #"^ +" "")]
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
          (assoc-in state [:segs i 1] (str/replace s #"\t? *$" ""))

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
          (append state (str/replace s #"[ \n]+" " ")))))))

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
  preceding indentation tab and re-indent for the parent."
  [state {:keys [tag close close-indent indent]}]
  (let [state (if close-indent
                (-> state
                    backtab-eat
                    (update :segs conj [:barrier-close ""])
                    (append (str close "\n" (str/join (repeat close-indent "\t"))))
                    (update :space - indent))
                (append state close))]
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
  (str/replace s #"(?m)^(\t*)(.*)$"
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
                             :normal (cond-> (str/replace text #"[\t ]+(?=\n)" "")
                                       (= i (dec (count segs))) (str/replace #"[\t ]+\z" ""))
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
     (str/replace (finish state) #"^\n+" ""))))

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

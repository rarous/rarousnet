(ns texy.engine
  "The parsing engine: block structures and inline syntaxes
  (port of Texy\\Parsing - Engine, BlockParser, InlineParser).

  Nodes are plain maps with a :type key. The block parser is a small
  stateful machine (an atom) exposed to handlers, which may consume
  continuation lines through `block-next` and rewind with
  `block-move-backward` - the interactive half of the reference
  BlockParser.

  Collision resolution follows the reference: inline matches at the same
  offset prefer the longer match, then earlier registration; block
  matches are ordered by offset, then registration order, and a rejected
  match lets the next one at the same offset run."
  (:require [clojure.string :as str]))

(defn- groups
  "Match groups as a vector, nil for groups that did not participate."
  [^java.util.regex.Matcher m]
  (into [] (map #(try (.group m (int %)) (catch Exception _ nil)))
        (range (inc (.groupCount m)))))

(defn match-at
  "Anchored match of pattern at pos of s. Returns [full, groups, end] or
  nil. Uses an anchoring region so `^` anchors at pos."
  [^java.util.regex.Pattern pattern ^String s pos]
  (let [m (re-matcher pattern s)]
    (.region m (int pos) (count s))
    (.useAnchoringBounds m true)
    (when (.lookingAt m)
      [(subs s pos (.end m)) (groups m) (.end m)])))

(defn find-from
  "First match of pattern in s at or after pos. Returns
  [offset, full, groups, end] or nil."
  [^java.util.regex.Pattern pattern ^String s pos]
  (let [m (re-matcher pattern s)]
    (when (.find m (int pos))
      [(.start m) (subs s (.start m) (.end m)) (groups m) (.end m)])))

(defn match-all
  "All matches of a pattern over the text, as maps with :offset, :match,
  :groups, :end."
  [^java.util.regex.Pattern pattern ^String s]
  (let [m (re-matcher pattern s)]
    (loop [res []]
      (if (.find m)
        (recur (conj res {:offset (.start m) :match (.group m 0)
                          :groups (groups m) :end (.end m)}))
        res))))


;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Block parser (interactive: handlers consume via block-next)

(defn make-block-parser
  "A stateful block parser over text: an atom with :text and :offset (the
  position after the last consumed line)."
  [^String text]
  (atom {:text text :offset 0}))

(defn block-text [parser] (:text @parser))

(defn block-next
  "Matches the pattern anchored at the parser position; on success advances
  past the line and returns [full, groups, end]; nil otherwise."
  [parser ^java.util.regex.Pattern pattern]
  (let [{:keys [^String text offset]} @parser]
    (when (<= offset (count text))
      (when-let [[full groups end] (match-at pattern text offset)]
        (swap! parser assoc :offset (inc end))
        [full groups end]))))

(defn block-move-backward
  "Moves position back over the specified number of line endings (default
  1); ends up at the line start, like the reference (the position is
  decremented before each line-ending check, and the line ending itself
  is not consumed)."
  ([parser] (block-move-backward parser 1))
  ([parser lines-count]
   (swap! parser
          (fn [{:keys [^String text offset] :as st}]
            (assoc st :offset
                   (loop [pos offset n lines-count]
                     (let [pos' (dec pos)]
                       (cond
                         (<= pos' 0) 0
                         ;; the JS checks text[offset-1] after each decrement
                         (= \newline (.charAt text (dec pos')))
                         (let [n' (dec n)]
                           (if (< n' 1) pos' (recur pos' n')))
                         :else (recur pos' n)))))))))


;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Context and the parse entry points

(defn make-context
  "context = {:block-parser (atom) :line-syntaxes [...] :block-syntaxes [...]
              :gap-handler fn(ctx, text) :allowed {...} :options {...}}"
  [options]
  (merge {:line-syntaxes [] :block-syntaxes [] :allowed {}} options))

(defn parse-block
  "Parses text as block content with the context's block syntaxes and gap
  handler. Returns the vector of block nodes.

  All block matches are precomputed and processed in (offset, registration)
  order; a match is stale when the parser has moved past its offset. The
  matched line is consumed by the loop, handlers may consume continuation
  lines through the block parser, and a nil result (or no advancement)
  means refusal: the position resets and the gap handler sees the text."
  [context ^String text]
  (let [text (str/replace text #"\n+$" "")
        parser (make-block-parser text)
        ctx (assoc context :block-parser parser)
        matches (->> (:block-syntaxes ctx)
                     (map-indexed (fn [order {:keys [name pattern handler]}]
                                    (map #(assoc % :name name :handler handler :order order)
                                         (match-all pattern text))))
                     (apply concat)
                     (sort-by (juxt :offset :order))
                     (into []))
        n (count matches)]
    (loop [cursor 0 nodes []]
      (let [i (loop [c cursor]
                (cond
                  (>= c n) nil
                  (>= (:offset (nth matches c)) (:offset @parser)) c
                  :else (recur (inc c))))
            m (when i (nth matches i))
            offset (if i (:offset m) (count text))]
        ;; between-matches content -> gap handler
        (let [nodes (if (> offset (:offset @parser))
                      (into nodes ((:gap-handler ctx) ctx (subs text (:offset @parser) offset)))
                      nodes)]
          (if (nil? i)
            nodes
            (let [mOffset (:offset m)
                  mLen (count (:match m))]
              (swap! parser assoc :offset (+ mOffset mLen 1)) ; consume the matched line
              (let [node ((:handler m) ctx (:groups m))]
                (if (or (nil? node) (<= (:offset @parser) mOffset)) ; handler rejects
                  (do (swap! parser assoc :offset mOffset)
                      (recur (inc i) nodes))
                  (recur (inc i) (into nodes (if (map? node) [node] node))))))))))))

(defn- inline-candidate
  "The first match of the syntax at or after pos, or nil."
  [{:keys [pattern name handler]} ^String text pos]
  (when-let [[offset full groups end] (find-from pattern text pos)]
    {:offset offset :length (count full) :full full :groups groups
     :name name :handler handler :end end}))

(defn parse-inline
  "Parses text as inline content with the context's line syntaxes.
  Returns a VECTOR of nodes. Text gaps become :text nodes; a handler may
  return a node or a vector of nodes (spliced); a nil result means the
  syntax refuses this match and other syntaxes at the same position still
  get their turn."
  [context ^String text]
  (if (or (= "" text) (empty? (:line-syntaxes context)))
    (if (= "" text) [] [{:type :text :text text}])
    (let [candidates (into {} (map (fn [syntax] [(:name syntax)
                                                 (inline-candidate syntax text 0)])
                                   (:line-syntaxes context)))
          syntax-by-name (into {} (map (fn [s] [(:name s) s]) (:line-syntaxes context)))]
      (loop [candidates candidates pos 0 res []]
        (let [candidates (into {} (map (fn [[name m]]
                                         (if (and m (< (:offset m) pos))
                                           [name (inline-candidate (syntax-by-name name) text pos)]
                                           [name m]))
                                       candidates))
              best (reduce (fn [best [_ m]]
                             (if (and m (or (nil? best)
                                            (< (:offset m) (:offset best))
                                            (and (= (:offset m) (:offset best))
                                                 (> (:length m) (:length best)))))
                               m best))
                           nil candidates)]
          (if (nil? best)
            (let [res (if (< pos (count text))
                        (conj res {:type :text :text (subs text pos)})
                        res)]
              res)
            (let [node ((:handler best) context (:groups best))]
              (if (nil? node)
                ;; rejected: retry this syntax after the match start
                (recur (assoc candidates (:name best)
                              (inline-candidate (syntax-by-name (:name best)) text (inc (:offset best))))
                       pos res)
                (let [res (cond-> res
                            (< pos (:offset best)) (conj {:type :text :text (subs text pos (:offset best))}))
                      res (into res (if (map? node) [node] node))]
                  (recur candidates (:end best) res))))))))))


;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Node helpers

(defn node-seq
  "Depth-first sequence of all nodes (maps with :type) in the tree."
  [node]
  (tree-seq map?
            (fn [n] (concat (get n :content []) (get n :items []) (get n :caption [])
                            (get n :rows []) (mapcat :cells (get n :rows []))
                            (when (map? (get n :image)) [(get n :image)])))
            node))

(defn find-nodes [node pred]
  (filter pred (node-seq node)))

(defn extract-text [node]
  (->> (node-seq node)
       (filter #(contains? #{:text :raw-text} (:type %)))
       (map :text)
       (apply str)))

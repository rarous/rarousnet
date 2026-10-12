(ns texy.passes
  "Transform passes (port of Texy\\Passes\\* - the ported subset): heading
  level balancing (dynamic or fixed, like HeadingPass)."
  (:require [clojure.string :as str]
            [texy.normalize :as norm]
            [texy.engine :as engine]))

(defn transform-nodes
  "Applies f to every node bottom-up (children first), rebuilding the
  child collections :content, :items, :caption and :image (as vectors;
  the figure's :image holds a single node). f receives a node map and
  returns a node map or nil to remove the node (a removed figure :image
  disappears from the map)."
  [f node]
  (let [node (reduce (fn [node key]
                       (cond
                         (sequential? (get node key))
                         (update node key #(filterv some? (map (partial transform-nodes f) %)))
                         (and (map? (get node key)) (contains? (get node key) :type))
                         (let [child (transform-nodes f (get node key))]
                           (if (nil? child) (dissoc node key) (assoc node key child)))
                         :else node))
                     node
                     [:content :items :caption :image :rows :cells])]
    (f node)))

(defn transform-content
  "Applies f to every child collection (:content, :items, :caption) of
  every node, bottom-up: f receives the collection and returns the new
  one. Used by the HTML pairing and sanitize passes, which operate per
  content container."
  [f doc]
  (transform-nodes
    (fn [node]
      (reduce (fn [node key]
                (if (sequential? (get node key))
                  (update node key f)
                  node))
              node
              [:content :items :caption :rows :cells]))
    doc))

(defn- collect-headings [doc]
  (into [] (filter #(= :heading (:type %))) (engine/node-seq doc)))

(defn- webalize
  "Converts to web-safe [a-z0-9-] text (the reference Helpers::webalize;
  the transliteration approximates Nette's with Unicode decomposition)."
  ^String [^String s]
  (let [ascii (-> s
                 (str/replace #"[`'\"^~]" "-")
                 (java.text.Normalizer/normalize java.text.Normalizer$Form/NFD)
                 (str/replace #"\p{M}+" ""))]
    (-> (norm/lower-case ascii)
        (str/replace #"[^a-z0-9]+" "-")
        (str/replace #"^-+|-+$" ""))))

(defn- unique-id [id used]
  (if-not (contains? @used id)
    id
    (loop [n 2]
      (let [id' (str id "-" n)]
        (if-not (contains? @used id') id' (recur (inc n)))))))

(defn- hoist-toc
  "Moves the {toc: ...} style out of the heading modifier: it is transport
  syntax and must never reach the output (the reference hoistOverride)."
  [node]
  (let [title (get-in node [:modifier :styles "toc"])]
    (if (nil? title)
      node
      (-> node
          (update-in [:modifier :styles] dissoc "toc")
          (assoc :title-override title)))))

(defn- heading-title
  "The heading as plain text: the override, or the content's text
  (the reference HeadingNode::getTitle)."
  [node]
  (or (:title-override node)
      (str/trim (engine/extract-text node))))

(defn balance-headings
  "Balances heading levels on the document (returns a new document), and
  applies the rest of the reference's HeadingPass: hoists the {toc: ...}
  style off the modifier (it must never reach the output) and, when
  :generate-ids is on, gives every heading a slug id (webalized title,
  :id-prefix prefix, uniquified; an explicit modifier id wins).

  Dynamic level balancing (default): underlined levels are ranked by
  their preliminary level (densest becomes the top), surrounded levels
  shift relative to the highest of them - so both families end at `top`.

  Fixed: every level shifts by `top` and is clamped to 1..6."
  [doc {:keys [top dynamic generate-ids id-prefix]
    :or {top 1 dynamic true generate-ids false id-prefix "toc-"}}]
  (let [headings (collect-headings doc)]
    (if (empty? headings)
      doc
      (let [level-fn (if-not dynamic
                       (fn [node] (assoc node :level (-> (:level node) (+ top) (max 1) (min 6))))
                       (let [surrounded (keep #(when (= :surrounded (:subtype %)) (:level %)) headings)
                             min-level (if (seq surrounded) (reduce min surrounded) Integer/MAX_VALUE)
                             underlined (sort (distinct (keep #(when (= :underlined (:subtype %)) (:level %)) headings)))
                             rank (into {} (map-indexed (fn [r level] [level r])) underlined)
                             offset (- top min-level)]
                         (fn [node]
                           (assoc node :level (-> (if (= :surrounded (:subtype node))
                                                    (+ (:level node) offset)
                                                    (+ (get rank (:level node) 0) top))
                                                  (max 1) (min 6))))))
            used-id (atom #{})]
        (transform-nodes
          (fn [node]
            (if (not= :heading (:type node))
              node
              (let [node (hoist-toc (level-fn node))]
                (if-not generate-ids
                  node
                  (let [mod-id (get-in node [:modifier :id])]
                    (if mod-id
                      (do (swap! used-id conj mod-id) (assoc node :id mod-id))
                      (let [id (unique-id (str id-prefix (webalize (heading-title node))) used-id)]
                        (swap! used-id conj id)
                        (assoc node :id id))))))))
          doc)))))

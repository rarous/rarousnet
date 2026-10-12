(ns texy.conformance-test
  "Conformance against the reference implementation's test material: the
  original sources (tests/Texy/sources/*.texy) rendered by this port and
  compared with the reference HTML produced by the PHP oracle with
  typography, hyphenation AND well-former formatting disabled (fixtures/
  render-flat - indent off, line wrap off), matching this port's flat
  hiccup serialization.

  Start-tag attributes are sorted
  (attribute order differs between the two renderers and is semantically
  irrelevant in HTML).

  Sources exercising syntaxes outside this port's subset are listed in
  `known-gaps` with the reason."
  (:require [clojure.test :refer [deftest is]]
            [clojure.string :as str]
            [texy.core :as core]))

(def sources-dir "../../tests/Texy/sources")
(def fixtures-dir "../clojure/fixtures/render-flat")

(def known-gaps
  "Sources whose syntaxes are outside the ported subset."
  {;; the well-forming phase is jsoup's HTML5 tree construction (see
  ;; texy.dom and the README Deviations); these sources exercise the
  ;; places where it disagrees with the reference WellFormer
   "html" "jsoup repair semantics (crossed/unclosed inline tags, nested forms, paragraph wrapping)"
   "html-tags2" "jsoup repair semantics (script islands, bare boolean attributes)"
   ;; jsoup inserts an implicit <tbody> that the reference does not
   ;; emit for passthrough tables (accepted difference)
   "html-tags4" "implicit <tbody> in passthrough tables"})

(defn- canonicalize-tags
  "Sorts the attributes of every start tag: the two renderers emit
  attributes in different (insertion) orders; attribute order is
  semantically irrelevant in HTML, so both sides are sorted."
  ^String [^String html]
  (str/replace
    html
    #"<(\w[-\w]*)((?:\s+[-\w]+=\"[^\"]*\")*)\s*/?>"
    (fn [[_ tag attrs]]
      (let [pairs (->> (re-seq #"([-\w]+)=\"([^\"]*)\"" attrs)
                       (map (fn [[_ k v]] [(keyword k) v]))
                       (sort-by first)
                       (map (fn [[k v]] (str (name k) "=\"" v "\"")))
                       (str/join " "))]
        (str "<" tag (when-not (str/blank? pairs) (str " " pairs)) ">")))))

(defn normalize
  "Strips the reference's indentation whitespace and canonicalizes tag
  serialization on both sides."
  ^String [^String html]
  (-> html
      (str/replace #"[\n\t]" "")
      canonicalize-tags))

(defn fixtures
  "([fixtures-dir]) pairs of [name source expected] for every fixture
  (skipping the emoticon-enabled -on variants)."
  ([dir-name]
   (let [dir (java.io.File. dir-name)
         files (or (.listFiles dir) (throw (ex-info (str "fixtures dir not found: " dir-name)
                                                    {:dir (.getAbsolutePath dir)})))]
     (into []
           (comp (filter #(and (str/ends-with? % ".html")
                               (not (str/ends-with? % "-on.html"))))
                 (map #(let [name (str/replace % #"\.html$" "")]
                         [name
                          (slurp (str sources-dir "/" name ".texy"))
                          (slurp (str dir-name "/" %))])))
           (map #(.getName %) files))))
  ([] (fixtures fixtures-dir)))

(deftest reference-sources
  (let [fx (fixtures)]
    (is (pos? (count fx)) "no fixtures found - broken path?")
    (doseq [[name source expected] fx
            :when (not (contains? known-gaps name))]
      (is (= (normalize expected)
             ;; typography off: the flat fixtures are generated with the
             ;; typography, hyphenation and well-former formatting all off
             (normalize (core/process (core/->texy {:typography false}) source)))
           (str "conformance: " name ".texy")))))

(deftest reference-sources-typography
  (let [fx (fixtures "../clojure/fixtures/render-typo")]
    (is (pos? (count fx)) "no render-typo fixtures found - generate them: php ../node.js/tools/transform-oracle.php --render-typo")
    (doseq [[name source expected] fx
            :when (not (contains? known-gaps name))]
      (is (= (normalize expected)
             ;; typography on (the default), hyphenation and well-former
             ;; formatting still off - matching the render-typo oracle
             (normalize (core/process (core/->texy) source)))
           (str "typo conformance: " name ".texy")))))

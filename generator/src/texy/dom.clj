(ns texy.dom
  "The HTML transform phase on jsoup, replacing the reference's
  serialization-time WellFormer: the rendered hiccup tree is serialized,
  parsed by jsoup - whose HTML5 tree construction repairs the global
  tag stream (unclosed and crossed tags, prohibited nesting, raw script
  and style islands) - and converted back to hiccup. A hicory-style
  facade written for this port (jsoup Document -> hiccup, the
  hicory conversion, inlined): hiccup in, hiccup out, huff2 stays the
  serializer.

  jsoup's repair follows HTML5, not the reference's own Schema tables -
  the places the two disagree are documented in the README Deviations
  (jsoup closes an outer <a> instead of dropping the nested start tag;
  script content stays raw until its real close tag instead of
  auto-closing at the first embedded comment).

  The port escapes display text itself, so jsoup's decoded text and
  attribute values are re-encoded on the way back with the very
  escaping the renderers applied (passed in as escape-html /
  escape-attr). Raw blobs WITHOUT tag markup (the e-mail obfuscation
  entity, comment payloads, the empty alt) would be lossy through the
  parse round trip - jsoup decodes entities - so they travel through
  as base64 <texy-raw data-r=\"...\"> placeholder elements and come
  back verbatim. The texy-raw name is reserved for this purpose."
  (:require [clojure.string :as str]
            [huff2.core :as huff])
  (:import (java.util Base64)
           (org.jsoup Jsoup)
           (org.jsoup.nodes Attribute CDataNode Comment DataNode Element
                            TextNode)))

;; huff serializes void elements XHTML-style (<br />); HTML5 voids
;; carry no self-closing slash. huff's emit methods append exactly
;; " />" for a void tag, so both element methods are redefined through
;; their original implementations with the append wrapped: " />"
;; becomes ">". Everything else (compound tags, attributes, escaping)
;; keeps huff's semantics. A global multimethod override - this port
;; is huff's only consumer here.
(doseq [dispatch-val [:tag-node-no-attrs :tag-node]]
  (let [original (get (methods huff/emit) dispatch-val)]
    (defmethod huff/emit dispatch-val
      [append! form opts]
      (original (fn [& xs] (apply append! (map #(if (= " />" %) ">" %) xs)))
                form opts))))

(def ^:private b64-encoder (Base64/getEncoder))
(def ^:private b64-decoder (Base64/getDecoder))

(defn- b64
  ^String [^String s]
  (.encodeToString b64-encoder (.getBytes s "UTF-8")))

(defn- unb64
  ^String [^String s]
  (String. (.decode b64-decoder s) "UTF-8"))

;; Pre-compiled regex pattern for performance
(def ^:private ^java.util.regex.Pattern re-tag-markup #"</?[a-zA-Z]")

(defn- protect
  "Walks the rendered tree replacing tag-free raw blobs with
  <texy-raw> placeholder markup (itself kept raw, so the serialization
  step emits it verbatim). Tag-bearing raws - the passthrough HTML -
  stay unprotected: the jsoup repair must see them."
  [form]
  (cond
    (and (huff/raw-string? form) (not (re-find re-tag-markup (str form))))
    (huff/raw (str "<texy-raw data-r=\"" (b64 (str form)) "\"></texy-raw>"))

    (vector? form)
    (let [[tag & tail] form
          attrs? (map? (first tail))]
      (into (if attrs? [tag (first tail)] [tag])
            (map protect (if attrs? (rest tail) tail))))

    (sequential? form)
    (map protect form)

    :else form))

(defn- attr-value
  "A jsoup attribute value back to hiccup: re-encoded with escape-attr,
  empty values as raw so huff's omission of empty attribute values
  does not drop them (the reference always emits alt)."
  [escape-attr ^String v]
  (if (.isEmpty v)
    (huff/raw (escape-attr v))
    (escape-attr v)))

(declare node->form)

(defn- element->form
  [^Element el escape-html escape-attr]
  (if (= "texy-raw" (.nodeName el))
    (huff/raw (unb64 (.attr el "data-r")))
    (let [attrs (into {} (map (fn [^Attribute a]
                               [(keyword (.getKey a)) (attr-value escape-attr (.getValue a))]))
                     (.attributes el))
          tag (keyword (.nodeName el))]
      (into (if (seq attrs) [tag attrs] [tag])
            (keep #(node->form % escape-html escape-attr) (.childNodes el))))))

(defn- node->form
  "One jsoup node to hiccup: elements recurse, text re-escapes, script
  and style data (jsoup's DataNode) and comments come back raw so
  neither shrinking nor escaping touches them."
  [node escape-html escape-attr]
  (cond
    (instance? Element node) (element->form node escape-html escape-attr)
    (instance? CDataNode node) (huff/raw (.getWholeText ^CDataNode node))
    (instance? DataNode node) (huff/raw (.getWholeData ^DataNode node))
    (instance? Comment node) (huff/raw (str "<!--" (.getData ^Comment node) "-->"))
    (instance? TextNode node) (escape-html (.getWholeText ^TextNode node))
    :else nil))

(defn wellform
  "Repairs the rendered hiccup tree with jsoup's HTML5 tree
  construction: serialize, parse, convert back. escape-html /
  escape-attr re-encode jsoup's decoded text and attribute values -
  pass the same escaping the renderers applied."
  [forms escape-html escape-attr]
  (let [html (binding [huff/*escape?* false]
               (str (huff/html (mapv protect forms))))
        ;; a doctype forces standards-mode parsing: without it jsoup
        ;; (1.23+) switches to quirks mode, where a <table> start no
        ;; longer closes an open <p>. The doctype never reaches the
        ;; output - only head/body children are read back. A leading
        ;; <script>/<style>/<title> is hoisted to <head> by the HTML5
        ;; tree construction (in-head content before the body starts),
        ;; so head children come first.
        doc (Jsoup/parse (str "<!DOCTYPE html>" html))
        nodes (concat (.childNodes (.head doc))
                      (.childNodes (.body doc)))]
    (keep #(node->form % escape-html escape-attr) nodes)))

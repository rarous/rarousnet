(ns texy.text
  "Plain-text rendition of a parsed document (port of the reference
  Output/Text/Renderer): HTML tags are dropped (element content is
  kept), blocks separate by blank lines, list items render one per
  line, table rows join cells with tabs."
  (:require [clojure.string :as str]))

(defmulti render-node
  "Renders one AST node as plain text."
  :type)

(declare render-blocks render-children)

(defn- children [node] (get node :content []))

(defmethod render-node :default [node] "")

(defmethod render-node :text [node] (:text node))
(defmethod render-node :raw-text [node] (:text node))
(defmethod render-node :line-break [_] "\n")

(defmethod render-node :document [node] (render-blocks (children node)))
(defmethod render-node :paragraph [node] (apply str (map render-node (children node))))
(defmethod render-node :heading [node] (apply str (map render-node (children node))))
(defmethod render-node :blockquote [node] (render-blocks (children node)))
(defmethod render-node :section [node] (render-blocks (children node)))
(defmethod render-node :code-block [node] (str/replace (:code node) #"^\n+|\n+$" ""))
(defmethod render-node :horizontal-rule [_] "")
(defmethod render-node :figure [node] (if-some [caption (:caption node)]
                                        (apply str (map render-node caption))
                                        ""))

(defmethod render-node :list [node]
  (str/join "\n" (map #(render-blocks (children %) "\n") (get node :items []))))

(defmethod render-node :definition-list [node]
  (str/join "\n" (map render-node (get node :items []))))

(defmethod render-node :list-item [node] (render-blocks (children node) "\n"))

(defmethod render-node :table [node]
  (str (when-some [caption (:caption node)]
         (str (apply str (map render-node caption)) "\n"))
       (str/join "\n" (map render-node (get node :rows [])))))

(defmethod render-node :table-row [node]
  (str/join "\t" (map render-node (get node :cells []))))

(defmethod render-node :table-cell [node] (render-blocks (children node) "\n"))

(defmethod render-node :image [node] (or (get-in node [:modifier :title]) ""))
(defmethod render-node :link [node] (apply str (map render-node (children node))))
(defmethod render-node :phrase [node] (apply str (map render-node (children node))))
(defmethod render-node :emoticon [node] (or (:resolved node) (:emoticon node)))

(defmethod render-node :url [node] (:url node))
(defmethod render-node :email [node] (:email node))

;; passthrough: tags drop, element content is kept
(defmethod render-node :html-tag [_] "")
(defmethod render-node :html-element [node] (apply str (map render-node (children node))))
(defmethod render-node :html-comment [_] "")
(defmethod render-node :block-comment [_] "")

(defmethod render-node :directive [node] (str "{{" (:text node) "}}"))
(defmethod render-node :link-definition [_] "")
(defmethod render-node :image-definition [_] "")

(defn- render-children [node]
  (apply str (map render-node (children node))))

(defn- render-blocks
  "Blocks joined by blank lines (or the separator), empty ones dropped."
  ([blocks] (render-blocks blocks "\n\n"))
  ([blocks separator]
   (->> blocks
        (map render-node)
        (filter #(not (str/blank? (str/trim %))))
        (str/join separator))))

(defn to-text
  "Renders a parsed document to plain text: soft hyphens are stripped,
  non-breaking spaces become regular spaces, excess blank lines
  collapse, and the result ends with a single newline."
  [doc]
  (let [text (render-node doc)]
    (-> text
        (str/replace "\u00AD" "")
        (str/replace "\u00A0" " ")
        (str/replace #"\n{3,}" "\n\n")
        (str/replace #"^\n+|\n+$" "")
        (#(if (str/blank? %) % (str % "\n"))))))

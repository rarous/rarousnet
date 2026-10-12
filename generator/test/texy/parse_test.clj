(ns texy.parse-test
  "AST-level parse tests: block structures, inline syntaxes, and the
  heading balancing pass. Nodes are plain maps; assertions select the
  relevant shapes rather than pinning the whole tree."
  (:require [clojure.test :refer [deftest is testing]]
            [texy.core :as core]
            [texy.engine :as engine]))

(defn parse-typed [text]
  (-> (core/parse (core/->texy) text) :content))

(defn types [nodes] (mapv :type nodes))

(defn first-of [nodes t]
  (first (filter #(= t (:type %)) nodes)))

;;-------------------------------------------------- paragraphs

(deftest paragraphs
  (testing "blank lines split paragraphs"
    (is (= [:paragraph :paragraph] (types (parse-typed "one\n\ntwo")))))
  (testing "consecutive lines merge into one paragraph"
    (is (= 1 (count (parse-typed "one\ntwo\nthree")))))
  (testing "a whitespace-indented continuation line is a hard break"
    (let [para (first (parse-typed "one\n  two"))]
      (is (some #(= :line-break (:type %)) (:content para)))))
  (testing "with merge-lines off every newline is a hard break"
    (let [texy (core/->texy {:merge-lines false})
          para (first (:content (core/parse texy "one\ntwo")))]
      (is (some #(= :line-break (:type %)) (:content para)))))
  (testing "trailing modifier becomes the paragraph modifier"
    (let [para (first (parse-typed "text .(title)[cls]"))]
      (is (= {:title "title" :classes ["cls"]} (:modifier para))))))

;;-------------------------------------------------- headings

(deftest headings
  (testing "underlined headings (the level after balancing: a lone
            underlined heading becomes the top level)"
    (is (= :heading (:type (first (parse-typed "Title\n====")))))
    (is (= 1 (:level (first (parse-typed "Title\n====")))))
    (is (= 1 (:level (first (parse-typed "Title\n----"))))))
  (testing "surrounded headings: more # means higher (a lone one is the top)"
    (is (= 1 (:level (first (parse-typed "## Smaller")))))
    (is (= 1 (:level (first (parse-typed "###### Smaller"))))))
  (testing "the underline keeps the heading on one line"
    (is (= "Title" (engine/extract-text (first (parse-typed "Title\n====")))))))
(deftest heading-balancing
  (testing "dynamic balancing ranks underlined levels from top=1"
    ;; underlined ==== is preliminary 2, the only level -> rank 0 + top 1
    (is (= 1 (:level (first (parse-typed "Title\n====")))))
    ;; two underlined levels: ==== -> 1, ---- (preliminary 3) -> 2
    (let [doc (core/parse (core/->texy) "A\n====\n\nB\n----")
          levels (mapv :level (engine/find-nodes doc #(= :heading (:type %))))]
      (is (= [1 2] levels))))
  (testing "surrounded headings shift relative to the highest of them"
    ;; ###### is the highest (preliminary 1) -> h1; ## (preliminary 5) stays h5
    (let [doc (core/parse (core/->texy) "## A\n\n###### B")
          levels (mapv :level (engine/find-nodes doc #(= :heading (:type %))))]
      (is (= [5 1] levels))))
  (testing "fixed leveling shifts by top"
    (let [texy (core/->texy {:fixed-leveling true :top 2})
          doc (core/parse texy "Title\n====")]
      (is (= 4 (:level (first (:content doc))))))))  ; 2 + 2, fixed

;;-------------------------------------------------- lists

(deftest lists
  (testing "unordered list"
    (let [list (first-of (parse-typed "- one\n- two") :list)]
      (is (= :ul (:list-type list)))
      (is (= 2 (count (:items list))))))
  (testing "ordered list with the a) bullet"
    (let [list (first-of (parse-typed "a) one\nb) two") :list)]
      (is (not= :ul (:list-type list)))))
  (testing "13) starts an ordered list at 13"
    (let [list (first-of (parse-typed "13) one\n14) two") :list)]
      (is (= 13 (:start list)))))
  (testing "a lone 13. line is not a list (the 1. bullet is literal, like the reference)"
    (is (nil? (first-of (parse-typed "13. one\n14. two") :list))))
  (testing "nested list inside an item (the indented line continues item one)"
    (let [list (first-of (parse-typed "- one\n  - nested") :list)
          item (first (:items list))]
      (is (some #(= :list (:type %)) (:content item)))))
  (testing "continuation lines belong to the item"
    (let [list (first-of (parse-typed "- one\n  two") :list)
          item (first (:items list))]
      (is (= 1 (count (:items list))))
      (is (= 1 (count (:content item))))
      (is (= "one two" (engine/extract-text item))))))

(deftest definition-lists
  (testing "term followed by an indented description"
    (let [dl (first-of (parse-typed "Chicken:\n  - flightless bird") :definition-list)]
      (is (some? dl))
      (is (= 2 (count (:items dl))))
      (is (:term (first (:items dl))))
      (is (not (some :term (rest (:items dl))))))))

;;-------------------------------------------------- blockquote & hr & code

(deftest blockquotes
  (testing "single line"
    (is (= :blockquote (:type (first (parse-typed "> quoted"))))))
  (testing "continuation lines"
    (is (= 1 (count (parse-typed "> one\n> two")))))
  (testing "nested blockquote"
    (let [bq (first (parse-typed "> outer\n> > inner"))]
      (is (some #(= :blockquote (:type %)) (engine/find-nodes bq #(= :blockquote (:type %))))))))

(deftest horizontal-rules
  (testing "--- and *** are horizontal rules"
    (is (= :horizontal-rule (:type (first (parse-typed "---")))))
    (is (= :horizontal-rule (:type (first (parse-typed "***")))))
    (is (= \- (:marker (first (parse-typed "---")))))))

(deftest fenced-code
  (testing "with language and content"
    (let [cb (first (parse-typed "```clojure\n(def x 1)\n```"))]
      (is (= :code-block (:type cb)))
      (is (= "clojure" (:language cb)))
      (is (= "(def x 1)" (:code cb)))))
  (testing "unclosed fence takes the rest of the input"
    (let [cb (first (parse-typed "```\ncode\n"))]
      (is (= "code" (:code cb))))))

;;-------------------------------------------------- phrases

(defn parse-inline-typed [text]
  (:content (first (parse-typed text))))

(deftest phrases
  (testing "strong and emphasis"
    (is (= "phrase/strong"
           (:syntax (first-of (parse-inline-typed "a **b** c") :phrase))))
    (is (= "phrase/em"
           (:syntax (first-of (parse-inline-typed "a //b// c") :phrase)))))
  (testing "code phrase content is literal (not inline-parsed)"
    (let [code (first-of (parse-inline-typed "a `**b**` c") :phrase)]
      (is (= "phrase/code" (:syntax code)))
      (is (= "**b**" (engine/extract-text code)))))
  (testing "sup/sub short (m^2; subscript needs a non-alnum after)"
    (is (= "phrase/sup-alt"
           (:syntax (first-of (parse-inline-typed "word^2") :phrase))))
    (is (= "phrase/sub-alt"
           (:syntax (first-of (parse-inline-typed "H_2 O") :phrase)))))
  (testing "notexy is raw text"
    (is (= {:type :raw-text :text "<b>raw</b>"}
           (first-of (parse-inline-typed "''<b>raw</b>''") :raw-text))))
  (testing "escaped asterisk"
    (is (some #(= {:type :text :text "*"} %)
              (parse-inline-typed "a \\* b"))))
  (testing "quote phrase >>text<<"
    (is (= "phrase/quote"
           (:syntax (first-of (parse-inline-typed ">>q<<") :phrase))))))

;;-------------------------------------------------- links, images, autolinks

(deftest links
  (testing "phrase with a :link suffix"
    (let [link (first-of (parse-inline-typed "\"check\":https://example.com") :link)]
      (is (= "https://example.com" (:url link)))))
  (testing "quicklink text:[link]"
    (let [link (first-of (parse-inline-typed "see:[https://example.com]") :link)]
      (is (= "https://example.com" (:url link)))))
  (testing "markdown link"
    (let [link (first-of (parse-inline-typed "see [text](https://example.com)") :link)]
      (is (= "https://example.com" (:url link)))
      (is (= "text" (engine/extract-text link))))))

(deftest images
  (testing "plain image with dimensions (inline, inside a sentence)"
    (let [img (first-of (parse-inline-typed "look [* img.jpg 100x200 *] here") :image)]
      (is (= "img.jpg" (:url img)))
      (is (= 100 (:width img)))
      (is (= 200 (:height img)))))
  (testing "modifier title and align"
    (let [img (first-of (parse-inline-typed "look [* img.jpg .(alt text)<] here") :image)]
      (is (= {:title "alt text" :h-align :left} (:modifier img))))))

(deftest figures
  (testing "a line starting with an image is a figure"
    (let [fig (first (parse-typed "[* img.jpg *]"))]
      (is (= :figure (:type fig)))
      (is (= "img.jpg" (get-in fig [:image :url])))))
  (testing "figure with caption (*** separator)"
    (let [fig (first (parse-typed "[* img.jpg *] *** the caption"))]
      (is (= :figure (:type fig)))
      (is (= "the caption" (engine/extract-text {:content (:caption fig)}))))))

(deftest autolinks
  (testing "url autolink"
    (is (= {:type :url :url "https://example.com/path"}
           (first-of (parse-inline-typed "go https://example.com/path now") :url))))
  (testing "www autolink"
    (is (= :url (:type (first-of (parse-inline-typed "see www.example.com") :url)))))
  (testing "email autolink"
    (is (= {:type :email :email "john@example.com"}
           (first-of (parse-inline-typed "mail john@example.com") :email)))))

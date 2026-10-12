(ns texy.custom-syntax-test
  "The extension API: custom line/block syntaxes and custom passes
  (the port's counterpart of the reference's addLineSyntax,
  addBlockSyntax and addPass)."
  (:require [clojure.string :as str]
            [clojure.test :refer [deftest is testing]]
            [texy.core :as core]
            [texy.engine :as engine]
            [texy.passes :as passes]
            [texy.render :as render]))

(defmethod render/render-node :smiley [_]
  [[:span {:class "smiley"} ":-)"]])

(def smiley-texy
  (core/add-line-syntax (core/->texy) "smiley" #":-?\)"
                        (fn [_ _] {:type :smiley})))

(def refusing-texy
  (core/add-line-syntax (core/->texy) "smiley" #":-?\)"
                        (fn [_ _] nil)))

(def note-texy
  (core/add-block-syntax (core/->texy) "note" "^NOTE:[ \t]+(.+)$"
                         (fn [ctx groups]
                           {:type :paragraph
                            :content (engine/parse-inline ctx (second groups))
                            :modifier nil})))

(def upper-pass
  (fn [doc]
    (passes/transform-nodes
      #(if (= :text (:type %)) (update % :text str/upper-case) %)
      doc)))

(def not-strong-texy
  (core/add-line-syntax (core/->texy) "not-strong" #"\*\*"
                        (fn [_ _] {:type :text :text "__"})))

(deftest custom-line-syntax
  (testing "the handler's node renders through the render multimethod"
    (is (= "<p>hi <span class=\"smiley\">:-)</span>!</p>"
           (core/process smiley-texy "hi :)!"))))
  (testing "returning nil refuses the match, the text stays plain"
    (is (= "<p>hi :)!</p>"
           (core/process refusing-texy "hi :)!")))))

(deftest custom-block-syntax
  (testing "a NOTE: line becomes a paragraph (block handler)"
    (is (= "<p>see this</p><p>regular</p>"
           (core/process note-texy "NOTE: see this\n\nregular")))))

(deftest custom-pass
  (testing "a document -> document pass runs after the built-in passes"
    (let [texy (core/add-pass (core/->texy) upper-pass)]
      (is (= "<p>HELLO <strong>WORLD</strong></p>"
             (core/process texy "hello **world**"))))))

(deftest custom-syntaxes-compose-with-the-built-ins
  (testing "at the same offset a longer built-in match still wins"
    (is (= "<p>a <strong>b</strong> c</p>"
           (core/process not-strong-texy "a **b** c")))))

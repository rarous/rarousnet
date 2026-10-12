(ns texy.dom-test
  "The jsoup well-forming facade: protection of tag-free raw blobs,
  repair of the global tag stream, raw script islands, attribute
  fidelity. Escaping is identity here - the entity-preservation
  property of the placeholder is what matters; the full escaping
  round trip is covered by the render tests.

  The repair semantics are HTML5 tree construction (jsoup), which is
  what this phase uses INSTEAD of the reference's WellFormer - see the
  README Deviations: formatting elements reconstruct across
  paragraphs, crossed tags nest per the adoption agency, script
  content stays raw until its real close tag."
  (:require [clojure.test :refer [deftest is testing]]
            [huff2.core :as huff]
            [texy.dom :as dom]))

(def identity-html identity)
(def identity-attr identity)

(defn wellform
  ([forms] (wellform forms identity-html identity-attr))
  ([forms escape-html escape-attr]
   (vec (dom/wellform forms escape-html escape-attr))))

(deftest raw-blobs-without-tags-survive-verbatim
  (testing "the e-mail obfuscation entity survives the parse round trip"
    (is (= [(huff/raw "dave&#64;<!-- -->example.com")]
           (wellform [(huff/raw "dave&#64;<!-- -->example.com")]))))
  (testing "comment payloads survive"
    (is (= [(huff/raw "<!-- a -- b -->")]
           (wellform [(huff/raw "<!-- a -- b -->")]))))
  (testing "display text around a protected blob keeps its structure"
    (is (= ["pre " (huff/raw "&#64;") " post"]
           (wellform ["pre " (huff/raw "&#64;") " post"])))))

(deftest structural-raws-are-parsed-and-repaired
  (testing "an unclosed inline tag closes at its paragraph and reconstructs in the next one
            (HTML5 formatting-element reconstruction, not the reference's drop)"
    (is (= [[:p [:b "bold"]] [:p [:b "next"]]]
           (wellform [[:p (huff/raw "<b>bold")] [:p "next"]]))))
  (testing "crossed tags nest per the adoption agency"
    (is (= [[:div [:i "a" [:b "b"]]]]
           (wellform [[:div (huff/raw "<i>a<b>b</i></b>")]]))))
  (testing "nested forms drop the inner form, content stays"
    (is (= [[:form "a" "b"]]
           (wellform [[:form "a" [:form "b"]]])))))

(deftest script-and-style-islands-stay-raw
  (testing "script content is not parsed or escaped"
    (is (= [[:script (huff/raw "if (a<b) write('<img src=x>');")]]
           (wellform [[:script (huff/raw "if (a<b) write('<img src=x>');")]])))))

(deftest attribute-fidelity
  (testing "attribute order and values are preserved, keys come back keywords"
    (is (= [[:p {:b "2" :a "1"} "x"]]
           (wellform [[:p {:b "2" :a "1"} "x"]]))))
  (testing "an empty attribute value stays (huff omits plain empty values)"
    (is (= [[:img {:alt (huff/raw "") :src "x"}]]
           (wellform [[:img {:alt (huff/raw "") :src "x"}]]))))
  (testing "text and attribute values round trip through the passed
            escaping fns (inputs are pre-escaped, as the renderers emit)"
    (let [esc-html (fn [s] (-> s (clojure.string/replace "&" "&amp;")
                                (clojure.string/replace "<" "&lt;")
                                (clojure.string/replace ">" "&gt;")))
          esc-attr (fn [s] (-> s (clojure.string/replace "&" "&amp;")
                                (clojure.string/replace "<" "&lt;")
                                (clojure.string/replace ">" "&gt;")
                                (clojure.string/replace "\"" "&quot;")))]
      (is (= [[:p {:title "&quot;t&quot;"} "&lt;t&gt;"]]
             (wellform [[:p {:title "&quot;t&quot;"} "&lt;t&gt;"]] esc-html esc-attr))))))

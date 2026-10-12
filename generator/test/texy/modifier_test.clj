(ns texy.modifier-test
  "Modifier .(title)[class]{style}<>^ parsing: the instaparse-structured
  parts and the trailing-modifier extraction."
  (:require [clojure.test :refer [deftest is testing]]
            [texy.modifier :as mod]))

(deftest parse-parts
  (testing "title"
    (is (= {:title "Hello world"} (mod/parse "(Hello world)"))))
  (testing "title with an escaped close paren: \\) unescapes, \\( stays"
    (is (= {:title "a\\(b"} (mod/parse "(a\\(b)")))
    (is (= {:title "a)b"} (mod/parse "(a\\)b)"))))
  (testing "classes and id (the #id token lives inside the brackets)"
    (is (= {:classes ["foo" "bar"] :id "main"} (mod/parse "[foo bar #main]"))))
  (testing "styles keep their order"
    (is (= {:styles (array-map "color" "red" "text-align" "center")}
           (mod/parse "{color:red; text-align:center}"))))
  (testing "aligns"
    (is (= {:h-align :left} (mod/parse "<")))
    (is (= {:h-align :right} (mod/parse ">")))
    (is (= {:h-align :center} (mod/parse "<>")))
    (is (= {:h-align :justify} (mod/parse "=")))
    (is (= {:v-align :top} (mod/parse "^")))
    (is (= {:v-align :middle} (mod/parse "-")))
    (is (= {:v-align :bottom} (mod/parse "_"))))
  (testing "parts combine in any order"
    (is (= {:title "T" :classes ["a"] :h-align :left}
           (mod/parse "[a]<(T)"))))
  (testing "invalid input yields nil"
    (is (nil? (mod/parse "*")))
    (is (nil? (mod/parse nil)))
    (is (nil? (mod/parse "")))))

(deftest extract-trailing
  (testing "plain modifier (bound 3)"
    (is (= [{:title "T" :classes ["c"]} "text"]
           (mod/extract "text .(T)[c]")))
    ;; a modifier requires a space (or line start) before the dot
    (is (nil? (mod/extract "text.(T)")))
    (is (nil? (mod/extract "plain text"))))
  (testing "with aligns (bound 4)"
    (is (= [{:classes ["a" "b" "c"] :h-align :left} "text"]
           (mod/extract "text .[a][b][c]<" 4)))
    ;; at bound 3 the run of four parts cannot match the end anchor at all
    (is (nil? (mod/extract "text .[a][b][c]<" 3))))
  (testing "the modifier may start a line"
    (is (= [{:title "T"} ""] (mod/extract ".(T)")))))

(deftest decorate
  (testing "hiccup attribute rendering"
    (is (= {:title "T" :class "a b" :style "color:red;text-align:left"}
           (mod/decorate {:title "T" :classes ["a" "b"]
                          :styles (array-map "color" "red") :h-align :left})))
    (is (= {} (mod/decorate nil)))
    (is (= {:id "x"} (mod/decorate {:id "x"})))))

(deftest style-parts
  (testing "{name: value} pairs split into attributes and styles (ElAttrs)"
    (is (= {:attrs {"alt" "alternative" "title" "T"} :styles {"color" "red"}}
           (select-keys (mod/parse "{alt:alternative; title:T; color:red}")
                        [:attrs :styles]))))
  (testing "data- and aria- prefixed names are attributes"
    (is (= {:attrs {"data-x" "1" "aria-label" "L"}}
           (select-keys (mod/parse "{data-x:1; aria-label:L}") [:attrs :styles]))))
  (testing "attribute names are case-insensitive, styles keep no empty values"
    (is (= {:attrs {"lang" "cs"} :styles {"color" "red"}}
           (select-keys (mod/parse "{LANG:cs; color:red; width:}") [:attrs :styles]))))
  (testing "attrs render as element attributes via decorate"
    (is (= {:alt "alternative" :style "color:red"}
           (mod/decorate {:attrs {"alt" "alternative"} :styles (array-map "color" "red")})))))

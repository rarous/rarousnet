(ns texy.typography-test
  "The typography module: locale quotes, dashes, ellipsis, non-breaking
  spaces, and the TextRunPass contract - markup is protected by the
  marker image, code and URLs are opaque, and disabled typography
  leaves the text alone. Expectations verified against the PHP
  reference."
  (:require [clojure.test :refer [deftest is testing]]
            [texy.core :as core]))

(defn html
  ([text] (html text {}))
  ([text opts]
   (core/process (core/->texy opts) text)))

(deftest quotes-per-locale
  (testing "the default locale is cs (German-style low quotes)"
    (is (= "<p>He said \u201Ehello\u201C and \u201Aworld\u2018</p>"
           (html "He said \"hello\" and 'world'"))))
  (testing "fr: guillemets with the inner level in singleQuotes"
    (is (= "<p>He said \u00ABhello\u00BB and \u2039world\u203A</p>"
           (html "He said \"hello\" and 'world'" {:typography-locale "fr"}))))
  (testing "en: curly quotes"
    (is (= "<p>He said \u201Chello\u201D and \u2018world\u2019</p>"
           (html "He said \"hello\" and 'world'" {:typography-locale "en"}))))
  (testing "an unknown locale falls back to English, like the reference"
    (is (= "<p>He said \u201Chello\u201D</p>"
           (html "He said \"hello\"" {:typography-locale "xx"})))))

(deftest dashes-ellipsis-dimensions
  (testing "en dash, em dash, ellipsis, dimension sign"
    (is (= "<p>a\u00A0\u2013 b \u2026 1978\u00A0\u2013 x</p>" (html "a -- b ... 1978 - x")))
    (is (= "<p>123\u00A0\u00D7\u00A0456</p>" (html "123 x 456")))))

(deftest protected-content
  (testing "code phrases are protected from typography"
    (is (= "<p>code <code>a--b</code> stays</p>" (html "code `a--b` stays"))))
  (testing "intermarkup space is removed before a comment marker"
    (is (= "<p>x<!-- c --> y</p>" (html "x <!-- c --> y"))))
  (testing "text between markup keeps its spaces"
    (is (= "<p><strong>b</strong> and <strong>c</strong></p>" (html "**b** and **c**")))))

(deftest disabled-typography
  (testing ":typography false leaves the text untouched"
    (is (= "<p>a -- b ...</p>" (html "a -- b ..." {:typography false})))))

(deftest apply-typography-api
  (testing "the reference applyTypography: normalize + typo, no parsing"
    (is (= "x\u00A0\u2013 y \u2026" (core/apply-typography (core/->texy) "x -- y ..."))))
  (testing "it honours the locale option and the typography flag"
    (is (= "\u00ABhi\u00BB" (core/apply-typography (core/->texy) "\"hi\"" {:locale "fr"})))
    (is (= "\"hi\"" (core/apply-typography (core/->texy {:typography false}) "\"hi\"")))))

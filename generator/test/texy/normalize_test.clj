(ns texy.normalize-test
  "Port of Texy::normalize behaviors: line endings, control characters,
  line trimming, blank line trimming, BOM; idempotence."
  (:require [clojure.test :refer [deftest is testing]]
            [clojure.string :as str]
            [texy.normalize :as normalize]))

(deftest line-endings
  (testing "line endings are converted to unix-like"
    (is (= "a\nb\nc" (normalize/normalize "a\r\nb\rc")))))

(deftest control-characters
  (testing "control characters are stripped (DEL survives, like the reference); tab and newline survive"
    (is (= "a\u007F\tb\nc" (normalize/normalize "a\u0001\u007F\tb\u000B\nc")))))

(deftest line-trimming
  (testing "lines are right-trimmed"
    (is (= "a\nb" (normalize/normalize "a \t \nb \t"))))
  (testing "blank lines at both ends are dropped"
    (is (= "a\n\nb" (normalize/normalize "\n\n\na\n\nb\n\n\n")))))

(deftest bom
  (testing "byte order mark at the start is removed"
    (is (= "abc" (normalize/normalize "\uFEFFabc")))))

(deftest idempotence
  (testing "normalize is idempotent"
    (let [s "Hello\r\nworld...\t\t\n\n\rSecond\u0002part\n\n\n"]
      (is (= (normalize/normalize s) (normalize/normalize (normalize/normalize s)))))))

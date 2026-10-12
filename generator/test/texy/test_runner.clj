(ns texy.test-runner
  "clojure.test entry point: runs all test namespaces and exits nonzero on
  failure (the bundled clojure.test has no -main)."
  (:require [clojure.test :as test]
            [texy.normalize-test]
            [texy.modifier-test]
            [texy.parse-test]
            [texy.render-test]
            [texy.custom-syntax-test]
            [texy.directive-test]
            [texy.dom-test]
            [texy.typography-test]
            [texy.blog-setup-test]
            [texy.conformance-test]))

(defn -main [& _]
  (let [{:keys [fail error]} (apply test/run-tests
                                    (map find-ns '[texy.normalize-test
                                                   texy.modifier-test
                                                   texy.parse-test
                                                   texy.render-test
                                                   texy.custom-syntax-test
                                                   texy.directive-test
                                                   texy.dom-test
                                                   texy.typography-test
                                                   texy.blog-setup-test
                                                   texy.conformance-test]))]
    (System/exit (if (zero? (+ fail error)) 0 1))))

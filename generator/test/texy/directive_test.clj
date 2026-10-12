(ns texy.directive-test
  "The {{script}} directive syntax and its handler registration (the
  reference's DirectiveModule: addDirective / setFallback)."
  (:require [clojure.test :refer [deftest is testing]]
            [texy.core :as core]
            [texy.modules :as modules]))

(deftest parse-directive-content
  (testing "the three content forms"
    (is (= {:name "note" :value nil :args []}
           (modules/parse-directive-content "note")))
    (is (= {:name "note" :value "a, b" :args ["a" "b"]}
           (modules/parse-directive-content "note: a, b")))
    (is (= {:name "note" :value "a, b" :args ["a" "b"]}
           (modules/parse-directive-content "note(a, b)")))
    (is (= {:name "note" :value "a;b" :args ["a" "b"]}
           (modules/parse-directive-content "note: a;b" ";"))))
  (testing "a non-name-like content is the whole name"
    (is (= {:name "some random text" :value nil :args []}
           (modules/parse-directive-content "some random text")))))

(defn- text-node [& strs]
  {:type :text :text (clojure.string/join strs)})

(deftest named-directive-handlers
  (testing "a handler's node replaces the directive"
    (let [texy (core/add-directive (core/->texy) "hello"
                                   (fn [_ _ _] (text-node "Hello!")))]
      (is (= "<p>say Hello! now</p>" (core/process texy "say {{hello}} now")))))
  (testing "the name is matched case-insensitively; the handler sees value and args"
    (let [seen (atom [])
          texy (core/add-directive (core/->texy) "note"
                                   (fn [value args _]
                                     (swap! seen conj [value args])
                                     (text-node "N")))]
      (is (= "<p>a N b</p>" (core/process texy "a {{Note: x, y}} b")))
      (is (= [["x, y" ["x" "y"]]] @seen))))
  (testing "returning nil removes the directive"
    (let [texy (core/add-directive (core/->texy) "noop" (fn [_ _ _] nil))]
      (is (= "<p>gone</p>" (core/process texy "{{noop}}gone"))))))

(deftest texy-directive-is-consumed-into-meta
  (let [doc (core/parse (core/->texy) "{{texy: one, two}}\n\ntext")]
    ;; typography (the default) also marks the document typographed
    (is (= {"one" true "two" true :typographed true} (:meta doc)))
    (is (= "<p>text</p>" (core/process (core/->texy) "{{texy: one, two}}\n\ntext")))))

(deftest fallback-directive-handler
  (testing "set-fallback-directive handles unregistered directives"
    (let [texy (core/set-fallback-directive
                (core/->texy)
                (fn [value _ node]
                  (let [name (:name (modules/parse-directive-content (:text node)))]
                    (text-node (clojure.string/upper-case name) ":" value))))]
      (is (= "<p>NOTE:x</p>" (core/process texy "{{note: x}}"))))))

(deftest unhandled-directives-stay-literal
  (is (= "<p>{{note: x}}</p>" (core/process (core/->texy) "{{note: x}}"))))

(deftest directive-matching-is-lazy
  (testing "a directive closes at the first }}, it never spans a later one"
    (is (= "<p>{{ texy }} x </p>"
           (core/process (core/->texy) "{{ texy }} x {{ texy (test) }}")))))

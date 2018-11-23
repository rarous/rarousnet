(ns rarousnet.weblog.handler-test
  (:require [clojure.test :refer [testing is are deftest]]
            [rarousnet.weblog.handler :as sut]))

(deftest permalink
  (testing "Should create absolute url permalink"
    (is (= (sut/permalink {:id 1 :url "test"})
           "https://www.rarous.net/weblog/1-test.aspx"))))

(deftest rel-link
  (testing "Should create relative url link"
    (is (= (sut/rel-link {:id 1 :url "test"})
           "/weblog/1-test.aspx"))))

(deftest author-twitter
  (testing "Should convert author name to twitter handle"
    (is (= (sut/author-twitter {:author "Aleš Roubíček"})
           "@alesroubicek"))
    (is (= (sut/author-twitter {:author "Alessio Busta"})
           "@alessiobusta"))
    (is (= (sut/author-twitter {:author "Other"})
           nil))))

(deftest categhory
  (testing "Should get category listing"
    (is (= (:status (sut/category "skola.aspx" {}))
           200)))
  (testing "Should not render unknown category"
    (is (= (sut/category "" {})
           nil))))

(deftest index
  (testing "Should render index"
    (is (= (:status (sut/index {}))
           200))))

(deftest blogpost
  (testing "Should render article"
    (is (= (:status (sut/blogpost "1-vitejte.aspx" {}))
           200)))
  (testing "Should not render unknown article"
    (is (= (sut/blogpost "" {})
           nil))))

(deftest rss
  (testing "Should render RSS feed"
    (is (= (:status (sut/rss))
           200))))

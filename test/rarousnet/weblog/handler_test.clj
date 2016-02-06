(ns rarousnet.weblog.handler-test
  (:require [clojure.test :refer [testing is are]]
            [rarousnet.weblog.handler :as sut]))

(testing "Should create absolute url permalink"
  (is (= (sut/permalink {:id 1 :url "test"})
        "http://www.rarous.net/weblog/1-test.aspx")))

(testing "Should create relative url link"
  (is (= (sut/rel-link {:id 1 :url "test"})
        "/weblog/1-test.aspx")))

(testing "Should convert author name to twitter handle"
  (is (= (sut/author-twitter {:author "Aleš Roubíček"})
        "@alesroubicek"))
  (is (= (sut/author-twitter {:author "Alessio Busta"})
        "@alessiobusta"))
  (is (= (sut/author-twitter {:author "Other"})
        nil)))

(testing "Should get category listing"
  (is (= (sut/category "" {})
        nil))
  (is (= (:status (sut/category "skola.aspx" {}))
        200)))

(testing "Should render index"
  (is (= (:status (sut/index {}))
        200)))

(testing "Should render article"
  (is (= (sut/blogpost "" {})
        nil))
  (is (= (:status (sut/blogpost "1-vitejte.aspx" {}))
        200)))

(testing "Sould render RSS feed"
  (is (= (:status (sut/rss))
        200)))

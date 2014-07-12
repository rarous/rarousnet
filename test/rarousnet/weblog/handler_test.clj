(ns rarousnet.weblog.handler-test
  (:use midje.sweet)
  (:require [rarousnet.weblog.handler :as sut]))

(fact "Should create absolute url permalink"
      (sut/permalink {:id 1 :url "test"}) => "http://www.rarous.net/weblog/1-test.aspx")

(fact "Should create relative url link"
      (sut/rel-link {:id 1 :url "test"}) => "/weblog/1-test.aspx")

(fact "Should convert author name to twitter handle"
      (sut/author-twitter {:author "Aleš Roubíček"}) => "@alesroubicek"
      (sut/author-twitter {:author "Alessio Busta"}) => "@alessiobusta"
      (sut/author-twitter {:author "Other"}) => nil)

(fact "Should get category listing"
      (sut/category "" {}) => nil
      (sut/category "skola.aspx" {}) => (contains {:status 200}))

(fact "Should render index"
      (sut/index {}) => (contains {:status 200}))

(fact "Should render article"
      (sut/blogpost "" {}) => nil
      (sut/blogpost "1-vitejte.aspx" {}) => (contains {:status 200}))

(fact "Sould render RSS feed"
      (sut/rss) => (contains {:status 200}))

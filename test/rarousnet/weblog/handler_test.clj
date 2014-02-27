(ns rarousnet.weblog.handler-test
  (:use midje.sweet)
  (:require [rarousnet.weblog.handler :as sut :refer :all]))

(fact "Should create absolute url permalink"
      (sut/permalink {:id 1 :url "test"}) => "http://rarous.net/weblog/1-test.aspx")

(fact "Should convert author name to twitter handle"
      (sut/author-twitter {:author "Aleš Roubíček"}) => "@alesroubicek"
      (sut/author-twitter {:author "Alessio Busta"}) => "@alessiobusta"
      (sut/author-twitter {:author "Other"}) => nil)

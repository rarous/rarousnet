(ns rarousnet.home.handler
  (:use net.cgrand.enlive-html)
  (:require [compojure.core :refer [defroutes GET]]
            [clojure.java.io :as io]
            [ring.util.response :as resp]))

(deftemplate home-template "home/index.html" [])

(defn view [template]
    (apply str (template)))

(defn home []
  (resp/charset {:status 200
                 :headers {"Content-Type" "text/html"}
                 :body (view home-template)} "UTF-8"))

(defroutes routes
  (GET "/" [] (home)))

(ns rarousnet.home.handler
  (:use net.cgrand.enlive-html)
  (:require [compojure.core :refer [defroutes GET]]
            [ring.util.response :refer [charset]]))

(deftemplate home-template "home/index.html" [])
(deftemplate webdesign-template "home/webdesign.html" [])

(defn view [template]
    (apply str (template)))

(defn render [template]
  (-> {:status 200
       :headers {"Content-Type" "text/html"}
       :body (view template)}
      (charset "UTF-8")))

(defn home [] (render home-template))
(defn webdesign [] (render webdesign-template))

(defroutes routes
  (GET "/" [] (home))
  (GET "/webdesign/" [] (webdesign)))

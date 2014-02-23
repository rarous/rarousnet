(ns rarousnet.weblog.handler
  (:use net.cgrand.enlive-html)
  (:require [clojure.java.io :as io]
            [compojure.core :refer [defroutes GET]]
            [ring.util.response :refer [charset]]))

(def articles (read-string (slurp (io/resource "articles.edn"))))
(defn load-article [url]
  ((keyword url) articles))

(deftemplate index-template "weblog/index.html" [])
(deftemplate blogpost-template "weblog/blogpost.html" [article]
  [:title] (content (:title article))
  [:article :h1] (content (:title article))
  [:article :div.content] (html-content (:html article)))

(defn render-view [template]
  (-> {:status 200
       :headers {"Content-Type" "text/html"}
       :body (apply str template)}
      (charset "UTF-8")))

(defn index []
  (render-view (index-template)))

(defn blogpost [url]
  (some-> (load-article url)
          blogpost-template
          render-view))

(defroutes routes
  (GET "/weblog/" [] (index))
  (GET "/weblog/:url" [url] (blogpost url)))

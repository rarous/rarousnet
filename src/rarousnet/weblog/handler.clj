(ns rarousnet.weblog.handler
  (:use net.cgrand.enlive-html
        clj-time.coerce
        clj-time.format
        clj-time.local)
  (:require [clojure.java.io :as io]
            [compojure.core :refer [defroutes GET]]
            [ring.util.response :refer [charset]]))

(def articles (read-string (slurp (io/resource "articles.edn"))))
(defn load-article [url]
  ((keyword url) articles))

(def utc-format (formatters :basic-date-time))
(def long-date-format
  (-> (formatter "HH.mm - d. MMMM yyyy")
      (with-locale (new java.util.Locale "cs"))))
(defn permalink [article]
  (str "http://rarous.net/weblog/" (:id article) "-" (:url article) ".aspx"))

(deftemplate index-template "weblog/index.html" [])
(deftemplate blogpost-template "weblog/blogpost.html" [article]
  [:title] (content (get article :title))
  [[:meta (attr= :name "author")]] (set-attr :content (get article :author))
  [[:meta (attr= :name "description")]] (set-attr :content (get article :description))
  [[:link (attr= :rel "canonical")]] (set-attr :href (permalink article))
  [:article :h1] (content (get article :title))
  [:article :div.entry-content] (html-content (get article :html))
  [:article :p.info :strong] (content (get article :category))
  [:article :strong.user] (content (get article :author))
  [:article (attr= :rel "bookmark")] (set-attr :href (permalink article))
  [:article :p.info :time.published] (content (->> (get article :published)
                                                   from-date
                                                   (unparse long-date-format)))
  [:article :p.info :time.published] (set-attr :datetime (->> (get article :published)
                                                              from-date
                                                              (unparse utc-format))))

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

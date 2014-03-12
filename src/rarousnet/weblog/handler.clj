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
  (str "http://www.rarous.net/weblog/" (:id article) "-" (:url article) ".aspx"))
(defn author-twitter [article]
  (let [author (get article :author)]
    (condp = author
      "Aleš Roubíček" "@alesroubicek"
      "Alessio Busta" "@alessiobusta"
      nil)))

(deftemplate index-template "weblog/index.html" [])
(deftemplate rss-template "weblog/index.rss" [])
(deftemplate comments-rss-template "weblog/comments.rss" [])
(deftemplate blogpost-template "weblog/blogpost.html" [article]
  [:title] (content (get article :title))
  [[:meta (attr= :name "author")]] (set-attr :content (get article :author))
  [[:meta (attr= :name "description")]] (set-attr :content (get article :description))
  [[:meta (attr= :property "twitter:author")]] (set-attr :content (author-twitter article))
  [[:meta (attr= :property "twitter:title")]] (set-attr :content (get article :title))
  [[:meta (attr= :property "twitter:description")]] (set-attr :content (get article :description))
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

(defn render-feed [template]
  (-> {:status 200
       :headers {"Content-Type" "application/xml"}
       :body (apply str template)}
      (charset "UTF-8")))

(defn index []
  (render-view (index-template)))

(defn rss []
  (render-feed (rss-template)))

(defn comments-rss []
  (render-feed (comments-rss-template)))

(defn redirect-to-rss-feed []
   {:status 301
    :headers {"Location" "http://feeds.feedburner.com/rarous-weblog"}})

(defn blogpost [url]
  (some-> (load-article url)
          blogpost-template
          render-view))

(defroutes routes
  (GET "/weblog/" [] (index))
  (GET "/feed/rss.ashx" [] (rss))
  (GET "/feed/comments.ashx" [] (comments-rss))
  (GET "/ws/syndikace.asmx/rss" [] (redirect-to-rss-feed))
  (GET "/weblog/:url" [url] (blogpost url)))

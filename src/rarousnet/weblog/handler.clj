(ns rarousnet.weblog.handler
  (:use net.cgrand.enlive-html
        clj-time.coerce
        clj-time.format
        clj-time.local)
  (:require [clojure.java.io :as io]
            [compojure.core :refer [defroutes GET]]
            [ring.util.response :refer [charset]]))

(def blog-url "http://www.rarous.net/weblog/")
(defn read-resource [n] (read-string (slurp (io/resource n))))
(def articles (read-resource "articles.edn"))
(def categories (read-resource "rubrics.edn"))
(defn load-article [url] (get articles (keyword url)))
(defn load-category [url] (get categories (keyword url)))
(defn last-articles [n]
  (->> (vals articles)

       (sort-by :id)
       (reverse)
       (take n)))

(def long-date-format
  (with-locale
    (formatter "HH.mm - d. MMMM yyyy")
    (new java.util.Locale "cs")))
(def utc-format (formatters :basic-date-time))
(def rss-format (formatter "EEE, d MMM yyyy HH:mm:ss Z"))
(defn utc-date [article]
  (->> (get article :published)
       from-date
       (unparse utc-format)))
(defn long-date [article]
  (->> (get article :published)
       from-date
       (unparse long-date-format)))
(defn rss-date [article]
  (->> (get article :published)
       from-date
       (unparse rss-format)))

(defn permalink [article]
  (str blog-url (article :id) "-" (article :url) ".aspx"))
(defn author-twitter [article]
  (let [author (article :author)]
    (case author
      "Aleš Roubíček" "@alesroubicek"
      "Alessio Busta" "@alessiobusta"
      nil)))

(defn meta-n [name] [:meta (attr= :name name)])
(defn meta-p [name] [:meta (attr= :property name)])
(defn itemprop [name] (attr= :itemprop name))
(defn link [rel] [:link (attr= :rel rel)])

(deftemplate index-template "weblog/index.html" [articles]
  [:#content :article] (clone-for [article articles]
                                  [:article :header (itemprop "name") :a] (content (article :title))
                                  [:article :header (itemprop "name") :a] (set-attr :href (permalink article))
                                  [:article (itemprop "articleBody")] (html-content (article :html))
                                  [:article (itemprop "articleSection")] (content (article :category))
                                  [:article (itemprop "author") (itemprop "name")] (content (article :author))
                                  [:article (itemprop "url")] (set-attr :href (permalink article))
                                  [:article (itemprop "datePublished")] (content (long-date article))
                                  [:article (itemprop "datePublished")] (set-attr :datetime (utc-date article))))

(deftemplate rss-template "weblog/index.rss" [articles]
  [:item] (clone-for [article articles]
                     [:author] (content (article :author))
                     [:title] (content (article :title))
                     [:guid] (content (permalink article))
                     [:link] (content (permalink article))
                     [:pubDate] (content (rss-date article))
                     [:description] (content (article :description))
                     [:category] (content (article :category))))

(deftemplate comments-rss-template "weblog/comments.rss" [])
(deftemplate blogpost-template "weblog/blogpost.html" [article]
  [:title] (content (article :title))
  [(meta-n "author")] (set-attr :content (article :author))
  [(meta-n "description")] (set-attr :content (article :description))
  [(meta-n "twitter:creator")] (set-attr :content (author-twitter article))
  [(meta-n "twitter:title")] (set-attr :content (article :title))
  [(meta-n "twitter:description")] (set-attr :content (article :description))
  [(meta-p "article:published_time")] (set-attr :content (utc-date article))
  [(meta-p "article:section")] (set-attr :content (article :category))
  [(link "canonical")] (set-attr :href (permalink article))
  [(link "category")] (set-attr :href (article :category-url))
  [:article :header (itemprop "name")] (content (article :title))
  [:article (itemprop "articleBody")] (html-content (article :html))
  [:article (itemprop "articleSection")] (content (article :category))
  [:article (itemprop "author") (itemprop "name")] (content (article :author))
  [:article (itemprop "url")] (set-attr :href (permalink article))
  [:article (itemprop "datePublished")] (content (long-date article))
  [:article (itemprop "datePublished")] (set-attr :datetime (utc-date article)))

(deftemplate category-template "weblog/category.html" [articles]
  [:title] (content (str "Rubrika " (:category (first articles))))
  [(link "canonical")] (set-attr :href (str blog-url (:category-url (first articles))))
  [:#content :h2] (content (:category (first articles)))
  [:#content :ul [:li first-of-type]] (clone-for [{:keys [title url id]} articles]
                                                 [:li :a] (content title)
                                                 [:li :a] (set-attr :href (permalink {:url url :id id}))))

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

(defn moved-permanently [location]
  {:status 301
   :headers {"Location" location}})

(defn index []
  (->> (last-articles 5)
       index-template
       render-view))

(defn rss []
  (->> (last-articles 10)
       rss-template
       render-view))

(defn comments-rss []
  (render-feed (comments-rss-template)))

(defn redirect-to-rss-feed []
  (moved-permanently "http://feeds.feedburner.com/rarous-weblog"))

(defn redirect-to-blogpost [url]
  (moved-permanently (str "http://www.rarous.net/weblog/" url)))

(defn blogpost [url]
  (some-> (load-article url)
          blogpost-template
          render-view))

(defn category [url]
  (some-> (load-category url)
          reverse
          category-template
          render-view))

(defroutes routes
  (GET "/weblog/" [] (index))
  (GET "/weblog/:url" [url]
       (if (Character/isDigit (first url))
         (blogpost url)
         (category url)))
  (GET "/feed/rss.ashx" [] (rss))
  (GET "/feed/comments.ashx" [] (comments-rss))

  (GET "/ws/syndikace.asmx/rss" [] (redirect-to-rss-feed))
  (GET "/ws/Syndikace.asmx/Rss" [] (redirect-to-rss-feed))
  (GET "/ws/syndikace.asmx/Rss" [] (redirect-to-rss-feed))
  (GET "/clanek/:url" [url] (redirect-to-blogpost url))
  (GET "/rubrika/:url" [url] (redirect-to-blogpost (subs url (inc (.indexOf url "-")))))
  (GET "/weblog" [] (redirect-to-blogpost ""))
  (GET "/weblog/429-test-driven-developemt-pribeh-nezbedneho-vyvojare.aspx" []
       (moved-permanently "/weblog/429-test-driven-development-pribeh-nezbedneho-vyvojare.aspx")))


(ns rarousnet.weblog.handler
  (:require [clj-time.core :as t]
            [clj-time.coerce :refer [from-date]]
            [clj-time.format :refer [formatter unparse with-locale formatters]]
            [clojure.core.reducers :as r]
            [clojure.java.io :as io]
            [cognitect.transit :as transit]
            [compojure.core :refer [defroutes GET]]
            [net.cgrand.enlive-html :refer [defsnippet deftemplate] :as html]
            [ring.util.response :refer [charset]])
  (:import [java.util Locale]))

(def blog-relative-url "/weblog/")
(def blog-url (str "http://www.rarous.net" blog-relative-url))

(defn- read-resource [n]
  (with-open [in (io/input-stream (io/resource n))]
    (transit/read (transit/reader in :msgpack))))
(def articles (read-resource "articles.mp"))
(def categories (read-resource "rubrics.mp"))

(defn load-article [url] (get articles (keyword url)))

(defn last-articles [n]
  (->> (vals articles)
       (sort-by :id)
       (take-last n)
       (reverse)))

(defn load-category [url]
  (let [category-items (get categories (keyword url))
        title (:category (first category-items))
        years (->> category-items
                   (group-by (comp t/year from-date :published))
                   (map (partial zipmap [:year :articles]))
                   (sort-by :year >))]
    (if title {:title title, :url url, :years years} nil)))

(def long-date-format
  (with-locale (formatter "HH.mm - d. MMMM yyyy") (Locale. "cs")))
(def short-date-format
  (with-locale (formatter "MMM d") (Locale. "cs")))
(def utc-format (formatters :basic-date-time))
(def rss-format (formatter "EEE, d MMM yyyy HH:mm:ss Z"))
(defn utc-date [d]
  (unparse utc-format (from-date d)))
(defn long-date [d]
  (unparse long-date-format (from-date d)))
(defn short-date [d]
  (unparse short-date-format (from-date d)))
(defn rss-date [d]
  (unparse rss-format (from-date d)))

(defn permalink [{:keys [id url]}]
  (str blog-url id "-" url ".aspx"))
(defn rel-link [{:keys [id url]}]
  (str blog-relative-url id "-" url ".aspx"))
(defn author-twitter [{:keys [author]}]
  (case author
    "Aleš Roubíček" "@alesroubicek"
    "Alessio Busta" "@alessiobusta"
    nil))

(defn- meta-n [name] [:meta (html/attr= :name name)])
(defn- meta-p [name] [:meta (html/attr= :property name)])
(defn- itemprop [name] (html/attr= :itemprop name))
(defn- itemtype [name] (html/attr= :itemtype (str "http://schema.org/" name)))
(defn- microdata
  ([type prop] [(itemtype type) (itemprop prop)])
  ([type subtype prop] [(itemtype type) (itemtype subtype) (itemprop prop)]))
(defn- link [rel] [:link (html/attr= :rel rel)])
(defn- script [src] [:script (html/attr= :src src)])

(defsnippet article-listing "weblog/index.html" [:#content :article]
  [{:keys [title author category html published] :as article}]
  (conj (microdata "BlogPosting" "name") :a) (html/do->
                                              (html/content title)
                                              (html/set-attr :href (rel-link article)))
  (microdata "BlogPosting" "datePublished") (html/do->
                                              (html/content (long-date published))
                                              (html/set-attr :datetime (utc-date published)))
  (microdata "BlogPosting" "articleSection") (html/content category)
  (microdata "BlogPosting" "articleBody") (html/html-content html)
  (microdata "BlogPosting" "Person" "name") (html/content author)
  (microdata "BlogPosting" "url") (html/set-attr :href (rel-link article)))

(deftemplate index-template "weblog/index.html" [r articles]
  [:#content] (html/content (map article-listing articles)))

(deftemplate rss-template "weblog/index.rss" [articles]
  [:item] (html/clone-for [{:keys [author title description category published] :as article} articles]
                          [:author] (html/content author)
                          [:title] (html/content title)
                          [:guid] (html/content (permalink article))
                          [:link] (html/content (permalink article))
                          [:pubDate] (html/content (rss-date published))
                          [:description] (html/content description)
                          [:category] (html/content category)))

(deftemplate comments-rss-template "weblog/comments.rss" [])

(defsnippet article-detail "weblog/blogpost.html" [:article]
  [{:keys [title author category html published] :as article}]
  (microdata "BlogPosting" "name") (html/content title)
  (microdata "BlogPosting" "datePublished") (html/do->
                                              (html/content (long-date published))
                                              (html/set-attr :datetime (utc-date published)))
  (microdata "BlogPosting" "articleSection") (html/content category)
  (microdata "BlogPosting" "articleBody") (html/html-content html)
  (microdata "BlogPosting" "Person" "name") (html/content author)
  (microdata "BlogPosting" "url") (html/set-attr :href (rel-link article)))

(deftemplate blogpost-template "weblog/blogpost.html"
  [r {:keys [title author description category category-url html published] :as article}]
  [:title] (html/content title)
  [(meta-n "author")] (html/set-attr :content author)
  [(meta-n "description")] (html/set-attr :content description)
  [(meta-n "twitter:creator")] (html/set-attr :content (author-twitter article))
  [(meta-n "twitter:title")] (html/set-attr :content title)
  [(meta-n "twitter:description")] (html/set-attr :content description)
  [(meta-p "article:published_time")] (html/set-attr :content (utc-date published))
  [(meta-p "article:section")] (html/set-attr :content category)
  [(link "canonical")] (html/set-attr :href (permalink article))
  [(link "category")] (html/set-attr :href category-url)
  [:article] (html/substitute (article-detail article)))

(defsnippet category-items "weblog/category.html" [:#content :article] [articles]
  (html/clone-for [{:keys [title published] :as article} articles]
                  [:article :a] (html/content title)
                  [:article :a] (html/set-attr :href (rel-link article))
                  [:article :time] (html/content (short-date published))
                  [:article :time] (html/set-attr :datetime (utc-date published))))

(defsnippet year-items "weblog/category.html" [:#content :section] [years]
  (html/clone-for [{:keys [year articles]} years]
                  [:section :h1] (html/content (str year))
                  [:article] (html/substitute (category-items articles))))

(deftemplate category-template "weblog/category.html" [r {:keys [title url years]}]
  [:title] (html/content (str "Rubrika " title))
  [(link "canonical")] (html/set-attr :href (str blog-url url))
  [:#content :h2] (html/content title)
  [:#content :section] (html/substitute (year-items years)))

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

(defn index [r]
  (->> (last-articles 5)
       (index-template r)
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

(defn blogpost [url r]
  (some->> (load-article url)
           (blogpost-template r)
           render-view))

(defn category [url r]
  (some->> (load-category url)
           (category-template r)
           render-view))

(defroutes routes
  (GET "/weblog/" r (index r))
  (GET "/weblog/:url" [url :as r]
       (if (Character/isDigit (first url))
         (blogpost url r)
         (category url r)))
  (GET "/feed/rss.ashx" [] (rss))
  (GET "/feed/comments.ashx" [] (comments-rss))

  (GET "/ws/syndikace.asmx/rss" [] (redirect-to-rss-feed))
  (GET "/ws/Syndikace.asmx/Rss" [] (redirect-to-rss-feed))
  (GET "/ws/syndikace.asmx/Rss" [] (redirect-to-rss-feed))
  (GET "/clanek/:url" [url] (redirect-to-blogpost url))
  (GET "/clanek.aspx/:url" [url] (redirect-to-blogpost (str url ".aspx")))
  (GET "/rubrika/:url" [url] (redirect-to-blogpost (subs url (inc (.indexOf url "-")))))
  (GET "/weblog" [] (redirect-to-blogpost ""))
  (GET "/weblog/429-test-driven-developemt-pribeh-nezbedneho-vyvojare.aspx" []
       (moved-permanently "/weblog/429-test-driven-development-pribeh-nezbedneho-vyvojare.aspx"))
  (GET "/weblog/267-vladani-data-do-stranky.aspx" []
       (moved-permanently "/weblog/267-vkladani-data-do-stranky.aspx"))
  (GET "/weblog/329-rest-full-aplikace-pomoci-asp-net-mvc.aspx" []
       (moved-permanently "/weblog/329-rest-aplikace-pomoci-asp-net-mvc.aspx")))


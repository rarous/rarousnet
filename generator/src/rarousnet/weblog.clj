(ns rarousnet.weblog
  "The rarouš.weblog theme: enlive templates over the built HTML
  (weblog/index.html, weblog/blogpost.html, weblog/category.html off the
  classpath) and the site Texy setup - the markup half of the site. The
  engine (work.gryphoon.weblog.generator) drives it through the
  WeblogTheme protocol implemented by the `theme` var below (gryphoon.edn
  :theme points to this namespace)."
  (:require
    [clj-time.coerce :as tc]
    [clj-time.core :as time]
    [net.cgrand.enlive-html :as html :refer [defsnippet deftemplate]]
    [work.gryphoon.weblog.generator :as weblog :refer [WeblogTheme]]
    [work.gryphoon.texy.typography :refer [process-typo]]
    [rarousnet.texy :refer [blog-texy]]))

(defn- weblog-url [config]
  (str (get-in config [:weblog :url]) (get-in config [:weblog :path])))

(defn- weblog-path [config]
  (get-in config [:weblog :path]))

(defn- fmt [config]
  (weblog/formatters config))

(defn- iso-date [config d]
  ((:iso-date (fmt config)) d))

(defn- meta-n [name] [:meta (html/attr= :name name)])
(defn- property [name] (html/attr= :property name))
(defn- meta-p [name] [:meta (property name)])
(defn- typeof [name] (html/attr= :typeof name))
(defn- rdfa
   ([type prop] [(typeof type) (property prop)])
   ([type subtype prop] [(typeof type) (typeof subtype) (property prop)]))
(defn- itemprop [name] (html/attr= :itemprop name))
(defn- itemtype [name] (html/attr= :itemtype name))
(defn- microdata
  ([type prop] [(itemtype type) (itemprop prop)])
  ([type subtype prop] [(itemtype type) (itemtype subtype) (itemprop prop)]))
(defn- schema-org
  ([type prop] [(itemtype (str "https://schema.org/" type)) (itemprop prop)])
  ([type subtype prop] [(itemtype (str "https://schema.org/" type)) (itemtype (str "https://schema.org/" subtype)) (itemprop prop)]))
(defn- link [rel] [:link (html/attr= :rel rel)])
(defn- input [name] [:input (html/attr= :name name)])

(defsnippet article-tags "weblog/blogpost.html" [:.tags]
  [config tags]
  [:li] (html/clone-for [tag tags]
          [:a] (html/do->
                 (html/content tag)
                 (html/set-attr :href (str (weblog-path config) "tag/" (weblog/slug tag) ".html")))))

(defsnippet article-listing "weblog/index.html" [:.feed :article]
  [config {:keys [title author category html published tags] :as article}]
  (conj (schema-org "BlogPosting" "headline") :a) (html/do->
                                                   (html/content (process-typo title))
                                                   (html/set-attr :href (:rel-link article)))
  (schema-org "BlogPosting" "datePublished") (html/do->
                                              (html/content ((:long-date-time (fmt config)) published))
                                              (html/set-attr :datetime (iso-date config published)))
  (schema-org "BlogPosting" "articleSection") (html/content category)
  (schema-org "BlogPosting" "articleBody") (html/html-content html)
  (schema-org "BlogPosting" "Person" "name") (html/content author)
  (schema-org "BlogPosting" "image") (html/set-attr :href (:card-image article))
  (schema-org "BlogPosting" "url") (html/set-attr :href (:rel-link article))
  [:gryphoon-weblog] (html/set-attr :href (:permalink article))
  [:article :.tags] (html/substitute (article-tags config tags)))

(defsnippet page-header "weblog/index.html" [:#head] []
  [:.year] (html/content (str (time/year (time/today)))))
(defsnippet page-footer "weblog/index.html" [:.footer] []
  [:.year] (html/content (str (time/year (time/today)))))

(deftemplate index-template "weblog/index.html" [config articles]
  [:.feed] (html/content (map #(article-listing config %) articles))
  [:.footer] (html/substitute (page-footer)))

(defsnippet article-detail "weblog/blogpost.html" [:article]
  [config {:keys [title author category html published] :as article}]
  (schema-org "BlogPosting" "headline") (html/content (process-typo title))
  (schema-org "BlogPosting" "datePublished") (html/do->
                                              (html/content ((:long-date-time (fmt config)) published))
                                              (html/set-attr :datetime (iso-date config published)))
  (schema-org "BlogPosting" "articleSection") (html/content category)
  (schema-org "BlogPosting" "articleBody") (html/html-content html)
  (schema-org "BlogPosting" "Person" "name") (html/content author)
  (schema-org "BlogPosting" "image") (html/set-attr :href (:card-image article))
  (schema-org "BlogPosting" "url") (html/set-attr :href (:permalink article)))

(defsnippet article-breadcrumbs "weblog/blogpost.html" [:.breadcrumbs]
  [config {:keys [year month month-name day]}]
  [:.year] (html/set-attr :href (str (weblog-path config) year "/"))
  [:.year (itemprop "name")] (html/content (str year))
  [:.month] (html/set-attr :href (str (weblog-path config) year "/" month "/"))
  [:.month (itemprop "name")] (html/content month-name)
  [:.day] (html/set-attr :href (str (weblog-path config) year "/" month "/" day "/"))
  [:.day (itemprop "name")] (html/content (str day)))

(deftemplate blogpost-template "weblog/blogpost.html"
  [config {:keys [title author description published tags syndication] :as article}]
  [:title] (html/content title)
  [(meta-n "author")] (html/set-attr :content author)
  [(meta-n "description")] (html/set-attr :content description)
  [(meta-p "og:title")] (html/set-attr :content title)
  [(meta-p "og:description")] (html/set-attr :content description)
  [(meta-p "og:image")] (html/set-attr :content (:card-image article))
  [(meta-p "article:published_time")] (html/set-attr :content (iso-date config published))
  [(meta-p "article:author")] (html/set-attr :content author)
  [(meta-p "article:tag")] (html/clone-for [tag tags] (html/set-attr :content tag))
  [(meta-n "fediverse:creator")] (html/set-attr :content (:author-fediverse article))
  [(link "canonical")] (html/set-attr :href (:permalink article))
  [(link "syndication")] (if syndication
                          (html/clone-for [url syndication] (html/set-attr :href url))
                          (html/substitute nil))
  [:article] (html/substitute (article-detail config article))
  [:article :.breadcrumbs] (html/substitute
                             (article-breadcrumbs config
                               (let [dt (tc/from-date published)]
                                 {:year (time/year dt)
                                  :month ((:url-month (fmt config)) dt)
                                  :month-name ((:short-month (fmt config)) dt)
                                  :day ((:url-day (fmt config)) dt)})))
  [:article :.tags] (html/substitute (article-tags config tags))
  [:gryphoon-weblog] (html/set-attr :href (:permalink article))
  [:#new-comment] (html/replace-vars
                   {:permalink (:permalink article)
                    :turnstileSiteKey (get-in config [:comments :turnstile-site-key])})
  [:#new-comment (input "article-title")] (html/set-attr :value title)
  [:#head] (html/substitute (page-header))
  [:.footer] (html/substitute (page-footer)))

(defsnippet tag-items "weblog/category.html" [:#content :article] [config articles]
  (html/clone-for [{:keys [title published] :as article} articles]
    [:article :a] (html/content (process-typo title))
    [:article :a] (html/set-attr :href (:rel-link article))
    [:article :time] (html/content ((:short-date (fmt config)) published))
    [:article :time] (html/set-attr :datetime (iso-date config published))))

(defsnippet year-items "weblog/category.html" [:#content :section] [config years]
  (html/clone-for [{:keys [year articles]} years]
    [:section :h3 :a] (html/content (str year))
    [:section :h3 :a] (html/set-attr :href (str (weblog-path config) year "/"))
    [:article] (html/substitute (tag-items config articles))))

(deftemplate tag-template "weblog/category.html" [config {:keys [page-title title url years]}]
  [:title] (html/content (str page-title " - " (get-in config [:site :title])))
  [(link "canonical")] (html/set-attr :href (str (weblog-url config) url))
  [:#content :h2] (html/content title)
  [:#content :section] (html/substitute (year-items config years))
  [:#head] (html/substitute (page-header))
  [:.footer] (html/substitute (page-footer)))

;;-------------------------------------------------- theme contract

(def theme
  (reify WeblogTheme
    (texy [_ _config]
      (blog-texy))
    (render-article [_ article config]
      (apply str (blogpost-template config article)))
    (render-index [_ articles config]
      (apply str (index-template config articles)))
    (render-category [_ data config]
      (apply str (tag-template config data)))))

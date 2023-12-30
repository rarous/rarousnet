(ns rarousnet.generator
  (:require
    [clj-time.core :as time :refer [date-time]]
    [clj-time.coerce :as tc :refer [from-date]]
    [clj-time.format :refer [formatter unparse with-locale formatters]]
    [clojure.core.async :as async :refer [>!! <!! >! <! go go-loop]]
    [clojure.edn :as edn]
    [clojure.java.io :as io]
    [clojure.java.shell :refer [sh]]
    [clojure.string :as string]
    [cheshire.core :as json]
    [net.cgrand.enlive-html :as html :refer [defsnippet deftemplate xml-parser]]
    [rarousnet.texy :refer [process-typo]])
  (:import
    (java.io File)
    (java.security MessageDigest)
    (java.text Normalizer Normalizer$Form)
    (java.util Locale))
  (:gen-class))

(set! *warn-on-reflection* true)

(def blog-relative-url "/weblog/")
(def blog-url (str "https://www.rarous.net" blog-relative-url))

(defn remove-diacritics
  "Remove diacritical marks from the string `s`, E.g., 'żółw' is transformed
  to 'zolw'."
  [^String s]
  (let [normalized (Normalizer/normalize s Normalizer$Form/NFD)]
    (.replaceAll normalized "\\p{InCombiningDiacriticalMarks}+" "")))

(defn slug [^String s]
  (-> s
      (.toLowerCase)
      (remove-diacritics)
      (string/replace #"\." "-")
      (string/replace #"\s+" "-")))

(def cs (Locale. "cs"))

(def long-date-time-format
  (with-locale (formatter "HH.mm - d. MMMM yyyy") cs))
(def long-date-format
  (with-locale (formatter "d. MMMM yyyy") cs))
(def long-month-year-format
  (with-locale (formatter "MMMM yyyy") cs))
(def short-month-format
  (with-locale (formatter "MMM") cs))
(def short-date-format
  (with-locale (formatter "MMM d") cs))
(def url-month-format (with-locale (formatter "MM") cs))
(def url-day-format (with-locale (formatter "dd") cs))
(def utc-format (formatters :basic-date-time))
(def rss-format (formatter "EEE, d MMM yyyy HH:mm:ss Z"))
(defn utc-date [d]
  (unparse utc-format (from-date d)))
(defn long-date-time [d]
  (unparse long-date-time-format (from-date d)))
(defn long-date [dt]
  (unparse long-date-format dt))
(defn long-month-year [dt]
  (unparse long-month-year-format dt))
(defn short-month [dt]
  (unparse short-month-format dt))
(defn short-date [d]
  (unparse short-date-format (from-date d)))
(defn rss-date [d]
  (unparse rss-format (from-date d)))
(defn url-month [dt]
  (unparse url-month-format dt))
(defn url-day [dt]
      (unparse url-day-format dt))

(defn permalink [{:keys [file-name]}]
  (str blog-url file-name))
(defn rel-link [{:keys [file-name]}]
  (str blog-relative-url file-name))
(defn author-twitter [{:keys [author]}]
  (case author
    "Aleš Roubíček" "@alesroubicek"
    "Alessio Busta" "@alessiobusta"
    nil))
(defn card-image [article]
  (string/replace (permalink article) #"\.html" ".png"))

(defn- meta-n [name] [:meta (html/attr= :name name)])
(defn- meta-p [name] [:meta (html/attr= :property name)])
(defn- property [name] (html/attr= :property name))
(defn- typeof [name] (html/attr= :typeof name))
(defn- rdfa
   ([type prop] [(typeof type) (property prop)])
   ([type subtype prop] [(typeof type) (typeof subtype) (property prop)]))
(defn- link [rel] [:link (html/attr= :rel rel)])
(defn- script [src] [:script (html/attr= :src src)])

(defsnippet article-listing "weblog/index.html" [:.feed :article]
  [{:keys [title author category html published] :as article}]
  (conj (rdfa "BlogPosting" "headline") :a) (html/do->
                                                   (html/content (process-typo title))
                                                   (html/set-attr :href (rel-link article)))
  (rdfa "BlogPosting" "datePublished") (html/do->
                                              (html/content (long-date-time published))
                                              (html/set-attr :datetime (utc-date published)))
  (rdfa "BlogPosting" "articleSection") (html/content category)
  (rdfa "BlogPosting" "articleBody") (html/html-content html)
  (rdfa "BlogPosting" "Person" "name") (html/content author)
  (rdfa "BlogPosting" "image") (html/set-attr :href (card-image article))
  (rdfa "BlogPosting" "url") (html/set-attr :href (rel-link article)))

(defsnippet page-header "weblog/index.html" [:#head] []
  [:.year] (html/content (str (time/year (time/today)))))
(defsnippet page-footer "weblog/index.html" [:.footer] []
  [:.year] (html/content (str (time/year (time/today)))))

(deftemplate index-template "weblog/index.html" [articles]
  [:.feed] (html/content (map article-listing articles))
  [:.footer] (html/substitute (page-footer)))

(defsnippet article-detail "weblog/blogpost.html" [:article]
  [{:keys [title author category html published] :as article}]
  (rdfa "BlogPosting" "headline") (html/content (process-typo title))
  (rdfa "BlogPosting" "datePublished") (html/do->
                                              (html/content (long-date-time published))
                                              (html/set-attr :datetime (utc-date published)))
  (rdfa "BlogPosting" "articleSection") (html/content category)
  (rdfa "BlogPosting" "articleBody") (html/html-content html)
  (rdfa "BlogPosting" "Person" "name") (html/content author)
  (rdfa "BlogPosting" "image") (html/set-attr :href (card-image article))
  (rdfa "BlogPosting" "url") (html/set-attr :href (permalink article)))

(defsnippet article-breadcrumbs "weblog/blogpost.html" [:.breadcrumbs]
  [{:keys [year month month-name day]}]
  [:.year] (html/set-attr :href (str blog-relative-url year "/"))
  [:.year (html/attr= :property "name")] (html/content (str year))
  [:.month] (html/set-attr :href (str blog-relative-url year "/" month "/"))
  [:.month (html/attr= :property "name")] (html/content month-name)
  [:.day] (html/set-attr :href (str blog-relative-url year "/" month "/" day "/"))
  [:.day (html/attr= :property "name")] (html/content (str day)))

(defsnippet article-tags "weblog/blogpost.html" [:.tags]
  [tags]
  [:li] (html/clone-for [tag tags]
          [:a] (html/do->
                 (html/content tag)
                 (html/set-attr :href (str blog-relative-url "tag/" (slug tag) ".html")))))

(deftemplate blogpost-template "weblog/blogpost.html"
  [{:keys [title author description published tags syndication] :as article}]
  [:title] (html/content title)
  [(meta-n "author")] (html/set-attr :content author)
  [(meta-n "description")] (html/set-attr :content description)
  [(meta-n "twitter:creator")] (html/set-attr :content (author-twitter article))
  [(meta-n "twitter:title")] (html/set-attr :content title)
  [(meta-n "twitter:description")] (html/set-attr :content description)
  [(meta-n "twitter:image")] (html/set-attr :content (card-image article))
  [(meta-p "article:published_time")] (html/set-attr :content (utc-date published))
  [(link "canonical")] (html/set-attr :href (permalink article))
  [(link "syndication")] (if syndication
                          (html/clone-for [url syndication] (html/set-attr :href url))
                          (html/substitute nil))
  [:article] (html/substitute (article-detail article))
  [:article :.breadcrumbs] (html/substitute
                             (article-breadcrumbs
                               (let [dt (from-date published)]
                                {:year (time/year dt)
                                 :month (url-month dt)
                                 :month-name (short-month dt)
                                 :day (url-day dt)})))
  [:article :.tags] (html/substitute (article-tags tags))
  [:gryphoon-weblog] (html/set-attr :href (permalink article))
  [:#new-comment] (html/replace-vars
                   {:permalink (permalink article)
                    ;; TODO: inject from pulumi state
                    :turnstileSiteKey "0x4AAAAAAAOCSb93_fOUweSv"})
  [:#new-comment :input (html/attr= :name "article-title")] (html/set-attr :value title)
  [:#head] (html/substitute (page-header))
  [:.footer] (html/substitute (page-footer)))

(deftemplate rss-template {:parser xml-parser} "weblog/index.rss" [articles]
  [:link] (html/content blog-url)
  [:item] (html/clone-for [{:keys [author title description tags published] :as article} articles]
            [:author] (html/content author)
            [:title] (html/content title)
            [:guid] (html/content (permalink article))
            [:link] (html/content (permalink article))
            [:pubDate] (html/content (rss-date published))
            [:description] (html/content description)
            [:category] (html/clone-for [tag tags]
                          (html/content tag))))

(deftemplate sitemap-template {:parser xml-parser} "weblog/sitemap.xml" [links]
  [:url] (html/clone-for [link links]
           [:loc] (html/content link)))

(defsnippet tag-items "weblog/category.html" [:#content :article] [articles]
  (html/clone-for [{:keys [title published] :as article} articles]
    [:article :a] (html/content (process-typo title))
    [:article :a] (html/set-attr :href (rel-link article))
    [:article :time] (html/content (short-date published))
    [:article :time] (html/set-attr :datetime (utc-date published))))

(defsnippet year-items "weblog/category.html" [:#content :section] [years]
  (html/clone-for [{:keys [year articles]} years]
    [:section :h1] (html/content (str year))
    [:article] (html/substitute (tag-items articles))))

(deftemplate tag-template "weblog/category.html" [{:keys [page-title title url years]}]
  [:title] (html/content (str page-title " - rarouš.weblog"))
  [(link "canonical")] (html/set-attr :href (str blog-url url))
  [:#content :h2] (html/content title)
  [:#content :section] (html/substitute (year-items years))
  [:#head] (html/substitute (page-header))
  [:.footer] (html/substitute (page-footer)))


(defn date [s]
  (->> s tc/from-string tc/to-date))

(defn texy [data]
  (let [input (json/generate-string data)
        {:keys [exit err out] :as result} (sh "php" "index.php" :in input)]
    (if (zero? exit)
      (json/parse-string out)
      (throw (ex-info "Error occurred" result)))))

(defn ->article [input]
  (let [[_ meta & text] (string/split input #"---")]
    (assoc (edn/read-string meta)
      :texy (-> (string/join "---" text)))))

(defn file-name [^File f]
  (let [x (fn [y m d & name] (str y "/" m "/" d "/" (string/join "-" name)))
        y (-> (.getName f)
              (string/replace #"\.texy" ".html")
              (string/split #"-"))]
    (apply x y)))

(defn convert [transform]
  (fn [^File f]
    (as->
      f article
      (slurp article)
      (transform article)
      (assoc article
        :file-name (file-name f)
        :published (-> article :published date))
      (assoc article
        :timestamp (-> article :published tc/to-long)
        :year (-> article :published from-date time/year)
        :month (-> article :published from-date time/month)
        :day (-> article :published from-date time/day)))))

(defn static-content [src dest]
  (io/make-parents dest ".")
  (println (:out (sh "cp" "-vpR" src dest))))

(def entries
  (comp
    (remove (fn [^File f] (.isDirectory f)))
    (map (convert ->article))))

(defn read-articles [content]
  (let [articles (into [] entries (file-seq (io/file (str content "/weblog"))))
        html (texy (into {} (map #(vector (:file-name %) (:texy %))) articles))
        with-html #(assoc % :html (-> % :file-name html))]
    (into [] (map with-html) articles)))

(defn write-file [dist {:file/keys [name content append]}]
  (let [file (.getCanonicalFile (io/file dist "weblog" name))
        file-path (.getCanonicalPath file)]
    (println "Writing file" file-path)
    (io/make-parents file-path)
    (spit file content :append append)))

(defn latest [n articles]
  (->>
    articles
    (sort-by :timestamp >)
    (take n)))

(defn articles-rss [articles write-file-ch]
  (let [rss (apply str (rss-template (latest 10 articles)))]
    (go (>! write-file-ch
            {:file/name "articles.rss"
             :file/content rss}))))

(defn page [article]
    {:file/content (apply str (blogpost-template article))
     :file/name (:file-name article)})

(defn articles-pages [articles write-file-ch]
    (async/onto-chan! write-file-ch (map page articles)))

(defn articles-index [articles write-file-ch]
  (let [html (apply str (index-template (latest 5 articles)))]
    (go (>! write-file-ch
            {:file/name "index.html"
             :file/content html}))))

(defn tag-page [[tag items]]
  (let [file-name (str "tag/" (slug tag) ".html")
        data {:title tag
              :page-title (str "Tag " tag)
              :url file-name
              :years items}
        html (apply str (tag-template data))]
    {:file/name file-name
     :file/content html}))

(defn articles-by-tag [[tag items]]
  [tag (->>
         items
         (sort-by :timestamp >)
         (group-by :year)
         (map #(zipmap [:year :articles] %))
         (sort-by :year >))])

(defn tag-indexes [articles write-file-ch]
  (let [pages
        (->>
          articles
          (map #(into {} (map (fn [x] [x [%]])) (:tags %)))
          (apply merge-with concat)
          (map articles-by-tag)
          (map tag-page))]
    (async/onto-chan write-file-ch pages false)))

(defn day-index [year month]
  (fn [[day items]]
    (let [file-name (str year "/" (format "%02d" month) "/" (format "%02d" day) "/index.html")
          articles
          (->>
            items
            (sort-by (juxt :month :day))
            (reverse))
          data {:title "Denník"
                :page-title (str "Denník " (long-date (date-time year month day)))
                :url file-name
                :years [{:year year :articles articles}]}
          html (apply str (tag-template data))]
      {:file/name file-name
       :file/content html})))

(defn month-index [year]
  (fn [[month items]]
    (let [file-name (str year "/" (format "%02d" month) "/index.html")
          articles
          (->>
            items
            (map second)
            (flatten)
            (sort-by (juxt :month :day))
            (reverse))
          data {:title "Měsíčník"
                :page-title (str "Měsíčník " (long-month-year (date-time year month)))
                :url file-name
                :years [{:year year :articles articles}]}
          html (apply str (tag-template data))]
      (conj
        (map (day-index year month) items)
        {:file/name file-name
         :file/content html}))))

(defn year-index [[year items]]
  (let [file-name (str year "/index.html")
        articles
        (->>
          items
          (map second)
          (mapcat vals)
          (flatten)
          (sort-by (juxt :month :day))
          (reverse))
        data {:title "Ročenka"
              :page-title (str "Ročenka " year)
              :url file-name
              :years [{:year year :articles articles}]}
        html (apply str (tag-template data))]
    (conj
      (mapcat (month-index year) items)
      {:file/name file-name
       :file/content html})))

(defn articles-by-month [[month items]]
  [month (group-by :day items)])

(defn articles-by-year [[year items]]
  [year (->>
          items
          (group-by :month)
          (map articles-by-month))])

(defn time-indexes [articles write-file-ch]
  (let [files
        (->>
          articles
          (group-by :year)
          (map articles-by-year)
          (mapcat year-index))]
    (async/onto-chan write-file-ch files false)))

(defn sitemap [articles write-file-ch]
  (let [hp [blog-url]
        articles (map #(permalink %) articles)
        links (concat hp articles)
        sitemap (apply str (sitemap-template links))]
       (go (>! write-file-ch
               {:file/name "sitemap.xml"
                :file/content sitemap}))))

(defn syndication-feed [articles write-file-ch]
  (let [years
        (->>
          articles
          (group-by :year)
          (sort-by first >)
          (map (fn [[year articles]]
                   {:year year
                    :articles (sort-by :timestamp > articles)})))
        data {:title "Syndication feed"
              :page-title "Syndication feed"
              :url "weblog/feed/"
              :years years}
        html (apply str (tag-template data))]
       (go (>! write-file-ch
               {:file/name "feed/index.html"
                :file/content html}))))

(def weblog-pattern
  #(str "/weblog/" (:id %) "-" (string/replace (last (string/split (:file-name %) #"/")) #"html" "aspx")))

(defn redirects [articles write-file-ch]
  (let [redirects (into []
                    (comp
                      (filter :id)
                      (map #(str (weblog-pattern %) " " (rel-link %) " 301")))
                    articles)]
       (go (>! write-file-ch
               {:file/name "../_redirects"
                :file/content (string/join "\n" redirects)
                :file/append true}))))

(defn article->image [article]
  {:title (:title article)
   :name (author-twitter article)
   :date (last (string/split (long-date-time (:published article)) #" - "))
   :fileName (string/replace (:file-name article) #"\.html$" ".png")})

(defn sha256 [^String string]
  (let [digest (.digest (MessageDigest/getInstance "SHA-256") (.getBytes string "UTF-8"))]
    (apply str (map (partial format "%02x") digest))))

(defn hash-content [{:keys [title name date fileName] :as article}]
  (assoc article :hash (sha256 (str title name date fileName))))

(defn twitter-images [articles write-file-ch]
  (let [images-meta (into [] (comp (map article->image) (map hash-content)) articles)
        json (json/generate-string images-meta)]
    (go (>! write-file-ch
            {:file/name "../../cards.json"
             :file/content json}))))

(def generators
  [twitter-images
   articles-rss
   sitemap
   syndication-feed
   articles-index
   tag-indexes
   time-indexes
   articles-pages
   redirects])

(defn -main [& args]
  (let [root (or (first args) "..")
        dist (.getCanonicalPath (io/file root ".gryphoon" "dist"))
        static (.getCanonicalPath (io/file root "static"))
        content (.getCanonicalFile (io/file root "content"))
        website (.getCanonicalPath (io/file root "website"))]
    (println)
    (println "Gryphoon 3.5 - static website generator")
    (println "Content generator")
    (println)
    (println "Copying website content to distribution folder...")
    (static-content website dist)
    (println)
    (println "Reading content...")
    (let [articles (read-articles content)
          write-file-ch (async/chan)]
      (println "Generating content...")
      (run! #(async/thread (% articles write-file-ch)) generators)
      (<!! (go-loop []
             (when-let [file (<! write-file-ch)]
               (write-file dist file)
               (recur)))))
    (println)
    (println "DONE")))

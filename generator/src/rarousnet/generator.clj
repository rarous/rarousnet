(ns rarousnet.generator
  (:require
    [clj-time.core :as time]
    [clj-time.coerce :as tc :refer [from-date]]
    [clj-time.format :refer [formatter unparse with-locale formatters]]
    [clojure.core.async :as async :refer [>!! <!! >! <! go go-loop]]
    [clojure.edn :as edn]
    [clojure.java.io :as io]
    [clojure.java.shell :refer [sh]]
    [clojure.string :as string]
    [cheshire.core :as json]
    [net.cgrand.enlive-html :as html :refer [defsnippet deftemplate]])
  (:import
    (java.io File)
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

(defn permalink [{:keys [file-name]}]
  (str blog-url file-name))
(defn rel-link [{:keys [file-name]}]
  (str blog-relative-url file-name))
(defn author-twitter [{:keys [author]}]
  (case author
    "Aleš Roubíček" "@alesroubicek"
    "Alessio Busta" "@alessiobusta"
    nil))

(defn- meta-n [name] [:meta (html/attr= :name name)])
(defn- meta-p [name] [:meta (html/attr= :property name)])
(defn- itemprop [name] (html/attr= :itemprop name))
(defn- itemtype [name] (html/attr= :itemtype (str "https://schema.org/" name)))
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

(deftemplate index-template "weblog/index.html" [articles]
  [:#content] (html/content (map article-listing articles)))

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
  [{:keys [title author description category category-url published] :as article}]
  [:title] (html/content title)
  [(meta-n "author")] (html/set-attr :content author)
  [(meta-n "description")] (html/set-attr :content description)
  [(meta-n "twitter:creator")] (html/set-attr :content (author-twitter article))
  [(meta-n "twitter:title")] (html/set-attr :content title)
  [(meta-n "twitter:description")] (html/set-attr :content description)
  [(meta-n "twitter:image")] (html/set-attr :content (string/replace (permalink article) #"\.html" ".png"))
  [(meta-p "article:published_time")] (html/set-attr :content (utc-date published))
  [(meta-p "article:section")] (html/set-attr :content category)
  [(link "canonical")] (html/set-attr :href (permalink article))
  [(link "category")] (html/set-attr :href category-url)
  [:article] (html/substitute (article-detail article)))

(deftemplate rss-template "weblog/index.rss" [articles]
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

(defsnippet tag-items "weblog/category.html" [:#content :article] [articles]
  (html/clone-for [{:keys [title published] :as article} articles]
    [:article :a] (html/content title)
    [:article :a] (html/set-attr :href (rel-link article))
    [:article :time] (html/content (short-date published))
    [:article :time] (html/set-attr :datetime (utc-date published))))

(defsnippet year-items "weblog/category.html" [:#content :section] [years]
  (html/clone-for [{:keys [year articles]} years]
    [:section :h1] (html/content (str year))
    [:article] (html/substitute (tag-items articles))))

(deftemplate tag-template "weblog/category.html" [{:keys [title url years]}]
  [:title] (html/content (str "Tag " title " - rarouš.weblog"))
  [(link "canonical")] (html/set-attr :href (str blog-url url))
  [:#content :h2] (html/content title)
  [:#content :section] (html/substitute (year-items years)))

(deftemplate redirect-template "weblog/redirect.html" [{:keys [url]}]
  [html/any-node] (html/replace-vars {:url url}))

(defn date [s]
  (->> s tc/from-string tc/to-date))

(defn texy [data]
  (let [input (json/generate-string data)
        {:keys [exit err out] :as result} (sh "php" "index.php" :in input)]
    (if (zero? exit)
      (json/parse-string out)
      (throw (ex-info "Error occurred" result)))))

(defn article [input]
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
  (sh "cp" "-pR" src dest))

(defn read-articles [content]
  (let [articles
        (into []
              (comp
                (remove (fn [^File f] (.isDirectory f)))
                (map (convert article)))
              (file-seq (io/file (str content "/weblog"))))
        html (texy (into {} (map #(vector (:file-name %) (:texy %))) articles))
        with-html #(assoc % :html (-> % :file-name html))]
    (into [] (map with-html) articles)))

(defn write-file [dist {:file/keys [name content]}]
  (let [weblog (str dist "/weblog/")]
    (println "Writing file" (str "/dist/weblog/" name))
    (io/make-parents weblog name)
    (spit (io/file weblog name) content)))

(def weblog-pattern
  #(str (:id %) "-" (string/replace (last (string/split (:file-name %) #"/")) #"html" "aspx/index.html")))
(def clanek-pattern
  #(str "../clanek/" (:id %) "-" (string/replace (last (string/split (:file-name %) #"/")) #"html" "aspx/index.html")))
(def clanek-aspx-pattern
  #(str "../clanek.aspx/" (:id %) "-" (string/replace (last (string/split (:file-name %) #"/")) #"\.html" "/index.html")))

(defn redirect-names [article]
  (let [redirect-page (apply str (redirect-template {:url (str blog-url (:file-name article))}))]
    (for [file-name [weblog-pattern clanek-pattern clanek-aspx-pattern]]
      {:file/name (file-name article)
       :file/content redirect-page})))

(defn articles-rss [articles write-file-ch]
  (let [last-10-articles
        (->>
          articles
          (sort-by :timestamp >)
          (take 10))
        rss (apply str (rss-template last-10-articles))]
    (go
      (>! write-file-ch {:file/name "articles.rss" :file/content rss}))))

(defn articles-pages [articles write-file-ch]
  (->>
    articles
    (mapcat #(conj (redirect-names %)
                   {:file/content (apply str (blogpost-template %))
                    :file/name (:file-name %)}))
    (async/onto-chan write-file-ch)))

(defn articles-index [articles write-file-ch]
  (let [last-5-articles
        (->>
          articles
          (sort-by :timestamp >)
          (take 5))
        html (apply str (index-template last-5-articles))]
    (go
      (>! write-file-ch {:file/name "index.html" :file/content html}))))

(defn tag-indexes [articles write-file-ch]
  (let [files
        (->>
          articles
          (map #(into {} (map (fn [x] [x [%]])) (:tags %)))
          (apply merge-with concat)
          (map (fn [[tag items]]
                 [tag (->> items
                           (sort-by :timestamp >)
                           (group-by :year)
                           (map #(zipmap [:year :articles] %))
                           (sort-by :year >))]))
          (map (fn [[tag items]]
                 (let [file-name (str "tag/" (slug tag) ".html")
                       html (apply str (tag-template {:title tag :url file-name :years items}))] ;; TODO: sort by date
                   {:file/name file-name
                    :file/content html}))))]
    (async/onto-chan write-file-ch files false)))

(defn daybook [year month]
  (fn [[day items]]
    (let [file-name (str year "/" (format "%02d" month) "/" (format "%02d" day) "/index.html")
          articles (->> items (sort-by (juxt :month :day)) reverse)
          html (apply str (tag-template {:title "Denník" :url file-name :years [{:year year :articles articles}]}))]
      {:file/name file-name
       :file/content html})))

(defn monthbook [year]
  (fn [[month items]]
    (let [file-name (str year "/" (format "%02d" month) "/index.html")
          articles (->> items (map second) flatten (sort-by (juxt :month :day)) reverse)
          html (apply str (tag-template {:title "Měsíčník" :url file-name :years [{:year year :articles articles}]}))]
      (conj
        (map (daybook year month) items)
        {:file/name file-name
         :file/content html}))))

(defn yearbook [[year items]]
  (let [file-name (str year "/index.html")
        articles (->> items (map second) (mapcat vals) flatten (sort-by (juxt :month :day)) reverse)
        html (apply str (tag-template {:title "Ročenka" :url file-name :years [{:year year :articles articles}]}))]
    (conj
      (mapcat (monthbook year) items)
      {:file/name file-name
       :file/content html})))

(defn time-indexes [articles write-file-ch]
  (let [files
        (->>
          articles
          (group-by :year)
          (map (fn [[year items]]
                 [year (->>
                         items
                         (group-by :month)
                         (map (fn [[month items]]
                                [month (group-by :day items)])))]))
          (mapcat yearbook))]
    (async/onto-chan write-file-ch files false)))

(defn twitter-images [articles write-file-ch]
  (let [images-meta
        (into []
              (map #(array-map
                      :title (:title %)
                      :name (author-twitter %)
                      :date (last (string/split (long-date (:published %)) #" - "))
                      :fileName (string/replace (:file-name %) #".html" ".png")))
              articles)
        json (json/generate-string images-meta)]
    (go
      (>! write-file-ch {:file/name "data.json" :file/content json}))))

(defn -main [& args]
  (let [root (or (first args) "../")
        dist (str root "dist")
        static (str root "static")
        content (str root "content")]
    (println)
    (println "Gryphoon 3.0 - static website generator")
    (println)
    (println "Copying static content to distribution folder...")
    (async/thread (static-content static dist))
    (println)
    (println "Reading content...")
    (let [articles (read-articles content)
          write-file-ch (async/chan)]
      (println "Generating content...")
      (async/thread (twitter-images articles write-file-ch))
      (async/thread (articles-rss articles write-file-ch))
      (async/thread (articles-index articles write-file-ch))
      (async/thread (tag-indexes articles write-file-ch))
      (async/thread (time-indexes articles write-file-ch))
      (async/thread (articles-pages articles write-file-ch))
      ;; TODO: comments
      (<!! (go-loop []
             (when-let [file (<! write-file-ch)]
               (write-file dist file)
               (recur)))))
    (println)
    (println "DONE")))

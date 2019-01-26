(ns rarousnet.generator
  (:require
    [clj-time.core :as time]
    [clj-time.coerce :as tc :refer [from-date]]
    [clj-time.format :refer [formatter unparse with-locale formatters]]
    [clojure.edn :as edn]
    [clojure.java.io :as io]
    [clojure.java.shell :refer [sh]]
    [clojure.string :as string]
    [cheshire.core :as json]
    [net.cgrand.enlive-html :as html :refer [defsnippet deftemplate]]
    [clojure.string :as str])
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
  (println "Converting Texy files...")
  (time
    (let [input (json/generate-string data)
          {:keys [exit err out] :as result} (sh "php" "index.php" :in input)]
      (if (zero? exit)
        (json/parse-string out)
        (throw (ex-info "Error occurred" result))))))

(defn article [input]
  (let [[_ meta & text] (string/split input #"---")]
    (assoc (edn/read-string meta)
      :texy (-> (string/join "---" text)))))

(defn article-meta [input]
  (let [[_ meta & _] (string/split input #"---")]
    (edn/read-string meta)))

(defn file-name [^File f]
  (let [x (fn [y m d & name] (str y "/" m "/" d "/" (string/join "-" name)))
        y (-> (.getName f)
              (string/replace #"\.texy" ".html")
              (string/split #"-"))]
    (apply x y)))

(defn convert [transform]
  (fn [^File f]
    (->> f
         (slurp)
         (transform)
         (#(assoc %
             :file-name (file-name f)
             :published (date (:published %)))))))

(defn write-file [dist {:keys [file-name html]}]
  (let [weblog (str dist "/weblog/")]
    (println "Writing file" (str "/dist/weblog/" file-name))
    (io/make-parents weblog file-name)
    (spit (io/file weblog file-name) html)))

(defn articles-rss [content dist]
  (->>
    content
    (map (convert article-meta))
    (sort-by :published)
    (take-last 10)
    (rss-template)
    (apply str)
    (assoc {:file-name "articles.rss"} :html)
    (write-file dist)))

(defn articles-entries [articles results dist]
  (dorun
    (->>
      articles
      (group-by :file-name)
      (map (fn [[k [v]]] (assoc v :html (results k))))
      (map #(assoc % :html (apply str (blogpost-template %))))
      (map (partial write-file dist)))))

(defn articles-index [articles results dist]
  (dorun
    (->>
      articles
      (map #(assoc % :timestamp (tc/to-long (:published %))
                     :html (results (:file-name %))))
      (sort-by :timestamp >)
      (take 5)
      (index-template)
      (apply str)
      (assoc {:file-name "index.html"} :html)
      (write-file dist))))

(defn tags [content dist]
  (dorun
    (->>
      content
      (map (convert article-meta))
      (mapv #(->> % :tags (map (fn [x] [x [%]])) (into {})))
      (apply merge-with concat)
      (map (fn [[tag items]]
             [tag (->> items
                       (group-by (comp time/year from-date :published))
                       (map (partial zipmap [:year :articles]))
                       (sort-by :year >))]))
      (map (fn [[tag items]]
             (let [file-name (str "tag/" (slug tag) ".html")
                   html (apply str (tag-template {:title tag :url file-name :years items}))]
               {:file-name file-name
                :html html})))
      (map (partial write-file dist)))))

(defn daybook [year month]
  (fn [[day items]]
    (let [file-name (str year "/" (format "%02d" month) "/" (format "%02d" day) "/index.html")
          articles (->> items (sort-by (juxt :month :day)) reverse)
          html (apply str (tag-template {:title "Denník" :url file-name :years [{:year year :articles articles}]}))]
      {:file-name file-name
       :html html})))

(defn monthbook [year]
  (fn [[month items]]
    (let [file-name (str year "/" (format "%02d" month) "/index.html")
          articles (->> items (map second) flatten (sort-by (juxt :month :day)) reverse)
          html (apply str (tag-template {:title "Měsíčník" :url file-name :years [{:year year :articles articles}]}))]
      (conj
        (map (daybook year month) items)
        {:file-name file-name
         :html html}))))

(defn yearbook [[year items]]
  (let [file-name (str year "/index.html")
        articles (->> items (map second) (mapcat vals) flatten (sort-by (juxt :month :day)) reverse)
        html (apply str (tag-template {:title "Ročenka" :url file-name :years [{:year year :articles articles}]}))]
    (conj
      (mapcat (monthbook year) items)
      {:file-name file-name
       :html html})))

(defn indexes [content dist]
  (dorun
    (->>
      content
      (map (convert article-meta))
      (map #(select-keys % [:published :file-name :title]))
      (map #(assoc % :year (-> % :published from-date time/year)
                     :month (-> % :published from-date time/month)
                     :day (-> % :published from-date time/day)))
      (group-by :year)
      (map (fn [[year items]]
             [year (->>
                     (group-by :month items)
                     (map (fn [[month items]]
                            [month (group-by :day items)])))]))
      (mapcat yearbook)
      (map (partial write-file dist)))))

(def weblog-pattern
  #(str (:id %) "-" (str/replace (last (str/split (:file-name %) #"/")) #"html" "aspx/index.html")))
(def clanek-pattern
  #(str "../clanek/" (:id %) "-" (str/replace (last (str/split (:file-name %) #"/")) #"html" "aspx/index.html")))
(def clanek-aspx-pattern
  #(str "../clanek.aspx/" (:id %) "-" (str/replace (last (str/split (:file-name %) #"/")) #"\.html" "/index.html")))

(defn redirect-names [article]
  (for [ptr [weblog-pattern clanek-pattern clanek-aspx-pattern]]
    {:file-name (ptr article)
     :url (str blog-url (:file-name article))}))

(defn redirects [content dist]
  (dorun
    (->>
      content
      (map (convert article-meta))
      (mapcat redirect-names)
      (map #(assoc % :html (apply str (redirect-template %))))
      (map (partial write-file dist)))))

(defn static-content [src dest]
  (sh "cp" "-pR" src dest))

(defn -main [& args]
  (let [root (or (first args) "../")
        dist (str root "dist")
        static (str root "static")
        content (str root "content")]
    (println)
    (println "Gryphoon 3.0 - static website generator")
    (println)
    (println "Reading content...")
    (let [content (eduction
                    (remove (fn [^File f] (.isDirectory f)))
                    (file-seq (io/file (str content "/weblog"))))
          articles (eduction (map (convert article)) content)
          results (texy (into {} (map #(vector (:file-name %) (:texy %))) articles))]
      (println)
      (println "Copying static content to distribution folder...")
      (time (static-content static dist))
      (println)
      (println "Generating articles...")
      (time (articles-entries articles results dist))
      (println)
      (println "Generating landing page...")
      (time (articles-index articles results dist))
      (println)
      (println "Generating RSS feed...")
      (time (articles-rss content dist))
      (println)
      (println "Generating tag index pages...")
      (time (tags content dist))
      (println)
      (println "Generating years/months/days index pages...")
      (time (indexes content dist))
      (println)
      (println "Generating redirect pages...")
      (time (redirects content dist))
      ;; TODO: comments
      (println)
      (println "DONE"))))



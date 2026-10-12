(ns texy.blog-setup-test
  "The translation of a Texy 3 production setup into this port's
  extension points:

    Texy 3 addHandler('script', ...)  ->  {{...}} directive handlers
                                          (core/set-fallback-directive)
    Texy 3 addHandler('image', ...)   ->  an add-pass over image nodes
    Texy 3 addHandler('block', ...)   ->  a render-node method override
                                          (the open multimethod)
    $texy->phraseModule->tags         ->  :phrase-tags (Config::phraseTags)
    $texy->figureModule->class        ->  :figure-class (Config::figureClass)
    $texy->headingModule->top         ->  :top
    $texy->headingModule->generateID  ->  :generate-ids
    $texy->imageModule->root          ->  :image-root
    $texy->allowed['phrase/ins'] ...  ->  no-op: the port registers all
                                          phrase syntaxes unconditionally
    $texy->protect(markup, MARKUP)   ->  returning an :html-element node -
                                          raw markup, validated by the
                                          sanitize pass like passthrough"
  (:require [clojure.test :refer [deftest is testing]]
            [clojure.string :as str]
            [texy.core :as core]
            [texy.modules :as modules]
            [texy.passes :as passes]
            [texy.render :as render]))

(defn- raw-url-encode
  "PHP rawurlencode: percent encoding with spaces as %20 (URLEncoder is
  form encoding, spaces would come out as +)."
  [s]
  (str/replace (java.net.URLEncoder/encode s "UTF-8") "+" "%20"))

(defn- player
  "A player iframe as an AST html-element node: raw markup in the
  output, its attributes validated by the sanitize pass like any
  passthrough element."
  [{:keys [src width height cls title allow allowfullscreen data-ratio]}]
  {:type :html-element
   :name "iframe"
   :attrs (cond-> {"loading" "lazy"}
            true (assoc "width" width)
            true (assoc "height" height)
            cls (assoc "class" cls)
            title (assoc "title" title)
            allow (assoc "allow" allow)
            allowfullscreen (assoc "allowfullscreen" true)
            data-ratio (assoc "data-ratio" data-ratio)
            true (assoc "src" src))
   :content []})

(defn- script-handler
  "The Texy 3 scriptHandler: one fallback dispatching on the directive
  name (the PHP switch), returning AST nodes instead of protected
  strings. Unknown directives render as the author wrote them (the
  PHP $invocation->proceed() default)."
  [_value args node]
  (let [{:keys [name]} (modules/parse-directive-content (:text node))]
    (case name
      "mixcloud-mini"
      (player {:src (str "https://www.mixcloud.com/widget/iframe/?hide_cover=1&light=1&mini=1&feed="
                         (raw-url-encode (first args)) "&" (or (second args) ""))
               :width "560" :height "60"
               :cls "player mixcloud-player mixcloud-player--mini"})
      "mixcloud"
      (player {:src (str "https://www.mixcloud.com/widget/iframe/?hide_cover=1&light=1&feed="
                         (raw-url-encode (first args)) "&" (or (second args) ""))
               :width "560" :height "120"
               :cls "player mixcloud-player"})
      "speakerdeck"
      (player {:src (str "https://speakerdeck.com/player/" (raw-url-encode (first args)))
               :width "560" :height "420"
               :cls "player speakerdeck"
               :allowfullscreen true
               :data-ratio "1.3333333333333333"})
      "spotify"
      (player {:src (str "https://open.spotify.com/embed/episode/" (first args))
               :width "560" :height "152"
               :cls "player spotify-player"
               :allowfullscreen true
               :allow "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"})
      "youtube"
      (player {:src (str "https://www.youtube-nocookie.com/embed/" (first args))
               :width "560" :height "315"
               :cls "player youtube-player"
               :title "YouTube video player"
               :allowfullscreen true
               :allow "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"})
      ;; default: proceed()
      {:type :text :text (str "{{" (:text node) "}}")})))

(defn- image-handler-pass
  "The Texy 3 image handler: every image gets loading=lazy and
  sizes=100vw (Client Hints) - a transform pass over image nodes, riding
  the modifier-attribute path so the values land on the <img>."
  [doc]
  (passes/transform-nodes
    (fn [node]
      (if (= :image (:type node))
        (update-in node [:modifier :attrs] (fnil merge {})
                   {"loading" "lazy" "sizes" "100vw"})
        node))
    doc))

(defn- prism-code-renderer
  "The Texy 3 block handler as a render-node override: Prism.js wants
  language-<lang> on the <code> element and no language class on the
  <pre>."
  [original node]
  (if (and (= :code (:style node :code)) (seq (:language node)))
    (let [;; the code content escapes through the public text renderer
          code-text (first (render/render-node {:type :text :text (:code node)}))]
      [[:pre
        [:code {:class (str "language-" (:language node))} code-text]]])
    (original node)))

(defn blog-texy []
  (-> (core/->texy
        {:top 3
         :generate-ids true
         :image-root "https://res.cloudinary.com/rarous/image/fetch/dpr_auto,f_auto,q_auto,w_auto:100:800/https://www.rarous.net/data/obrazky/"
         ;; Texy 3: $texy->phraseModule->tags['phrase/em'] = 'i'
         :phrase-tags (merge render/phrase-tags {"phrase/em" :i})
         ;; Texy 3: $texy->figureModule->class = 'image'
         :figure-class "image"})
      (core/set-fallback-directive script-handler)
      (core/add-pass image-handler-pass)))

(deftest script-handlers
  (let [texy (blog-texy)]
    (testing "youtube: raw iframe, nontext <div> wrapper (like the reference -
              an iframe is inline-replaced content); attribute order is map
              order, and the bare boolean serializes name=\"\" through jsoup"
      (is (= (str "<div><iframe allowfullscreen=\"\" width=\"560\" "
                  "src=\"https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ\" "
                  "allow=\"accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share\" "
                  "title=\"YouTube video player\" loading=\"lazy\" "
                  "class=\"player youtube-player\" height=\"315\"></iframe></div>")
             (core/process texy "{{youtube(dQw4w9WgXcQ)}}"))))
    (testing "mixcloud-mini with feed and extra params (& escapes in attributes)"
      (is (= (str "<div><iframe loading=\"lazy\" width=\"560\" height=\"60\" "
                  "class=\"player mixcloud-player mixcloud-player--mini\" "
                  "src=\"https://www.mixcloud.com/widget/iframe/?hide_cover=1&amp;light=1&amp;mini=1&amp;feed=%2Fwebmaraton%2F&amp;autoplay=1\"></iframe></div>")
             (core/process texy "{{mixcloud-mini(/webmaraton/, autoplay=1)}}"))))
    (testing "an unknown directive proceeds (renders literally)"
      (is (= "<p>{{unknown(1)}}</p>" (core/process texy "{{unknown(1)}}"))))))

(deftest image-handler
  (testing "every image gets loading=lazy and sizes=100vw on the cloudinary root"
    (is (= (str "<div class=\"image\"><img loading=\"lazy\" sizes=\"100vw\" "
                "src=\"https://res.cloudinary.com/rarous/image/fetch/dpr_auto,f_auto,q_auto,w_auto:100:800/https://www.rarous.net/data/obrazky/photo.jpg\" "
                "alt=\"\"></div>")
           (core/process (blog-texy) "[* photo.jpg *]")))))

(deftest block-handler
  (let [original (get (methods render/render-node) :code-block)]
    (try
      (defmethod render/render-node :code-block [node]
        (prism-code-renderer original node))
      (testing "Prism language class on <code>, none on <pre>"
        (is (= "<pre><code class=\"language-clojure\">(def x 1)</code></pre>"
               (core/process (core/->texy {:typography false}) "```clojure\n(def x 1)\n```"))))
      (finally
        (defmethod render/render-node :code-block [node]
          (original node))))))

(deftest module-configuration
  (let [texy (blog-texy)]
    (testing "phrase/em renders as <i> (//Idiomatic text//)"
      (is (= "<p><i>Idiomatic text</i></p>" (core/process texy "//Idiomatic text//"))))
    (testing "figure class comes from :figure-class"
      (is (= "<div class=\"image\"><img loading=\"lazy\" sizes=\"100vw\" src=\"https://res.cloudinary.com/rarous/image/fetch/dpr_auto,f_auto,q_auto,w_auto:100:800/https://www.rarous.net/data/obrazky/img.jpg\" alt=\"\"></div>"
             (core/process texy "[* img.jpg *]"))))
    (testing "top heading level 3 with generated ids"
      (is (= "<h3 id=\"toc-title\">Title</h3>" (core/process texy "Title\n===="))))))

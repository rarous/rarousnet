(ns rarousnet.texy
  (:require
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
  [{:keys [src width height class title allow allowfullscreen data-ratio]}]
  {:type :html-element
   :name "iframe"
   :attrs (cond-> {"loading" "lazy"
                   "width" width
                   "height" height
                   "src" src}
            class (assoc "class" class)
            title (assoc "title" title)
            allow (assoc "allow" allow)
            allowfullscreen (assoc "allowfullscreen" true)
            data-ratio (assoc "data-ratio" data-ratio))
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
               :class "player mixcloud-player mixcloud-player--mini"})
      "mixcloud"
      (player {:src (str "https://www.mixcloud.com/widget/iframe/?hide_cover=1&light=1&feed="
                         (raw-url-encode (first args)) "&" (or (second args) ""))
               :width "560" :height "120"
               :class "player mixcloud-player"})
      "speakerdeck"
      (player {:src (str "https://speakerdeck.com/player/" (raw-url-encode (first args)))
               :width "560" :height "420"
               :class "player speakerdeck"
               :allowfullscreen true
               :data-ratio "1.3333333333333333"})
      "spotify"
      (player {:src (str "https://open.spotify.com/embed/episode/" (first args))
               :width "560" :height "152"
               :class "player spotify-player"
               :allowfullscreen true
               :allow "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"})
      "youtube"
      (player {:src (str "https://www.youtube-nocookie.com/embed/" (first args))
               :width "560" :height "315"
               :class "player youtube-player"
               :title "YouTube video player"
               :allowfullscreen true
               :allow "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"})
      {:type :text :text (str "{{" (:text node) "}}")})))

(defn- image-handler-pass
  "Every image gets loading=lazy and
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
  "Prism.js wants language-<lang> on the <code> element and no language class on the <pre>."
  [original node]
  (if (and (= :code (:style node :code)) (seq (:language node)))
    (let [;; the code content escapes through the public text renderer
          code-text (first (render/render-node {:type :text :text (:code node)}))]
      [[:pre
        [:code {:class (str "language-" (:language node))} code-text]]])
    (original node)))

(defn blog-texy []
  (let [original (get (methods render/render-node) :code-block)]
  (defmethod render/render-node :code-block [node]
          (prism-code-renderer original node))
  (-> (core/->texy
       {:top 3
        :generate-ids true
        :legacy-references true
        :well-forming :direct
        :image-root "https://res.cloudinary.com/rarous/image/fetch/dpr_auto,f_auto,q_auto,w_auto:100:800/https://www.rarous.net/data/obrazky/"
        :phrase-tags (merge render/phrase-tags {"phrase/em" :i})
        :figure-class "image"})
      (core/set-fallback-directive script-handler)
      (core/add-pass image-handler-pass))))

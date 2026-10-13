(ns texy.modifier
  "Modifier .(title)[class]{style}<>^ parsing (port of Texy\\Modifier).

  The extent of a modifier run in text is found with a regular expression
  (the reference's `(?:(...)|[...]|\\{...\\}|<>|>|=|<|\\^|-|_){1,n}`), and the
  extracted run is structured by an instaparse grammar - a genuine CFG, the
  natural fit for instaparse among Texy's mostly-regex syntaxes."
  (:require [clojure.string :as str]
            [texy.normalize :as norm]
            [instaparse.core :as insta]))

;; Pre-compiled regex patterns for performance
(def ^:private ^java.util.regex.Pattern re-colon #":")
(def ^:private ^java.util.regex.Pattern re-semicolon #";")
(def ^:private ^java.util.regex.Pattern re-backslash-paren #"\\\)")
(def ^:private ^java.util.regex.Pattern re-whitespace-plus-mod #"\s+")

(def ^:private grammar
  (insta/parser
    "modifier = part+
     <part> = title / classes / styles / halign / valign
     title = <'('> #'(?:\\\\\\)|[^)\\n])+' <')'>
     classes = <'['> #'[^\\]\\n]+' <']'>
     styles = <'{'> #'[^}\\n]+' <'}'>
     halign = '<>' / '>' / '=' / '<'
     valign = '^' / '-' / '_'"))

(def ^:private aligns {">" :right, "<" :left, "=" :justify, "<>" :center,
                       "^" :top, "-" :middle, "_" :bottom})

(def ^:private el-attrs
  "Names in {...} treated as HTML attributes; anything else is a CSS style.
  Names that are also CSS properties (width, height, color, border...) are
  omitted on purpose, so the far more common style meaning wins (the
  reference Modifier::ElAttrs)."
  #{"abbr" "accesskey" "alt" "cite" "colspan" "contenteditable" "crossorigin"
    "datetime" "decoding" "dir" "download" "draggable" "for" "headers"
    "hidden" "href" "hreflang" "id" "inert" "inputmode" "itemid" "itemprop"
    "itemref" "itemscope" "itemtype" "lang" "loading" "name" "ping"
    "popover" "referrerpolicy" "rel" "reversed" "role" "rowspan" "scope"
    "slot" "spellcheck" "src" "srcset" "start" "tabindex" "target" "title"
    "type" "value"})

(defn- split-style
  "\"alt: x; color: red\" into attribute and style entries: keys in
  el-attrs (or data-/aria- prefixed) are HTML attributes, the rest are CSS
  styles (like the reference parseStyle)."
  [content]
  (reduce
    (fn [{:keys [attrs styles] :as acc} decl]
      (let [[k v] (str/split decl re-colon 2)
            prop (norm/lower-case (str/trim k))]
        (if (nil? v)
          acc
          (let [v (str/trim v)]
            (cond
              (or (contains? el-attrs prop)
                  (str/starts-with? prop "data-")
                  (str/starts-with? prop "aria-"))
              (assoc acc :attrs (assoc attrs prop v))
              (not= "" v)
              (assoc acc :styles (assoc styles prop v))
              :else acc)))))
    {:attrs {} :styles (array-map)}
    (str/split content re-semicolon)))

(defn- extent-pattern [bound]
  (re-pattern (str "[ \t]*(?<=[\t ]|^)\\.((?:\\((?:\\\\\\)|[^)\\n])+\\)|\\[[^\\]\\n]+\\]|"
                   "\\{[^}\\n]+\\}|<>|>|=|<|\\^|-|_){1," bound "})$")))
(defn- part->map [mod [tag content]]
  (case tag
    :title (assoc mod :title (str/replace (str/trim content) re-backslash-paren ")"))
    :classes (let [tokens (-> (str/replace content "#" " #") (str/split re-whitespace-plus-mod))
                   id (->> tokens (filter #(str/starts-with? % "#")) first)
                   classes (->> tokens (remove #(str/starts-with? % "#")) (remove str/blank?) vec)]
               (cond-> mod
                 (seq classes) (update :classes (fnil into []) classes)
                 id (assoc :id (subs id 1))))
    :styles (let [{:keys [attrs styles]} (split-style content)]
              (cond-> mod
                (seq attrs) (update :attrs (fnil into {}) attrs)
                (seq styles) (update :styles (fnil into (array-map)) styles)))
    :halign (assoc mod :h-align (get aligns content))
    :valign (assoc mod :v-align (get aligns content))))

(defn parse
  "Parses the modifier parts (without the leading dot) into a modifier map,
  or nil for an empty/invalid string (the reference is equally lenient)."
  [^String s]
  (when (and s (not (str/blank? s)))
    (let [tree (insta/parse grammar s :start :modifier)]
      (when (and (vector? tree) (not (insta/failure? tree)))
        (not-empty (reduce part->map {} (rest tree)))))))

(defn extract
  "Finds and parses the trailing modifier of s, up to bound parts
  (3 for the plain, 4 with aligns, 5 with vertical aligns - like the
  reference's Modifier/ModifierHAlign/ModifierHVAlign). The `$` anchor
  makes the search land on the last modifier run that reaches the end.
  Returns [modifier-map, s-without-the-modifier] or nil."
  ([s] (extract s 3))
  ([^String s bound]
   (when-let [[full parts] (re-find (extent-pattern bound) s)]
     [(parse parts)
      (subs s 0 (- (count s) (count full)))])))

(defn merge-modifiers
  "Overlays m2 onto m1 with the reference setProperties semantics: the
  title and aligns are overwritten, classes are appended, styles and
  attributes are merged per key."
  [m1 m2]
  (cond-> (or m1 {})
    (:title m2) (assoc :title (:title m2))
    (:id m2) (assoc :id (:id m2))
    (:h-align m2) (assoc :h-align (:h-align m2))
    (:v-align m2) (assoc :v-align (:v-align m2))
    (seq (:classes m2)) (update :classes (fnil into []) (:classes m2))
    (seq (:styles m2)) (update :styles (fnil merge {}) (:styles m2))
    (seq (:attrs m2)) (update :attrs (fnil merge {}) (:attrs m2))))

(defn decorate
  "Renders a modifier map into hiccup attribute entries: the {name: value}
  attribute pairs, title, id, class, style (explicit styles plus
  text-align/vertical-align from aligns)."
  [{:keys [title id classes attrs styles h-align v-align]}]
  (let [style-parts (concat (map (fn [[k v]] (str k ":" v)) styles)
                            (when h-align [(str "text-align:" (name h-align))])
                            (when v-align [(str "vertical-align:" (name v-align))]))]
    (cond-> (into {} (map (fn [[k v]] [(keyword k) v])) attrs)
      title (assoc :title title)
      id (assoc :id id)
      (seq classes) (assoc :class (str/join " " classes))
      (seq style-parts) (assoc :style (str/join ";" style-parts)))))

(ns texy.patterns
  "Shared grammar patterns, kept in Java-regex syntax.

  The reference grammar is defined by PCRE patterns (docs/porting.md: \"the
  reference regexes are the authoritative grammar\"). This port translates
  them to java.util.regex by hand:

  - extended mode (x) whitespace/comments are stripped;
  - the ungreedy flag (U) is inverted into explicit lazy quantifiers
    (PCRE `X+` under U is lazy -> Java `X+?`; possessive `X++` stays);
  - `\\x{hhhh}` codepoint escapes are supported by Java as-is;
  - PCRE recursion `(?0)` is not used by the ported subset (the /-- blocks
    are not implemented)."
  (:require [clojure.string :as str]))

(def letter
  "The reference's Letter ranges (Patterns::Letter): ASCII, Latin
  Extended and Greek/Cyrillic blocks - deliberately NOT \\p{L}. This is
  the grammar - what the reference recognizes as syntax (CJK autolinks
  stay plain text) - so parse patterns keep it faithful; the typography
  nbsp rule is the deliberate all-scripts extension."
  "A-Za-z\\x{C0}-\\x{2FF}\\x{370}-\\x{1EFF}")

(def ^:private title-part "\\((?:\\\\\\)|[^)\\n])+\\)")
(def ^:private class-part "\\[[^\\]\\n]+\\]")
(def ^:private style-part "\\{[^}\\n]+\\}")

(defn modifier-pattern
  "The .(title)[class]{style} modifier, optionally with align parts.
  Bound is the maximum number of parts (3/4/5 in the reference). The parts
  are the capture (group N of the embedding pattern - always the first
  group the modifier contributes)."
  [& {:keys [align valign bound] :or {bound 3}}]
  (str "[ \t]*+(?<=[\t ]|^)\\.((?:"
       (str/join "|" (concat [title-part class-part style-part]
                             (when align ["<>" ">" "=" "<"])
                             (when valign ["\\^" "-" "_"])))
       "){1," bound "})"))

(def modifier (modifier-pattern))
(def modifier-h (modifier-pattern :align true :bound 4))
(def modifier-hv (modifier-pattern :align true :valign true :bound 5))

;; links, url - doesn't end by :).,!? (greedy body: PCRE {0,1000}? under U)
(def link-url
  (str "\\[[^\\]\\n]+]|(?=[\\w/+.~%&?@=_#$])\\S{0,1000}[^:);,.!?\\s]"))

(def email
  (str "[" letter "][0-9.+_" letter "\\x{ad}-]{0,63}@[0-9.+_"
       letter "\\x{ad}-]{1,252}\\.[" letter "\\x{ad}]{2,19}"))

(defn char-class
  "Wraps characters in a class, unless a single (possibly escaped) one
  speaks for itself."
  [chars]
  (if (re-matches #"(?:\\.|[^\\])" chars) chars (str "[" chars "]")))

(defn build-phrase-pattern
  "Builds the pattern of a paired phrase from its delimiter spec:
  (?<! guard) open (?! ...) content modifier? (?<! ...) close (?! ...)
  (:link)? - the PCRE-ungreedy inversion is baked in (lazy content,
  greedy modifier/link)."
  [{:keys [open char close close-char guard guard-after before-open after-open
           before-close after-close content content-pair link multiline]
    :or {guard "" guard-after ""}}]
  (let [char (or char "")
        close-char (or close-char char)
        close (or close open)
        before-open (or before-open (char-class (str char guard)))
        after-open (or after-open (char-class (str "\\s" char guard-after)))
        before-close (or before-close (char-class (str "\\s" close-char guard)))
        after-close (or after-close (char-class (str close-char guard-after)))
        content (or content (str (if multiline "" "\\r\\n") " " close-char))
        content-pair (or content-pair (str " " close-char))]
    (str
      "(?<!" before-open ")" open "(?!" after-open ")"
      "((?:[^" content "]++|[" content-pair "])+?)"
      "(?:" modifier ")?"
      "(?<!" before-close ")" close "(?!" after-close ")"
      (when link (str "(?::(" link-url "))?")))))

(ns rarousnet.texy
  (:require
    [clojure.string :as string]))

(def locales
  {"cs"
   {:single-quotes ["‚" "‘"]
    :double-quotes ["„" "“"]}

   "en"
   {:single-quotes ["‘" "’"]
    :double-quotes ["“" "”"]}

   "fr"
   {:single-quotes ["‹" "›"]
    :double-quotes ["«" "»"]}

   "de"
   {:single-quotes ["‚" "‘"]
    :double-quotes ["„" "“"]}
    
   "pl"
   {:single-quotes ["‚" "’"]
    :double-quotes ["„" "”"]}})

(defn- patterns [{:keys [single-quotes double-quotes]}]
  [
    [#"(?mu)(?<![.\x{2026}])\.{3,4}(?![.\x{2026}])" "…"] ; ellipsis  ...
    [#"(?<=[\d ]|^)-(?=[\d ]|$)" "–"] ; en dash 123-123
    [#"(?<=[^!*+,/:;<=>@\\\\_|-])--(?=[^!*+,/:;<=>@\\\\_|-])" "–"] ; en dash alphanum--alphanum
    [#",-" ",–"] ; en dash ,-
    [#"(?<!\d)(\d{1,2}\.) (\d{1,2}\.) (\d\d)" "$1\u00A0$2\u00A0$3"] ; date 23. 1. 1978
    [#"(?<!\d)(\d{1,2}\.) (\d{1,2}\.)" "$1\u00A0$2"] ; date 23. 1.
    [#" --- " "\u00A0— "] ; em dash ---
    [#"(?u) ([\u2013\u2014])" "\u00A0$1"] ; &nbsp; behind dash (dash stays at line end)
    [#" <-{1,2}> " " ↔ "] ; left right arrow <-->
    [#"-+> " "→ "] ; right arrow -->
    [#" <-+" " ← "] ; left arrow <--
    [#"=+> " "⇒ "] ; right arrow ==>
    [#"\+-" "±"] ; +-
    [#"(\d++) x (?=\d)" "$1\u00A0×\u00A0"] ; dimension sign 123 x 123...
    [#"(\d++)x(?=\d)" "$1×"] ; dimension sign 123x123...
    [#"(?m)(?<=\d)x(?= |,|.|$)" "×"] ; dimension sign 123x
    [#"(?i)(\S ?)\(TM\)" "$1™"] ; trademark (TM)
    [#"(?i)(\S ?)\(R\)" "$1®"] ; registered (R)
    [#"(?i)\(C\)( ?\S)" "©$1"] ; copyright (C)
    [#"\(EUR\)" "€"] ; Euro (EUR)
    [#"(\d) (?=\d{3})" "$1\u00A0"] ; (phone) number 1 123 123 123...

    ; CONTENT_MARKUP mark: \x17-\x1F, CONTENT_REPLACED mark: \x16, CONTENT_TEXTUAL mark: \x17
    [#"(?u)(?<=[^\s\x17])\s++([\x17-\x1F]++)(?=\s)" "$1"] ; remove intermarkup space phase 1
    [#"(?u)(?<=\s)([\x17-\x1F]+)\s++" "$1"] ; remove intermarkup space phase 2

    [#"(?us)(?<=.{50})\s++(?=[\x17-\x1F]*\S{1,6}[\x17-\x1F]*$)" "\u00A0"] ; space before last short word

    ; nbsp space between number (optionally followed by dot) and word, symbol, punctation, currency symbol
    [
      #"(?mu)(?<=^| |\.|,|-|\+|\x16|\(|\d\x{A0})([\x17-\x1F]*\d++\.?[\x17-\x1F]*)\s++(?=[\x17-\x1F]*[%\p{L}\p{P}\p{Sc}])"
      "$1\u00A0"
    ]
    ; space between preposition and word
    [
      #"(?mus)(?<=^|[^0-9\p{L}])([\x17-\x1F]*[ksvzouiKSVZOUIA][\x17-\x1F]*)\s++(?=[\x17-\x1F]*[0-9\p{L}])"
      "$1\u00A0"
    ]

    ; double ""
    [
      #"(?Uu)(?<!\"|\w)\"(?![ \"])((?:[^\"]++|\")+)(?<![ \"])\"(?![\"\p{L}])()"
      (str (first double-quotes) "$1" (last double-quotes))
    ]
    
    ; single ''
    [
      #"(?Uu)(?<!'|\w)'(?![ '])((?:[^']+|')++)(?<![ '])'(?!['\p{L}])()"
      (str (first single-quotes) "$1" (last single-quotes))
    ]
  ])

(defn process-typo
  ([input] (process-typo input {:locale "cs"}))
  ([input {:keys [locale]}]
    (reduce
      (fn [s [m r]] (string/replace s m r))
      input
      (patterns (get locales locale)))))
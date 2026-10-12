(ns texy.hyphenation
  "Breaks long words with soft hyphens (U+00AD) for better line wrapping -
  the port of Texy\\Modules\\HyphenationModule.

  postLine operates on the TextRunPass text image: words longer than
  the word limit (default 20) are split into syllables joined with
  soft hyphens. The syllable boundaries come from the Czech/English
  vowel/consonant state machine (get-hyphen below); runs of marker
  bytes count as one pseudo-character, so a word never breaks inside
  markup. Runs as the second text-run transformer, after typography
  (the reference applyAstTypography order)."
  (:require [clojure.string :as str]))

(def ^:private consonants
  "Consonants (the reference table, Czech diacritics included)."
  #{"b" "c" "d" "f" "g" "h" "j" "k" "l" "m" "n" "p" "q" "r" "s" "t" "v"
    "w" "x" "z"
    "B" "C" "D" "F" "G" "H" "J" "K" "L" "M" "N" "P" "Q" "R" "S" "T" "V"
    "W" "X" "Z"
    "\u010D" "\u010F" "\u0148" "\u0159" "\u0161" "\u0165" "\u017E" ; č ď ň ř š ť ž
    "\u010C" "\u010E" "\u0147" "\u0158" "\u0160" "\u0164" "\u017D"}) ; Č Ď Ň Ř Š Ť Ž

(def ^:private vowels
  #{"a" "e" "i" "o" "u" "y"
    "A" "E" "I" "O" "U" "Y"
    "\u00E1" "\u00E9" "\u011B" "\u00ED" "\u00F3" "\u00FA" "\u016F" "\u00FD"
    "\u00C1" "\u00C9" "\u011A" "\u00CD" "\u00D3" "\u00DA" "\u016E" "\u00DD"})

(def ^:private before-r
  #{"b" "B" "c" "C" "d" "D" "f" "F" "g" "G" "k" "K" "p" "P" "r" "R" "t" "T" "v" "V"
    "\u010D" "\u010C" "\u010F" "\u010E" "\u0159" "\u0158" "\u0165" "\u0164"})

(def ^:private before-l
  #{"b" "B" "c" "C" "d" "D" "f" "F" "g" "G" "k" "K" "l" "L" "p" "P" "t" "T" "v" "V"
    "\u010D" "\u010C" "\u010F" "\u010E" "\u0165" "\u0164"})

(def ^:private before-h #{"c" "C" "s" "S"})

(def ^:private double-vowels #{"a" "A" "o" "O"})

(def ^:private safe-limit 1000)

(defn- get-hyphen
  "The hyphenation state machine: :dont, :here (hyphenate before this
  char) or :after (hyphenate after it)."
  [ch prev next]
  (cond
    (= ch ".") :here

    (contains? consonants ch)
    (cond
      (contains? vowels next)
      (if (contains? vowels prev) :here :dont)

      (and (= ch "s") (= prev "n") (contains? consonants next))
      :after

      (and (contains? consonants next) (contains? vowels prev))
      (cond
        (= next "r") (if (contains? before-r ch) :here :after)
        (= next "l") (if (contains? before-l ch) :here :after)
        (= next "h") (if (contains? before-h ch) :dont :after) ; CH
        :else :after)

      :else :dont)

    (and (= ch "u") (contains? double-vowels prev)) :after

    (and (contains? vowels ch) (contains? vowels prev)) :here

    :else :dont))

(defn- hyphenate
  "Splits one long word into syllables joined with soft hyphens (the
  reference HyphenationModule::pattern). A run of marker bytes counts
  as one pseudo-character, so words never break inside markup."
  [^String word word-limit]
  (if (> (count word) safe-limit)
    word
    (let [chars (vec (re-seq #"[\x15-\x17]+|." word))]
      (if (< (count chars) word-limit)
        word
        (let [;; the marker runs (first char a control byte) are excluded
              ;; from the hyphenation alphabet but stay in the output
              kept (keep (fn [[key ch]]
                          (when (>= (int (.charAt ^String ch 0)) 32)
                            [key ch]))
                        (map-indexed vector chars))
              s (into [""] (map second) kept)
              s (conj (vec s) "")
              trans (into [-1] (map first) kept)
              len (- (count s) 2)
              ;; the walking loop: NBSP positions never hyphenate, the
              ;; state machine marks the boundaries; last blocks
              ;; positions closer than 0.6 * word limit apart
              positions
              (loop [a 0, last 1, positions []]
                (let [a (inc a)]
                  (cond
                    (>= a len) positions

                    (= "\u00A0" (nth s a))
                    (recur (inc a) last positions)

                    :else
                    (let [hyphen (get-hyphen (nth s a) (nth s (dec a)) (nth s (inc a)))]
                      (cond
                        (and (= :dont hyphen)
                             (> (- a last) (* 0.6 word-limit)))
                        (recur a (dec a) (conj positions (dec a)))

                        (= :here hyphen)
                        (recur a (dec a) (conj positions (dec a)))

                        (= :after hyphen)
                        (recur (inc a) a (conj positions a))

                        :else
                        (recur a last positions))))))
              ;; a hyphen right before a trailing consonant is dropped
              positions
              (if (and (seq positions)
                       (= (peek positions) (dec len))
                       (contains? consonants (nth s len)))
                (pop positions)
                positions)
              ;; the syllables: consecutive boundary positions, each
              ;; at least 0.6 * word limit after the previous one; the
              ;; chars are consumed from the front via the trans index
              ;; (marker runs between boundaries ride along whole)
              syllables
              (loop [positions positions, chars chars, syllables [], last 0]
                (if-some [pos (first positions)]
                  (if (> (- pos last) (* 0.6 word-limit))
                    (let [n (- (nth trans pos) (nth trans last))]
                      (recur (rest positions)
                             (subvec chars n)
                             (conj syllables (str/join (subvec chars 0 n)))
                             pos))
                    (recur (rest positions) chars syllables last))
                  (conj syllables (str/join chars))))]
          (str/join "\u00AD" syllables))))))

(defn post-line
  "Hyphenates words longer than the limit (default 20), splitting them
  with soft hyphens at syllable boundaries. Spaces, tabs, newlines,
  marker bytes, dashes and soft hyphens break words (the reference
  postLine)."
  ([^String text] (post-line text 20))
  ([^String text word-limit]
   (str/replace text
                (re-pattern (str "[^ \\n\\t\\x15\\x16\\u2013\\u2014\\u00AD-]{" word-limit ",}"))
                #(hyphenate % word-limit))))

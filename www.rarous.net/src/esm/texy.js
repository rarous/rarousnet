const locales = new Map([
  ["cs", {
    singleQuotes: ["‚", "‘"],
    doubleQuotes: ["„", "“"],
  }],

  ["en", {
    singleQuotes: ["‘", "’"],
    doubleQuotes: ["“", "”"],
  }],

  ["fr", {
    singleQuotes: ["‹", "›"],
    doubleQuotes: ["«", "»"],
  }],

  ["de", {
    singleQuotes: ["‚", "‘"],
    doubleQuotes: ["„", "“"],
  }],

  ["pl", {
    singleQuotes: ["‚", "’"],
    doubleQuotes: ["„", "”"],
  }],
]);

function definePatterns({ singleQuotes, doubleQuotes }) {
  return [
    [/(?<![.\u{2026}])\.{3,4}(?![.\u{2026}])/mug, "…"], // ellipsis  ...
    [/(?<=[\d ]|^)-(?=[\d ]|$)/g, "–"], // en dash 123-123
    [/(?<=[^!*+,/:;<=>@\\_|-])--(?=[^!*+,/:;<=>@\\_|-])/g, "–"], // en dash alphanum--alphanum
    [/,-/g, ",–"], // en dash ,-
    [/(?<!\d)(\d{1,2}\.) (\d{1,2}\.) (\d\d)/g, "\$1\u{A0}\$2\u{A0}\$3"], // date 23. 1. 1978
    [/(?<!\d)(\d{1,2}\.) (\d{1,2}\.)/g, "\$1\u{A0}\$2"], // date 23. 1.
    [/ --- /g, "\u{A0}— "], // em dash ---
    [/ ([\u{2013}\u{2014}])/ug, "\u{A0}\$1"], // &nbsp; behind dash (dash stays at line end)
    [/ <-{1,2}> /g, " ↔ "], // left right arrow <-->
    [/-+> /g, "→ "], // right arrow -->
    [/ <-+/g, " ← "], // left arrow <--
    [/=+> /g, "⇒ "], // right arrow ==>
    [/\+-/g, "±"], // +-
    [/(\d+) x (?=\d)/g, "\$1\u{A0}\u{D7}\u{A0}"], // dimension sign 123 x 123...
    [/(\d+)x(?=\d)/g, "\$1×"], // dimension sign 123x123...
    [/(?<=\d)x(?= |,|.|$)/mg, "×"], // dimension sign 123x
    [/(\S ?)\(TM\)/ig, "\$1™"], // trademark (TM)
    [/(\S ?)\(R\)/ig, "\$1®"], // registered (R)
    [/\(C\)( ?\S)/ig, "©\$1"], // copyright (C)
    [/\(EUR\)/g, "€"], // Euro (EUR)
    [/(\d) (?=\d{3})/g, "\$1\u{A0}"], // (phone) number 1 123 123 123...

    // CONTENT_MARKUP mark: \x17-\x1F, CONTENT_REPLACED mark: \x16, CONTENT_TEXTUAL mark: \x17
    [/(?<=[^\s\x17])\s+([\x17-\x1F]+)(?=\s)/ug, "$1"], // remove intermarkup space phase 1
    [/(?<=\s)([\x17-\x1F]+)\s+/ug, "$1"], // remove intermarkup space phase 2

    [/(?<=.{50})\s+(?=[\x17-\x1F]*\S{1,6}[\x17-\x1F]*$)/usg, "\u{A0}"], // space before last short word

    // nbsp space between number (optionally followed by dot) and word, symbol, punctation, currency symbol
    [
      /(?<=^| |\.|,|-|\+|\x16|\(|\d\xA0)([\x17-\x1F]*\d+\.?[\x17-\x1F]*)\s+(?=[\x17-\x1F]*[%\p{Letter}\p{Punctuation}\p{Currency_Symbol}])/mvg,
      "\$1\u{A0}",
    ],
    // space between preposition and word
    [
      /(?<=^|[^0-9\p{Letter}])([\x17-\x1F]*[ksvzouiKSVZOUIA][\x17-\x1F]*)\s+(?=[\x17-\x1F]*[0-9\p{Letter}])/mvsg,
      "\$1\u{A0}",
    ],

    // double ""
    [
      /(?<!"|\w)"(?![ "])((?:[^"]+|")+)(?<![ "])"(?!["\p{Letter}])()/vg,
      `${doubleQuotes[0]}$1${doubleQuotes[1]}`,
    ],
    // single ''
    [
      /(?<!'|\w)'(?![ '])((?:[^']+|')+)(?<![ '])'(?!['\p{Letter}])()/vg,
      `${singleQuotes[0]}$1${singleQuotes[1]}`,
    ],
  ];
}

/**
 * Apply typografic substitutions to given text input.
 * @param {string} input
 * @param {Object} options
 * @param {string} options.locale Locale determines what quotation marks will be applied. Default `cs`
 */
export function processTypo(input, { locale } = { locale: "cs" }) {
  const patterns = definePatterns(locales.get(locale ?? "en"));
  return patterns.reduce((i, [p, r]) => i.replaceAll(p, r), input);
}

class TexyTypography extends HTMLElement {
  connectedCallback() {
    const text = this.textContent;
    const locale = this.getAttribute("lang") ?? "cs";
    this.innerText = processTypo(text, { locale });
  }
}

customElements.define("texy-typo", TexyTypography);

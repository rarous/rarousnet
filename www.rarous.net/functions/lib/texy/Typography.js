/**
 * Typographic substitutions (port of Texy\Modules\TypographyModule's
 * pattern catalog), replacing the @gryphoon/texy delegation.
 *
 * The patterns operate on TextRunPass text images: the marker bytes
 * \x15 (protected text), \x16 (replaced content) and \x17 (markup
 * boundary) stand in for non-text nodes; the patterns never create nor
 * destroy them.
 *
 * The quote patterns mirror the reference's PCRE (which runs ungreedy
 * with an embedded-quote alternation): a lazy quantifier over
 * (non-quotes | quote), so a quote inside a quoted span does not stop
 * the substitution ('This guy's really nice.' -> ‚…‘).
 */

const locales = new Map([
	[
		"cs",
		{
			singleQuotes: ["\u201A", "\u2018"], // ‚ ‘
			doubleQuotes: ["\u201E", "\u201C"], // „ “
		},
	],
	[
		"sk",
		{
			singleQuotes: ["\u201A", "\u2018"],
			doubleQuotes: ["\u201E", "\u201C"],
		},
	],
	[
		"en",
		{
			singleQuotes: ["\u2018", "\u2019"], // ‘ ’
			doubleQuotes: ["\u201C", "\u201D"], // “ ”
		},
	],
	[
		"nl",
		{
			singleQuotes: ["\u2018", "\u2019"],
			doubleQuotes: ["\u201C", "\u201D"],
		},
	],
	[
		"fr",
		{
			singleQuotes: ["\u2039", "\u203A"], // ‹ ›
			doubleQuotes: ["\u00AB", "\u00BB"], // « »
		},
	],
	[
		"da",
		{
			singleQuotes: ["\u203A", "\u2039"], // › ‹
			doubleQuotes: ["\u00BB", "\u00AB"], // » «
		},
	],
	[
		"de",
		{
			singleQuotes: ["\u201A", "\u2018"],
			doubleQuotes: ["\u201E", "\u201C"],
		},
	],
	[
		"pl",
		{
			singleQuotes: ["\u201A", "\u2019"],
			doubleQuotes: ["\u201E", "\u201D"],
		},
	],
	[
		"hr",
		{
			singleQuotes: ["\u201A", "\u2019"],
			doubleQuotes: ["\u201E", "\u201D"],
		},
	],
	[
		"fi",
		{
			singleQuotes: ["\u2019", "\u2019"],
			doubleQuotes: ["\u201D", "\u201D"],
		},
	],
	// the reference catalog's remaining languages
	[
		"bg",
		{
			singleQuotes: ["\u201A", "\u2018"],
			doubleQuotes: ["\u201E", "\u201C"],
		},
	],
	[
		"el",
		{
			// guillemets nest curly quotes as the inner level
			singleQuotes: ["\u201C", "\u201D"],
			doubleQuotes: ["\u00AB", "\u00BB"],
		},
	],
	[
		"es",
		{
			singleQuotes: ["\u201C", "\u201D"],
			doubleQuotes: ["\u00AB", "\u00BB"],
		},
	],
	[
		"hu",
		{
			singleQuotes: ["\u201A", "\u2019"],
			doubleQuotes: ["\u201E", "\u201D"],
		},
	],
	[
		"it",
		{
			singleQuotes: ["\u201C", "\u201D"],
			doubleQuotes: ["\u00AB", "\u00BB"],
		},
	],
	[
		"ja",
		{
			// corner brackets: 「…」 primary, 『…』 nested
			singleQuotes: ["\u300E", "\u300F"],
			doubleQuotes: ["\u300C", "\u300D"],
		},
	],
	[
		"pt",
		{
			// Brazilian usage, which is what the pt documentation follows
			singleQuotes: ["\u2018", "\u2019"],
			doubleQuotes: ["\u201C", "\u201D"],
		},
	],
	[
		"ro",
		{
			singleQuotes: ["\u201A", "\u2019"],
			doubleQuotes: ["\u201E", "\u201D"],
		},
	],
	[
		"ru",
		{
			singleQuotes: ["\u201E", "\u201C"],
			doubleQuotes: ["\u00AB", "\u00BB"],
		},
	],
	[
		"sl",
		{
			singleQuotes: ["\u201A", "\u2018"],
			doubleQuotes: ["\u201E", "\u201C"],
		},
	],
	[
		"tr",
		{
			singleQuotes: ["\u2018", "\u2019"],
			doubleQuotes: ["\u201C", "\u201D"],
		},
	],
	[
		"uk",
		{
			singleQuotes: ["\u201E", "\u201C"],
			doubleQuotes: ["\u00AB", "\u00BB"],
		},
	],
]);

/**
 * The "space before last short word" rule, hand-implemented. The only
 * matchable whitespace run is the last one - any earlier run's tail still
 * contains whitespace, which the lookahead cannot span. The match may start
 * mid-run at index 50 (the lookbehind); everything from there to the run end
 * is replaced with a no-break space. A tail qualifies when it holds no
 * whitespace at all and its non-marker span fits \S{1,6} - markers count as
 * \S and may interleave within those six characters.
 * @param {string} s
 * @returns {string}
 */
export function bindLastShortWord(s)
{
	const n = s.length;
	if (n < 51) return s; // 50 chars before the space, plus the space itself

	// the last whitespace run of the segment
	let runEnd = n;
	while (runEnd > 0 && !isJsWhitespace(s.charCodeAt(runEnd - 1))) runEnd--;
	if (runEnd === 0) return s; // no whitespace at all
	let runStart = runEnd;
	while (runStart > 0 && isJsWhitespace(s.charCodeAt(runStart - 1))) runStart--;

	if (!tailIsShortWord(s, runEnd)) return s;

	const matchStart = Math.max(runStart, 50); // the lookbehind
	if (matchStart >= runEnd) return s; // the whole run sits before index 50
	return s.slice(0, matchStart) + "\u00A0" + s.slice(runEnd);
}


/**
 * Does the tail from `runEnd` to the end match the reference's lookahead
 * `[\x17-\x1F]*\S{1,6}[\x17-\x1F]*$`?
 * @param {string} s
 * @param {number} runEnd
 * @returns {boolean}
 */
function tailIsShortWord(s, runEnd)
{
	let first = -1; // first non-marker char of the tail
	let last = -1; // last non-marker char of the tail
	for (let i = runEnd; i < s.length; i++) {
		const c = s.charCodeAt(i);
		if (isJsWhitespace(c)) return false; // the tail must be whitespace-free
		if (c < 0x17 || c > 0x1f) {
			if (first === -1) first = i;
			last = i;
		}
	}

	if (last === -1) return s.length > runEnd; // markers only: \S{1,6} takes one, the rest trail
	return last - first <= 5; // the non-marker span must fit in \S{1,6}
}


/** The exact \s character set of JavaScript's regexes. */
function isJsWhitespace(c)
{
	return c === 0x20 || (c >= 0x09 && c <= 0x0d) || c === 0xa0 || c === 0x1680
		|| (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x2029
		|| c === 0x202f || c === 0x205f || c === 0x3000 || c === 0xfeff;
}

export function definePatterns({ singleQuotes, doubleQuotes })
{
	return [
		[/(?<![.\u{2026}])\.{3,4}(?![.\u{2026}])/gmu, "\u2026", "..."], // ellipsis  ...
		[/(?<=[\d ]|^)-(?=[\d ]|$)/g, "\u2013", "-"], // en dash 123-123
		[/(?<=[^!*+,/:;<=>@\\_|-])--(?=[^!*+,/:;<=>@\\_|-])/g, "\u2013", "--"], // en dash alphanum--alphanum
		[/,-/g, ",\u2013", ",-"], // en dash ,-
		[/(?<!\d)(\d{1,2}\.) (\d{1,2}\.) (\d\d)/g, "$1\u00A0$2\u00A0$3"], // date 23. 1. 1978
		[/(?<!\d)(\d{1,2}\.) (\d{1,2}\.)/g, "$1\u00A0$2"], // date 23. 1.
		[/ --- /g, "\u00A0\u2014 ", "---"], // em dash ---
		[/ ([\u{2013}\u{2014}])/gu, "\u00A0$1"], // &nbsp; behind dash (dash stays at line end)
		[/ <-{1,2}> /g, " \u2194 ", "<"], // left right arrow <-->
		[/-+> /g, "\u2192 ", "->"], // right arrow -->
		[/ <-+/g, " \u2190 ", "<-"], // left arrow <--
		[/=+> /g, "\u21D2 ", "=>"], // right arrow ==>
		[/\+-/g, "\u00B1", "+-"], // +-
		[/(\d+) x (?=\d)/g, "$1\u00A0\u00D7\u00A0", " x "], // dimension sign 123 x 123...
		[/(\d+)x(?=\d)/g, "$1\u00D7", "x"], // dimension sign 123x123...
		[/(?<=\d)x(?= |,|\.|$)/gm, "\u00D7", "x"], // dimension sign 123x
		[/(\S ?)\(TM\)/gi, "$1\u2122", "("], // trademark (TM)
		[/(\S ?)\(R\)/gi, "$1\u00AE", "("], // registered (R)
		[/\(C\)( ?\S)/gi, "\u00A9$1", "("], // copyright (C)
		[/\(EUR\)/g, "\u20AC", "(EUR)"], // Euro (EUR)
		[/(\d) (?=\d{3})/g, "$1\u00A0"], // (phone) number 1 123 123 123...

		// CONTENT_MARKUP mark: \x17-\x1F, CONTENT_REPLACED mark: \x16, CONTENT_TEXTUAL mark: \x17
		[/(?<=[^\s\x17])\s+([\x17-\x1F]+)(?=\s)/gu, "$1"], // remove intermarkup space phase 1
		[/(?<=\s)([\x17-\x1F]+)\s+/gu, "$1"], // remove intermarkup space phase 2

		// space before last short word: the reference
		// `(?<= .{50}) \s++ (?= \x17* \S{1,6} \x17* $)` is hand-implemented in
		// bindLastShortWord - the 50-char lookbehind is attempted at every
		// position, an O(50n) scan in V8, while the tail check only touches
		// the last whitespace run
		[bindLastShortWord, ""],

		// nbsp space between number (optionally followed by dot) and word,
		// symbol, currency symbol - % and letters kept as \p{Letter} (a
		// deliberate extension beyond the reference's legacy
		// A-Za-z/Latin/Greek/Cyrillic ranges: it covers all scripts), plus
		// the reference's U+00B0-U+00BE and U+2020-U+214F symbol blocks
		// (°, …, €, ...) - these have no faithful Unicode class, so they
		// stay ranges (\p{Punctuation} would wrongly match ",")
		[
			/(?<=^| |\.|,|-|\+|\x16|\(|\d\xA0)([\x17-\x1F]*\d+\.?[\x17-\x1F]*)\s+(?=[\x17-\x1F]*[%\p{Letter}\u00B0-\u00BE\u2020-\u214F])/gmv,
			"$1\u00A0",
		],
		// space between preposition and word
		[
			/(?<=^|[^0-9\p{Letter}])([\x17-\x1F]*[ksvzouiKSVZOUIA][\x17-\x1F]*)\s+(?=[\x17-\x1F]*[0-9\p{Letter}])/gmsv,
			"$1\u00A0",
		],

		// double "" - the reference's lazy inner class with an embedded-quote
		// alternation, so a quote inside the span does not stop the substitution
		[/(?<!"|\w)"(?![ "])((?:[^"]+|")+?)(?<![ "])"(?!["\p{Letter}])/gv, `${doubleQuotes[0]}$1${doubleQuotes[1]}`, "\""],
		// single ''
		[/(?<!'|\w)'(?![ '])((?:[^']+|')+?)(?<![ '])'(?!['\p{Letter}])/gv, `${singleQuotes[0]}$1${singleQuotes[1]}`, "'"],
	];
}

/**
 * Apply typographic substitutions to given text input.
 * @param {string} input
 * @param {Object} [options]
 * @param {string} options.locale Locale determines what quotation marks will be applied. Default `en`
 */
export function processTypo(input, options)
{
	const { locale = "en" } = options ?? {};
	const patterns = definePatterns(locales.get(locale.substring(0, 2)) ?? locales.get("en"));
	// an entry is [regex, replacement] or [ruleFunction, ""]; a rule function
	// is a hand-implemented reference pattern. The optional third element is a
	// literal anchor: a match can only exist when the segment contains it, so
	// a missing anchor skips the scan entirely (each anchor's necessity is
	// machine-checked - see the typography tests)
	return patterns.reduce(
		(i, [rule, replacement, anchor]) => {
			if (typeof rule === 'function') return rule(i);
			if (anchor && !i.includes(anchor)) return i;
			return i.replaceAll(rule, replacement);
		},
		input,
	);
}

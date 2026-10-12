/**
 * Shared regular expression patterns (port of Texy\Patterns).
 * The patterns are PCRE, compiled to JS by src/Regexp.js.
 */

/** Unicode character class used throughout the grammar. */
/**
 * The reference's Letter ranges (Patterns::Letter): ASCII, Latin Extended and
 * Greek/Cyrillic blocks - deliberately NOT \\p{Letter}. This is the grammar -
 * what the reference recognizes as syntax (CJK autolinks stay plain text) -
 * so parse patterns keep it faithful; the typography nbsp rule is the
 * deliberate all-scripts extension.
 */
export const Letter = 'A-Za-z\\x{C0}-\\x{2FF}\\x{370}-\\x{1EFF}';

// modifier .(title)[class]{style}
export const Modifier = String.raw`(?x:
	[ \t]*+ (?<= [ \t] | ^ )
	\.
	((?:
		\( (?: \\\) | [^)\n] )++ \) |
		\[ [^]\n]++ ] |
		\{ [^}\n]++ }
	){1,3}?)
)`;

// modifier .(title)[class]{style}<>
export const ModifierHAlign = String.raw`(?x:
	[ \t]*+ (?<= [ \t] | ^ )
	\.
	((?:
		\( (?: \\\) | [^)\n] )++ \) |
		\[ [^]\n]++ ] |
		\{ [^}\n]++ } |
		<> | > | = | <
	){1,4}?)
)`;

// modifier .(title)[class]{style}<>^
export const ModifierHVAlign = String.raw`(?x:
	[ \t]*+ (?<= [ \t] | ^ )
	\.
	((?:
		\( (?: \\\) | [^)\n] )++ \) |
		\[ [^]\n]++ ] |
		\{ [^}\n]++ } |
		<> | > | = | < |
		\^ | - | _
	){1,5}?)
)`;

// links, url - doesn't end by :).,!?
export const LinkUrl = String.raw`(?x:
	\[ [^]\n]++ ]                    # link text in brackets
	|
	(?= [\w/+.\~%&?@=_#$] )         # URL must start with these chars
	\S{0,1000}?                     # URL body
	[^:);,.!?\s]                    # URL must not end with these chars
)`;

export const Email = String.raw`(?x:
	[` + Letter + String.raw`]                 # first char
	[0-9.+_` + Letter + String.raw`\x{ad}-]{0,63}  # local part
	@
	[0-9.+_` + Letter + String.raw`\x{ad}-]{1,252} # domain
	\.
	[` + Letter + String.raw`\x{ad}]{2,19}     # TLD
)`;

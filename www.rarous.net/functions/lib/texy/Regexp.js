/**
 * PCRE-to-JavaScript regular expression translation layer.
 *
 * Texy's grammar is defined by PCRE patterns (see docs/porting.md §5: "the
 * reference regexes are the authoritative grammar"). To keep the port
 * faithful, patterns are kept in PCRE syntax and compiled to native JS
 * RegExp objects by this module. The translation handles the PCRE features
 * JS lacks:
 *
 * - extended mode (`x` flag, inline `(?x:...)` groups): whitespace and
 *   `#` comments outside character classes are stripped;
 * - ungreedy mode (`U` flag): quantifier greediness is swapped;
 * - possessive quantifiers (`X++`, `X*+`, `X{1,3}+`) and atomic groups
 *   `(?>...)`: emulated as `(?=(?<pK>atom q))\k<pK>` — an assertion is not
 *   re-entered while backtracking, which is exactly atomic behavior;
 * - `\s` is redefined to PCRE's set (JS `\s` includes NBSP and other
 *   Unicode spaces, PCRE's does not — guards depend on this);
 * - `\x{hhhh}` escapes -> `\u{hhhh}`; `\A`, `\z`, `\Z` -> JS equivalents;
 * - pattern recursion `(?0)`: expanded inline to a bounded depth, deeper
 *   occurrences degrade to a failing branch;
 * - captures and backreferences are converted to named groups so the
 *   emulation groups cannot shift the group numbers handlers rely on.
 *
 * Not supported (not used by the parse-phase patterns): named groups,
 * conditionals, callouts, `\Q..\E`, inline case-insensitivity `(?i)`.
 */

/**
 * PCRE's `\s` set under the `u` flag (probed against the reference engine):
 * HT, LF, VT, FF, CR, space, NEL, NBSP, OGHAM SPACE MARK, U+2000-U+200A,
 * LS, PS, NARROW NBSP, MEDIUM MATHEMATICAL SPACE, IDEOGRAPHIC SPACE.
 * Identical to JS `\s` except that the BOM (U+FEFF) is NOT whitespace here.
 */
const SPACE = '\\t\\n\\v\\f\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const RECURSION = '\x00\x00REC\x00\x00';
const MAX_RECURSION_DEPTH = 8;

const cache = new Map();


/**
 * Splits a PCRE pattern into body and flags. The pattern is expected in the
 * delimiter-wrapped form used by the reference implementation, e.g. `~...~Uix`.
 * @param {string} pattern
 * @returns {[string, string]}
 */
export function splitPattern(pattern)
{
	if (pattern.length < 2) {
		throw new Error('Invalid pattern: ' + pattern);
	}

	const open = pattern[0];
	const closes = { '(': ')', '[': ']', '{': '}', '<': '>' };
	const close = closes[open] ?? open;

	const end = pattern.lastIndexOf(close);
	if (end <= 0) {
		throw new Error('Invalid pattern: ' + pattern);
	}

	return [pattern.slice(1, end), pattern.slice(end + 1)];
}


class Translator
{
	/** @param {{namePrefix?: string}} options */
	constructor(options = {})
	{
		this.namePrefix = options.namePrefix ?? '';
		this.state = { captureCount: 0, emulationCount: 0 };
	}


	/**
	 * Translates a PCRE pattern body (no delimiters).
	 * @param {string} body
	 * @param {{x?: boolean, U?: boolean}} flags
	 * @returns {string} JS RegExp source
	 */
	translate(body, flags)
	{
		const f = { x: false, U: false, ...flags };
		let out = '';
		let i = 0;
		let atomStart = 0; // start of the last completed atom in `out`
		const closeStack = []; // per open group: { atomStart, flags? }

		while (i < body.length) {
			const ch = body[i];

			if (f.x && /[ \t\n\r\f\v]/.test(ch)) { // x-mode: whitespace ignored outside classes
				i++;
				continue;
			}

			if (f.x && ch === '#') { // x-mode: comment to end of line
				while (i < body.length && body[i] !== '\n') i++;
				continue;
			}

			if (ch === '\\') {
				const [piece, next] = this.escape(body, i);
				atomStart = out.length;
				out += piece;
				i = next;
				continue;
			}

			if (ch === '[') {
				const [piece, next] = this.charClass(body, i);
				atomStart = out.length;
				out += piece;
				i = next;
				continue;
			}

			if (ch === '(') {
				const [piece, next, pushClose, flagsAtClose] = this.group(body, i, f);
				if (pushClose) closeStack.push({ atomStart: out.length, flags: flagsAtClose });
				if (piece !== '') atomStart = out.length;
				out += piece;
				i = next;
				continue;
			}

			if (ch === ')') {
				const frame = closeStack.pop();
				if (frame?.flags) Object.assign(f, frame.flags);
				if (frame) atomStart = frame.atomStart; // the closed group is the quantifiable atom
				out += ')';
				i++;
				continue;
			}

			if (isQuantifierStart(body, i)) {
				const res = this.quantifier(body, i, out, atomStart, f);
				out = res[0];
				i = res[1];
				continue;
			}

			atomStart = out.length;
			// brackets/braces are quantifier syntax in u-mode; PCRE allows them bare
			out += (ch === '{' || ch === '}' || ch === ']') ? '\\' + ch : ch;
			i++;
		}

		return out;
	}


	/** Translates a `\X` escape. Returns [jsText, nextIndex]. */
	escape(body, i)
	{
		const ch = body[i + 1];
		if (ch === undefined) {
			throw new Error('Pattern ends with a lone backslash');
		}

		if (ch === 'x' && body[i + 2] === '{') { // \x{hhhh} -> \u{hhhh}
			const end = body.indexOf('}', i + 3);
			if (end === -1) throw new Error('Unterminated \\x{...} escape');
			return ['\\u{' + body.slice(i + 3, end) + '}', end + 1];
		}

		if (ch === 'x') return [body.slice(i, i + 4), i + 4]; // \xhh

		if (ch >= '0' && ch <= '9') { // backreference \1..\99
			let end = i + 1;
			while (end < body.length && body[end] >= '0' && body[end] <= '9') end++;
			const digits = body.slice(i + 1, end);
			for (let len = digits.length; len >= 1; len--) {
				const n = parseInt(digits.slice(0, len), 10);
				if (n >= 1 && n <= 99) {
					return ['\\k<' + this.namePrefix + 'c' + n + '>', i + 1 + len];
				}
			}
			throw new Error('Invalid backreference: ' + body.slice(i, i + 4));
		}

		if (ch === 's') return ['[' + SPACE + ']', i + 2];
		if (ch === 'S') return ['[^' + SPACE + ']', i + 2];
		if (ch === 'A') return ['(?<![\\s\\S])', i + 2];
		if (ch === 'z') return ['(?![\\s\\S])', i + 2];
		if (ch === 'Z') return ['(?=\\n?(?![\\s\\S]))', i + 2];

		// escapes with identical JS semantics pass through
		if ('dDwWbBnrtfv0'.includes(ch)) return ['\\' + ch, i + 2];

		// JS u-mode allows escaping syntax characters only; the rest are literal
		if (isSyntaxChar(ch)) return ['\\' + ch, i + 2];
		return [ch, i + 2];
	}


	/** Translates a `[...]` character class (whitespace is significant inside). */
	charClass(body, i)
	{
		let j = i + 1;
		let out = '[';
		if (body[j] === '^') { out += '^'; j++; }
		let first = true; // PCRE: `]` as the first class character is literal

		while (j < body.length && (first || body[j] !== ']')) {
			const ch = body[j];
			first = false;
			if (ch === '\\' && j + 1 < body.length) {
				const c = body[j + 1];
				if (c === 'x' && body[j + 2] === '{') {
					const end = body.indexOf('}', j + 3);
					if (end === -1) throw new Error('Unterminated \\x{...} escape in class');
					out += '\\u{' + body.slice(j + 3, end) + '}';
					j = end + 1;
				} else if (c === 'x') {
					out += body.slice(j, j + 4);
					j += 4;
				} else if (c === 's') {
					out += SPACE;
					j += 2;
				} else if (c === 'S') {
					throw new Error('Negated \\S inside a character class is not supported');
				} else {
					// escapes with identical JS semantics pass through; the rest are literal
					out += ('dDwWbBnrtfv0'.includes(c) || isSyntaxChar(c) || c === '-') ? '\\' + c : c;
					j += 2;
				}
			} else {
				out += ch === ']' ? '\\]' : ch;
				j++;
			}
		}

		if (j >= body.length) throw new Error('Unterminated character class');
		return [out + ']', j + 1];
	}


	/**
	 * Translates a `(` construct. Returns
	 * [jsText, nextIndex, pushClose, flagsAtClose].
	 * `jsText === ''` means the construct emitted nothing (comment).
	 * `pushClose` is true for constructs that open a parenthesized group whose
	 * `)` the main loop will see.
	 */
	group(body, i, f)
	{
		let j = i + 1;

		if (body[j] !== '?') { // capturing group
			const n = ++this.state.captureCount;
			return ['(?<' + this.namePrefix + 'c' + n + '>', j, true, null];
		}

		j++;
		const c = body[j];

		if (c === ':') return ['(?:', j + 1, true, null];
		if (c === '=') return ['(?=', j + 1, true, null];
		if (c === '!') return ['(?!', j + 1, true, null];
		if (c === '<' && (body[j + 1] === '=' || body[j + 1] === '!')) {
			return ['(?<' + body[j + 1], j + 2, true, null];
		}

		if (c === '>') { // atomic group -> (?=(?<aN>inner))\k<aN>
			const inner = balancedBody(body, j + 1);
			const translated = this.translate(inner.text, f);
			const k = ++this.state.emulationCount;
			return ['(?=(?<' + this.namePrefix + 'a' + k + '>' + translated + '))\\k<' + this.namePrefix + 'a' + k + '>', inner.end + 1, false, null];
		}

		if (c === '#') { // comment group (?#...)
			const end = body.indexOf(')', j + 1);
			if (end === -1) throw new Error('Unterminated comment group');
			return ['', end + 1, false, null];
		}

		if (c === '0') { // whole-pattern recursion (?0)
			return [RECURSION, j + 2, false, null];
		}

		// (?flags:...) scoped flag group
		const m = /^([a-zA-Z-]+):/.exec(body.slice(j));
		if (!m) throw new Error('Unsupported group: ' + body.slice(i, i + 12));

		const saved = { ...f };
		for (const fc of m[1]) {
			if (fc === '-') { f.x = false; f.U = false; }
			else if (fc === 'x') f.x = true;
			else if (fc === 'U') f.U = true;
			else throw new Error('Unsupported inline flag: ' + fc);
		}

		return ['(?:', j + m[0].length, true, saved];
	}


	/** Translates a quantifier (`*`, `+`, `?`, `{n,m}`) with lazy/possessive suffixes. */
	quantifier(body, i, out, atomStart, f)
	{
		let q = body[i];
		let j = i + 1;

		if (q === '{') {
			const m = /^\{\d+(,\d*)?\}/.exec(body.slice(i));
			if (!m) return [out + '\\{', i + 1]; // PCRE treats a non-interval brace as literal
			q = m[0];
			j = i + m[0].length;
		}

		const lazySuffix = body[j] === '?';
		const possessive = body[j] === '+';
		if (lazySuffix || possessive) j++;

		// under U (ungreedy) a trailing `?` restores greediness
		const greedy = f.U ? lazySuffix : !lazySuffix;
		const atom = out.slice(atomStart);

		if (possessive) {
			const k = ++this.state.emulationCount;
			return [out.slice(0, atomStart) + '(?=(?<' + this.namePrefix + 'p' + k + '>(?:' + atom + ')' + q + '))\\k<' + this.namePrefix + 'p' + k + '>', j];
		}

		return [out.slice(0, atomStart) + atom + q + (greedy ? '' : '?'), j];
	}
}


function balancedBody(body, open)
{
	let depth = 1;
	let j = open;
	while (j < body.length) {
		const ch = body[j];
		if (ch === '\\') { j += 2; continue; }
		if (ch === '[') {
			j++;
			while (j < body.length && body[j] !== ']') {
				j += body[j] === '\\' ? 2 : 1;
			}
		} else if (ch === '(') {
			depth++;
		} else if (ch === ')') {
			depth--;
			if (depth === 0) return { text: body.slice(open, j), end: j };
		}
		j++;
	}
	throw new Error('Unterminated group');
}


function isQuantifierStart(body, i)
{
	const ch = body[i];
	if (ch === '*' || ch === '+' || ch === '?') return true;
	if (ch === '{') return /^\{\d+(,\d*)?\}/.test(body.slice(i));
	return false;
}


function isSyntaxChar(ch)
{
	return '^$\\.*+?()[]{}|'.includes(ch);
}


/**
 * Compiles a PCRE pattern into a reusable shape:
 * { source, groupCount, anchored, regexp (global), sticky, plain }.
 * Results are cached per pattern string.
 * @param {string} pattern PCRE pattern with delimiters, e.g. `~^abc$~miu`
 */
export function compile(pattern)
{
	let c = cache.get(pattern);
	if (c) return c;

	const [body, flagStr] = splitPattern(pattern);
	const flags = { x: flagStr.includes('x'), U: flagStr.includes('U') };

	const jsFlagList = ['u', 'd'];
	for (const f of ['i', 'm', 's']) {
		if (flagStr.includes(f)) jsFlagList.push(f);
	}

	const translator = new Translator({});

	// expand (?0) recursion inline to a bounded depth; each nesting level gets
	// its own group-name prefix so captures cannot collide, and the innermost
	// level degrades to a failing branch
	const expand = (prefix, depth) => {
		const src = new Translator({ namePrefix: prefix }).translate(body, flags);
		if (!src.includes(RECURSION)) return src;
		if (depth >= MAX_RECURSION_DEPTH) return src.split(RECURSION).join('(?!)');
		return src.split(RECURSION).join(expand('r' + depth + '_', depth + 1));
	};

	let source = translator.translate(body, flags);
	while (source.includes(RECURSION)) {
		source = source.split(RECURSION).join(expand('r1_', 2));
	}

	if (source.includes(RECURSION)) {
		throw new Error('Recursion expansion failed for: ' + pattern);
	}

	const flagString = jsFlagList.join('');

	try {
		c = {
			source,
			groupCount: translator.state.captureCount,
			anchored: flagStr.includes('A'),
			regexp: new RegExp(source, flagString + 'g'),
			sticky: new RegExp(source, flagString + 'y'),
			plain: new RegExp(source, flagString),
		};
	} catch (e) {
		throw new Error('Pattern failed to compile: ' + pattern + '\n  ' + source + '\n  ' + e.message);
	}

	cache.set(pattern, c);
	return c;
}


/**
 * Extracts one match into the reference implementation's shape: `matches` and
 * `offsets` arrays indexed by original group number (0 = whole match), with
 * null for groups that did not participate. Offsets are UTF-16 code-unit
 * indices into the subject string.
 */
function toResult(m, c, subject)
{
	const matches = [m[0]];
	const offsets = [m.index];
	const indices = m.indices.groups ?? {};

	for (let n = 1; n <= c.groupCount; n++) {
		const ind = indices['c' + n];
		matches.push(ind ? subject.slice(ind[0], ind[1]) : null);
		offsets.push(ind ? ind[0] : null);
	}

	return { matches, offsets, length: m[0].length };
}


/**
 * Searches the subject for the first match of the pattern at or after `offset`.
 * Returns null or { matches, offsets, length, index }.
 * @param {string} subject
 * @param {string} pattern
 * @param {{offset?: number}} [options]
 */
export function match(subject, pattern, { offset = 0 } = {})
{
	if (offset > subject.length) return null;

	const c = compile(pattern);
	const re = c.anchored ? c.sticky : c.regexp;
	re.lastIndex = offset;
	const m = re.exec(subject);
	return m ? { ...toResult(m, c, subject), index: m.index } : null;
}


/**
 * Finds all matches in order, as a list of { matches, offsets, length, index }.
 * @param {string} subject
 * @param {string} pattern
 * @param {{offset?: number}} [options]
 */
export function matchAll(subject, pattern, { offset = 0 } = {})
{
	if (offset > subject.length) return [];

	const c = compile(pattern);
	const re = c.regexp;
	re.lastIndex = offset;
	const results = [];
	let m;
	while ((m = re.exec(subject)) !== null) {
		results.push({ ...toResult(m, c, subject), index: m.index });
		if (m[0] === '') re.lastIndex++;
	}
	return results;
}


/**
 * Splits the subject by the pattern, PHP preg_split style: captured delimiters
 * are returned too (flat list), empty pieces are skipped when `skipEmpty`,
 * `limit` bounds the number of splits. Returns a list of [piece, offset] pairs.
 * @param {string} subject
 * @param {string} pattern
 * @param {{skipEmpty?: boolean, limit?: number}} [options]
 */
export function split(subject, pattern, { skipEmpty = false, limit = -1 } = {})
{
	const c = compile(pattern);
	const re = c.regexp;
	re.lastIndex = 0;

	const result = [];
	let pos = 0;
	let splits = 0;

	for (;;) {
		if (limit > 0 && splits >= limit - 1) break;
		const m = re.exec(subject);
		if (!m || m[0] === '') break;

		if (m.index > pos) result.push([subject.slice(pos, m.index), pos]);
		else if (!skipEmpty) result.push(['', pos]);

		const indices = m.indices.groups ?? {};
		for (let n = 1; n <= c.groupCount; n++) {
			const ind = indices['c' + n];
			if (ind) result.push([subject.slice(ind[0], ind[1]), ind[0]]);
			else if (!skipEmpty) result.push([null, null]);
		}

		pos = m.index + m[0].length;
		splits++;
	}

	if (pos < subject.length) result.push([subject.slice(pos), pos]);
	else if (!skipEmpty && result.length === 0) result.push([subject.slice(pos), pos]); // preg_split never returns an empty list

	return skipEmpty ? result.filter(([piece]) => piece !== '' && piece !== null) : result;
}


/**
 * Replaces all pattern matches. The replacement is either a string using
 * `$1`-style references to the pattern's own groups, or a callback receiving
 * the matches array (nulls for non-participating groups).
 * @param {string} subject
 * @param {string} pattern
 * @param {string|function((string|null)[]): string)} [replacement]
 */
export function replace(subject, pattern, replacement = '')
{
	const c = compile(pattern);

	if (typeof replacement === 'function') {
		const re = c.regexp;
		re.lastIndex = 0;
		let out = '';
		let pos = 0;
		let m;
		while ((m = re.exec(subject)) !== null) {
			out += subject.slice(pos, m.index);
			out += replacement(toResult(m, c, subject).matches);
			pos = m.index + m[0].length;
			if (m[0] === '') re.lastIndex++;
		}
		return out + subject.slice(pos);
	}

	return subject.replace(c.regexp, replacement.replace(/\$(\d+)/g, (_, n) => '$<c' + n + '>')); // global, like preg_replace
}


/**
 * Quotes a literal string for inclusion in a pattern body (PCRE extended
 * mode): escapes control/space characters and regex metacharacters.
 * @param {string} s
 * @returns {string}
 */
export function quote(s)
{
	return s.replace(/[\x00-\x20\-\.\\+*?\[\]^$(){}=!<>|:#\/]/g, ch => '\\' + ch);
}

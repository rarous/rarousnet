/**
 * Static utility helpers (port of Texy\Helpers).
 *
 * Entity decoding replicates PHP's html_entity_decode(ENT_QUOTES | ENT_HTML5)
 * behavior exactly, including its deliberate deviations from the HTML spec:
 * no semicolonless forms, no Windows-1252 remapping of &#128;-&#159;,
 * and control-character references stay literal (except NUL -> U+FFFD).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { match } from './Regexp.js';

/** Matches one HTML entity reference; shared by languages that treat `&...;` as an entity. */
export const EntityPattern = '&(?:\\#[0-9]{1,7}|\\#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});';

const entities = JSON.parse(readFileSync(
	join(dirname(fileURLToPath(import.meta.url)), 'entities.json'),
	'utf8',
));


/**
 * Strips control characters that must never occur in AST text (they collide
 * with the internal marker bytes); every decoder that can create them calls
 * this. \r survives - it is the internal hard line break marker.
 * @param {string} s
 */
export function stripControlChars(s)
{
	return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]+/g, '');
}


/**
 * Lowercases a UTF-8 string (mb_strtolower equivalent).
 * @param {string} s
 */
export function toLower(s)
{
	return s.toLowerCase();
}


/**
 * Decodes a single numeric character reference, PHP html_entity_decode style.
 * Returns null when the reference stays literal (invalid code points).
 * @param {string} digits
 * @param {boolean} isHex
 */
function decodeNumericRef(digits, isHex)
{
	const cp = parseInt(digits, isHex ? 16 : 10);
	if (cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF)) return null; // surrogates, out of range
	if (cp === 9 || cp === 10 || cp === 12) return String.fromCodePoint(cp); // tab, LF, FF
	if (cp >= 32 && cp <= 0x10FFFF && !(cp >= 127 && cp <= 159)) return String.fromCodePoint(cp);
	return null; // other control references, 0x7F-0x9F
}


/**
 * Decodes HTML entities into display text (html_entity_decode with
 * ENT_QUOTES | ENT_HTML5; only `&name;` and numeric references).
 * @param {string} s
 */
export function unescapeHtml(s)
{
	if (!s.includes('&')) return s;

	return s.replace(/&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{0,63});/g, (ref, body) => {
		if (body[0] === '#') {
			const isHex = (body[1] === 'x' || body[1] === 'X');
			const decoded = decodeNumericRef(body.slice(isHex ? 2 : 1), isHex);
			return decoded ?? ref;
		}
		return entities[body] ?? ref;
	});
}


/**
 * Decodes HTML entities into display text; strips control characters they may
 * smuggle in (input normalization does the same for raw input).
 * @param {string} s
 */
export function decodeEntities(s)
{
	if (!s.includes('&')) return s;
	return stripControlChars(unescapeHtml(s));
}


/**
 * Decodes a single reference matched by EntityPattern into display text;
 * null when it is not a known entity and should stay literal.
 * PHP refuses NUL and other control references; per CommonMark only NUL maps
 * to U+FFFD, the rest stay literal.
 * @param {string} ref
 * @returns {?string}
 */
export function decodeEntity(ref)
{
	const decoded = unescapeHtml(ref);
	if (decoded === ref) {
		return /^&#(?:0+|[xX]0+);$/.test(ref) ? '\uFFFD' : null;
	}
	return stripControlChars(decoded);
}


/**
 * Removes soft hyphens. URL targets parsed from source text are cleaned with
 * this: soft hyphens get into them by copy-pasting hyphenated text and would
 * break the address.
 * @param {string} s
 */
export function removeSoftHyphens(s)
{
	return s.replaceAll('\u00AD', '');
}


/**
 * Translate all whitespaces (\t \n \r space) to the meta-space bytes
 * \x01-\x04, which the line wrapper must not break inside.
 * @param {string} s
 */
export function freezeSpaces(s)
{
	return s
		.replaceAll(' ', '\x01')
		.replaceAll('\t', '\x02')
		.replaceAll('\r', '\x03')
		.replaceAll('\n', '\x04');
}


/**
 * Reverts meta-spaces back to normal spaces.
 * @param {string} s
 */
export function unfreezeSpaces(s)
{
	return s
		.replaceAll('\x01', ' ')
		.replaceAll('\x02', '\t')
		.replaceAll('\x03', '\r')
		.replaceAll('\x04', '\n');
}


/**
 * Escapes text for HTML output (htmlspecialchars with ENT_NOQUOTES):
 * only & < > are escaped, quotes stay as they are.
 * @param {string} s
 */
export function escapeHtml(s)
{
	return s
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}


/**
 * Escapes text for HTML output (htmlspecialchars with ENT_QUOTES): & < >
 * and both quotes. Also escapes apostrophes as &#39;.
 * @param {string} s
 */
export function escapeHtmlQuotes(s)
{
	return s
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}


const escapeForClass = c => c.replace(/[.*+?^${}()|[\]\\-]/g, '\\' + c);


/**
 * PHP trim() character list.
 */
const TRIM_CHARS = " \t\n\r\0\x0B";


/**
 * Strips a character list from the end of the string (PHP rtrim).
 * @param {string} s
 * @param {string} chars
 */
export function phpRtrim(s, chars = TRIM_CHARS)
{
	return s.replace(new RegExp('[' + chars.split('').map(escapeForClass).join('') + ']+$'), '');
}


/**
 * Strips a character list from the start of the string (PHP ltrim).
 * @param {string} s
 * @param {string} chars
 */
export function phpLtrim(s, chars = TRIM_CHARS)
{
	return s.replace(new RegExp('^[' + chars.split('').map(escapeForClass).join('') + ']+'), '');
}


/**
 * Strips a character list from both ends of the string (PHP trim).
 * @param {string} s
 * @param {string} chars
 */
export function phpTrim(s, chars = TRIM_CHARS)
{
	return phpLtrim(phpRtrim(s, chars), chars);
}


/**
 * Is the given URL relative (no scheme, no absolute path, no absolute URL)?
 * The pattern is anchored (PCRE `A`): only a scheme at the start or a
 * leading #, / or ? makes the URL non-relative.
 * @param {string} url
 */
export function isRelative(url)
{
	return match(url, String.raw`~[a-z][a-z0-9+.-]{0,20}:|[#/?]~Ai`) === null;
}


/**
 * Prepends root to the URL, if possible.
 * @param {string} url
 * @param {?string} root
 */
export function prependRoot(url, root)
{
	if (root == null || root === '' || !isRelative(url)) {
		return url;
	}

	return root.replace(/[\/\\]+$/, '') + '/' + url;
}


/**
 * Prepends http:// to scheme-less www.* URLs.
 * @param {string} url
 */
export function normalizeWww(url)
{
	return url.slice(0, 4).toLowerCase() === 'www.'
		? 'http://' + url
		: url;
}


/**
 * Returns a shortened URL for display (e.g., in autolinks).
 * @param {string} url
 */
export function shortenUrl(url)
{
	const raw = url.slice(0, 4).toLowerCase() === 'www.'
		? 'none://' + url
		: url;

	const m = raw.match(/^(?:([a-z]+):)?(?:\/\/([^/?#]*))?((?:\/|^)(?!\/)[^?#]*)?(?:\?([^#]*))?(?:#(.*))?$/i);
	if (!m) {
		return url;
	}

	const [, scheme, host, path, query, fragment] = m;
	const codePoints = s => [...s].length;
	const last12 = s => [...s].slice(-12).join('');

	let res = '';
	if (scheme !== undefined && scheme !== '' && scheme !== 'none') {
		res += scheme + '://';
	}
	if (host !== undefined && host !== '') {
		res += host;
	}
	if (path !== undefined && path !== '') {
		res += codePoints(path) > 16
			? '/\u2026' + last12(path)
			: path;
	}

	if (query !== undefined && query !== '') {
		res += codePoints(query) > 4
			? '?\u2026'
			: '?' + query;
	} else if (fragment !== undefined && fragment !== '') {
		res += codePoints(fragment) > 4
			? '#\u2026'
			: '#' + fragment;
	}

	return res;
}


/**
 * PHP urlencode(): form encoding - spaces become '+', the extra
 * characters ! ' ( ) * ~ that encodeURIComponent leaves are percent
 * encoded. Used by the Texy 3 %s reference-URL substitution.
 * @param {string} s
 */
export function phpUrlencode(s)
{
	return encodeURIComponent(String(s))
		.replace(/[!*'()~]/g, ch => '%' + ch.charCodeAt(0).toString(16).toUpperCase())
		.replace(/%20/g, '+');
}


/**
 * Transliteration table for the Latin-1/Latin-Extended blocks; used by
 * webalize() for heading ID slugs.
 */
const asciiTable = {
	'ä': 'a', 'á': 'a', 'à': 'a', 'â': 'a', 'æ': 'ae', 'ã': 'a', 'å': 'a', 'ā': 'a', 'ą': 'a',
	'ď': 'd', 'đ': 'd', 'ð': 'd',
	'ě': 'e', 'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e', 'ė': 'e', 'ę': 'e', 'ē': 'e',
	'ģ': 'g', 'ğ': 'g', 'ĝ': 'g',
	'î': 'i', 'ï': 'i', 'í': 'i', 'ì': 'i', 'į': 'i', 'ī': 'i',
	'ķ': 'k',
	'ĺ': 'l', 'ļ': 'l', 'ł': 'l',
	'ñ': 'n', 'ń': 'n', 'ņ': 'n',
	'ô': 'o', 'ö': 'o', 'ó': 'o', 'ò': 'o', 'ő': 'o', 'ø': 'o', 'õ': 'o', 'ō': 'o', 'œ': 'oe',
	'ř': 'r', 'ŕ': 'r', 'ŗ': 'r',
	'š': 's', 'ś': 's', 'ş': 's', 'ș': 's', 'ß': 'ss',
	'ť': 't', 'ţ': 't', 'þ': 'th',
	'û': 'u', 'ü': 'u', 'ú': 'u', 'ù': 'u', 'ų': 'u', 'ű': 'u', 'ů': 'u', 'ũ': 'u', 'ū': 'u',
	'ý': 'y', 'ÿ': 'y', 'ŷ': 'y',
	'ž': 'z', 'ź': 'z', 'ż': 'z',
};

const upperAsciiTable = Object.fromEntries(
	Object.entries(asciiTable).map(([k, v]) => [k.toUpperCase(), v[0].toUpperCase() + v.slice(1)]),
);


/**
 * Converts UTF-8 to ASCII. The reference falls back to iconv transliteration
 * when nette/utils is absent (whose output is locale-dependent); this port
 * uses a fixed Latin transliteration table.
 * @param {string} s
 */
export function toAscii(s)
{
	let out = '';
	for (const ch of s) {
		out += upperAsciiTable[ch] ?? asciiTable[ch] ?? ch;
	}
	return out.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}


/**
 * Converts to web-safe characters [a-z0-9-].
 * @param {string} s
 * @returns {string}
 */
export function webalize(s)
{
	s = toAscii(s).toLowerCase();
	s = s.replace(/[^a-z0-9]+/g, '-');
	return s.replace(/^-+|-+$/g, '');
}

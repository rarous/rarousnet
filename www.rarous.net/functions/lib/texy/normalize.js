/**
 * Normalizes text to the canonical form that parsing operates on (port of
 * Texy::normalize): removes the leading byte order mark, converts line
 * endings to \n, strips control characters, right-trims lines and drops
 * blank lines at both ends. Idempotent, so it is safe to apply before
 * storing text and again before parsing.
 *
 * @param {string} text
 * @returns {string}
 * @throws {Error} when the input is not valid UTF-8 (a lone surrogate)
 */

export function normalize(text)
{
	if (hasLoneSurrogate(text)) {
		throw new Error('Input is not valid UTF-8 text.');
	}

	// standardize line endings to unix-like
	text = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');

	// remove control characters; leave \t + \n
	text = text.replace(/[\x00-\x08\x0B-\x1F]+/g, '');

	// right trim line ends
	text = text.replace(/[\t ]+$/gm, '');

	// drop blank lines at both ends and byte order marks at the start;
	// a mark hidden behind blank lines would surface after the trim otherwise
	text = text.replace(/^[\n\u{FEFF}]+/u, '');
	return text.replace(/\n+$/, '');
}


/** A JS string can only be invalid UTF-8 through an unpaired surrogate. */
function hasLoneSurrogate(s)
{
	for (let i = 0; i < s.length; i++) {
		const cu = s.charCodeAt(i);
		if (cu >= 0xD800 && cu <= 0xDBFF) {
			const lo = s.charCodeAt(++i);
			if (lo === undefined || lo < 0xDC00 || lo > 0xDFFF) return true;
		} else if (cu >= 0xDC00 && cu <= 0xDFFF) {
			return true;
		}
	}
	return false;
}

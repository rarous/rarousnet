/**
 * PHP-compatible wordwrap() (port of the standard PHP function, the only
 * non-Texy dependency of the reference well-former).
 *
 * PHP wordwrap counts BYTES and checks the width at every byte position,
 * including inside a multibyte character. A line breaks at the last space
 * seen in the current line, consuming it; earlier spaces of a run stay in
 * the emitted segment. Tabs and newlines are not break points. Words longer
 * than the width are not cut (the reference never uses the cut mode).
 */

/**
 * Cumulative UTF-8 byte length at each code-unit boundary.
 * @param {string} s
 * @returns {Uint32Array}
 */
function byteLengths(s)
{
	const cum = new Uint32Array(s.length + 1);
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);
		cum[i + 1] = cum[i] + (
			c < 0x80 ? 1
				: c < 0x800 ? 2
					: c >= 0xD800 && c < 0xDC00 ? 3 // high surrogate (its low surrogate adds 1)
						: c >= 0xDC00 && c < 0xE000 ? 1
							: 3
		);
	}
	return cum;
}


/**
 * @param {string} s
 * @param {number} width
 * @param {string} brk
 * @returns {string}
 */
export function wordwrap(s, width, brk = '\n')
{
	if (s === '') return s;

	const cum = byteLengths(s);
	const n = s.length;

	let out = '';
	let laststart = 0; // code-unit index; cum[laststart] is its byte position
	let lastspace = -1; // code-unit index of the last space

	for (let i = 0; i < n; i++) {
		if (s.charCodeAt(i) === 0x20) {
			lastspace = i;
		}

		// the line is over-long when the bytes before the current position
		// reach the width; checking cum[i+1] > width + cum[laststart] covers
		// a crossing anywhere inside the current character's bytes
		if (lastspace > laststart && cum[i + 1] - cum[laststart] > width) {
			out += s.slice(laststart, lastspace) + brk;
			laststart = lastspace + 1;
		}
	}

	return out + s.slice(laststart);
}

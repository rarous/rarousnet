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
 * UTF-8 byte length of one code unit (high surrogates count 3: their low
 * surrogate adds 1, so the pair totals 4).
 * @param {number} c
 * @returns {number}
 */
function byteLen(c)
{
	return c < 0x80 ? 1
		: c < 0x800 ? 2
			: c >= 0xD800 && c < 0xDC00 ? 3
				: c >= 0xDC00 && c < 0xE000 ? 1
					: 3;
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

	// a line that fits the width in bytes can never break - one scan, no
	// allocation (cumulative byte arrays were computed per line before)
	let fits = true;
	let total = 0;
	for (let i = 0; i < s.length; i++) {
		total += byteLen(s.charCodeAt(i));
		if (total > width) {
			fits = false;
			break;
		}
	}
	if (fits) return s;

	let out = '';
	let laststart = 0; // code-unit index; `bytes` is the byte count since it
	let bytes = 0;
	let lastspace = -1; // code-unit index of the last space
	let bytesAtSpace = 0; // byte count when that space was reached

	for (let i = 0; i < s.length; i++) {
		bytes += byteLen(s.charCodeAt(i));

		if (s.charCodeAt(i) === 0x20) {
			lastspace = i;
			bytesAtSpace = bytes;
		}

		// the line is over-long when the bytes up to and including the current
		// position exceed the width - this covers a crossing anywhere inside
		// the current character's bytes
		if (lastspace > laststart && bytes > width) {
			out += s.slice(laststart, lastspace) + brk;
			laststart = lastspace + 1;
			bytes -= bytesAtSpace;
		}
	}

	return out + s.slice(laststart);
}

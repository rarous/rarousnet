/**
 * Maps offsets in a locally re-assembled string back to absolute positions in
 * the source (port of Texy\Parsing\OffsetMap).
 *
 * Some block modules (blockquote, lists, tables, /--div blocks) strip
 * per-line prefixes ("> ", indentation) and join the remaining content
 * before recursive parsing. Nodes parsed from such content carry local
 * positions; this map rewrites them to source coordinates.
 */

import { Range } from '../Range.js';

/** Length of the leading run shared by both strings. */
function commonPrefixLength(a, b)
{
	let i = 0;
	const max = Math.min(a.length, b.length);
	while (i < max && a[i] === b[i]) i++;
	return i;
}


/** Length of the leading run of characters from the set (strspn). */
function spanLength(s, set)
{
	let i = 0;
	while (i < s.length && set.includes(s[i])) i++;
	return i;
}


export class OffsetMap
{
	/**
	 * @param {Object<number, number>} map local offset of line start => absolute offset in source (ascending keys)
	 * @param {number} skipped number of characters trimmed from the beginning of the local string before parsing
	 */
	constructor(map = {}, skipped = 0)
	{
		/** @type {Array<[number, number]>} local line start => absolute source offset, numerically ascending */
		this.pairs = Object.entries(map)
			.map(([local, absolute]) => [Number(local) - skipped, absolute])
			.sort((a, b) => a[0] - b[0]);
	}


	/**
	 * Builds a map for content created by joining lines with "\n".
	 * @param {Array<{content: string, offset: number}>} lines
	 * @param {number} skipped
	 * @returns {OffsetMap}
	 */
	static fromLines(lines, skipped = 0)
	{
		const map = {};
		let localPos = 0;
		for (const line of lines) {
			map[localPos] = line.offset;
			localPos += line.content.length + 1; // 1 = "\n"
		}
		return new OffsetMap(map, skipped);
	}


	/**
	 * Splits contiguous source text into lines with absolute offsets.
	 * @param {string} text
	 * @param {number} offset
	 * @returns {Array<{content: string, offset: number}>}
	 */
	static linesOf(text, offset = 0)
	{
		const lines = [];
		for (const line of text.split('\n')) {
			lines.push({ content: line, offset });
			offset += line.length + 1; // 1 = "\n"
		}
		return lines;
	}


	/**
	 * Outdents lines and builds the matching offset map: blank edge lines are
	 * dropped, then the whitespace prefix shared by all lines (or taken from
	 * the first line) is stripped from each line.
	 * @param {Array<{content: string, offset: number}>} lines
	 * @param {boolean} firstLine take the indentation from the first line
	 * @returns {[string, OffsetMap]}
	 */
	static outdentLines(lines, firstLine = false)
	{
		while (lines.length > 0 && lines[0].content === '') lines.shift();
		while (lines.length > 0 && lines[lines.length - 1].content === '') lines.pop();

		let prefix;
		if (firstLine) {
			prefix = lines.length > 0 ? lines[0].content.slice(0, spanLength(lines[0].content, ' \t')) : '';
		} else {
			prefix = null;
			for (const line of lines) {
				// only lines with a non-whitespace character after the indentation participate
				const ws = spanLength(line.content, ' \t');
				if (ws < line.content.length) {
					const indent = line.content.slice(0, ws);
					prefix = prefix === null ? indent : prefix.slice(0, commonPrefixLength(prefix, indent));
				}
			}
			prefix ??= '';
		}

		lines = lines.map(line => {
			const strip = commonPrefixLength(line.content, prefix);
			return { content: line.content.slice(strip), offset: line.offset + strip };
		});

		return [lines.map(l => l.content).join('\n'), OffsetMap.fromLines(lines)];
	}


	/**
	 * Translates a local offset to an absolute source offset.
	 * @param {number} local
	 * @returns {number}
	 */
	toAbsolute(local)
	{
		const pairs = this.pairs;
		if (pairs.length === 0) {
			return local;
		}

		if (local < pairs[0][0]) { // before the first line start: clamps to it
			return pairs[0][1];
		}

		// the last line start <= local; binary search over the ascending pairs
		let lo = 0, hi = pairs.length - 1;
		let best = pairs[0];
		while (lo <= hi) {
			const mid = (lo + hi) >> 1;
			if (pairs[mid][0] <= local) {
				best = pairs[mid];
				lo = mid + 1;
			} else {
				hi = mid - 1;
			}
		}
		return best[1] + (local - best[0]);
	}


	/**
	 * Recursively rewrites node positions from local to absolute coordinates.
	 * Length of multi-line spans grows by the stripped prefixes they cover.
	 * @param {import('../Range.js').Node} node
	 */
	applyTo(node)
	{
		if (this.pairs.length === 0) return; // the map stays empty for the whole walk

		this.applyToNode(node);
	}


	/** @param {import('../Range.js').Node} node */
	applyToNode(node)
	{
		if (node.range !== null) {
			node.range = this.rangeToAbsolute(node.range);
		}

		const modifier = node.getModifier ? node.getModifier() : null;
		if (modifier?.range !== null && modifier !== null) {
			modifier.range = this.rangeToAbsolute(modifier.range);
		}

		for (const child of node.getChildren()) {
			this.applyToNode(child);
		}
	}


	/**
	 * @param {Range} range
	 * @returns {Range}
	 */
	rangeToAbsolute(range)
	{
		const offset = this.toAbsolute(range.offset);
		const end = this.toAbsolute(range.offset + range.length);
		return new Range(offset, end - offset);
	}
}

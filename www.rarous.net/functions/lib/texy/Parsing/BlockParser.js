/**
 * Parses block structures (paragraphs, headings, lists, tables, etc.) -
 * port of Texy\Parsing\BlockParser.
 *
 * Trailing newlines are trimmed on entry - they are not part of any line.
 * A handler returns a BlockNode, a ContentNode (sequence to splice; empty
 * consumes silently), or null to refuse the match. Returning null, or
 * leaving the parser position at/before the match start, means refusal:
 * the match is dropped, the position resets to the match start, and the
 * gap handler will see that text.
 */

import { BlockNode, ContentNode } from '../nodes.js';
import { match, matchAll } from '../Regexp.js';

export class BlockParser
{
	constructor(patterns, gapHandler)
	{
		/** @type {Map<string, {handler: Function, pattern: string}>} */
		this.patterns = patterns;

		/** @type {Function} (context, text, offset) => BlockNode[] */
		this.gapHandler = gapHandler;

		/** @private */
		this.text = '';
		/** @private */
		this.offset = 0;
		/** @private */
		this.baseOffset = 0;
		/** @type {Array} nodes produced so far by the running parse */
		this.nodes = [];
	}


	/**
	 * @param {import('./ParseContext.js').ParseContext} context
	 * @param {string} text
	 * @param {number} baseOffset
	 * @returns {ContentNode}
	 */
	parse(context, text, baseOffset = 0)
	{
		this.text = text = text.replace(/\n+$/, '');
		this.offset = 0;
		this.baseOffset = baseOffset;
		this.nodes = [];

		const matches = this.matchAll(text, baseOffset);
		matches.push({ offset: text.length, name: null, match: null, offsets: null }); // terminal sentinel
		let cursor = 0;

		for (;;) {
			let mOffset;
			let mName;
			let mMatches;
			let mOffsets;
			do {
				({ offset: mOffset, name: mName, match: mMatches, offsets: mOffsets } = matches[cursor]);
				cursor++;
				if (mName === null || mOffset >= this.offset) break;
			} while (true);

			// between-matches content -> delegate to gap handler
			if (mOffset > this.offset) {
				const s = text.slice(this.offset, mOffset);
				this.nodes.push(...this.gapHandler(context, s, baseOffset + this.offset));
			}

			if (mName === null) break; // finito

			this.offset = mOffset + mMatches[0].length + 1; // 1 = \n

			// call handler
			const node = this.patterns.get(mName).handler(context, mMatches, mOffsets, mName);

			if (node === null || this.offset <= mOffset) { // handler rejects text
				this.offset = mOffset;
				continue;
			}

			if (node instanceof ContentNode) {
				for (const child of node.children) { // a returned sequence is spliced in
					if (!(child instanceof BlockNode)) {
						throw new Error("Handler of block syntax '" + mName + "' returned a sequence containing an inline node; only block nodes are allowed.");
					}
					this.nodes.push(child);
				}
			} else {
				this.nodes.push(node);
			}
		}

		return new ContentNode(this.nodes);
	}


	/**
	 * Nodes produced so far, gap-handler output included; the last one
	 * directly precedes the current match. The nodes are live, so a handler
	 * may graft consumed text onto the preceding block.
	 * @returns {Array}
	 */
	getNodes()
	{
		return [...this.nodes]; // live list; return a snapshot like the PHP value semantics
	}


	/**
	 * Matches the current line against a pattern; on success advances past
	 * the line and returns the matches with absolute offsets.
	 * @param {string} pattern PCRE pattern, anchored with A
	 * @param {string} result 'matches' or 'offsets'
	 * @returns {Array|null}
	 */
	next(pattern, result = 'matches')
	{
		if (this.offset > this.text.length) return null;

		const m = match(this.text, pattern + 'Am', { offset: this.offset });
		if (m === null) return null;

		this.offset += m.length + 1; // 1 = "\n"
		return m;
	}


	/**
	 * Moves position back over the specified number of line endings.
	 * @param {number} linesCount
	 */
	moveBackward(linesCount = 1)
	{
		while (--this.offset > 0) {
			if (this.text[this.offset - 1] === '\n') {
				linesCount--;
				if (linesCount < 1) break;
			}
		}

		this.offset = Math.max(this.offset, 0);
	}


	/**
	 * Collects all matches of all block patterns over the whole text,
	 * sorted by (offset asc, registration order asc).
	 * @param {string} text
	 * @param {number} baseOffset
	 */
	matchAll(text, baseOffset = 0)
	{
		const matches = [];
		let priority = 0;

		for (const [name, info] of this.patterns) {
			for (const m of matchAll(text, info.pattern)) {
				const offsets = m.offsets.map(offset => offset !== null ? baseOffset + offset : null);
				matches.push({ offset: m.index, name, match: m.matches, priority, offsets });
			}
			priority++;
		}

		matches.sort((a, b) => a.offset - b.offset || a.priority - b.priority);
		return matches;
	}
}

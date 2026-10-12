/**
 * Parses inline structures (links, images, formatting, etc.) - port of
 * Texy\Parsing\InlineParser.
 *
 * A handler returns an InlineNode, a ContentNode (sequence to splice; an
 * empty one consumes the match silently), or null to refuse the match.
 *
 * The per-pattern-candidate design exists because regex matching is
 * non-overlapping per pattern: a single early match of a pattern would
 * swallow the region where the intended (later) match sits. `**` inside a
 * code span used to pair with the next `**` this way, and the real pair
 * behind it was never offered.
 */

import { ContentNode, TextNode } from '../nodes.js';
import { Range } from '../Range.js';
import { match } from '../Regexp.js';

export class InlineParser
{
	/**
	 * @param {Map<string, {handler: Function, pattern: string}>} patterns
	 */
	constructor(patterns = new Map())
	{
		this.patterns = patterns;
	}


	/**
	 * @param {string} name
	 * @param {string} pattern
	 * @param {Function} handler
	 */
	addPattern(name, pattern, handler)
	{
		this.patterns.set(name, { pattern, handler });
	}


	/**
	 * Returns a copy with only the specified patterns kept.
	 * @param {string[]} names
	 * @returns {InlineParser}
	 */
	withPatterns(names)
	{
		const clone = new InlineParser(new Map());
		for (const name of names) {
			const info = this.patterns.get(name);
			if (info) clone.patterns.set(name, info);
		}
		return clone;
	}


	/**
	 * First match of one pattern at or after the offset, in the shape the
	 * loop works with. Zero-length matches are skipped by advancing the
	 * search start by 1.
	 * @param {string} text
	 * @param {{handler: Function, pattern: string}} info
	 * @param {string} name
	 * @param {number} offset
	 */
	findMatch(text, info, name, offset)
	{
		while (offset <= text.length) {
			const m = match(text, info.pattern, { offset });
			if (m === null) return null;

			// a zero-length match would never move the position forward
			if (m.length === 0) {
				offset = m.index + 1;
				continue;
			}

			return {
				name,
				offset: m.index,
				length: m.length,
				match: m.matches,
				offsets: m.offsets,
				handler: info.handler,
			};
		}

		return null;
	}


	/**
	 * @param {import('./ParseContext.js').ParseContext} context
	 * @param {string} text
	 * @param {number} baseOffset
	 * @returns {ContentNode}
	 */
	parse(context, text, baseOffset = 0)
	{
		if (text === '' || this.patterns.size === 0) {
			if (text === '') return new ContentNode;
			return new ContentNode([new TextNode(text, new Range(baseOffset, text.length))]);
		}

		// one candidate per pattern, refreshed as the position moves
		const candidates = new Map();
		for (const [name, info] of this.patterns) {
			candidates.set(name, this.findMatch(text, info, name, 0));
		}

		const res = [];
		let pos = 0;

		for (;;) {
			let best = null;
			for (const [name, m] of candidates) {
				const current = m !== null && m.offset < pos
					? (candidates.set(name, this.findMatch(text, this.patterns.get(name), name, pos)), candidates.get(name))
					: m;
				// leftmost wins, longer match on a tie
				if (current !== null
					&& (best === null
						|| current.offset < best.offset
						|| (current.offset === best.offset && current.length > best.length))) {
					best = current;
				}
			}

			if (best === null) break;

			// adjust offsets to absolute positions
			const absoluteOffsets = best.offsets.map(offset => offset !== null ? baseOffset + offset : null);

			// call handler with absolute offsets
			const node = best.handler(context, best.match, absoluteOffsets, best.name);
			if (node === null) {
				// handler rejected - other patterns at this position still get their turn
				candidates.set(best.name, this.findMatch(text, this.patterns.get(best.name), best.name, best.offset + 1));
				continue;
			}

			// add text before this match (only now - a rejected match must not emit it)
			if (best.offset > pos) {
				res.push(new TextNode(
					text.slice(pos, best.offset),
					new Range(baseOffset + pos, best.offset - pos),
				));
			}

			if (node instanceof ContentNode) {
				res.push(...node.children); // a returned sequence is spliced in
			} else {
				res.push(node);
			}

			pos = best.offset + best.length;
		}

		// add remaining text
		if (pos < text.length) {
			res.push(new TextNode(text.slice(pos), new Range(baseOffset + pos, text.length - pos)));
		}

		return new ContentNode(res);
	}
}

/**
 * Processes blockquote syntax with nested content (port of
 * Texy\Modules\BlockQuoteModule).
 */

import { Module } from './Module.js';
import { Syntax } from '../Syntax.js';
import { ModifierHAlign } from '../Patterns.js';
import { Modifier } from '../Modifier.js';
import { BlockQuoteNode } from '../nodes.js';
import { OffsetMap } from '../Parsing/OffsetMap.js';

export class BlockQuoteModule extends Module
{
	constructor(texy)
	{
		super();
		this.texy = texy;
	}


	beforeParse()
	{
		this.texy.addBlockSyntax(
			Syntax.Blockquote,
			String.raw`~^
				(?: ` + ModifierHAlign + String.raw`\n)? # modifier (1)
				>                                      # blockquote char
				( [ \t]++ | : )                        # space/tab or colon (2)
				( \S.*+ )                              # content (3)
			$~mUx`,
			(context, matches, offsets) => this.parse(context, matches, offsets),
		);
	}


	/**
	 * Parses blockquote; continuation lines are collected via next().
	 */
	parse(context, matches, offsets)
	{
		const [, mMod, mPrefix, mContent] = matches;

		const startOffset = offsets[0];
		let totalLength = matches[0].length;

		// Collect lines with their absolute offsets
		const lines = [{ content: mContent, offset: offsets[3] }];
		const spaces = Math.max(1, mPrefix.length);

		let nextMatches;
		while ((nextMatches = context.getBlockParser().next(
			String.raw`~^>(?: | ([ \t]{1,${spaces}} | :) (.*))$~mAx`,
		)) !== null) {
			totalLength += nextMatches.length + 1; // +1 for \n

			// Track where this line's content starts in absolute terms
			const lineContentOffset = nextMatches.offsets[2] ?? nextMatches.offsets[0] + 2; // after "> "
			lines.push({ content: nextMatches.matches[2] ?? '', offset: lineContentOffset });
		}

		// Join content for parsing, but track line boundaries
		const content = lines.map(l => l.content).join('\n');
		const trimmed = content.trim();

		// Parse nested content
		const parsed = context.parseBlock(trimmed);
		if (parsed.children.length === 0) return null;

		// Fix positions in parsed content using offset map
		OffsetMap.fromLines(lines, content.length - content.replace(/^\s+/, '').length).applyTo(parsed);

		return new BlockQuoteNode(
			parsed,
			Modifier.parse(mMod, offsets[1] ?? null),
			{ offset: startOffset, length: totalLength },
		);
	}
}

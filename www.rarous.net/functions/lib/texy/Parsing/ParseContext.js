/**
 * Context for parsing (port of Texy\Parsing\ParseContext).
 * Provides methods for recursive parsing and access to the block parser.
 */

import { ContentNode } from '../nodes.js';
import { BlockParser } from './BlockParser.js';

export class ParseContext
{
	/**
	 * @param {import('./InlineParser.js').InlineParser} inlineParser
	 * @param {import('./BlockParser.js').BlockParser} blockParser
	 */
	constructor(inlineParser, blockParser)
	{
		this.inlineParser = inlineParser;
		this.blockParser = blockParser;
	}


	/**
	 * Parse text as inline content.
	 * @param {string} text
	 * @param {number} baseOffset
	 * @returns {ContentNode}
	 */
	parseInline(text, baseOffset = 0)
	{
		return this.inlineParser.parse(this, text, baseOffset);
	}


	/**
	 * Parse text as block content. Creates a fresh block parser so nested
	 * block parsing is isolated from the outer parser's position state.
	 * @param {string} text
	 * @param {number} baseOffset
	 * @returns {ContentNode}
	 */
	parseBlock(text, baseOffset = 0)
	{
		const clonedParser = new BlockParser(this.blockParser.patterns, this.blockParser.gapHandler);
		const newContext = new ParseContext(this.inlineParser, clonedParser);
		return clonedParser.parse(newContext, text, baseOffset);
	}


	/**
	 * Returns the current block parser for navigation (next, moveBackward).
	 * @returns {import('./BlockParser.js').BlockParser}
	 */
	getBlockParser()
	{
		return this.blockParser;
	}


	/**
	 * Returns the inline parser (for creating filtered variants).
	 * @returns {import('./InlineParser.js').InlineParser}
	 */
	getInlineParser()
	{
		return this.inlineParser;
	}
}

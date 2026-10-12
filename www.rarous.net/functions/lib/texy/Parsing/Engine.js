/**
 * Minimal parser engine - handles pattern registration and parsing (port of
 * Texy\Parsing\Engine).
 *
 * The pattern maps are a cumulative registry: re-registration under an
 * existing name replaces the handler and pattern but keeps the original
 * position, and nothing is ever removed. The allowed filter is applied per
 * parse when the parse context is created.
 *
 * Input contract: valid UTF-8, LF line endings, no \r (it is the internal
 * hard-break marker). Plain text between matches becomes TextNode holding
 * the source text verbatim; decoding (e.g. HTML entities) is a language
 * concern expressed as a registered syntax, never engine mechanics.
 *
 * Offsets are UTF-16 code-unit indices (see src/Range.js).
 */

import { ContentNode, DocumentNode } from '../nodes.js';
import { InlineParser } from './InlineParser.js';
import { BlockParser } from './BlockParser.js';
import { ParseContext } from './ParseContext.js';

export class Engine
{
	constructor()
	{
		/** @type {Map<string, {handler: Function, pattern: string}>} ordered */
		this.linePatterns = new Map();

		/** @type {Map<string, {handler: Function, pattern: string}>} ordered */
		this.blockPatterns = new Map();

		/** @type {Function} (context, text, offset) => BlockNode[] */
		this.gapHandler = () => [];
	}


	/**
	 * Register an inline pattern handler.
	 * @param {string} name
	 * @param {string} pattern PCRE pattern with delimiters
	 * @param {Function} handler (context, matches, offsets, name) => InlineNode|ContentNode|null
	 */
	addLineSyntax(name, pattern, handler)
	{
		this.linePatterns.set(name, { handler, pattern });
	}


	/**
	 * Register a block pattern handler. Patterns are forced multiline.
	 * @param {string} name
	 * @param {string} pattern PCRE pattern with delimiters
	 * @param {Function} handler (context, matches, offsets, name) => BlockNode|ContentNode|null
	 */
	addBlockSyntax(name, pattern, handler)
	{
		this.blockPatterns.set(name, { handler, pattern: pattern + 'm' });
	}


	/**
	 * Sets the gap handler for content between block patterns.
	 * @param {Function} handler (context, text, offset) => BlockNode[]
	 */
	setGapHandler(handler)
	{
		this.gapHandler = handler;
	}


	/**
	 * Parse text into an AST.
	 * @param {string} text normalized source
	 * @param {Object<string, boolean>} allowedSyntaxes map of syntax name => enabled
	 * @param {boolean} singleLine parse as single line (inline only)
	 * @returns {DocumentNode}
	 */
	parse(text, allowedSyntaxes, singleLine = false)
	{
		const context = this.createParseContext(allowedSyntaxes);
		const content = singleLine
			? context.parseInline(text)
			: context.parseBlock(text);

		return new DocumentNode(content);
	}


	/**
	 * Creates a parse context with patterns filtered by the allowed map.
	 * @param {Object<string, boolean>} allowedSyntaxes
	 * @returns {ParseContext}
	 */
	createParseContext(allowedSyntaxes)
	{
		return new ParseContext(
			this.createInlineParser(allowedSyntaxes),
			this.createBlockParser(allowedSyntaxes),
		);
	}


	/** @param {Object<string, boolean>} allowedSyntaxes */
	createBlockParser(allowedSyntaxes)
	{
		const patterns = new Map();
		for (const [name, info] of this.blockPatterns) {
			if (allowedSyntaxes[name]) patterns.set(name, info);
		}
		return new BlockParser(patterns, this.gapHandler);
	}


	/** @param {Object<string, boolean>} allowedSyntaxes */
	createInlineParser(allowedSyntaxes)
	{
		const patterns = new Map();
		for (const [name, info] of this.linePatterns) {
			if (allowedSyntaxes[name]) patterns.set(name, info);
		}
		return new InlineParser(patterns);
	}
}

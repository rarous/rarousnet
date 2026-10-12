/**
 * Processes HTML tags, comments and entity references in input text
 * (port of Texy\Modules\HtmlModule).
 *
 * Tag pairing into HtmlElementNode subtrees and whitelist evaluation are
 * transform passes in the reference (HtmlPairingPass, HtmlSanitizePass)
 * and are out of scope for this port.
 */

import { Module } from './Module.js';
import { Syntax } from '../Syntax.js';
import { HtmlCommentNode, HtmlTagNode, TextNode } from '../nodes.js';
import { decodeEntity, unescapeHtml } from '../helpers.js';
import { matchAll } from '../Regexp.js';

export class HtmlModule extends Module
{
	constructor(texy)
	{
		super();
		this.texy = texy;
	}


	beforeParse()
	{
		this.texy.addLineSyntax(
			Syntax.HtmlTag,
			String.raw`~
				< (/?)                          # tag begin
				([a-z][a-z0-9_:-]{0,50})        # tag name
				(
					(?:
						\s++ [a-z0-9_:-]++ |          # attribute name
						= \s*+ " [^"]*+ " |           # attribute value in double quotes
						= \s*+ ' [^']*+ ' |           # attribute value in single quotes
						= [^\s>]++                    # attribute value without quotes
					)*
				)
				\s*+
				(/?)                             # self-closing slash
				>
			~isx`,
			(context, matches, offsets) => this.parseTag(context, matches, offsets),
		);

		this.texy.addLineSyntax(
			Syntax.HtmlComment,
			String.raw`~
				<!--
				( .*? )
				-->
			~isx`,
			(context, matches, offsets) => this.parseComment(context, matches, offsets),
		);

		this.texy.addLineSyntax(
			Syntax.HtmlEntity,
			'~&(?:\\#[0-9]{1,7}|\\#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});~',
			(context, matches, offsets) => this.parseEntity(context, matches, offsets),
		);
	}


	/**
	 * Parses &amp;, &#160;, &#xA0; - unknown references are refused.
	 * @param {import('../Parsing/ParseContext.js').ParseContext} context
	 * @param {Array<?string>} matches
	 * @param {Array<?number>} offsets
	 * @returns {?TextNode}
	 */
	parseEntity(context, matches, offsets)
	{
		const decoded = decodeEntity(matches[0]);
		return decoded === null
			? null
			: new TextNode(decoded, { offset: offsets[0], length: matches[0].length });
	}


	/**
	 * Parses <!-- comment -->.
	 * @param {import('../Parsing/ParseContext.js').ParseContext} context
	 * @param {Array<?string>} matches
	 * @param {Array<?number>} offsets
	 * @returns {HtmlCommentNode}
	 */
	parseComment(context, matches, offsets)
	{
		return new HtmlCommentNode(matches[1], { offset: offsets[0], length: matches[0].length });
	}


	/**
	 * Parses <tag attr="...">.
	 * @param {import('../Parsing/ParseContext.js').ParseContext} context
	 * @param {Array<?string>} matches
	 * @param {Array<?number>} offsets
	 * @returns {?HtmlTagNode}
	 */
	parseTag(context, matches, offsets)
	{
		const [, mEnd, mTag, mAttr, mEmpty] = matches;

		const isStart = mEnd !== '/';
		let attr = mAttr;
		let isEmpty = mEmpty === '/';
		if (!isEmpty && attr.endsWith('/')) {
			attr = attr.slice(0, -1);
			isEmpty = true;
		}

		// error - can't close empty element
		if (isEmpty && !isStart) return null;

		// error - end element with attrs
		attr = attr.replaceAll('\n', ' ').trim();
		if (attr && !isStart) return null;

		return new HtmlTagNode(
			mTag,
			isStart ? this.parseAttributes(attr) : {},
			!isStart,
			isEmpty,
			{ offset: offsets[0], length: matches[0].length },
		);
	}


	/**
	 * Parses an attribute string into name -> value pairs; valueless
	 * attributes get true, quoted values are unquoted and entity-decoded.
	 * @param {string} attrs
	 * @returns {Object<string, string|boolean>}
	 */
	parseAttributes(attrs)
	{
		const res = {};
		const matches = matchAll(attrs, String.raw`~
			([a-z0-9_:-]+)                 # attribute name
			\s*
			(?:
				= \s*                      # equals sign
				(
					' [^']* ' |            # single quoted value
					" [^"]* " |            # double quoted value
					[^'"\s]+               # unquoted value
				)
			)?
		~isx`);

		for (const m of matches) {
			const key = m.matches[1].toLowerCase();
			const value = m.matches[2];
			if (value == null || value === '') {
				res[key] = true;
			} else if (value[0] === '\'' || value[0] === '"') {
				res[key] = decodeEntitiesTrimmed(value.slice(1, -1));
			} else {
				res[key] = decodeEntitiesTrimmed(value);
			}
		}

		return res;
	}
}


const decodeEntitiesTrimmed = s => unescapeHtml(s).trim();

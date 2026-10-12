/**
 * Replaces emoticons with Unicode characters (port of
 * Texy\Modules\EmoticonModule; parse phase only).
 *
 * Resolution to the replacement character happens in the transform phase
 * in the reference; this module parses EmoticonNodes when the syntax is
 * enabled via allowed['emoticon'].
 */

import { Module } from './Module.js';
import { Syntax } from '../Syntax.js';
import { EmoticonNode } from '../nodes.js';
import { quote } from '../Regexp.js';
import { find } from '../NodeHelpers.js';


export class EmoticonModule extends Module
{
	constructor(texy)
	{
		super();
		this.texy = texy;

		/** @type {Object<string, string>} emoticon -> emoji/image mapping */
		this.icons = {
			':-)': '🙂',
			':-(': '☹',
			';-)': '😉',
			':-D': '😁',
			'8-O': '😮',
			'8-)': '😄',
			':-?': '😕',
			':-x': '😶',
			':-P': '😛',
			':-|': '😐',
		};

		texy.allowed[Syntax.Emoticon] = false;
	}


	beforeParse()
	{
		// icons sorted longest-first; the last char may repeat
		const icons = Object.keys(this.icons).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)); // krsort: descending key order
		const pattern = icons.map(key => quote(key) + '+').join('|');

		this.texy.addLineSyntax(
			Syntax.Emoticon,
			String.raw`~
				(?<= ^ | [\x00-\x20] )
				(` + pattern + `)
			~x`,
			(context, matches, offsets) => this.parse(context, matches, offsets),
		);
	}


	/**
	 * Parses :-); picks the icon that is a prefix of the match.
	 * @param {import('../Parsing/ParseContext.js').ParseContext} context
	 */
	parse(context, matches, offsets)
	{
		const match = matches[0];

		for (const emoticon of Object.keys(this.icons)) {
			if (match.startsWith(emoticon)) {
				return new EmoticonNode(emoticon, { offset: offsets[0], length: matches[0].length });
			}
		}

		return null;
	}


	/**
	 * Resolves an emoticon node's display text (for consumers running the
	 * transform phase).
	 */
	resolveEmoticon(node)
	{
		node.resolved = this.icons[node.emoticon] ?? node.emoticon;
	}


	/**
	 * Writes resolved emoji into EmoticonNode so the AST is semantically
	 * complete and generators need not reach into this module (transform
	 * phase; only when emoticons are enabled).
	 * @param {import('../nodes.js').DocumentNode} doc
	 */
	resolveEmoticons(doc)
	{
		if (!this.texy.allowed.emoticon) { // disabled = no EmoticonNodes in AST
			return;
		}

		for (const node of find(doc, n => n instanceof EmoticonNode)) {
			node.resolved = this.icons[node.emoticon] ?? node.emoticon;
		}
	}

}

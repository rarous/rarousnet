/**
 * Processes ordered, unordered, and definition lists with nesting (port of
 * Texy\Modules\ListModule).
 */

import { Module } from './Module.js';
import { Syntax } from '../Syntax.js';
import { ModifierHAlign } from '../Patterns.js';
import { Modifier } from '../Modifier.js';
import { DefinitionListNode, ListItemNode, ListNode, ListType } from '../nodes.js';
import { match, quote } from '../Regexp.js';
import { OffsetMap } from '../Parsing/OffsetMap.js';

export class ListModule extends Module
{
	constructor(texy)
	{
		super();
		this.texy = texy;

		/**
		 * Bullet styles: [regex, type, optional next-regex].
		 * Order matters: it drives both the pattern alternation and bullet
		 * recognition in the handler.
		 * @type {Object<string, [string, string, ?string]>}
		 */
		this.bullets = {
			'*': [String.raw`\* [ \t]`, ListType.Unordered, null],
			'-': [String.raw`[\x{2013}-] (?! [>-] )`, ListType.Unordered, null], // en dash allowed, not ->
			'+': [String.raw`\+ [ \t]`, ListType.Unordered, null],
			'1.': [String.raw`1 \. [ \t]`, ListType.Decimal, String.raw`\d{1,3} \. [ \t]`], // not \d!
			'1)': [String.raw`\d{1,3} \) [ \t]`, ListType.Decimal, null],
			'I.': [String.raw`I \. [ \t]`, ListType.UpperRoman, String.raw`[IVX]{1,4} \. [ \t]`],
			'I)': [String.raw`[IVX]+ \) [ \t]`, ListType.UpperRoman, null], // before A) !
			'a)': [String.raw`[a-z] \) [ \t]`, ListType.LowerAlpha, null],
			'A)': [String.raw`[A-Z] \) [ \t]`, ListType.UpperAlpha, null],
		};

		texy.allowed[Syntax.List] = true;
		texy.allowed[Syntax.DefinitionList] = true;
	}


	beforeParse()
	{
		const RE = [];
		const REul = [];
		for (const desc of Object.values(this.bullets)) {
			RE.push(desc[0]);
			if (!ListType.isOrdered(desc[1])) {
				REul.push(desc[0]);
			}
		}

		this.texy.addBlockSyntax(
			Syntax.List,
			String.raw`~^
				(?:` + ModifierHAlign + String.raw`\n)? # modifier (1)
				(` + RE.join('|') + String.raw`)         # list marker (2)
				[ \t]*+
				\S .*                               # content
			$~mUx`,
			(context, matches, offsets) => this.parseList(context, matches, offsets),
		);

		this.texy.addBlockSyntax(
			Syntax.DefinitionList,
			String.raw`~^
				(?:` + ModifierHAlign + String.raw`\n)?   # modifier (1)
				( \S .{0,2000} )                      # definition term (2)
				: [ \t]*                              # colon separator
				` + ModifierHAlign + String.raw`?         # modifier (3)
				\n
				( [ \t]++)                             # indentation (4)
				(` + REul.join('|') + String.raw`)         # description marker (5)
				[ \t]*+
				\S .*                                 # content
			$~mUx`,
			(context, matches, offsets) => this.parseDefList(context, matches, offsets),
		);
	}


	/**
	 * Parses list.
	 */
	parseList(context, matches, offsets)
	{
		const [, mMod, mBullet] = matches;

		let bullet = null;
		let min = 1;
		let start = null;
		let listType = ListType.Unordered;

		for (const [key, desc] of Object.entries(this.bullets)) {
			if (match(mBullet, '~' + desc[0] + '~Ax')) {
				bullet = desc[2] ?? desc[0];
				min = desc[2] !== undefined && desc[2] !== null ? 2 : 1;
				listType = desc[1];
				if (ListType.isOrdered(listType)) {
					if (key[0] === '1' && parseInt(mBullet, 10) > 1) {
						start = parseInt(mBullet, 10);
					} else if (key[0] === 'a' && mBullet[0] > 'a') {
						start = mBullet.charCodeAt(0) - 96;
					} else if (key[0] === 'A' && mBullet[0] > 'A') {
						start = mBullet.charCodeAt(0) - 64;
					}
				}
				break;
			}
		}

		if (bullet === null) return null;

		context.getBlockParser().moveBackward();

		const items = [];
		let item;
		while ((item = this.parseItem(context, bullet, false)) !== null) {
			items.push(item);
		}

		if (items.length < min) return null;

		return new ListNode(
			items,
			listType,
			start,
			Modifier.parse(mMod, offsets[1]),
			{ offset: offsets[0], length: matches[0].length },
		);
	}


	/**
	 * Parses definition list.
	 */
	parseDefList(context, matches, offsets)
	{
		const [, mMod, , , , mBullet] = matches;

		let bullet = null;
		for (const desc of Object.values(this.bullets)) {
			if (match(mBullet, '~' + desc[0] + '~Ax')) {
				bullet = desc[2] ?? desc[0];
				break;
			}
		}

		if (bullet === null) return null;

		context.getBlockParser().moveBackward(2);

		const items = [];
		const patternTerm = String.raw`~^
			\n?
			( \S .* )                       # term content
			: [ \t]*                        # colon separator
			` + ModifierHAlign + String.raw`?
		$~mUAx`;

		for (;;) {
			const item = this.parseItem(context, bullet, true);
			if (item !== null) {
				items.push(item);
				continue;
			}

			const termMatches = context.getBlockParser().next(patternTerm);
			if (termMatches !== null) {
				const [, mContent, mTermMod] = termMatches.matches;
				const termMod = Modifier.parse(mTermMod, termMatches.offsets[2] ?? null);
				const termOffset = termMatches.offsets[0];
				const contentOffset = termMatches.offsets[1];
				const termContent = context.parseInline(mContent, contentOffset);
				items.push(new ListItemNode(termContent, true, termMod, { offset: termOffset, length: termMatches.length }));
				continue;
			}

			break;
		}

		return new DefinitionListNode(
			items,
			Modifier.parse(mMod, offsets[1]),
			{ offset: offsets[0], length: matches[0].length },
		);
	}


	/**
	 * Parses a single list item and its continuation lines.
	 * @param {import('../Parsing/ParseContext.js').ParseContext} context
	 * @param {string} bullet
	 * @param {boolean} indented definition-description mode
	 * @returns {?ListItemNode}
	 */
	parseItem(context, bullet, indented)
	{
		const spacesBase = indented ? String.raw`[\ \t]{1,}` : '';
		const patternItem = String.raw`~^
			\n?
			(${spacesBase})                            # base indentation (1)
			${bullet}                                # bullet character
			[ \t]*
			( \S .* )?                              # content (2)
			` + ModifierHAlign + String.raw`?           # modifier (3)
		$~mAUx`;

		const first = context.getBlockParser().next(patternItem);
		if (first === null) return null;

		const [, mIndent, mContent, mMod] = first.matches;
		const itemOffset = first.offsets[0];
		const modOffset = first.offsets[3] ?? null;
		let itemEnd = itemOffset + first.length;

		// Assemble content and map local line starts to absolute source offsets
		const map = {};
		let content = ' ' + (mContent ?? '');
		if (mContent !== null) {
			map[1] = first.offsets[2]; // 1 = the leading space
		}

		// next lines
		let spaces = '';
		let next;
		while ((next = context.getBlockParser().next(
			String.raw`~^
			(\n*)
			` + quote(mIndent) + `
			([ \t]{1,${spaces}})   # continuation indent
			(.*)                                     # content (3)
		$~Amx`,
		)) !== null) {
			const [, mBlank, mSpaces, mNextContent] = next.matches;

			if (spaces === '') {
				spaces = String(mSpaces.length);
			}

			if (mNextContent !== '' && next.offsets[3] !== null) {
				map[content.length + 1 + mBlank.length] = next.offsets[3]; // 1 = "\n"
			}

			content += '\n' + mBlank + mNextContent;
			itemEnd = next.offsets[0] + next.length;
		}

		// Parse content as blocks
		const parsed = context.parseBlock(content.trim());

		// Fix positions in parsed content using offset mapping
		const keys = Object.keys(map);
		if (keys.length > 0) {
			const skipped = content.length - content.replace(/^[ \t\n]+/, '').length;
			new OffsetMap(map, skipped).applyTo(parsed);
		}

		return new ListItemNode(
			parsed,
			false,
			Modifier.parse(mMod, modOffset),
			{ offset: itemOffset, length: itemEnd - itemOffset },
		);
	}
}

/**
 * Processes horizontal line syntax (---, ***) (port of
 * Texy\Modules\HorizontalRuleModule).
 */

import { Module } from './Module.js';
import { Syntax } from '../Syntax.js';
import { Modifier as ModifierPattern } from '../Patterns.js';
import { Modifier } from '../Modifier.js';
import { HorizontalRuleNode } from '../nodes.js';

export class HorizontalRuleModule extends Module
{
	constructor(texy)
	{
		super();
		this.texy = texy;
	}


	beforeParse()
	{
		this.texy.addBlockSyntax(
			Syntax.HorizontalRule,
			String.raw`~^
				( \*{3,}+ | -{3,}+ )         # three or more * or - (1)
				[ \t]*                       # optional spaces
				` + ModifierPattern + String.raw`? # modifier (2)
			$~mUx`,
			(context, matches, offsets) => this.parse(context, matches, offsets),
		);
	}


	/**
	 * Parses --- and ***.
	 */
	parse(context, matches, offsets)
	{
		return new HorizontalRuleNode(
			matches[1][0],
			Modifier.parse(matches[2], offsets[2]),
			{ offset: offsets[0], length: matches[0].length },
		);
	}
}

/**
 * Autodetects URLs and email addresses in text
 * (port of Texy\Modules\AutolinkModule).
 */

import { Module } from './Module.js';
import { Syntax } from '../Syntax.js';
import { Email, Letter } from '../Patterns.js';
import { EmailNode, UrlNode } from '../nodes.js';
import { removeSoftHyphens } from '../helpers.js';

export class AutolinkModule extends Module
{
	constructor(texy)
	{
		super();
		this.texy = texy;
	}


	beforeParse()
	{
		// direct url; characters not allowed in URL <>[\]^`{|}
		this.texy.addLineSyntax(
			Syntax.AutolinkUrl,
			String.raw`~
				(?<= ^ | [\s([<:] )                # must be preceded by these chars
				(?: https?:// | www\. | ftp:// )   # protocol or www
				[0-9.` + Letter + String.raw`-]      # first char
				[/\d` + Letter + String.raw`+.\~%&?@=_:;#$!,*()\x{ad}-]{1,1000}  # URL body
				[/\d` + Letter + String.raw`+\~?@=_#$*]  # last char
			~x`,
			(context, matches, offsets) => this.parseUrl(context, matches, offsets),
		);

		// direct email
		this.texy.addLineSyntax(
			Syntax.AutolinkEmail,
			String.raw`~
				(?<= ^ | [\s([<] )                  # must be preceded by these chars
			` + Email + String.raw`
			~x`,
			(context, matches, offsets) => this.parseEmail(context, matches, offsets),
		);
	}


	/**
	 * @param {import('../Parsing/ParseContext.js').ParseContext} context
	 */
	parseUrl(context, matches, offsets)
	{
		return new UrlNode(removeSoftHyphens(matches[0]), { offset: offsets[0], length: matches[0].length });
	}


	/**
	 * @param {import('../Parsing/ParseContext.js').ParseContext} context
	 */
	parseEmail(context, matches, offsets)
	{
		return new EmailNode(removeSoftHyphens(matches[0]), { offset: offsets[0], length: matches[0].length });
	}
}

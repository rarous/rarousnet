/**
 * Applies typographic corrections (quotes, dashes, ellipsis, non-breaking
 * spaces) - port of Texy\Modules\TypographyModule.
 *
 * The typographic substitutions live in ../Typography.js (the port of the
 * reference pattern catalog, over the TextRunPass marker alphabet,
 * matching the reference on the replay corpus in
 * tests/fixtures/typo-probe.json). The nbsp letter classes are kept as
 * \p{Letter} - a deliberate extension beyond the reference's legacy
 * A-Za-z/Latin/Greek/Cyrillic ranges, covering all scripts. This module
 * adds the reference's pre-processing (tab and multiple-space shrinking)
 * and the locale configuration.
 */

import { processTypo } from '../Typography.js';
import { replace } from '../Regexp.js';
import { Syntax } from '../Syntax.js';
import { Module } from './Module.js';

export class TypographyModule extends Module
{
	/**
	 * @param {import('../Texy.js').Texy} texy
	 */
	constructor(texy)
	{
		super();
		this.texy = texy;

		/** @type {string} locale for quotation marks (unknown falls back to en) */
		this.locale = 'cs';

		if (texy.allowed[Syntax.Typography] === undefined) {
			texy.allowed[Syntax.Typography] = true;
		}
	}


	/**
	 * Applies typographic substitutions to a line of text.
	 * @param {string} text
	 * @param {boolean} preserveSpaces skip the tab/space shrinking
	 * @returns {string}
	 */
	postLine(text, preserveSpaces = false)
	{
		if (!preserveSpaces) {
			text = text.replaceAll("\t", ' ');
			text = replace(text, String.raw`~\ {2,}~`, ' ');
		}

		return processTypo(text, { locale: this.locale });
	}
}

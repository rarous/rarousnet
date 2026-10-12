/**
 * Configuration of the HTML output (port of Texy\Output\Html\Config):
 * formatting and presentation options and user node renderers, exposed as
 * $texy.htmlOutput. Consumed by the Renderer and the WellFormer engine.
 */

import { Syntax } from '../../Syntax.js';

export class Config
{
	constructor()
	{
		/** indent HTML code? */
		this.indent = true;

		/** @type {string[]} tags whose content keeps its whitespace verbatim */
		this.preserveSpaces = ['textarea', 'pre', 'script', 'code', 'samp', 'kbd'];

		/** base indent level */
		this.baseIndent = 0;

		/** wrap width, doesn't include indent space */
		this.lineWrap = 80;

		/** @type {Object<string, ?string>} CSS classes for align modifiers */
		this.alignClasses = {
			left: null,
			right: null,
			center: null,
			justify: null,
			top: null,
			middle: null,
			bottom: null,
		};

		/** Do obfuscate e-mail addresses? */
		this.obfuscateEmail = true;

		/** Element for image-only paragraphs: tag name or an Element instance */
		this.nontextParagraph = 'div';

		/** Shorten URLs to more readable form? */
		this.shortenUrls = true;

		/** CSS class for emoticons */
		this.emoticonClass = null;

		/** Figure wrapper tag name */
		this.figureTagName = 'div';

		/** Non-floated figure CSS class */
		this.figureClass = 'figure';

		/** Left-floated figure CSS class */
		this.figureLeftClass = null;

		/** Right-floated figure CSS class */
		this.figureRightClass = null;

		/** @type {Object<string, ?string>} default CSS class for HR types */
		this.horizontalRuleClasses = {
			'-': null,
			'*': null,
		};

		/** Pass HTML comments to output? */
		this.passHtmlComments = true;

		/** Left-floated images CSS class */
		this.imageLeftClass = null;

		/** Right-floated images CSS class */
		this.imageRightClass = null;

		/** Root path for image URLs */
		this.imageRoot = 'images/';

		/**
		 * File system root for image dimension detection (the reference
		 * probes images with getimagesize() under this root).
		 */
		this.imageFileRoot = null;

		/** Always use rel="nofollow" for absolute links? */
		this.linkNoFollow = false;

		/** Root path for link URLs */
		this.linkRoot = null;

		/** @type {Object<string, string>} syntax id -> HTML tag mapping */
		this.phraseTags = {
			[Syntax.Strong]: 'strong',
			[Syntax.Emphasis]: 'em',
			[Syntax.EmphasisSingleAsterisk]: 'em',
			[Syntax.EmphasisSingleAsterisk2]: 'em',
			[Syntax.Inserted]: 'ins',
			[Syntax.Deleted]: 'del',
			[Syntax.Superscript]: 'sup',
			[Syntax.SuperscriptShort]: 'sup',
			[Syntax.Subscript]: 'sub',
			[Syntax.SubscriptShort]: 'sub',
			[Syntax.SpanQuotes]: 'span',
			[Syntax.SpanTilde]: 'span',
			[Syntax.AbbreviationQuotes]: 'abbr',
			[Syntax.Abbreviation]: 'abbr',
			[Syntax.Code]: 'code',
			[Syntax.Quote]: 'q',
			[Syntax.QuickLink]: 'a',
		};

		/** @type {Array<Function>} user node renderers (see addRenderer) */
		this.userRenderers = [];
	}


	/**
	 * Registers how a node class is rendered. Return null to pass the node
	 * on to the previous renderer for that class.
	 *
	 * Deviation from the reference (which reads the node class from the
	 * first parameter's type hint): JavaScript has no runtime parameter
	 * types, so the node class is passed explicitly.
	 * @param {Function} nodeClass a Node subclass
	 * @param {Function} renderer fn(node, rendererInstance, previousRenderer): Element|Raw|string|null
	 */
	addRenderer(nodeClass, renderer)
	{
		this.userRenderers.push([nodeClass, renderer]);
	}


	/**
	 * @internal
	 * @returns {Array<[Function, Function]>}
	 */
	getRenderers()
	{
		return this.userRenderers;
	}
}

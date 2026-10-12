/**
 * Texy! - text-to-HTML converter (port of Texy\Texy).
 *
 * Implements the full pipeline of the reference implementation (see
 * docs/porting.md): normalize -> parse -> transform passes (incl.
 * typography and hyphenation) -> HTML rendering. Typography substitutions
 * live in ./Typography.js (the reference pattern catalog over the
 * TextRunPass marker alphabet).
 *
 * <code>
 * const texy = new Texy();
 * const html = texy.process(text);          // text -> HTML
 * const document = texy.parse(text);        // text -> DocumentNode
 * const html2 = texy.renderHtml(document);   // DocumentNode -> HTML
 * const plain = texy.toText(text);           // text -> plain text
 * </code>
 */

import { Engine } from './Parsing/Engine.js';
import { UrlPolicy } from './UrlPolicy.js';
import { normalize } from './normalize.js';
import { Syntax } from './Syntax.js';
import { HtmlPolicy } from './HtmlPolicy.js';
import { HtmlPairingPass } from './Passes/HtmlPairingPass.js';
import { HtmlSanitizePass } from './Passes/HtmlSanitizePass.js';
import { HeadingPass } from './Passes/HeadingPass.js';
import { DirectiveModule } from './Modules/DirectiveModule.js';
import { HtmlModule } from './Modules/HtmlModule.js';
import { ImageModule } from './Modules/ImageModule.js';
import { PhraseModule } from './Modules/PhraseModule.js';
import { LinkReferenceModule } from './Modules/LinkReferenceModule.js';
import { AutolinkModule } from './Modules/AutolinkModule.js';
import { EmoticonModule } from './Modules/EmoticonModule.js';
import { ParagraphModule } from './Modules/ParagraphModule.js';
import { BlockModule } from './Modules/BlockModule.js';
import { HorizontalRuleModule } from './Modules/HorizontalRuleModule.js';
import { BlockQuoteModule } from './Modules/BlockQuoteModule.js';
import { TableModule } from './Modules/TableModule.js';
import { HeadingModule } from './Modules/HeadingModule.js';
import { ListModule } from './Modules/ListModule.js';
import { TypographyModule } from './Modules/TypographyModule.js';
import { HyphenationModule } from './Modules/HyphenationModule.js';
import { TextRunPass } from './Passes/TextRunPass.js';
import { Config } from './Output/Html/Config.js';
import { Renderer } from './Output/Html/Renderer.js';
import { Renderer as TextRenderer } from './Output/Text/Renderer.js';

export class Texy
{
	constructor()
	{
		/** @type {Object<string, boolean>} Texy! syntax configuration */
		this.allowed = {};

		/** URL scheme security policy for links and images */
		this.urlPolicy = new UrlPolicy();

		/** @type {Array<import('./Modules/Module.js').Module>} */
		this.modules = [];

		/**
		 * The parsing engine - a cumulative pattern registry. Modules refresh
		 * their patterns before each parse; consumer registrations are never
		 * overwritten.
		 */
		this.engine = new Engine();

		/** @type {Object<string, true>} syntax names registered by the consumer */
		this.consumerSyntaxes = { line: {}, block: {} };

		this.inModulePrepare = false;

		/** @type {Function[]} consumer transform passes, run after the module passes */
		this.passes = [];

		/** HTML security policy: allowed tags, classes and inline styles */
		this.htmlPolicy = new HtmlPolicy(this.urlPolicy);

		/** @type {import('./Output/Html/Config.js').Config} HTML output configuration (formatting, presentation options) */
		this.htmlOutput = new Config();

		// module handles for configuration before parse
		this.paragraphModule = null;
		this.imageModule = null;
		this.linkModule = null;
		this.phraseModule = null;
		this.emoticonModule = null;
		this.headingModule = null;
		this.listModule = null;
		this.directiveModule = null;
		this.typographyModule = null;
		this.hyphenationModule = null;

		this.loadModules();
		this.engine.setGapHandler(
			(context, gapText, offset) => this.paragraphModule.parseText(context, gapText, offset),
		);
	}


	/**
	 * Creates the array of all used modules. This array can be changed by
	 * overriding this method (by subclasses). Registration order is part of
	 * the collision-resolution contract.
	 */
	loadModules()
	{
		// line parsing
		this.addModule(this.directiveModule = new DirectiveModule(this));
		this.addModule(new HtmlModule(this));
		this.addModule(this.imageModule = new ImageModule(this));
		this.addModule(this.phraseModule = new PhraseModule(this));
		this.addModule(this.linkModule = new LinkReferenceModule(this));
		this.addModule(new AutolinkModule(this));
		this.addModule(this.emoticonModule = new EmoticonModule(this));

		// block parsing
		this.addModule(this.paragraphModule = new ParagraphModule(this));
		this.addModule(new BlockModule(this));
		this.addModule(new HorizontalRuleModule(this));
		this.addModule(new BlockQuoteModule(this));
		this.addModule(new TableModule(this));
		this.addModule(this.headingModule = new HeadingModule(this));
		this.addModule(this.listModule = new ListModule(this));

		// post process
		this.addModule(this.typographyModule = new TypographyModule(this));
		this.addModule(this.hyphenationModule = new HyphenationModule(this));
	}


	/**
	 * @param {import('./Modules/Module.js').Module} module
	 */
	addModule(module)
	{
		this.modules.push(module);
	}


	/**
	 * Registers an inline syntax.
	 * @param {string} name
	 * @param {string} pattern PCRE pattern
	 * @param {Function} handler (context, matches, offsets, name) => InlineNode|ContentNode|null
	 */
	addLineSyntax(name, pattern, handler)
	{
		if (this.inModulePrepare) {
			if (this.consumerSyntaxes.line[name]) return; // a syntax registered by the consumer is never overwritten by a module
		} else {
			this.consumerSyntaxes.line[name] = true;
		}

		if (this.allowed[name] === undefined) {
			this.allowed[name] = true;
		}

		this.engine.addLineSyntax(name, pattern, handler);
	}


	/**
	 * Registers a block syntax.
	 * @param {string} name
	 * @param {string} pattern PCRE pattern
	 * @param {Function} handler (context, matches, offsets, name) => BlockNode|ContentNode|null
	 */
	addBlockSyntax(name, pattern, handler)
	{
		if (this.inModulePrepare) {
			if (this.consumerSyntaxes.block[name]) return;
		} else {
			this.consumerSyntaxes.block[name] = true;
		}

		if (this.allowed[name] === undefined) {
			this.allowed[name] = true;
		}

		this.engine.addBlockSyntax(name, pattern, handler);
	}


	/**
	 * Parses text to an AST. The text is normalized first (idempotent).
	 * @param {string} text
	 * @param {boolean} singleLine
	 * @returns {import('./nodes.js').DocumentNode}
	 */
	parse(text, singleLine = false)
	{
		text = normalize(text);

		// let modules do per-parse initialization (pattern registration, state reset)
		this.inModulePrepare = true;
		try {
			for (const module of this.modules) {
				module.beforeParse();
			}
		} finally {
			this.inModulePrepare = false;
		}

		const document = this.engine.parse(text, this.allowed, singleLine);

		// the transform passes, in module order
		this.directiveModule.processDirectives(document);
		this.processHtmlPassthrough(document);
		this.imageModule.resolveReferences(document);
		this.linkModule.resolveReferences(document);
		this.emoticonModule.resolveEmoticons(document);
		new HeadingPass(
			this.headingModule.top,
			this.headingModule.balancing === HeadingModule.Dynamic,
			this.headingModule.generateID,
			this.headingModule.idPrefix,
		).process(document);

		for (const pass of this.passes) {
			pass(document);
		}

		this.applyAstTypography(document);
		return document;
	}


	/**
	 * Runs typography/hyphenation over the AST, honouring the allowed[]
	 * configuration, and marks the document so the renderer skips its
	 * string post-processing (title/alt typography).
	 *
	 * parse() does this itself as its last step. It is public for the other
	 * case: a document built by a different parser, which is still an
	 * ordinary Texy AST and still wants the typography. Calling it on an
	 * already typographed document does nothing.
	 * @param {import('./nodes.js').DocumentNode} document
	 */
	applyAstTypography(document)
	{
		if (document.meta.typographed) {
			return;
		}

		const transformers = [];
		if (this.allowed[Syntax.Typography]) {
			transformers.push(s => this.typographyModule.postLine(s));
		}
		if (this.allowed[Syntax.Hyphenation]) {
			transformers.push(s => this.hyphenationModule.postLine(s));
		}

		new TextRunPass(
			transformers,
			this.allowed[Syntax.Typography]
				? s => this.typographyModule.postLine(s)
				: null,
		).process(document);

		document.meta.typographed = true;
	}


	/**
	 * Pairs passthrough HTML tags into elements and evaluates the tag
	 * whitelist over them; both are transform passes that protect every
	 * output format. Only when html/tag is allowed.
	 * @param {import('./nodes.js').DocumentNode} document
	 */
	processHtmlPassthrough(document)
	{
		if (!this.allowed['html/tag']) {
			return;
		}

		new HtmlPairingPass().process(document);
		new HtmlSanitizePass(this.htmlPolicy).process(document);
	}


	/**
	 * Registers a consumer transform pass: fn(DocumentNode): void, called after
	 * parsing and the module passes, in registration order.
	 * @param {Function} pass
	 */
	addPass(pass)
	{
		this.passes.push(pass);
	}


	/**
	 * Creates a parse context. Modules must be initialized via parse() first
	 * for patterns to be available.
	 */
	createParseContext()
	{
		return this.engine.createParseContext(this.allowed);
	}


	/**
	 * Converts Texy text to HTML.
	 * @param {string} text
	 * @param {boolean} singleLine
	 * @returns {string}
	 */
	process(text, singleLine = false)
	{
		return this.renderHtml(this.parse(text, singleLine));
	}


	/**
	 * Renders a parsed document to HTML. Separate from parse() so a
	 * consumer can read or transform the AST in between.
	 * @param {import('./nodes.js').DocumentNode} document
	 * @returns {string}
	 */
	renderHtml(document)
	{
		return this.createHtmlRenderer().render(document);
	}


	/**
	 * Renders a parsed document onto a linkedom Document (content in
	 * <body>) for DOM-side transformation; serialize afterwards via
	 * linkedom (e.g. document.body.innerHTML).
	 * @param {import('./nodes.js').DocumentNode} document
	 * @returns the linkedom Document
	 */
	renderDom(document)
	{
		return this.createHtmlRenderer().renderToDom(document);
	}


	/**
	 * Creates an HTML renderer wired to the current configuration. The
	 * renderer needs no live Texy instance and is reusable across documents.
	 * @returns {Renderer}
	 */
	createHtmlRenderer()
	{
		return new Renderer(
			this.htmlOutput,
			this.htmlPolicy,
			this.urlPolicy,
			this.allowed[Syntax.Typography]
				? s => this.typographyModule.postLine(s)
				: null,
			() => this.createParseContext(),
		);
	}


	/**
	 * Makes only typographic corrections (and hyphenation), honouring the
	 * allowed[] configuration.
	 * @param {string} text
	 * @returns {string}
	 */
	applyTypography(text)
	{
		text = normalize(text);

		if (this.allowed[Syntax.Typography]) {
			text = this.typographyModule.postLine(text, true);
		}

		if (this.allowed[Syntax.Hyphenation]) {
			text = this.hyphenationModule.postLine(text);
		}

		return text;
	}


	/**
	 * Converts Texy text to a plain-text rendition.
	 * @param {string} text
	 * @returns {string}
	 */
	toText(text)
	{
		return this.renderText(this.parse(text));
	}


	/**
	 * Renders a parsed document to plain text.
	 * @param {import('./nodes.js').DocumentNode} document
	 * @returns {string}
	 */
	renderText(document)
	{
		return new TextRenderer().render(document);
	}
}

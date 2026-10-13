/**
 * Renders the AST to the output HTML string (port of
 * Texy\Output\Html\Renderer); needs no live Texy instance. Configuration is
 * read from the Config object; per-document facts (nofollow, typographed)
 * are derived from the document itself at render time, so the instance is a
 * configuration snapshot reusable across documents.
 */

import { NodeRenderer } from '../NodeRenderer.js';
import { Element } from './Element.js';
import { Raw } from './Raw.js';
import { ElementDecorator } from './ElementDecorator.js';
import { ImageDimensions } from './ImageDimensions.js';
import { WellFormer } from './WellFormer.js';
import { renderToDom } from './DomBuilder.js';
import { inlineElements } from './Schema.js';
import {
	CommentNode, ContentNode, DefinitionListNode, DirectiveNode, DocumentNode, EmailNode, EmoticonNode,
	FigureNode, HeadingNode, HorizontalRuleNode, HtmlCommentNode, HtmlElementNode, HtmlTagNode, ImageNode,
	ImageDefinitionNode, LinkDefinitionNode, LinkNode, LineBreakNode, ListType, ListNode, ListItemNode,
	ParagraphNode, PhraseNode, RawTextNode, SectionNode, TableNode, TableCellNode, TableRowNode, TextNode,
	UrlNode, AnnotationNode, CodeBlockNode, BlockQuoteNode,
} from '../../nodes.js';
import { Syntax } from '../../Syntax.js';
import { decodeEntities, escapeHtml, escapeHtmlQuotes, normalizeWww, phpLtrim, phpTrim, prependRoot, shortenUrl } from '../../helpers.js';
import { cloneNode, extractText } from '../../NodeHelpers.js';

/**
 * PHP settype($attrs[$key], 'array'): an existing array or map passes
 * through, scalars become a one-element list, null/undefined an empty
 * composite. PHP arrays serve as both lists and maps; the JS shape is
 * chosen by usage: 'style' is a property map, everything else a list.
 */
function settypeArray(attrs, key)
{
	const v = attrs[key];
	if (v !== undefined && v !== null && typeof v === 'object') {
		return;
	}
	attrs[key] = key === 'style' ? {} : (v === undefined || v === null ? [] : [v]);
}


export class Renderer extends NodeRenderer
{
	/**
	 * @param {import('./Config.js').Config} config
	 * @param {import('../../HtmlPolicy.js').HtmlPolicy} htmlPolicy
	 * @param {import('../../UrlPolicy.js').UrlPolicy} urlPolicy
	 * @param {?Function} postLine typography for isolated strings (title, alt); null = disabled
	 * @param {?Function} parseContextFactory fn(): ParseContext - needed to render block/html and block/texysource
	 */
	constructor(config, htmlPolicy, urlPolicy, postLine = null, parseContextFactory = null)
	{
		super();
		this.config = config;
		this.htmlPolicy = htmlPolicy;
		this.urlPolicy = urlPolicy;
		this.postLine = postLine;
		this.parseContextFactory = parseContextFactory;
		this.noFollow = config.linkNoFollow;
		this.titleTypography = true;
		this.imageDimensions = new ImageDimensions(config);
		this.decorator = new ElementDecorator(htmlPolicy, urlPolicy, config, this);

		this.handlers.set(DocumentNode, n => this.renderDocument(n));
		this.handlers.set(TextNode, n => n.text);
		this.handlers.set(ContentNode, n => this.wrapChildren(this.renderNodes(n.children)));

		// Block nodes
		this.handlers.set(ParagraphNode, n => this.renderParagraph(n));
		this.handlers.set(HeadingNode, n => this.renderHeading(n));
		this.handlers.set(BlockQuoteNode, n => this.renderBlockQuote(n));
		this.handlers.set(CodeBlockNode, n => this.renderCodeBlock(n));
		this.handlers.set(SectionNode, n => this.renderSection(n));
		this.handlers.set(HorizontalRuleNode, n => this.renderHorizontalRule(n));
		this.handlers.set(FigureNode, n => this.renderFigure(n));

		// List nodes
		this.handlers.set(ListNode, n => this.renderList(n));
		this.handlers.set(ListItemNode, n => this.renderListItem(n));
		this.handlers.set(DefinitionListNode, n => this.renderDefinitionList(n));

		// Table nodes
		this.handlers.set(TableNode, n => this.renderTable(n));
		this.handlers.set(TableRowNode, n => this.renderTableRow(n));
		this.handlers.set(TableCellNode, n => this.renderTableCell(n));

		// Inline nodes
		this.handlers.set(ImageNode, n => this.renderImage(n));
		this.handlers.set(LinkNode, n => this.renderLink(n));
		this.handlers.set(PhraseNode, n => this.renderPhrase(n));
		this.handlers.set(RawTextNode, n => escapeHtml(n.text));
		this.handlers.set(AnnotationNode, n => (new Element('abbr', { title: n.annotation })).setText(n.text));
		this.handlers.set(EmoticonNode, n => this.renderEmoticon(n));
		this.handlers.set(LineBreakNode, () => new Raw('<br>'));

		// Autolink nodes
		this.handlers.set(UrlNode, n => this.renderUrl(n));
		this.handlers.set(EmailNode, n => this.renderEmail(n));

		// HTML passthrough nodes
		this.handlers.set(HtmlTagNode, n => this.renderHtmlTag(n));
		this.handlers.set(HtmlElementNode, n => this.renderHtmlElement(n));
		this.handlers.set(HtmlCommentNode, n => this.renderHtmlComment(n));

		// Directive nodes
		this.handlers.set(DirectiveNode, n => this.renderDirective(n));

		// Definition nodes (output empty string)
		this.handlers.set(ImageDefinitionNode, () => '');
		this.handlers.set(LinkDefinitionNode, () => '');
		this.handlers.set(CommentNode, () => '');

		for (const [nodeClass, renderer] of config.getRenderers()) {
			this.addRenderer(nodeClass, renderer);
		}
	}


	/**
	 * Render document AST to final HTML string. Per-document facts are read
	 * from the document itself: the {{texy: nofollow}} directive and the
	 * typographed mark left by the transform phase.
	 * @param {DocumentNode} document
	 * @returns {string}
	 */
	render(document)
	{
		this.prepareDocument(document);
		return this.finalize(this.renderNode(document));
	}


	/**
	 * Renders the document AST onto a linkedom Document (the content lands
	 * in the document's <body>) for DOM-side transformation; extension of
	 * the reference API for the linkedom-based transform phase.
	 * @param {DocumentNode} document
	 * @returns the linkedom Document
	 */
	renderToDom(document)
	{
		this.prepareDocument(document);
		return renderToDom(this.renderNode(document));
	}


	/**
	 * Derives per-document facts from the document itself.
	 * @param {DocumentNode} document
	 */
	prepareDocument(document)
	{
		this.noFollow = this.config.linkNoFollow || Boolean(document.meta.nofollow);
		this.titleTypography = !document.meta.typographed;
	}


	/**
	 * Render children as array (for Element.children).
	 * @param {Array<*>} content
	 * @returns {Array<Element|Raw|string>}
	 */
	renderNodes(content)
	{
		return content.map(child => this.renderNode(child));
	}


	/**
	 * Render content with only HTML tag/comment patterns (passthrough).
	 * @param {string} content
	 * @returns {Element}
	 */
	renderHtmlPassthrough(content)
	{
		const context = this.createParseContext();
		const htmlParser = context.getInlineParser().withPatterns([Syntax.HtmlTag, Syntax.HtmlComment, Syntax.HtmlEntity]);
		return this.wrapChildren(this.renderNodes(htmlParser.parse(context, content).children));
	}


	/**
	 * @returns {import('../../Parsing/ParseContext.js').ParseContext}
	 */
	createParseContext()
	{
		if (this.parseContextFactory === null) {
			throw new Error('Rendering block/html and block/texysource requires a parse context; create the renderer via texy.createHtmlRenderer().');
		}
		return this.parseContextFactory();
	}


	/**
	 * Checks whether rendered children produce no visible output (only empty
	 * strings/whitespace).
	 * @param {Array<Element|Raw|string>} children
	 * @returns {boolean}
	 */
	renderedToNothing(children)
	{
		return children.every(child => typeof child === 'string' && phpTrim(child) === '');
	}


	/**
	 * Applies typography to an isolated string (title, alt) unless the AST was
	 * already typographed in the transform phase or typography is disabled.
	 * @internal
	 * @param {string} s
	 * @returns {string}
	 */
	postLineText(s)
	{
		return this.titleTypography && this.postLine !== null
			? this.postLine(s)
			: s;
	}


	/**
	 * Turns the rendered document into the final HTML string: walks the
	 * Element tree straight into the well-forming engine.
	 * @param {Element|Raw|string} root
	 * @returns {string}
	 */
	finalize(root)
	{
		const wellFormer = new WellFormer(this.config);
		wellFormer.feed(root);
		return phpLtrim(wellFormer.finish(), "\n");
	}


	/**
	 * Well-forms a standalone fragment (texysource); no post-line handlers.
	 * @param {Array<Element|Raw|string>} content
	 * @returns {string}
	 */
	finalizeFragment(content)
	{
		const wellFormer = new WellFormer(this.config);
		let first = true;
		for (const child of content) {
			if (!first) {
				wellFormer.text("\n");
			}
			first = false;
			wellFormer.feed(child);
		}

		return phpTrim(wellFormer.finish());
	}


	/********************* core node renderers ****************/


	/**
	 * @param {DocumentNode} node
	 * @returns {Element}
	 */
	renderDocument(node)
	{
		return this.wrapChildren(this.renderNodes(node.content.children));
	}


	/********************* block node renderers ****************/


	/**
	 * @param {ParagraphNode} node
	 * @returns {Element}
	 */
	renderParagraph(node)
	{
		const children = this.renderNodes(node.content.children);

		// Block HTML content - skip <p> wrapper entirely. The parse-time flag
		// is stale when the sanitize pass turned the block tags into text, so
		// its own predicate is re-checked over the transformed content:
		// paragraphs degraded to visible text get a normal <p> again.
		if (node.blockHtml && this.containsBlockPassthrough(node.content.children)) {
			return this.wrapChildren(children);
		}

		// Whole content rendered to nothing (consumed directives, comments)
		// -> no paragraph at all
		if (node.modifier === null && this.renderedToNothing(children)) {
			return this.wrapChildren([]);
		}

		const info = this.analyzeContent(node.content.children);

		// Only markup (HTML tags/comments) without text -> no <p> wrapper
		if (!info.hasText && !info.hasOther && info.hasMarkup && node.modifier === null) {
			return this.wrapChildren(children);
		}

		// Only replaced content (images) -> use nontextParagraph
		if (!info.hasText && !info.hasOther && info.hasReplaced) {
			return this.createNontextParagraph(children, node.modifier);
		}

		// Normal paragraph
		const el = new Element('p');
		this.decorateElement(node.modifier, el);
		el.children = children;
		return el;
	}


	/**
	 * @param {HeadingNode} node
	 * @returns {Element}
	 */
	renderHeading(node)
	{
		const el = new Element('h' + node.level);
		this.decorateElement(node.modifier, el);
		if (node.id !== null && (node.modifier === null || node.modifier.id === null)) {
			el.attrs.id = node.id; // generated, so not subject to the modifier policy
		}

		el.children = this.renderNodes(node.content.children);
		return el;
	}


	/**
	 * @param {BlockQuoteNode} node
	 * @returns {Element}
	 */
	renderBlockQuote(node)
	{
		const el = new Element('blockquote');
		this.decorateElement(node.modifier, el);
		el.children = this.renderNodes(node.content.children);
		return el;
	}


	/**
	 * @param {CodeBlockNode} node
	 * @returns {Element|Raw|string}
	 */
	renderCodeBlock(node)
	{
		// block/texysource - parse as texy, then display resulting HTML as
		// source code
		if (node.type === 'texysource') {
			const context = this.createParseContext();
			const parsed = context.parseBlock(node.code);
			const html = this.finalizeFragment(this.renderNodes(parsed.children));
			// Now escape the final HTML to show as source code
			const escaped = escapeHtml(html);

			const el = new Element('pre');
			this.decorateElement(node.modifier, el);
			settypeArray(el.attrs, 'class');
			el.attrs.class = ['html', ...el.attrs.class];
			el.create('code').add(new Raw(escaped));
			return el;
		}

		// block/html - parse HTML tags/comments, escape unknown ones
		if (node.type === 'html') {
			const content = node.code;
			if (content === '') {
				return "\n";
			}

			return this.renderHtmlPassthrough(content).add(' ');
		}

		// block/text - plain text with <br> for newlines (no wrapper)
		if (node.type === 'text') {
			return new Raw(escapeHtml(node.code).replaceAll("\n", '<br>') + ' ');
		}

		// Types that use <pre> wrapper
		const el = new Element('pre');
		this.decorateElement(node.modifier, el);

		// Language class prepended before modifier classes
		if (node.language) {
			settypeArray(el.attrs, 'class');
			el.attrs.class = [node.language, ...el.attrs.class];
		}

		// PRE block - parse HTML tags, unescape entities
		if (node.type === 'pre') {
			el.children = [this.renderHtmlPassthrough(node.code)];
			return el;
		}

		const content = new Raw(escapeHtml(node.code));

		if (node.type === 'code') {
			el.create('code').add(content);
		} else {
			el.children = [content];
		}

		return el;
	}


	/**
	 * @param {SectionNode} node
	 * @returns {Element}
	 */
	renderSection(node)
	{
		const el = new Element(node.type === 'div' ? 'div' : 'section');
		this.decorateElement(node.modifier, el);
		el.children = this.renderNodes(node.content.children);
		return el;
	}


	/**
	 * @param {HorizontalRuleNode} node
	 * @returns {Element}
	 */
	renderHorizontalRule(node)
	{
		const el = new Element('hr');
		this.decorateElement(node.modifier, el);

		// Add default class if not already set via modifier
		const cls = this.config.horizontalRuleClasses[node.type] ?? null;
		if (cls && !node.modifier?.classes?.[cls]) {
			settypeArray(el.attrs, 'class');
			el.attrs.class.push(cls);
		}

		return el;
	}


	/**
	 * @param {FigureNode} node
	 * @returns {Element}
	 */
	renderFigure(node)
	{
		const el = new Element(this.config.figureTagName);

		// Get the actual ImageNode (might be wrapped in LinkNode)
		let image = node.image;
		const inner = image instanceof LinkNode ? (image.content.children[0] ?? null) : image;

		// Extract alignment from ImageNode - we'll apply it to the figure
		// wrapper instead; clear it on a copy so the generator won't add it
		// to <img> (the node must stay untouched)
		let hAlign = null;
		if (inner instanceof ImageNode && inner.modifier !== null && inner.modifier.hAlign !== null) {
			hAlign = inner.modifier.hAlign;
			const cleared = cloneNode(inner);
			cleared.modifier = inner.modifier.clone();
			cleared.modifier.hAlign = null;
			if (image instanceof LinkNode) {
				image = cloneNode(image);
				image.content = cloneNode(image.content);
				image.content.children = [...image.content.children];
				image.content.children[0] = cleared;
			} else {
				image = cleared;
			}
		}

		// Build image via generator - this allows custom ImageNode handlers
		el.children = this.renderNodes([image]);

		// Caption
		if (node.caption !== null) {
			el.create(this.config.figureTagName === 'figure' ? 'figcaption' : 'p')
				.children = this.renderNodes(node.caption.children);
		}

		// Modifier classes/styles
		this.decorateElement(node.modifier, el);

		// Figure class based on alignment (extracted from ImageNode above)
		let cls = this.config.figureClass;
		if (hAlign) {
			const hAlignClass = hAlign === 'left'
				? this.config.figureLeftClass
				: hAlign === 'right' ? this.config.figureRightClass : null;
			if (hAlignClass) {
				cls = hAlignClass;
			} else if (!(this.config.alignClasses[hAlign] ?? null)) {
				settypeArray(el.attrs, 'style');
				el.attrs.style.float = hAlign;
			} else {
				cls = (cls ?? '') + '-' + this.config.alignClasses[hAlign];
			}
		}

		if (cls) {
			settypeArray(el.attrs, 'class');
			el.attrs.class.push(cls);
		}

		return el;
	}


	/********************* list node renderers ****************/


	/**
	 * @param {ListNode} node
	 * @returns {Element}
	 */
	renderList(node)
	{
		const el = new Element(ListType.isOrdered(node.type) ? 'ol' : 'ul');
		this.decorateElement(node.modifier, el);

		if (node.start !== null && node.start > 1) {
			el.attrs.start = node.start;
		}

		const style = ListType.getStyleType(node.type);
		if (style) {
			// modifier may already have set styles, so merge instead of
			// overwriting
			const current = el.attrs.style ?? null;
			const styles = (current !== null && typeof current === 'object') ? current : {};
			styles['list-style-type'] = style;
			el.attrs.style = styles;
		}

		for (const item of node.items) {
			el.add(this.renderListItem(item));
		}

		return el;
	}


	/**
	 * @param {ListItemNode} node
	 * @returns {Element}
	 */
	renderListItem(node)
	{
		// Regular list item (li)
		const el = new Element('li');
		this.decorateElement(node.modifier, el);

		// The item is a block container itself, so a wrapper on the block
		// that opens it adds nothing: <li>text<ul></ul></li> needs no <p>
		// around the text. A second paragraph does get one, because there
		// the wrapper is what separates them.
		const content = node.content.children;
		const first = content[0] ?? null;
		const rest = content.slice(1);

		let opening = null;
		if (first instanceof ParagraphNode && first.modifier === null) {
			opening = this.renderNodes(first.content.children);
		} else if (rest.length === 0 && first instanceof FigureNode && first.caption === null && first.modifier === null) {
			opening = this.renderNodes([first.image]);
		}

		el.children = opening === null
			? this.renderNodes(content)
			: [...opening, ...this.renderNodes(rest)];

		return el;
	}


	/**
	 * @param {DefinitionListNode} node
	 * @returns {Element}
	 */
	renderDefinitionList(node)
	{
		const el = new Element('dl');
		this.decorateElement(node.modifier, el);

		for (const item of node.items) {
			el.add(this.renderDefinitionItem(item));
		}

		return el;
	}


	/**
	 * @param {ListItemNode} node
	 * @returns {Element}
	 */
	renderDefinitionItem(node)
	{
		// Definition list item (dt for term=true, dd for term=false)
		const el = new Element(node.term ? 'dt' : 'dd');
		this.decorateElement(node.modifier, el);

		// If content is a single simple ParagraphNode (no modifier), unwrap it
		const content = node.content.children;
		if (
			!node.term
			&& content.length === 1
			&& content[0] instanceof ParagraphNode
			&& content[0].modifier === null
		) {
			el.children = this.renderNodes(content[0].content.children);
		} else {
			el.children = this.renderNodes(content);
		}

		return el;
	}


	/********************* table node renderers ****************/


	/**
	 * @param {TableNode} node
	 * @returns {Element}
	 */
	renderTable(node)
	{
		const el = new Element('table');
		this.decorateElement(node.modifier, el);

		if (node.caption !== null) {
			el.create('caption').children = this.renderNodes(node.caption.children);
		}

		let elPart = null;
		for (const row of node.rows) {
			if (elPart === null) {
				elPart = new Element(row.header ? 'thead' : 'tbody');
				el.add(elPart);
			} else if (!row.header && elPart.name === 'thead') {
				// switch from thead to tbody
				elPart = new Element('tbody');
				el.add(elPart);
			}
			elPart.add(this.renderTableRow(row));
		}

		// if only thead without tbody, rename to tbody (tbody is required,
		// thead is optional)
		if (elPart !== null && elPart.name === 'thead') {
			elPart.name = 'tbody';
		}

		return el;
	}


	/**
	 * @param {TableRowNode} node
	 * @returns {Element}
	 */
	renderTableRow(node)
	{
		const el = new Element('tr');
		this.decorateElement(node.modifier, el);
		for (const cell of node.cells) {
			el.add(this.renderTableCell(cell));
		}

		return el;
	}


	/**
	 * @param {TableCellNode} node
	 * @returns {Element}
	 */
	renderTableCell(node)
	{
		const el = new Element(node.header ? 'th' : 'td');
		this.decorateElement(node.modifier, el);

		if (node.colspan > 1) {
			el.attrs.colspan = node.colspan;
		}
		if (node.rowspan > 1) {
			el.attrs.rowspan = node.rowspan;
		}

		el.children = this.renderNodes(node.content.children);
		return el;
	}


	/********************* inline node renderers ****************/


	/**
	 * @param {ImageNode} node
	 * @returns {Element}
	 */
	renderImage(node)
	{
		// Detect dimensions from the file system (imageFileRoot)
		const [width, height] = this.imageDimensions.detect(node);

		const el = new Element('img');
		let mod = node.modifier;

		// Extract title/hAlign and clear them on a copy before decorate (the
		// node must stay untouched)
		const alt = mod !== null ? mod.title : null;
		const hAlign = mod !== null ? mod.hAlign : null;
		if (mod !== null) {
			mod = mod.clone();
			mod.title = null;
			mod.hAlign = null;
		}

		// Custom attrs from modifier (like {alt:...; title:...})
		const hasCustomAlt = mod !== null && Object.hasOwn(mod.attrs, 'alt');
		if (hasCustomAlt) {
			el.attrs.alt = mod.attrs.alt;
		}
		if (mod !== null && Object.hasOwn(mod.attrs, 'title')) {
			el.attrs.title = mod.attrs.title;
		}

		// Reserve src position (decorate() may overwrite the attrs array)
		el.attrs.src = null;

		// class/style from modifier
		this.decorateElement(mod, el);

		// src
		el.attrs.src = node.url !== null ? prependRoot(node.url, this.config.imageRoot) : null;

		// alt: from title or empty (if not set by custom attrs)
		if (!hasCustomAlt && !Object.hasOwn(el.attrs, 'alt')) {
			el.attrs.alt = alt !== null ? this.postLineText(alt) : '';
		}

		// hAlign -> float class or style
		if (hAlign) {
			this.decorator.applyFloat(el, hAlign, this.config.imageLeftClass, this.config.imageRightClass);
		}

		// dimensions
		el.attrs.width = width;
		el.attrs.height = height;

		return el;
	}


	/**
	 * @param {LinkNode} node
	 * @returns {Element}
	 */
	renderLink(node)
	{
		// Check URL scheme (security - filter dangerous schemes like
		// javascript:)
		const rawUrl = node.url ?? '';
		if (!this.urlPolicy.isLinkAllowed(rawUrl)) {
			// URL fails scheme filter, return just the content without link
			return this.wrapChildren(this.renderNodes(node.content.children));
		}

		const el = new Element('a');

		// Handle nofollow class (work on a copy, the node must stay
		// untouched)
		let mod = node.modifier;
		let nofollow = false;
		if (mod !== null && mod.classes['nofollow']) {
			nofollow = true;
			mod = mod.clone();
			delete mod.classes['nofollow'];
		}

		// Apply modifier (title, class, id, style, etc.) before href
		el.attrs.href = null; // trick - reserve position at front
		this.decorateElement(mod, el);

		const normalized = normalizeWww(rawUrl);

		// Prepend root to relative URLs; use imageRoot for image links,
		// linkRoot otherwise
		const root = node.isImageLink ? this.config.imageRoot : this.config.linkRoot;
		el.attrs.href = prependRoot(normalized, root);

		// rel="nofollow"
		if (nofollow || (this.noFollow && el.attrs.href.includes('//'))) {
			el.attrs.rel = 'nofollow';
		}

		// Add content
		el.children = this.renderNodes(node.content.children);

		return el;
	}


	/**
	 * @param {PhraseNode} node
	 * @returns {Element}
	 */
	renderPhrase(node)
	{
		const tag = this.config.phraseTags[node.type] ?? 'span';

		if (node.type === Syntax.StrongEmphasis) {
			const el = new Element(this.config.phraseTags[Syntax.Strong] ?? 'strong');
			this.decorateElement(node.modifier, el);
			const inner = el.create(this.config.phraseTags[Syntax.Emphasis] ?? 'em');
			inner.children = this.renderNodes(node.content.children);
			return el;
		}

		// Code phrases - escape and protect content from typography
		if (node.type === Syntax.Code) {
			const el = new Element(tag);
			this.decorateElement(node.modifier, el);
			// Only escape <, >, & - not quotes
			el.children = [new Raw(escapeHtml(extractText(node.content)))];
			return el;
		}

		// Normal phrases
		const el = new Element(tag);
		this.decorateElement(node.modifier, el);
		el.children = this.renderNodes(node.content.children);
		return el;
	}


	/**
	 * @param {EmoticonNode} node
	 * @returns {Element|string}
	 */
	renderEmoticon(node)
	{
		const emoji = node.resolved ?? node.emoticon; // resolved is filled by the transform pass

		return this.config.emoticonClass
			? (new Element('span', { class: this.config.emoticonClass })).setText(emoji)
			: emoji;
	}


	/********************* autolink node renderers ****************/


	/**
	 * @param {UrlNode} node
	 * @returns {Element}
	 */
	renderUrl(node)
	{
		const url = normalizeWww(node.url);

		const el = new Element('a', { href: url });
		if (this.noFollow && url.includes('//')) {
			el.attrs.rel = 'nofollow';
		}

		// Protect URL text from typography/longwords processing
		const textualUrl = this.config.shortenUrls ? shortenUrl(node.url) : node.url;
		return el.add(new Raw(textualUrl));
	}


	/**
	 * @param {EmailNode} node
	 * @returns {Element}
	 */
	renderEmail(node)
	{
		const el = new Element('a', { href: 'mailto:' + node.email });
		const text = this.config.obfuscateEmail
			? new Raw(node.email.replaceAll('@', '&#64;<!-- -->'))
			: node.email;
		return el.add(text);
	}


	/********************* HTML passthrough node renderers ****************/


	/**
	 * @param {HtmlTagNode} node
	 * @returns {Raw|string}
	 */
	renderHtmlTag(node)
	{
		const tagName = node.name.toLowerCase();
		let attrs = node.attributes;

		// Check if tag is allowed
		if (!this.htmlPolicy.isTagAllowed(tagName)) {
			return decodeEntities(this.htmlPolicy.reconstructTag(node)); // shown as text
		}

		// Validate tag - reject if validation fails
		const validation = this.htmlPolicy.validateTag(tagName, attrs, node.closing);
		if (validation === false || validation === 'drop') {
			// Invalid tag - shown as text in the output
			return decodeEntities(this.htmlPolicy.reconstructTag(node));
		}

		// defense in depth: HtmlSanitizePass has already done this, but a
		// hand-built AST or a policy tightened after parsing must not slip
		// attributes through
		attrs = this.htmlPolicy.filterAttrs(tagName, attrs);

		// Add rel="nofollow" for external links when linkNoFollow is enabled
		if (tagName === 'a' && !node.closing && typeof attrs.href === 'string') {
			if (this.noFollow && attrs.href.includes('//')) {
				const existingRel = typeof attrs.rel === 'string' ? attrs.rel : '';
				const relParts = existingRel !== '' ? existingRel.split(' ') : [];
				if (!relParts.includes('nofollow')) {
					relParts.push('nofollow');
				}
				attrs.rel = relParts.join(' ');
			}
		}

		if (node.closing) {
			return new Raw('</' + escapeHtmlQuotes(tagName) + '>');
		}

		return new Raw(
			'<' + escapeHtmlQuotes(tagName)
			+ Element.formatAttrs(attrs)
			+ '>',
		);
	}


	/**
	 * @param {HtmlCommentNode} node
	 * @returns {Raw|string}
	 */
	renderHtmlComment(node)
	{
		if (!this.config.passHtmlComments) {
			return '';
		}

		// Sanitize comment content (security: prevent nested comments)
		let content = node.text.replace(/-{2,}/g, ' - ');
		content = phpTrim(content, '-');
		return new Raw('<!--' + content + '-->');
	}


	/**
	 * Renders paired passthrough element as open tag + children + close
	 * tag, delegating to renderHtmlTag() so sanitization and escaping behave
	 * exactly like for unpaired tags.
	 * @param {HtmlElementNode} node
	 * @returns {Element}
	 */
	renderHtmlElement(node)
	{
		const open = new HtmlTagNode(node.name, node.attributes, false, false, node.range);
		const close = node.closingTag ?? new HtmlTagNode(node.name, {}, true);
		return this.wrapChildren([
			this.renderHtmlTag(open),
			...this.renderNodes(node.content.children),
			this.renderHtmlTag(close),
		]);
	}


	/********************* directive node renderers ****************/


	/**
	 * @param {DirectiveNode} node
	 * @returns {string}
	 */
	renderDirective(node)
	{
		const parsed = node.parseContent();

		// {{texy: ...}} directives are normally consumed by
		// DirectiveModule.processDirectives() in the transform phase; swallow
		// any that reach the renderer (hand-built AST)
		if (parsed.name === 'texy' && parsed.args.length > 0) {
			return '';
		}

		// Unknown directives - preserve original text (entities decoded like
		// any display text)
		return decodeEntities('{{' + node.text + '}}');
	}


	/********************* utility methods ****************/


	/**
	 * Does the content still contain block-level passthrough markup? The
	 * same predicate ParagraphModule uses when setting the blockHtml flag,
	 * re-evaluated after transforms (sanitization may have turned tags to
	 * text).
	 * @param {Array<*>} content
	 * @returns {boolean}
	 */
	containsBlockPassthrough(content)
	{
		for (const node of content) {
			if (node instanceof HtmlTagNode) {
				if (!node.closing && !inlineElements.has(node.name.toLowerCase())) {
					return true;
				}
			} else if (node instanceof HtmlElementNode) {
				// block element, or a transparent inline wrapper (<a>, <ins>,
				// ...) holding one
				if (
					!inlineElements.has(node.name.toLowerCase())
					|| this.containsBlockPassthrough(node.content.children)
				) {
					return true;
				}
			}
		}

		return false;
	}


	/**
	 * Analyze paragraph content to determine what types of nodes it contains.
	 * @param {Array<*>} content
	 * @returns {{hasText: boolean, hasReplaced: boolean, hasMarkup: boolean, hasOther: boolean}}
	 */
	analyzeContent(content)
	{
		let hasText = false;
		let hasReplaced = false;
		let hasMarkup = false;
		let hasOther = false;

		for (const node of content) {
			if (node instanceof TextNode) {
				hasText = hasText || phpTrim(node.text) !== '';

			} else if (node instanceof ImageNode) {
				hasReplaced = true;

			} else if (node instanceof HtmlCommentNode) {
				hasMarkup = true;

			} else if (node instanceof HtmlTagNode) {
				const inlineType = inlineElements.get(node.name.toLowerCase()) ?? null;
				if (inlineType === 1) {
					hasReplaced = true; // replaced element (img, br, input, ...)
				} else {
					hasMarkup = true; // inline markup or block element
				}

			} else if (node instanceof HtmlElementNode) {
				const inlineType = inlineElements.get(node.name.toLowerCase()) ?? null;
				if (inlineType === 1) {
					hasReplaced = true; // replaced element (script, object, ...)
				} else {
					hasMarkup = true;
				}
				// flat pre-pairing analysis saw all descendants at top level -
				// propagate everything
				const inner = this.analyzeContent(node.content.children);
				hasText = hasText || inner.hasText;
				hasReplaced = hasReplaced || inner.hasReplaced;
				hasMarkup = hasMarkup || inner.hasMarkup;
				hasOther = hasOther || inner.hasOther;

			} else if (node instanceof LinkNode) {
				const inner = this.analyzeContent(node.content.children);
				if (inner.hasText || inner.hasOther) {
					hasOther = true;
				} else if (inner.hasReplaced) {
					hasReplaced = true;
				}

			} else {
				hasOther = true;
			}
		}

		return { hasText, hasReplaced, hasMarkup, hasOther };
	}


	/**
	 * Wrap children in a null element (no tag wrapper).
	 * @param {Array<Element|Raw|string>} children
	 * @returns {Element}
	 */
	wrapChildren(children)
	{
		const el = new Element(null);
		el.children = children;
		return el;
	}


	/**
	 * @param {*} node
	 * @returns {Element}
	 */
	renderUnknown(node)
	{
		return this.wrapChildren(this.renderChildrenOf(node));
	}


	/**
	 * Create paragraph for non-text content (images only).
	 * @param {Array<Element|Raw|string>} children
	 * @param {?import('../../Modifier.js').Modifier} modifier
	 * @returns {Element}
	 */
	createNontextParagraph(children, modifier)
	{
		const el = this.config.nontextParagraph instanceof Element
			? this.config.nontextParagraph.clone()
			: new Element(this.config.nontextParagraph);
		this.decorateElement(modifier, el);
		el.children = children;
		return el;
	}


	/**
	 * Decorate element with modifier's classes, styles, and attributes.
	 * @param {?import('../../Modifier.js').Modifier} modifier
	 * @param {Element} el
	 */
	decorateElement(modifier, el)
	{
		this.decorator.decorate(modifier, el);
	}
}

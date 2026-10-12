/**
 * Generates a plain-text rendition from the AST (port of
 * Texy\Output\Text\Renderer): markup is dropped, visible text and block
 * structure (blank lines between blocks) are kept.
 */

import { NodeRenderer } from '../NodeRenderer.js';
import { replace } from '../../Regexp.js';
import { phpTrim } from '../../helpers.js';
import {
	AnnotationNode, BlockQuoteNode, CodeBlockNode, CommentNode, ContentNode, DefinitionListNode,
	DirectiveNode, DocumentNode, EmailNode, EmoticonNode, FigureNode, HeadingNode,
	HorizontalRuleNode, HtmlCommentNode, HtmlElementNode, HtmlTagNode, ImageDefinitionNode,
	ImageNode, LineBreakNode, LinkDefinitionNode, LinkNode, ListNode, ListItemNode, ParagraphNode,
	PhraseNode, RawTextNode, SectionNode, TableNode, TableCellNode, TableRowNode, TextNode, UrlNode,
} from '../../nodes.js';

export class Renderer extends NodeRenderer
{
	constructor()
	{
		super();

		this.handlers.set(DocumentNode, n => this.renderBlocks(n.content.children));
		this.handlers.set(TextNode, n => n.text);
		this.handlers.set(ContentNode, n => this.renderChildren(n));

		// Block nodes
		this.handlers.set(ParagraphNode, n => this.renderChildren(n.content));
		this.handlers.set(HeadingNode, n => this.renderChildren(n.content));
		this.handlers.set(BlockQuoteNode, n => this.renderBlocks(n.content.children));
		this.handlers.set(CodeBlockNode, n => phpTrim(n.code, "\n"));
		this.handlers.set(SectionNode, n => this.renderBlocks(n.content.children));
		this.handlers.set(HorizontalRuleNode, () => '');
		this.handlers.set(FigureNode, n => n.caption !== null ? this.renderChildren(n.caption) : '');

		// List nodes
		this.handlers.set(ListNode, n => this.renderLines(n.items));
		this.handlers.set(ListItemNode, n => this.renderBlocks(n.content.children, "\n"));
		this.handlers.set(DefinitionListNode, n => this.renderLines(n.items));

		// Table nodes
		this.handlers.set(TableNode, n => (n.caption === null ? '' : this.renderChildren(n.caption) + "\n") + this.renderLines(n.rows));
		this.handlers.set(TableRowNode, n => n.cells.map(cell => this.renderNode(cell)).join("\t"));
		this.handlers.set(TableCellNode, n => this.renderBlocks(n.content.children, "\n"));

		// Inline nodes
		this.handlers.set(ImageNode, n => n.modifier !== null ? (n.modifier.title ?? '') : '');
		this.handlers.set(LinkNode, n => this.renderChildren(n.content));
		this.handlers.set(PhraseNode, n => this.renderChildren(n.content));
		this.handlers.set(RawTextNode, n => n.text);
		this.handlers.set(AnnotationNode, n => n.text);
		this.handlers.set(EmoticonNode, n => n.resolved ?? n.emoticon);
		this.handlers.set(LineBreakNode, () => "\n");

		// Autolink nodes
		this.handlers.set(UrlNode, n => n.url);
		this.handlers.set(EmailNode, n => n.email);

		// HTML passthrough nodes - tags are dropped, content is kept
		this.handlers.set(HtmlTagNode, () => '');
		this.handlers.set(HtmlElementNode, n => this.renderChildren(n.content));
		this.handlers.set(HtmlCommentNode, () => '');

		// Directive nodes
		this.handlers.set(DirectiveNode, n => '{{' + n.text + '}}');

		// Definition nodes (no output)
		this.handlers.set(ImageDefinitionNode, () => '');
		this.handlers.set(LinkDefinitionNode, () => '');
		this.handlers.set(CommentNode, () => '');
	}


	/**
	 * Render document AST to plain text.
	 * @param {DocumentNode} document
	 * @returns {string}
	 */
	render(document)
	{
		let text = this.renderNode(document);

		text = text
			.replaceAll('\u00AD', '') // soft hyphens from the hyphenation pass
			.replaceAll('\u00A0', ' '); // non-breaking spaces from the typography pass

		// collapse excess blank lines left by empty blocks
		text = replace(text, '~\n{3,}~', "\n\n");
		return phpTrim(text, "\n") + "\n";
	}


	/**
	 * @param {ContentNode} content
	 * @returns {string}
	 */
	renderChildren(content)
	{
		let s = '';
		for (const child of content.children) {
			s += this.renderNode(child);
		}

		return s;
	}


	/**
	 * Blocks separated by blank lines (or the given separator), empty ones dropped.
	 * @param {Array<*>} blocks
	 * @param {string} separator
	 * @returns {string}
	 */
	renderBlocks(blocks, separator = "\n\n")
	{
		const parts = blocks
			.map(block => this.renderNode(block))
			.filter(s => phpTrim(s) !== '');
		return parts.join(separator);
	}


	/**
	 * Items one per line.
	 * @param {Array<*>} items
	 * @returns {string}
	 */
	renderLines(items)
	{
		return items.map(item => this.renderNode(item)).join("\n");
	}


	/**
	 * @param {*} node
	 * @returns {string}
	 */
	renderUnknown(node)
	{
		return this.renderChildrenOf(node).join('');
	}
}

/**
 * Processes image and figure (image with caption) syntax
 * (port of Texy\Modules\ImageModule).
 *
 * Reference resolution (resolveReferences) is a transform pass and is out
 * of scope for this port; parseImageNode/parseImageContent stay public for
 * consumers running their own passes.
 */

import { Module } from './Module.js';
import { Syntax } from '../Syntax.js';
import { Modifier as ModifierPattern, ModifierHAlign, LinkUrl } from '../Patterns.js';
import { Modifier } from '../Modifier.js';
import { ContentNode, FigureNode, ImageDefinitionNode, ImageNode, LinkNode } from '../nodes.js';
import { removeSoftHyphens, toLower } from '../helpers.js';
import { NodeTraverser } from '../NodeTraverser.js';
import { find } from '../NodeHelpers.js';
import { match } from '../Regexp.js';

/** The [* url .(title) alignment ] part, shared by the image and figure syntaxes. */
const ImagePattern = String.raw`
	\[\* [ \t]*+                      # opening bracket with asterisk
	([^\n]{1,1000})                   # URLs (1)
	` + ModifierPattern + String.raw`?       # modifier (2)
	[ \t]*+
	( \* | (?<! < ) > | < )           # alignment (3)
]`;

/** The optional :LINK (or :: self link) suffix. */
const LinkPattern = String.raw`
	(?:
		:(` + LinkUrl + String.raw` | : ) # link or just colon (4)
	)??`;


export class ImageModule extends Module
{
	constructor(texy)
	{
		super();
		this.texy = texy;
		texy.allowed[Syntax.ImageDefinition] = true;
		/** @type {Object<string, ImageDefinitionNode>} collected image definitions */
		this.definitions = {};
		/** @type {Object<string, ImageDefinitionNode>} user-defined definitions (persist across parse() calls) */
		this.userDefinitions = {};
	}


	beforeParse()
	{
		// [*image*]:LINK
		this.texy.addLineSyntax(
			Syntax.Image,
			'~' + ImagePattern + LinkPattern + '\n~Ux',
			(context, matches, offsets) => this.parseImage(context, matches, offsets),
		);

		// [*ref*]: url .(title)[class]{style}
		this.texy.addBlockSyntax(
			Syntax.ImageDefinition,
			String.raw`~^
				\[\*                              # opening [*
				( [^\n]{1,100} )                  # reference (1)
				\*]                               # closing *]
				: [ \t]+
				(.{1,1000})                       # URL (2)
				[ \t]*
				` + ModifierPattern + String.raw`?       # modifier (3)
				\s*
			$~mUx`,
			(context, matches, offsets) => this.parseDefinition(context, matches, offsets),
		);

		// [*image*]:link *** caption
		this.texy.addBlockSyntax(
			Syntax.Figure,
			String.raw`~^` + '\n'
				+ '\t\t\t\t(?>' + ImagePattern + ')' + LinkPattern + '\n'
				+ '\t\t\t\t(?:' + '\n'
				+ '\t\t\t\t\t[ \t]++ \\*\\*\\* [ \t]++        # separator' + '\n'
				+ '\t\t\t\t\t(.{0,2000})                   # caption (5)' + '\n'
				+ '\t\t\t\t)?' + '\n'
				+ '\t\t\t\t' + ModifierHAlign + '?     # modifier (6)' + '\n'
				+ '\t\t\t$~mUx',
			(context, matches, offsets) => this.parseFigure(context, matches, offsets),
		);
	}


	/**
	 * Parses [*ref*]: urls .(title)[class]{style}
	 */
	parseDefinition(context, matches, offsets)
	{
		const [, mRef, mURLs, mMod] = matches;
		const parsed = this.parseImageContent(mURLs);

		return new ImageDefinitionNode(
			mRef.trim(),
			parsed.url,
			parsed.width,
			parsed.height,
			Modifier.parse(mMod, offsets[3] ?? null),
			{ offset: offsets[0], length: matches[0].length },
		);
	}


	/**
	 * Parses [* small.jpg 80x13 .(alternative text)[class]{style}>]:LINK
	 */
	parseImage(context, matches, offsets)
	{
		const [, mURLs, mMod, mAlign, mLink] = matches;
		const parsed = this.parseImageContent(mURLs);
		const modifier = Modifier.parse((mMod ?? '') + (mAlign ?? ''));
		const range = { offset: offsets[0], length: matches[0].length };

		const imageNode = new ImageNode(parsed.url, parsed.width, parsed.height, modifier, range);

		return mLink
			? this.wrapInLink(imageNode, mLink, range)
			: imageNode;
	}


	/**
	 * Parses [*image*]:link *** caption .(title)[class]{style}>.
	 * Refused when the image URL is null.
	 */
	parseFigure(context, matches, offsets)
	{
		const [, mURLs, mImgMod, mAlign, mLink, mContent, mMod] = matches;

		const parsed = this.parseImageContent(mURLs);
		const modifier = Modifier.parse((mImgMod ?? '') + (mAlign ?? ''));

		if (parsed.url === null) return null;

		// ImageNode source span is "[* ... <alignment>]"
		const imageEnd = (offsets[3] ?? 0) + (mAlign ?? '').length + 1; // 1 = "]"
		const imageNode = new ImageNode(
			parsed.url,
			parsed.width,
			parsed.height,
			modifier,
			{ offset: offsets[0], length: imageEnd - offsets[0] },
		);

		const image = mLink
			? this.wrapInLink(imageNode, mLink, { offset: offsets[0], length: offsets[4] + mLink.length - offsets[0] })
			: imageNode;

		// Parse caption as inline content
		let caption = null;
		const trimmed = (mContent ?? '').trim();
		if (trimmed !== '') {
			caption = context.parseInline(trimmed, offsets[5] ?? offsets[0]);
		}

		return new FigureNode(
			image,
			caption,
			Modifier.parse(mMod, offsets[6] ?? null),
			{ offset: offsets[0], length: matches[0].length },
		);
	}


	/**
	 * Wraps an image node in a link node; bare ":" links to the image itself.
	 * @returns {LinkNode}
	 */
	wrapInLink(imageNode, mLink, range)
	{
		let linkUrl;
		let isImageLink;

		if (mLink === ':') {
			// link to the image itself
			linkUrl = imageNode.url;
			isImageLink = true;
		} else {
			// direct URL or reference like [ref] or [*img*]
			linkUrl = removeSoftHyphens(mLink);
			// image reference [*...*] -> uses imageRoot
			isImageLink = mLink.length > 4
				&& mLink[0] === '[' && mLink[1] === '*'
				&& mLink[mLink.length - 1] === ']' && mLink[mLink.length - 2] === '*';
		}

		return new LinkNode(
			linkUrl,
			new ContentNode([imageNode]),
			null,
			range,
			isImageLink,
		);
	}


	/**
	 * Parses image content: "image.jpg 100x200" or "image.jpg 100X200".
	 * @param {string} content
	 * @returns {{url: ?string, width: ?number, height: ?number}}
	 */
	parseImageContent(content)
	{
		const parts = content.split('|');
		const main = parts[0].trim();

		let url = removeSoftHyphens(main);
		let width = null;
		let height = null;

		// Parse dimensions: "image.jpg 100x200" or "image.jpg 100X200" (asMax)
		const m = match(main, String.raw`~^(.*)\ (\d+|\?)\ *[xX]\ *(\d+|\?)\ *$~U`);
		if (m) {
			url = m.matches[1].trim();
			width = m.matches[2] === '?' ? null : parseInt(m.matches[2], 10);
			height = m.matches[3] === '?' ? null : parseInt(m.matches[3], 10);
		}

		// Check URL
		if (!this.texy.urlPolicy.isImageAllowed(url)) {
			url = null;
		}

		return { url, width, height };
	}


	/**
	 * Adds a user-defined image definition (persists across parse() calls).
	 */
	addDefinition(name, url, width = null, height = null, alt = null)
	{
		const modifier = alt !== null ? Modifier.parse('(' + alt + ')') : null;
		this.userDefinitions[name.toLowerCase()] = new ImageDefinitionNode(name, url, width, height, modifier);
	}


	/**
	 * Gets an image definition by name (for reference resolution passes).
	 */
	getDefinition(name)
	{
		return this.definitions[name.toLowerCase()] ?? null;
	}


	/**
	 * Resolve image references in the document (transform phase):
	 * document definitions override user definitions; node-explicit values
	 * win; a ::-self-link that matches the image reference resolves too.
	 * @param {import('../nodes.js').DocumentNode} doc
	 */
	resolveReferences(doc)
	{
		// Start with user-defined definitions
		this.definitions = { ...this.userDefinitions };

		// Pass 1: Collect document definitions (overwrites user-defined)
		for (const node of find(doc, n => n instanceof ImageDefinitionNode)) {
			this.definitions[toLower(node.reference)] = node;
		}

		// Pass 2: Resolve ImageNode references
		new NodeTraverser().traverse(doc, node => {
			if (node instanceof ImageNode) {
				this.resolveImageNode(node);
			} else if (
				node instanceof LinkNode
				&& node.content.children[0] instanceof ImageNode
			) {
				// LinkNode wrapping ImageNode - resolve image and possibly the link URL
				const imageNode = node.content.children[0];
				const imageKey = imageNode.url !== null ? toLower(imageNode.url.trim()) : null;
				const linkKey = node.url !== null ? toLower(node.url.trim()) : null;

				// Resolve the image
				this.resolveImageNode(imageNode);

				// If link URL matches the original image reference (from :: syntax), resolve it too
				if (imageKey !== null && linkKey === imageKey && Object.hasOwn(this.definitions, imageKey)) {
					node.url = this.definitions[imageKey].url;
				}
			}
			return null;
		});
	}


	/**
	 * @param {ImageNode} node
	 */
	resolveImageNode(node)
	{
		if (node.url === null) {
			return;
		}

		const key = toLower(node.url.trim());
		if (!Object.hasOwn(this.definitions, key)) {
			return;
		}

		const def = this.definitions[key];

		node.ref = node.url.trim(); // keep the written reference name for analyzers
		node.url = def.url;
		if (node.width === null) node.width = def.width;
		if (node.height === null) node.height = def.height;

		// Merge modifier from definition if node doesn't have one
		if (def.modifier && !node.modifier) {
			node.modifier = def.modifier.clone();
		} else if (def.modifier) {
			// Merge: node modifier takes precedence, but inherit missing values from definition
			if (node.modifier.title === null && def.modifier.title !== null) {
				node.modifier.title = def.modifier.title;
			}
		}
	}

}

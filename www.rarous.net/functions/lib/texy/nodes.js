/**
 * AST node classes (port of Texy\Nodes\*).
 *
 * Two abstract families mirror the reference: BlockNode (block-level
 * constructs) and InlineNode (inline constructs). Child lists are held in
 * ContentNode containers. Traversal order of getChildren() matches the
 * reference AstDumper output exactly (caption before rows in tables, image
 * before caption in figures, etc.).
 */

import { Node } from './Range.js';

/** @typedef {Object<string, string>} Meta */ // document-level options from {{texy: ...}}


/** @enum {string} */
export const HeadingType = Object.freeze({ Underlined: 'Underlined', Surrounded: 'Surrounded' });

/** List type: element name (ul/ol) or list-style-type value. */
export const ListType = Object.freeze({
	Unordered: 'ul',
	Decimal: 'ol',
	UpperRoman: 'upper-roman',
	LowerRoman: 'lower-roman',
	UpperAlpha: 'upper-alpha',
	LowerAlpha: 'lower-alpha',

	isOrdered(type) { return type !== ListType.Unordered; },

	getStyleType(type) { return type === ListType.Unordered || type === ListType.Decimal ? null : type; },
});


/** Abstract base of block-level nodes. */
export class BlockNode extends Node {}
export class InlineNode extends Node {}


/** Container for node content (inline or block children). */
export class ContentNode extends Node
{
	/**
	 * @param {Array<Node>} children
	 */
	constructor(children = [])
	{
		super();
		this.children = children;
	}


	/** @returns {Array<Node>} */
	getChildren()
	{
		return this.children;
	}
}


/** Root document node. */
export class DocumentNode extends BlockNode
{
	/**
	 * @param {ContentNode} content
	 * @param {?Range} range
	 */
	constructor(content = new ContentNode(), range = null)
	{
		super();
		/** @type {Object<string, boolean>} document-level options collected from {{texy: ...}} directives */
		this.meta = {};
		this.content = content;
		this.range = range;
	}


	getChildren()
	{
		return [this.content];
	}
}


export class ParagraphNode extends BlockNode
{
	/**
	 * @param {ContentNode} content
	 * @param {?import('./Modifier.js').Modifier} modifier
	 * @param {?Range} range
	 */
	constructor(content = new ContentNode(), modifier = null, range = null)
	{
		super();
		this.content = content;
		this.modifier = modifier;
		this.range = range;
		/** true when the content is a block-level HTML passthrough (no <p> wrapper) */
		this.blockHtml = false;
	}


	getChildren()
	{
		return [this.content];
	}


	getModifier()
	{
		return this.modifier;
	}
}


export class HeadingNode extends BlockNode
{
	/**
	 * @param {ContentNode} content
	 * @param {number} level preliminary level; balancing is a transform pass
	 * @param {string} type one of HeadingType
	 * @param {?import('./Modifier.js').Modifier} modifier
	 * @param {?Range} range
	 */
	constructor(content, level, type, modifier = null, range = null)
	{
		super();
		this.content = content;
		this.level = level;
		this.type = type;
		this.modifier = modifier;
		/** filled by the HeadingPass (transform phase) */
		this.id = null;
		this.titleOverride = null;
		this.range = range;
	}


	getChildren()
	{
		return [this.content];
	}


	getModifier()
	{
		return this.modifier;
	}
}


export class BlockQuoteNode extends BlockNode
{
	/**
	 * @param {ContentNode} content
	 * @param {?import('./Modifier.js').Modifier} modifier
	 * @param {?Range} range
	 */
	constructor(content = new ContentNode(), modifier = null, range = null)
	{
		super();
		this.content = content;
		this.modifier = modifier;
		this.range = range;
	}


	getChildren()
	{
		return [this.content];
	}


	getModifier()
	{
		return this.modifier;
	}
}


export class CodeBlockNode extends BlockNode
{
	/**
	 * @param {string} type 'default'|'pre'|'code'|'html'|'text'|'texysource'
	 * @param {string} code
	 * @param {?string} language
	 * @param {?import('./Modifier.js').Modifier} modifier
	 * @param {?Range} range
	 */
	constructor(type, code, language = null, modifier = null, range = null)
	{
		super();
		this.type = type;
		this.code = code;
		this.language = language;
		this.modifier = modifier;
		this.range = range;
	}


	getChildren()
	{
		return [];
	}


	getModifier()
	{
		return this.modifier;
	}
}


export class SectionNode extends BlockNode
{
	/**
	 * @param {ContentNode} content
	 * @param {?string} type
	 * @param {?import('./Modifier.js').Modifier} modifier
	 * @param {?Range} range
	 */
	constructor(content = new ContentNode(), type = null, modifier = null, range = null)
	{
		super();
		this.content = content;
		this.type = type;
		this.modifier = modifier;
		this.range = range;
	}


	getChildren()
	{
		return [this.content];
	}


	getModifier()
	{
		return this.modifier;
	}
}


/** Hidden comment; renders to nothing. */
export class CommentNode extends BlockNode
{
	/**
	 * @param {string} text
	 * @param {?Range} range
	 */
	constructor(text, range = null)
	{
		super();
		this.text = text;
		this.range = range;
	}


	getChildren()
	{
		return [];
	}
}


export class HorizontalRuleNode extends BlockNode
{
	/**
	 * @param {string} type first character of the marker, '-' or '*'
	 * @param {?import('./Modifier.js').Modifier} modifier
	 * @param {?Range} range
	 */
	constructor(type, modifier = null, range = null)
	{
		super();
		this.type = type;
		this.modifier = modifier;
		this.range = range;
	}


	getChildren()
	{
		return [];
	}


	getModifier()
	{
		return this.modifier;
	}
}


export class FigureNode extends BlockNode
{
	/**
	 * @param {ImageNode|LinkNode} image the image, or a LinkNode wrapping it
	 * @param {?ContentNode} caption
	 * @param {?import('./Modifier.js').Modifier} modifier
	 * @param {?Range} range
	 */
	constructor(image, caption = null, modifier = null, range = null)
	{
		super();
		this.image = image;
		this.caption = caption;
		this.modifier = modifier;
		this.range = range;
	}


	getChildren()
	{
		return this.caption !== null ? [this.image, this.caption] : [this.image];
	}


	getModifier()
	{
		return this.modifier;
	}
}


export class ListItemNode extends BlockNode
{
	/**
	 * @param {ContentNode} content
	 * @param {boolean} term definition-list term (dt) vs description (dd)
	 * @param {?import('./Modifier.js').Modifier} modifier
	 * @param {?Range} range
	 */
	constructor(content = new ContentNode(), term = false, modifier = null, range = null)
	{
		super();
		this.content = content;
		this.term = term;
		this.modifier = modifier;
		this.range = range;
	}


	getChildren()
	{
		return [this.content];
	}


	getModifier()
	{
		return this.modifier;
	}
}


export class ListNode extends BlockNode
{
	/**
	 * @param {ListItemNode[]} items
	 * @param {string} type one of ListType
	 * @param {?number} start
	 * @param {?import('./Modifier.js').Modifier} modifier
	 * @param {?Range} range
	 */
	constructor(items = [], type = ListType.Unordered, start = null, modifier = null, range = null)
	{
		super();
		this.items = items;
		this.type = type;
		this.start = start;
		this.modifier = modifier;
		this.range = range;
	}


	getChildren()
	{
		return this.items;
	}


	getModifier()
	{
		return this.modifier;
	}
}


export class DefinitionListNode extends BlockNode
{
	/**
	 * @param {ListItemNode[]} items alternating terms and descriptions
	 * @param {?import('./Modifier.js').Modifier} modifier
	 * @param {?Range} range
	 */
	constructor(items = [], modifier = null, range = null)
	{
		super();
		this.items = items;
		this.modifier = modifier;
		this.range = range;
	}


	getChildren()
	{
		return this.items;
	}


	getModifier()
	{
		return this.modifier;
	}
}


export class TableNode extends BlockNode
{
	/**
	 * @param {TableRowNode[]} rows
	 * @param {?import('./Modifier.js').Modifier} modifier
	 * @param {?Range} range
	 * @param {?ContentNode} caption written as |## Text above the first row
	 */
	constructor(rows = [], modifier = null, range = null, caption = null)
	{
		super();
		this.rows = rows;
		this.modifier = modifier;
		this.range = range;
		this.caption = caption;
	}


	getChildren()
	{
		return this.caption !== null ? [this.caption, ...this.rows] : this.rows;
	}


	getModifier()
	{
		return this.modifier;
	}
}


export class TableRowNode extends BlockNode
{
	/**
	 * @param {TableCellNode[]} cells
	 * @param {boolean} header
	 * @param {?import('./Modifier.js').Modifier} modifier
	 * @param {?Range} range
	 */
	constructor(cells = [], header = false, modifier = null, range = null)
	{
		super();
		this.cells = cells;
		this.header = header;
		this.modifier = modifier;
		this.range = range;
	}


	getChildren()
	{
		return this.cells;
	}


	getModifier()
	{
		return this.modifier;
	}
}


export class TableCellNode extends BlockNode
{
	/**
	 * @param {ContentNode} content
	 * @param {number} colspan
	 * @param {number} rowspan
	 * @param {boolean} header
	 * @param {?import('./Modifier.js').Modifier} modifier
	 * @param {?Range} range
	 */
	constructor(content = new ContentNode(), colspan = 1, rowspan = 1, header = false, modifier = null, range = null)
	{
		super();
		this.content = content;
		this.colspan = colspan;
		this.rowspan = rowspan;
		this.header = header;
		this.modifier = modifier;
		this.range = range;
	}


	getChildren()
	{
		return [this.content];
	}


	getModifier()
	{
		return this.modifier;
	}
}


/** Inline text with display semantics; renderers escape on output. */
export class TextNode extends InlineNode
{
	/**
	 * @param {string} text
	 * @param {?Range} range
	 */
	constructor(text, range = null)
	{
		super();
		this.text = text;
		this.range = range;
	}


	getChildren()
	{
		return [];
	}
}


/** Literal source text (code-like content, ''notexy''); escaped on output. */
export class RawTextNode extends InlineNode
{
	/**
	 * @param {string} text
	 * @param {?Range} range
	 */
	constructor(text, range = null)
	{
		super();
		this.text = text;
		this.range = range;
	}


	getChildren()
	{
		return [];
	}
}


/** Hard line break; renders <br>. */
export class LineBreakNode extends InlineNode
{
	/**
	 * @param {?Range} range
	 */
	constructor(range = null)
	{
		super();
		this.range = range;
	}


	getChildren()
	{
		return [];
	}
}


export class PhraseNode extends InlineNode
{
	/**
	 * @param {ContentNode} content
	 * @param {string} type the syntax id (phrase/*)
	 * @param {?import('./Modifier.js').Modifier} modifier
	 * @param {?Range} range
	 */
	constructor(content, type, modifier = null, range = null)
	{
		super();
		this.content = content;
		this.type = type;
		this.modifier = modifier;
		this.range = range;
	}


	getChildren()
	{
		return [this.content];
	}


	getModifier()
	{
		return this.modifier;
	}
}


export class AnnotationNode extends InlineNode
{
	/**
	 * @param {string} text
	 * @param {string} annotation title text
	 * @param {?Range} range
	 */
	constructor(text, annotation, range = null)
	{
		super();
		this.text = text;
		this.annotation = annotation;
		this.range = range;
	}


	getChildren()
	{
		return [];
	}
}


export class LinkNode extends InlineNode
{
	/**
	 * @param {?string} url
	 * @param {ContentNode} content
	 * @param {?import('./Modifier.js').Modifier} modifier
	 * @param {?Range} range
	 * @param {boolean} isImageLink link targets an image URL
	 * @param {?string} ref original reference name for links written as [ref]
	 */
	constructor(url = null, content = new ContentNode(), modifier = null, range = null, isImageLink = false, ref = null)
	{
		super();
		this.url = url;
		this.content = content;
		this.modifier = modifier;
		this.range = range;
		this.isImageLink = isImageLink;
		this.ref = ref;
	}


	getChildren()
	{
		return [this.content];
	}


	getModifier()
	{
		return this.modifier;
	}
}


export class ImageNode extends InlineNode
{
	/**
	 * @param {?string} url
	 * @param {?number} width
	 * @param {?number} height
	 * @param {?import('./Modifier.js').Modifier} modifier
	 * @param {?Range} range
	 * @param {?string} ref original reference name for images written as [*ref*]
	 */
	constructor(url = null, width = null, height = null, modifier = null, range = null, ref = null)
	{
		super();
		this.url = url;
		this.width = width;
		this.height = height;
		this.modifier = modifier;
		this.range = range;
		this.ref = ref;
	}


	getChildren()
	{
		return [];
	}


	getModifier()
	{
		return this.modifier;
	}
}


export class UrlNode extends InlineNode
{
	/**
	 * @param {string} url
	 * @param {?Range} range
	 */
	constructor(url, range = null)
	{
		super();
		this.url = url;
		this.range = range;
	}


	getChildren()
	{
		return [];
	}
}


export class EmailNode extends InlineNode
{
	/**
	 * @param {string} email
	 * @param {?Range} range
	 */
	constructor(email, range = null)
	{
		super();
		this.email = email;
		this.range = range;
	}


	getChildren()
	{
		return [];
	}
}


export class EmoticonNode extends InlineNode
{
	/**
	 * @param {string} emoticon
	 * @param {?Range} range
	 */
	constructor(emoticon, range = null)
	{
		super();
		this.emoticon = emoticon;
		/** filled by the transform phase */
		this.resolved = null;
		this.range = range;
	}


	getChildren()
	{
		return [];
	}
}


/** {{ ... }} script command. */
export class DirectiveNode extends InlineNode
{
	/**
	 * @param {string} text inner content
	 * @param {?Range} range
	 */
	constructor(text, range = null)
	{
		super();
		this.text = text;
		this.range = range;
	}


	getChildren()
	{
		return [];
	}


	/**
	 * Parses directive content into name, value, and arguments.
	 * @param {string} separator
	 * @returns {{name: string, value: ?string, args: string[]}}
	 */
	parseContent(separator = ',')
	{
		let cmd = this.text.trim();
		let raw = null;
		let args = [];

		// function (arg, arg, ...) or function: arg, arg
		const m = cmd.match(/^([a-z_][a-z0-9_-]*)\s*(?:\(([^()]*)\)|:(.*))$/i);
		if (m) {
			cmd = m[1];
			raw = (m[3] ?? m[2] ?? '').trim();
			if (raw !== '') {
				const quoted = separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
				args = raw.split(new RegExp('\\s*' + quoted + '\\s*'));
			}
		}

		return { name: cmd, value: raw, args };
	}
}


export class HtmlTagNode extends InlineNode
{
	/**
	 * @param {string} name lowercased tag name
	 * @param {Object<string, string|boolean>} attributes
	 * @param {boolean} closing
	 * @param {boolean} selfClosing
	 * @param {?Range} range
	 */
	constructor(name, attributes = {}, closing = false, selfClosing = false, range = null)
	{
		super();
		this.name = name;
		this.attributes = attributes;
		this.closing = closing;
		this.selfClosing = selfClosing;
		this.range = range;
	}


	getChildren()
	{
		return [];
	}
}


/** Paired passthrough HTML element (built by the pairing transform pass). */
export class HtmlElementNode extends InlineNode
{
	/**
	 * @param {string} name
	 * @param {Object<string, string|boolean>} attributes
	 * @param {ContentNode} content
	 * @param {?HtmlTagNode} closingTag
	 * @param {?Range} range
	 */
	constructor(name, attributes = {}, content = new ContentNode(), closingTag = null, range = null)
	{
		super();
		this.name = name;
		this.attributes = attributes;
		this.content = content;
		this.closingTag = closingTag;
		this.range = range;
	}


	getChildren()
	{
		return [this.content];
	}
}


export class HtmlCommentNode extends InlineNode
{
	/**
	 * @param {string} text inner comment text
	 * @param {?Range} range
	 */
	constructor(text, range = null)
	{
		super();
		this.text = text;
		this.range = range;
	}


	getChildren()
	{
		return [];
	}
}


/** [*reference*]: url - image definition (resolved in the transform phase). */
export class ImageDefinitionNode extends BlockNode
{
	/**
	 * @param {string} reference
	 * @param {?string} url
	 * @param {?number} width
	 * @param {?number} height
	 * @param {?import('./Modifier.js').Modifier} modifier
	 * @param {?Range} range
	 */
	constructor(reference, url = null, width = null, height = null, modifier = null, range = null)
	{
		super();
		this.reference = reference;
		this.url = url;
		this.width = width;
		this.height = height;
		this.modifier = modifier;
		this.range = range;
	}


	getChildren()
	{
		return [];
	}


	getModifier()
	{
		return this.modifier;
	}
}


/** [reference]: url - link definition (resolved in the transform phase). */
export class LinkDefinitionNode extends BlockNode
{
	/**
	 * The optional label and modifier of a definition are Texy 3
	 * semantics, restored for historical documents (the 4-dev reference
	 * deprecates them): a bare [ref] use shows the inline-parsed label
	 * as content, and the modifier applies to every use site.
	 * @param {string} reference
	 * @param {string} url
	 * @param {?Range} range
	 * @param {?string} label
	 * @param {?import('./Modifier.js').Modifier} modifier
	 */
	constructor(reference, url, range = null, label = null, modifier = null)
	{
		super();
		this.reference = reference;
		this.url = url;
		this.range = range;
		this.label = label;
		this.modifier = modifier;
	}


	getChildren()
	{
		return [];
	}
}

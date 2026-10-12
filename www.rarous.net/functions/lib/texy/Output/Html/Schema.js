/**
 * Declarative HTML vocabulary (port of Texy\Output\Html\Schema): a single
 * authoritative per-element table (category, void-ness, optional end tag,
 * content model) plus deep nesting prohibitions. Every element-related view
 * used by well-forming, paragraph analysis and the default tag whitelist is
 * derived from it.
 */

export const Text = '%TEXT';
export const Transparent = '%TRANS';

export const UrlLink = 'link';
export const UrlImage = 'image';

// element flags
const Inline = 0b000001; // phrasing element
const Replaced = 0b000010; // replaced/opaque element (typography must not reach inside)
const Void = 0b000100; // no end tag
const OptionalEnd = 0b001000; // end tag may be omitted (auto-close)
const PhrasingOnly = 0b010000; // block element with phrasing-only content
const ChildOnly = 0b100000; // allowed only inside its parent, not in flow content

/**
 * element => flags | [flags, content model]
 * Content model is a list of allowed children (+ markers); [] means no
 * content at all. Without it the category default applies: phrasing for
 * Inline/PhrasingOnly elements, flow content otherwise.
 */
const Elements = {
	// inline markup
	'a': [Inline, [Transparent]],
	'abbr': Inline,
	'audio': [Inline, ['source', 'track', Transparent]],
	'b': Inline,
	'bdi': Inline,
	'bdo': Inline,
	'cite': Inline,
	'code': Inline,
	'data': Inline,
	'datalist': Inline,
	'del': [Inline, [Transparent]],
	'dfn': Inline,
	'em': Inline,
	'i': Inline,
	'ins': [Inline, [Transparent]],
	'kbd': Inline,
	'label': Inline,
	'map': Inline,
	'mark': Inline,
	'q': Inline,
	'ruby': Inline,
	's': Inline,
	'samp': Inline,
	'slot': Inline,
	'small': Inline,
	'span': Inline,
	'strong': Inline,
	'sub': Inline,
	'sup': Inline,
	'template': Inline,
	'time': Inline,
	'u': Inline,
	'var': Inline,

	// inline voids
	'area': Inline | Void,
	'br': Inline | Replaced | Void,
	'embed': Inline | Replaced | Void,
	'img': Inline | Replaced | Void,
	'input': Inline | Replaced | Void,
	'link': Inline | Void,
	'meta': Inline | Void,
	'wbr': Inline | Void,

	// inline replaced
	'button': Inline | Replaced,
	'canvas': Inline | Replaced,
	'iframe': [Inline | Replaced, []],
	'math': Inline | Replaced,
	'meter': Inline | Replaced,
	'noscript': [Inline | Replaced, [Transparent]],
	'object': [Inline | Replaced, ['param', Transparent]],
	'output': Inline | Replaced,
	'picture': Inline | Replaced,
	'progress': Inline | Replaced,
	'script': [Inline | Replaced, [Text]],
	'select': [Inline | Replaced, ['option', 'optgroup']],
	'svg': Inline | Replaced,
	'textarea': [Inline | Replaced, [Text]],
	'video': [Inline | Replaced, ['source', 'track', Transparent]],

	// blocks with phrasing content
	'p': PhrasingOnly | OptionalEnd,
	'h1': PhrasingOnly,
	'h2': PhrasingOnly,
	'h3': PhrasingOnly,
	'h4': PhrasingOnly,
	'h5': PhrasingOnly,
	'h6': PhrasingOnly,
	'pre': PhrasingOnly,

	// blocks with flow content
	'address': 0,
	'article': 0,
	'aside': 0,
	'blockquote': 0,
	'details': [0, ['summary', Transparent]],
	'div': 0,
	'fieldset': [0, ['legend', Transparent]],
	'figure': [0, ['figcaption', Transparent]],
	'footer': 0,
	'form': 0,
	'header': 0,
	'hr': Void,
	'main': 0,
	'nav': 0,
	'section': 0,
	'body': OptionalEnd,
	'head': OptionalEnd,
	'html': OptionalEnd,

	// tables
	'table': [0, ['caption', 'colgroup', 'thead', 'tbody', 'tfoot', 'tr']],
	'caption': PhrasingOnly | ChildOnly,
	'colgroup': [OptionalEnd | ChildOnly, ['col']],
	'col': Void | ChildOnly,
	'thead': [OptionalEnd | ChildOnly, ['tr']],
	'tbody': [OptionalEnd | ChildOnly, ['tr']],
	'tfoot': [OptionalEnd | ChildOnly, ['tr']],
	'tr': [OptionalEnd | ChildOnly, ['th', 'td']],
	'td': OptionalEnd | ChildOnly,
	'th': OptionalEnd | ChildOnly,

	// lists
	'ul': [0, ['li']],
	'ol': [0, ['li']],
	'li': OptionalEnd | ChildOnly,
	'dl': [0, ['dt', 'dd']],
	'dt': OptionalEnd | ChildOnly,
	'dd': OptionalEnd | ChildOnly,

	// other child-only elements
	'figcaption': PhrasingOnly | ChildOnly,
	'legend': PhrasingOnly | ChildOnly,
	'summary': PhrasingOnly | ChildOnly,
	'option': OptionalEnd | ChildOnly,
	'optgroup': [ChildOnly, ['option']],
	'param': Void | ChildOnly,
	'source': Void | ChildOnly,
	'track': Void | ChildOnly,
	'style': [ChildOnly, [Text]],
	'base': Void | ChildOnly,
};

const Prohibits = {
	'a': ['a', 'button'],
	'button': ['a', 'button'],
	'form': ['form'],
};

/** Attributes whose value is a URL, and which policy governs them. */
const UrlAttrs = {
	href: UrlLink,
	cite: UrlLink,
	ping: UrlLink,
	itemid: UrlLink,
	itemtype: UrlLink,
	src: UrlImage,
	srcset: UrlImage,
};

const All = true; // Texy::All


const flags = def => Array.isArray(def) ? def[0] : def;

export function isKnown(tag)
{
	return Object.hasOwn(Elements, tag);
}


/** Returns UrlLink / UrlImage for an attribute carrying a URL, null otherwise. */
export function urlAttribute(name)
{
	return UrlAttrs[name] ?? null;
}


/** Phrasing elements; replaced elements have value 1, others 0. */
export const inlineElements = Object.fromEntries(
	Object.entries(Elements)
		.filter(([, def]) => flags(def) & Inline)
		.map(([tag, def]) => [tag, flags(def) & Replaced ? 1 : 0]),
);


/** Void elements (no end tag). */
export const voidElements = Object.fromEntries(
	Object.entries(Elements)
		.filter(([, def]) => flags(def) & Void)
		.map(([tag]) => [tag, 1]),
);


export function hasOptionalEnd(tag)
{
	return Boolean(flags(Elements[tag] ?? 0) & OptionalEnd);
}


export function prohibitedAncestors(tag)
{
	return Prohibits[tag] ?? [];
}


/** Elements allowed in flow content: every known element except child-only ones. */
const flowContentValue = Object.fromEntries([
	...Object.entries(Elements)
		.filter(([, def]) => !(flags(def) & ChildOnly))
		.map(([tag]) => [tag, 1]),
	[Text, 1],
]);


/** Elements allowed in phrasing content. */
const phrasingContentValue = Object.fromEntries([
	...Object.entries(inlineElements),
	[Text, 1],
]);


/** Default tag whitelist: all known tags with all attributes, except document-level tags. */
const defaultAllowedTagsValue = Object.fromEntries([
	...Object.keys(Elements)
		.filter(tag => !['html', 'head', 'body', 'style'].includes(tag))
		.map(tag => [tag, All]),
	['*', All], // modifiers may set anything unless the policy says otherwise
]);


const contentModels = Object.fromEntries(
	Object.entries(Elements)
		.filter(([, def]) => Array.isArray(def))
		.map(([tag, def]) => [tag, Object.fromEntries(def[1].map(name => [name, 1]))]),
);


/**
 * Determines what content (child elements) a known tag can contain.
 * @param {string} tag
 * @param {Object<string, number>} parentContent
 * @returns {Object<string, number>}
 */
export function childContent(tag, parentContent)
{
	const model = contentModels[tag] ?? null;

	if (model !== null) {
		if (Object.hasOwn(model, Transparent)) {
			// Transparent: inherits parent's content model plus its own additions
			const merged = { ...parentContent, ...model };
			delete merged[Transparent];
			return merged;
		}
		if (Object.keys(model).length === 0) {
			// No content allowed at all (e.g., iframe)
			return {};
		}
		// Explicit content model (e.g., table, ul)
		return { ...model, [Text]: 1 };
	}

	const def = Elements[tag] ?? 0;
	return flags(def) & (Inline | PhrasingOnly)
		? phrasingContentValue
		: flowContentValue;
}

export { defaultAllowedTagsValue as defaultAllowedTags, flowContentValue as flowContent, phrasingContentValue as phrasingContent };

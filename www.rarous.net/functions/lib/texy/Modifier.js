/**
 * Modifier processor (port of Texy\Modifier).
 *
 * Modifiers are texts like .(title)[class1 class2 #id]{color: red}>^
 *   .         starts with dot
 *   (...)     title or alt modifier
 *   [...]     classes or ID modifier
 *   {...}     inner style modifier
 *   < > <> =  horizontal align modifier
 *   ^ - _     vertical align modifier
 */

import { unescapeHtml } from './helpers.js';
import { match } from './Regexp.js';
import { Range } from './Range.js';

/**
 * Names in {...} treated as HTML attributes; anything else is a CSS style.
 * Names that are also CSS properties (width, height, color, border, ...)
 * are omitted on purpose, so that the far more common style meaning wins.
 */
export const ElAttrs = new Set([
	'abbr', 'accesskey', 'alt', 'cite', 'colspan', 'contenteditable', 'crossorigin', 'datetime',
	'decoding', 'dir', 'download', 'draggable', 'for', 'headers', 'hidden', 'href', 'hreflang',
	'id', 'inert', 'inputmode', 'itemid', 'itemprop', 'itemref', 'itemscope', 'itemtype', 'lang',
	'loading', 'name', 'ping', 'popover', 'referrerpolicy', 'rel', 'reversed', 'role', 'rowspan',
	'scope', 'slot', 'spellcheck', 'src', 'srcset', 'start', 'tabindex', 'target', 'title', 'type',
	'value',
]);


export class Modifier
{
	/** @type {?string} */
	id = null;

	/** @type {Object<string, true>} classes, as insertion-ordered keys */
	classes = {};

	/** @type {Object<string, string>} CSS styles */
	styles = {};

	/** @type {Object<string, string|string[]>} HTML element attributes */
	attrs = {};

	/** @type {?string} */
	hAlign = null;

	/** @type {?string} */
	vAlign = null;

	/** @type {?string} */
	title = null;

	/** @type {?Range} */
	range = null;


	/**
	 * Parses a modifier string and returns a new instance.
	 * @param {?string} s
	 * @param {?number} offset source offset of the modifier, for range tracking
	 * @returns {?Modifier}
	 */
	static parse(s, offset = null)
	{
		if (s === null || s === undefined) return null;
		const modifier = new Modifier;
		if (offset !== null && offset !== undefined) {
			modifier.range = new Range(offset, s.length);
		}
		modifier.setProperties(s);
		return modifier;
	}


	/**
	 * Returns a shallow copy (PHP clone semantics).
	 * @returns {Modifier}
	 */
	clone()
	{
		return Object.assign(new Modifier, this, {
			classes: { ...this.classes },
			styles: { ...this.styles },
			attrs: { ...this.attrs },
			range: this.range,
		});
	}


	/**
	 * Parses the modifier parts in any order.
	 * @param {?string} s
	 */
	setProperties(s)
	{
		let p = 0;
		const len = s ? s.length : 0;

		while (p < len) {
			const ch = s[p];

			if (ch === '(') { // title
				const m = match(s, String.raw`~(?: \\\) | [^)\n] )++\)~x`, { offset: p });
				if (m) {
					this.title = unescapeHtml(m.matches[0].slice(1, -1).replaceAll('\\)', ')').trim());
					p += m.length;
				}

			} else if (ch === '{') { // style & attributes
				const a = s.indexOf('}', p) + 1;
				this.parseStyle(s.slice(p + 1, a - 1));
				p = a;

			} else if (ch === '[') { // classes & ID
				const a = s.indexOf(']', p) + 1;
				this.parseClasses(s.slice(p + 1, a - 1).replaceAll('#', ' #'));
				p = a;

			} else if (ch === '^' || ch === '-' || ch === '_') { // vertical alignment
				this.vAlign = { '^': 'top', '-': 'middle', '_': 'bottom' }[ch];
				p++;

			} else if (s.slice(p, p + 2) === '<>') { // horizontal alignment
				this.hAlign = 'center';
				p += 2;

			} else if (ch === '=' || ch === '>' || ch === '<') {
				this.hAlign = { '=': 'justify', '>': 'right', '<': 'left' }[ch];
				p++;

			} else {
				break;
			}
		}
	}


	/**
	 * Parses `prop: value; prop: value` pairs: known attribute names and
	 * data-/aria- names become attributes, the rest CSS styles.
	 * @param {string} s
	 */
	parseStyle(s)
	{
		for (const value of s.split(';')) {
			const pair = value.split(':', 2);
			const prop = pair[0].trim().toLowerCase();
			if (prop === '' || pair.length < 2) continue;

			const val = pair[1].trim();
			if (ElAttrs.has(prop) || prop.startsWith('data-') || prop.startsWith('aria-')) {
				this.attrs[prop] = val; // attribute
			} else if (val !== '') { // style
				this.styles[prop] = val;
			}
		}
	}


	/**
	 * Parses space-separated classes; `#id` sets the id.
	 * @param {string} s
	 */
	parseClasses(s)
	{
		for (const value of s.split(' ')) {
			if (value === '') continue;
			if (value[0] === '#') {
				this.id = value.slice(1);
			} else {
				this.classes[value] = true;
			}
		}
	}
}


/**
 * Merges two modifiers the way Texy 3 references did: the reference
 * definition's modifier is the base, the use-site modifier applies on
 * top - classes, styles and attributes union (base first), title, id
 * and alignments overwrite. Used by the link-reference resolution.
 * @param {?Modifier} base the reference definition's modifier
 * @param {?Modifier} top the use-site modifier
 * @returns {?Modifier}
 */
export function mergeModifiers(base, top)
{
	if (base === null) {
		return top === null ? null : top.clone();
	}

	const m = base.clone();
	if (top === null) {
		return m;
	}

	Object.assign(m.classes, top.classes);
	Object.assign(m.styles, top.styles);
	Object.assign(m.attrs, top.attrs);
	m.id = top.id ?? m.id;
	m.title = top.title ?? m.title;
	m.hAlign = top.hAlign ?? m.hAlign;
	m.vAlign = top.vAlign ?? m.vAlign;

	return m;
}

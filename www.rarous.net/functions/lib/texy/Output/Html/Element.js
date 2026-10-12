/**
 * HTML helper for the render tree (port of Texy\Output\Html\Element).
 *
 * usage:
 *   const el = new Element('a', { href: link });
 *   el.children.push('Texy');
 *   el.startTag(), el.endTag()
 *
 * The element is the serialization-phase data model; a linkedom DOM
 * projection of the same tree is available via DomBuilder.
 */

import { voidElements } from './Schema.js';
import { freezeSpaces } from '../../helpers.js';

/**
 * PHP `$v == null`: true for null, false, '', 0, '0' and empty arrays.
 * @param {string|number|boolean|null|Array} v
 */
function phpLooseNull(v)
{
	return v == null || v === '' || v === 0 || v === '0' || v === false
		|| (Array.isArray(v) && v.length === 0);
}

export class Element
{
	/**
	 * @param {?string} name null = transparent wrapper (children only)
	 * @param {Object<string, string|number|boolean|Array|string[]>|?string} attrs element attributes (or textual content)
	 */
	constructor(name = null, attrs = null)
	{
		this.name = name;
		/** @type {Object<string, string|number|boolean|Array|Array<[string, string]>>} */
		this.attrs = {};
		/** @type {Array<Element|Raw|string>} */
		this.children = [];
		this.isVoid = Object.hasOwn(voidElements, name ?? '');

		if (attrs !== null && typeof attrs === 'object') {
			this.attrs = attrs;
		} else if (attrs !== null) {
			this.children = [attrs];
		}
	}


	/**
	 * Sets element's textual content.
	 * @param {string} text
	 */
	setText(text)
	{
		this.children = [text];
		return this;
	}


	/**
	 * Adds a child.
	 * @param {Element|Raw|string} child
	 */
	add(child)
	{
		this.children.push(child);
		return this;
	}


	/**
	 * Creates and adds a new child element.
	 * @param {string} name
	 * @param {Object|string|null} attrs
	 * @returns {Element}
	 */
	create(name, attrs = null)
	{
		const child = new Element(name, attrs);
		this.children.push(child);
		return child;
	}


	/**
	 * Returns the element's start tag.
	 */
	startTag()
	{
		if (!this.name) {
			return '';
		}

		return '<' + this.name + Element.formatAttrs(this.attrs) + '>';
	}


	/**
	 * Formats an attribute map to an HTML string. Values are escaped
	 * (&"'<>@) and their whitespace frozen so line wrapping cannot break
	 * inside an attribute value. Composite values (class/style) are either
	 * arrays of values or maps of property:value pairs.
	 * @param {Object<string, string|number|boolean|Array|Object<string, string>>} attrs
	 */
	static formatAttrs(attrs)
	{
		let s = '';
		for (const [key, value] of Object.entries(attrs)) {
			if (value === null || value === undefined || value === false) {
				continue; // skip nulls and false boolean attributes

			} else if (value === true) {
				s += ' ' + key; // true boolean attribute
				continue;

			} else if (typeof value === 'object') { // composite class/style
				const tmp = [];
				for (const [k, v] of Object.entries(value)) {
					if (phpLooseNull(v)) { // skip nulls, empty/zero strings; composite 'style' vs. 'others'
						continue;
					}
					tmp.push(/^\d+$/.test(k) ? String(v) : k + ':' + v);
				}

				if (tmp.length === 0) {
					continue;
				}

				s += ' ' + key + '="' + Element.escapeAttrValue(key === 'style' ? tmp.join(';') : tmp.join(' ')) + '"';

			} else {
				s += ' ' + key + '="' + Element.escapeAttrValue(String(value)) + '"';
			}
		}

		return s;
	}


	static escapeAttrValue(value)
	{
		return freezeSpaces(value
			.replaceAll('&', '&amp;')
			.replaceAll('"', '&quot;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('@', '&#64;'));
	}


	/**
	 * Returns the element's end tag.
	 */
	endTag()
	{
		return this.name && !this.isVoid
			? '</' + this.name + '>'
			: '';
	}


	/**
	 * Clones all children too (PHP clone semantics).
	 * @returns {Element}
	 */
	clone()
	{
		const copy = Object.assign(new Element(), this);
		copy.attrs = { ...this.attrs };
		copy.children = this.children.map(child =>
			child instanceof Element ? child.clone() : child);
		return copy;
	}
}

/**
 * Security policy for HTML in the document (port of Texy\HtmlPolicy):
 * which tags, classes and inline styles may appear, plus validation and
 * reconstruction of passthrough HTML tags.
 */

import { defaultAllowedTags } from './Output/Html/Schema.js';

export const All = true;
export const None = false;

export class HtmlPolicy
{
	constructor(urlPolicy)
	{
		this.urlPolicy = urlPolicy;

		/**
		 * Allowed HTML tags and their attributes. A fresh copy per instance:
		 * PHP arrays are value-copied, and configurators mutate the policy
		 * (e.g. Configurator.disableLinks deletes the 'a' entry).
		 * @type {boolean|Object<string, boolean|string[]>}
		 */
		this.allowedTags = { ...defaultAllowedTags };

		/** @type {boolean|string[]} allowed classes and IDs */
		this.allowedClasses = All;

		/** @type {boolean|string[]} allowed inline CSS styles */
		this.allowedStyles = All;
	}


	/**
	 * Is tag allowed by the allowedTags whitelist?
	 * @param {string} tagName
	 */
	isTagAllowed(tagName)
	{
		if (!this.allowedTags) { // all tags are disabled
			return false;
		}

		return this.allowedTags === true || Object.hasOwn(this.allowedTags, tagName);
	}


	/**
	 * Validate HTML tag for security.
	 * @param {string} tagName
	 * @param {Object<string, string|boolean>} attrs
	 * @param {boolean} closing
	 * @returns {boolean|string} true = valid, false = escape as text, 'drop' = remove entirely
	 */
	validateTag(tagName, attrs, closing)
	{
		// <a> requires href, name, or id
		if (tagName === 'a' && !closing) {
			if (!(Object.hasOwn(attrs, 'href') || Object.hasOwn(attrs, 'name') || Object.hasOwn(attrs, 'id'))) {
				return false;
			}
			// Validate href URL scheme (security: filter javascript: etc.)
			if (Object.hasOwn(attrs, 'href') && typeof attrs.href === 'string') {
				if (!this.urlPolicy.isLinkAllowed(attrs.href)) {
					return 'drop'; // XSS protection - drop dangerous URLs entirely
				}
			}
		}

		// <img> requires src
		if (tagName === 'img') {
			if (!Object.hasOwn(attrs, 'src') || (typeof attrs.src === 'string' && attrs.src.trim() === '')) {
				return false;
			}
			// Validate src URL scheme
			if (typeof attrs.src === 'string' && !this.urlPolicy.isImageAllowed(attrs.src)) {
				return 'drop';
			}
		}

		return true;
	}


	/**
	 * Drops attributes the whitelist does not allow for the tag. The '*' key
	 * lists attributes allowed on any element; it is added to whatever the
	 * element itself allows.
	 * @param {string} tagName
	 * @param {Object<string, *>} attrs values are untouched, only keys are filtered
	 */
	filterAttrs(tagName, attrs)
	{
		if (this.allowedTags === true || this.allowedTags === false) {
			return this.allowedTags ? { ...attrs } : {};
		}

		const names = [];
		for (const allowed of [this.allowedTags[tagName] ?? [], this.allowedTags['*'] ?? []]) {
			if (allowed === All) {
				return { ...attrs };
			} else if (Array.isArray(allowed)) {
				names.push(...allowed);
			}
		}

		const namesSet = new Set(names);
		return Object.fromEntries(Object.entries(attrs).filter(([name]) => namesSet.has(name)));
	}


	/**
	 * Is the tag (opening or closing) acceptable?
	 * @param {string} tagName
	 * @param {Object<string, string|boolean>} attrs
	 * @param {boolean} closing
	 */
	isTagAcceptable(tagName, attrs, closing)
	{
		if (!this.isTagAllowed(tagName)) {
			return false;
		}

		const validation = this.validateTag(tagName, attrs, closing);
		return validation !== false && validation !== 'drop';
	}


	/**
	 * Reconstructs the original tag source text.
	 * @param {import('./nodes.js').HtmlTagNode} node
	 */
	reconstructTag(node)
	{
		let tag = '<';
		if (node.closing) {
			tag += '/';
		}
		tag += node.name;
		for (const [name, value] of Object.entries(node.attributes)) {
			tag += ' ' + name;
			if (value !== true) {
				tag += '="' + value + '"';
			}
		}
		if (node.selfClosing) {
			tag += ' /';
		}

		return tag + '>';
	}
}

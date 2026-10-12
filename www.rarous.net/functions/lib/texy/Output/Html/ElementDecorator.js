/**
 * Applies Modifier (classes, styles, attributes, alignment) to an Element
 * (port of Texy\Output\Html\ElementDecorator).
 *
 * This is where the security policy is enforced, and the placement is
 * deliberate: it is the moment an author-written modifier is poured into
 * the output element. Anything a transform pass or a renderer handler
 * writes into the Element itself never passes through here, so generated
 * markup is not subject to the policy.
 */

import { All } from '../../HtmlPolicy.js';
import { urlAttribute, UrlImage } from './Schema.js';

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


export class ElementDecorator
{
	/**
	 * @param {import('../../HtmlPolicy.js').HtmlPolicy} policy
	 * @param {import('../../UrlPolicy.js').UrlPolicy} urlPolicy
	 * @param {import('./Config.js').Config} config
	 * @param {import('./Renderer.js').Renderer} renderer
	 */
	constructor(policy, urlPolicy, config, renderer)
	{
		this.policy = policy;
		this.urlPolicy = urlPolicy;
		this.config = config;
		this.renderer = renderer;
		/** @type {Set<string>|boolean|undefined} lazy lookup of policy.allowedClasses */
		this.classes = undefined;
		/** @type {Set<string>|boolean|undefined} lazy lookup of policy.allowedStyles */
		this.styles = undefined;
	}


	/**
	 * Decorate element with modifier's classes, styles, and attributes.
	 * @param {?import('../../Modifier.js').Modifier} modifier
	 * @param {import('./Element.js').Element} el
	 */
	decorate(modifier, el)
	{
		if (modifier === null) {
			return;
		}

		this.decorateAttrs(modifier, el);
		this.decorateClasses(modifier, el.attrs);
		this.decorateStyles(modifier, el.attrs);
		this.decorateAligns(modifier, el.attrs);
	}


	/**
	 * @param {import('../../Modifier.js').Modifier} modifier
	 * @param {import('./Element.js').Element} el
	 */
	decorateAttrs(modifier, el)
	{
		if (Object.keys(modifier.attrs).length > 0) {
			el.attrs = this.filterUrls(this.policy.filterAttrs(el.name ?? '', modifier.attrs));
		}

		if (modifier.title !== null) {
			el.attrs.title = this.renderer.postLineText(modifier.title);
		}
	}


	/**
	 * A URL attribute survives only if UrlPolicy accepts it. This runs
	 * regardless of the whitelist - "javascript:" must not get through even
	 * on a permissive policy.
	 * @param {Object<string, string>} attrs
	 * @returns {Object<string, string>}
	 */
	filterUrls(attrs)
	{
		for (const [name, value] of Object.entries(attrs)) {
			const kind = urlAttribute(name);
			if (kind === null || typeof value !== 'string') {
				continue;
			}

			const allowed = kind === UrlImage
				? this.urlPolicy.isImageAllowed(value)
				: this.urlPolicy.isLinkAllowed(value);
			if (!allowed) {
				delete attrs[name];
			}
		}

		return attrs;
	}


	/**
	 * @param {import('../../Modifier.js').Modifier} modifier
	 * @param {Object<string, *>} attrs
	 */
	decorateClasses(modifier, attrs)
	{
		if (Object.keys(modifier.classes).length > 0 || modifier.id !== null) {
			if (this.classes === undefined) {
				this.classes = Array.isArray(this.policy.allowedClasses)
					? new Set(this.policy.allowedClasses)
					: this.policy.allowedClasses;
			}
			const allowedClasses = this.classes;
			settypeArray(attrs, 'class');

			if (allowedClasses === All) {
				for (const value of Object.keys(modifier.classes)) {
					attrs.class.push(value);
				}

				attrs.id = modifier.id;
			} else if (allowedClasses instanceof Set) {
				for (const value of Object.keys(modifier.classes)) {
					if (allowedClasses.has(value)) {
						attrs.class.push(value);
					}
				}

				// PHP concatenates '#' . $id (null becomes ''); a null id can
				// only pass when the policy whitelists '#', and lands as a
				// null (dropped) attribute
				if (allowedClasses.has('#' + (modifier.id ?? ''))) {
					attrs.id = modifier.id;
				}
			}
		}
	}


	/**
	 * @param {import('../../Modifier.js').Modifier} modifier
	 * @param {Object<string, *>} attrs
	 */
	decorateStyles(modifier, attrs)
	{
		if (Object.keys(modifier.styles).length > 0) {
			if (this.styles === undefined) {
				this.styles = Array.isArray(this.policy.allowedStyles)
					? new Set(this.policy.allowedStyles)
					: this.policy.allowedStyles;
			}
			const allowedStyles = this.styles;
			settypeArray(attrs, 'style');

			if (allowedStyles === All) {
				for (const [prop, value] of Object.entries(modifier.styles)) {
					attrs.style[prop] = value;
				}
			} else if (allowedStyles instanceof Set) {
				for (const [prop, value] of Object.entries(modifier.styles)) {
					if (allowedStyles.has(prop)) {
						attrs.style[prop] = value;
					}
				}
			}
		}
	}


	/**
	 * Applies a horizontal float: side-specific class, alignClasses
	 * fallback, or an inline float style.
	 * @param {import('./Element.js').Element} el
	 * @param {string} hAlign
	 * @param {?string} leftClass
	 * @param {?string} rightClass
	 */
	applyFloat(el, hAlign, leftClass, rightClass)
	{
		let cls = hAlign === 'left' ? leftClass : hAlign === 'right' ? rightClass : null;
		cls ??= this.config.alignClasses[hAlign] ?? null;
		if (cls) {
			settypeArray(el.attrs, 'class');
			el.attrs.class.push(cls);
		} else {
			settypeArray(el.attrs, 'style');
			el.attrs.style.float = hAlign;
		}
	}


	/**
	 * @param {import('../../Modifier.js').Modifier} modifier
	 * @param {Object<string, *>} attrs
	 */
	decorateAligns(modifier, attrs)
	{
		if (modifier.hAlign) {
			const cls = this.config.alignClasses[modifier.hAlign] ?? null;
			if (cls) {
				settypeArray(attrs, 'class');
				attrs.class.push(cls);
			} else {
				settypeArray(attrs, 'style');
				attrs.style['text-align'] = modifier.hAlign;
			}
		}

		if (modifier.vAlign) {
			const cls = this.config.alignClasses[modifier.vAlign] ?? null;
			if (cls) {
				settypeArray(attrs, 'class');
				attrs.class.push(cls);
			} else {
				settypeArray(attrs, 'style');
				attrs.style['vertical-align'] = modifier.vAlign;
			}
		}
	}
}

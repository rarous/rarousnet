/**
 * linkedom DOM projection of the rendered tree.
 *
 * The renderer produces a PHP-faithful render tree (Element/Raw/string)
 * which the WellFormer serializes to byte-identical HTML. This module
 * projects the same tree onto a linkedom Document for consumers that want
 * a real DOM to transform before serializing (the "HTML transform" phase
 * in DOM form).
 *
 * Differences from WellFormer serialization, inherent to the DOM:
 * - the DOM has no notion of raw markup: Raw fragments are parsed into
 *   real nodes (their HTML is trusted, it passed the render pipeline);
 * - boolean attributes serialize as name="" (DOM serialization spec);
 * - no well-forming happens here: the WellFormer already guarantees a
 *   well-formed tree, but DOM mutation afterwards is the consumer's
 *   responsibility;
 * - void elements never receive children, mirroring the WellFormer.
 */

import { DOMParser } from 'linkedom';
import { phpLooseNull } from '../../helpers.js';
import { Raw } from './Raw.js';


/**
 * Composite attribute value (class list / style map) joined the way
 * Element.formatAttrs would serialize it, without escaping.
 * @param {string} key
 * @param {Array|Object<string, string>} value
 * @returns {string}
 */
function compositeValue(key, value)
{
	const parts = [];
	for (const [k, v] of Object.entries(value)) {
		if (phpLooseNull(v)) {
			continue;
		}
		parts.push(/^\d+$/.test(k) ? String(v) : `${k}:${v}`);
	}

	return key === 'style' ? parts.join(';') : parts.join(' ');
}


/**
 * Appends one render-tree node to a DOM parent.
 * @param {*} parent a linkedom node
 * @param {import('./Element.js').Element|import('./Raw.js').Raw|string} child
 * @param {*} doc the linkedom document
 */
function appendNode(parent, child, doc)
{
	if (child instanceof Raw) {
		// parse the trusted pre-serialized HTML in a detached container,
		// then splice the parsed nodes in
		const container = doc.createElement('div');
		container.innerHTML = child.html;
		while (container.firstChild) {
			parent.appendChild(container.firstChild);
		}
		return;
	}

	if (typeof child !== 'object') {
		parent.appendChild(doc.createTextNode(child));
		return;
	}

	if (child.name === null || child.name === '') {
		for (const inner of child.children) { // transparent wrapper
			appendNode(parent, inner, doc);
		}
		return;
	}

	const el = doc.createElement(child.name);
	for (const [key, value] of Object.entries(child.attrs)) {
		if (value === null || value === undefined || value === false) {
			continue;
		}
		el.setAttribute(
			key,
			typeof value === 'object'
				? compositeValue(key, value)
				: String(value),
		);
	}

	if (!child.isVoid) {
		for (const inner of child.children) {
			appendNode(el, inner, doc);
		}
	}

	parent.appendChild(el);
}


/**
 * Projects the rendered tree into a linkedom Document; the content lands
 * in the document's <body>.
 * @param {import('./Element.js').Element|import('./Raw.js').Raw|string} root
 * @param {Object} [options]
 * @param {*} [options.document] an existing linkedom document to fill
 *   (its body is used as the content root)
 * @returns the linkedom Document
 */
export function renderToDom(root, { document = null } = {})
{
	const doc = document ?? new DOMParser().parseFromString(
		'<!doctype html><html><head></head><body></body></html>',
		'text/html',
	);

	appendNode(doc.body, root, doc);
	return doc;
}

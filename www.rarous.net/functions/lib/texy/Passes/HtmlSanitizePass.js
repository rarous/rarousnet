/**
 * Evaluates the tag whitelist and validation over the paired passthrough
 * tree in the transform phase (port of Texy\Passes\HtmlSanitizePass):
 * rejected tags and elements are replaced by TextNode with the
 * reconstructed tag source, so the AST tells the truth - escaped tags are
 * visible text, allowed tags are markup. Renderers keep their own checks
 * as defense in depth.
 */

import { NodeTraverser } from '../NodeTraverser.js';
import { ContentNode, HtmlElementNode, HtmlTagNode, TextNode } from '../nodes.js';
import { decodeEntities } from '../helpers.js';

export class HtmlSanitizePass
{
	/** @param {import('../HtmlPolicy.js').HtmlPolicy} policy */
	constructor(policy)
	{
		this.policy = policy;
	}


	/** @param {import('../nodes.js').DocumentNode} doc */
	process(doc)
	{
		new NodeTraverser().traverse(doc, node => {
			if (node instanceof ContentNode && node.children.length > 0) {
				node.children = this.sanitize(node.children);
			}
			return null;
		});
	}


	/**
	 * Replaces rejected tags/elements in the list by their text form.
	 * Children of a rejected element are sanitized recursively and spliced
	 * in place - once spliced they are direct children of an already
	 * processed container, so the traverser would not check them again.
	 * @param {Array} children
	 */
	sanitize(children)
	{
		const out = [];
		for (const child of children) {
			if (child instanceof HtmlTagNode) {
				if (!this.policy.isTagAcceptable(child.name.toLowerCase(), child.attributes, child.closing)) {
					out.push(new TextNode(decodeEntities(this.policy.reconstructTag(child)), child.range));
					continue;
				}

				// the tag stays, but only with the attributes the whitelist names
				child.attributes = this.policy.filterAttrs(child.name.toLowerCase(), child.attributes);

			} else if (child instanceof HtmlElementNode) {
				if (!this.policy.isTagAcceptable(child.name.toLowerCase(), child.attributes, false)) {
					const open = new HtmlTagNode(child.name, { ...child.attributes }, false, false, child.range);
					const close = child.closingTag ?? new HtmlTagNode(child.name, {}, true);
					out.push(new TextNode(decodeEntities(this.policy.reconstructTag(open)), child.range));
					for (const inner of this.sanitize(child.content.children)) {
						out.push(inner);
					}
					out.push(new TextNode(decodeEntities(this.policy.reconstructTag(close)), close.range));
					continue;
				}

				child.attributes = this.policy.filterAttrs(child.name.toLowerCase(), child.attributes);
			}

			out.push(child);
		}

		return out;
	}
}

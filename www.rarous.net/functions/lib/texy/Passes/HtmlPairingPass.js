/**
 * Pairs passthrough HtmlTagNode open/close tags into HtmlElementNode with
 * real children, turning the tag stream into a tree (transform phase).
 * Port of Texy\Passes\HtmlPairingPass.
 *
 * Pairing is per content container and tolerant: crossed or unmatched tags
 * stay as standalone HtmlTagNode. Void elements are leaves by definition.
 */

import { NodeTraverser } from '../NodeTraverser.js';
import { ContentNode, HtmlElementNode, HtmlTagNode } from '../nodes.js';
import { voidElements } from '../Output/Html/Schema.js';

export class HtmlPairingPass
{
	/** @param {import('../nodes.js').DocumentNode} doc */
	process(doc)
	{
		new NodeTraverser().traverse(doc, node => {
			if (node instanceof ContentNode && node.children.length > 0) {
				node.children = this.pair(node.children);
			}
			return null;
		});
	}


	/** @param {Array} children */
	pair(children)
	{
		const out = [];
		const frames = []; // stack of [open HtmlTagNode, collected children]

		for (const child of children) {
			if (!(child instanceof HtmlTagNode)) {
				this.emit(out, frames, child);
				continue;
			}

			const name = child.name.toLowerCase();

			if (!child.closing && !child.selfClosing && !Object.hasOwn(voidElements, name)) {
				frames.push([child, []]);
				continue;
			}

			if (!child.closing) { // void or self-closing tag is a leaf
				this.emit(out, frames, child);
				continue;
			}

			// closing tag: find matching open frame from the top
			let found = null;
			for (let i = frames.length - 1; i >= 0; i--) {
				if (frames[i][0].name.toLowerCase() === name) {
					found = i;
					break;
				}
			}

			if (found === null) { // stray closing tag
				this.emit(out, frames, child);
				continue;
			}

			// crossed tags above the match cannot be paired - flatten them back
			while (frames.length - 1 > found) {
				this.flatten(out, frames);
			}

			const [tag, collected] = frames.pop();
			this.emit(out, frames, new HtmlElementNode(
				tag.name,
				{ ...tag.attributes },
				new ContentNode(collected),
				child,
				tag.range,
			));
		}

		// unmatched opening tags stay standalone
		while (frames.length > 0) {
			this.flatten(out, frames);
		}

		return out;
	}


	/** Emits node into the innermost open frame, or the output list. */
	emit(out, frames, node)
	{
		if (frames.length > 0) {
			const frame = frames[frames.length - 1];
			frame[1].push(node);
		} else {
			out.push(node);
		}
	}


	/** Pops the innermost frame and re-emits its open tag and children unpaired. */
	flatten(out, frames)
	{
		const [tag, collected] = frames.pop();
		this.emit(out, frames, tag);
		for (const node of collected) {
			this.emit(out, frames, node);
		}
	}
}

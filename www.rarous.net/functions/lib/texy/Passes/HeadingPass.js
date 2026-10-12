/**
 * Balances heading levels, hoists the {toc: ...} style onto the heading node
 * and generates heading IDs (transform phase). Port of Texy\Passes\HeadingPass.
 */

import { HeadingNode, SectionNode } from '../nodes.js';
import { NodeTraverser } from '../NodeTraverser.js';
import { extractText, find } from '../NodeHelpers.js';
import { webalize } from '../helpers.js';
import { HeadingType } from '../nodes.js';

export class HeadingPass
{
	/**
	 * @param {number} top level of the top heading (1..6)
	 * @param {boolean} dynamicBalancing
	 * @param {boolean} generateID
	 * @param {string} idPrefix
	 */
	constructor(top = 1, dynamicBalancing = true, generateID = false, idPrefix = 'toc-')
	{
		this.top = top;
		this.dynamicBalancing = dynamicBalancing;
		this.generateID = generateID;
		this.idPrefix = idPrefix;
	}


	/** @param {import('../nodes.js').DocumentNode} doc */
	process(doc)
	{
		const headings = collectHeadings(doc);
		if (headings.length === 0) {
			return;
		}

		this.balanceLevels(headings);

		const usedID = {};
		for (const node of headings) {
			node.titleOverride = HeadingPass.hoistOverride(node);
			if (!this.generateID) {
				continue;
			}

			if (node.modifier?.id) { // an explicit ID wins and reserves the name
				usedID[node.modifier.id] = true;
				node.id = node.modifier.id;
				continue;
			}

			// runs before typography, so the slug does not depend on it
			const id = HeadingPass.uniqueID(this.idPrefix + webalize(getTitle(node)), usedID);
			usedID[id] = true;
			node.id = id;
		}
	}


	/** @param {HeadingNode[]} headings */
	balanceLevels(headings)
	{
		if (!this.dynamicBalancing) {
			for (const node of headings) {
				node.level = Math.min(6, Math.max(1, node.level + this.top));
			}
			return;
		}

		const map = {};
		let min = 100;

		// collect level information
		for (const node of headings) {
			if (node.type === HeadingType.Surrounded) {
				min = Math.min(node.level, min);
			} else {
				map[node.level] = node.level;
			}
		}

		// top offset for surrounded headings
		const top = this.top - min;

		// sort underlined levels and create mapping
		const sortedLevels = Object.values(map).sort((a, b) => a - b);
		const levelToRank = new Map(sortedLevels.map((level, rank) => [level, rank])); // array_flip: 0-based

		// apply calculated levels
		for (const node of headings) {
			const level = node.type === HeadingType.Surrounded
				? node.level + top
				: levelToRank.get(node.level) + this.top;
			node.level = Math.min(6, Math.max(1, level));
		}
	}


	/**
	 * Moves the {toc: ...} label out of the modifier; it is transport syntax
	 * and must never reach the output.
	 * @param {HeadingNode} node
	 */
	static hoistOverride(node)
	{
		if (!node.modifier || !Object.hasOwn(node.modifier.styles, 'toc')) {
			return null;
		}

		const title = node.modifier.styles.toc;
		delete node.modifier.styles.toc;
		return title;
	}


	/** @param {Object<string, boolean>} usedID */
	static uniqueID(id, usedID)
	{
		if (!Object.hasOwn(usedID, id)) {
			return id;
		}

		let counter = 2;
		while (Object.hasOwn(usedID, id + '-' + counter)) {
			counter++;
		}

		return id + '-' + counter;
	}
}


/**
 * The heading's title: the {toc:} override, else the plain text content.
 * @param {HeadingNode} node
 */
export function getTitle(node)
{
	return node.titleOverride ?? extractText(node).trim();
}


/**
 * Headings in document order, skipping texysource sections (demo sources are
 * not part of the document outline).
 * @param {import('../nodes.js').Node} root
 * @returns {HeadingNode[]}
 */
export function collectHeadings(root)
{
	const headings = [];
	new NodeTraverser().traverse(root, node => {
		if (node instanceof SectionNode && node.type === 'texysource') {
			return NodeTraverser.DontTraverseChildren;
		}

		if (node instanceof HeadingNode) {
			headings.push(node);
		}

		return null;
	});

	return headings;
}

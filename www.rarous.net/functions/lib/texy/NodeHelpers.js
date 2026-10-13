/**
 * Read-only conveniences for finding nodes in the tree (port of
 * Texy\NodeHelpers::find / findFirst).
 */

/**
 * All nodes the filter accepts, in pre-order. Eagerly collected: the
 * generator recursion this replaces costs a generator frame per node.
 * @param {Node} node
 * @param {(node: Node) => boolean}filter
 * @returns {Array<Node>}
 */
export function find(node, filter)
{
	const found = [];
	collect(node, filter, found);
	return found;
}


/** @param {Node} node @param {Array<Node>} found */
function collect(node, filter, found)
{
	if (filter(node)) found.push(node);
	for (const child of node.getChildren()) {
		collect(child, filter, found);
	}
}


/**
 * @param {Node} node
 * @param {(node: Node) => boolean} filter
 * @returns {Array<Node>}
 */
export function findAll(node, filter)
{
	return find(node, filter);
}


/**
 * The first node the filter accepts, pre-order; leaves the tree as soon as
 * one is found.
 * @param {Node} node
 * @param {(node: Node) => boolean} filter
 * @returns {?Node}
 */
export function findFirst(node, filter)
{
	if (filter(node)) return node;
	for (const child of node.getChildren()) {
		const res = findFirst(child, filter);
		if (res !== null) return res;
	}
	return null;
}


/**
 * Extracts plain text content from AST node(s) (port of Helpers::extractText).
 * RawTextNode is visible text too - it is the node code-like content is held
 * in, and it has no children to recurse into.
 * @param {Node} node
 * @returns {string}
 */
export function extractText(node)
{
	if (node.constructor.name === 'TextNode' || node.constructor.name === 'RawTextNode') {
		return node.text;
	}

	let text = '';
	for (const child of node.getChildren()) {
		text += extractText(child);
	}
	return text;
}


/**
 * Shallow copy of an AST node (PHP clone semantics): properties are copied,
 * child arrays and content nodes are shared until explicitly re-assigned.
 * @param {Node} node
 * @returns {Node}
 */
export function cloneNode(node)
{
	return Object.assign(Object.create(Object.getPrototypeOf(node)), node);
}

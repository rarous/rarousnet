/**
 * Read-only conveniences for finding nodes in the tree (port of
 * Texy\NodeHelpers::find / findFirst).
 */

/**
 * @param {Node} node
 * @param {(node: Node) => boolean}filter
 * @returns {Generator<Node>}
 */
export function* find(node, filter)
{
	if (filter(node)) yield node;
	for (const child of node.getChildren()) {
		yield* find(child, filter);
	}
}


/**
 * @param {Node} node
 * @param {(node: Node) => boolean} filter
 * @returns {?Node}
 */
export function* findAll(node, filter)
{
	yield* find(node, filter);
}


export function findFirst(node, filter)
{
	for (const found of find(node, filter)) return found;
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

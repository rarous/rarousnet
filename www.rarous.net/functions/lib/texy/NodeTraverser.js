/**
 * Traverses and transforms AST nodes using visitor pattern (port of
 * Texy\NodeTraverser).
 *
 * Enter/leave callbacks may return: a Node (replaces the current one),
 * DontTraverseChildren (skip children), StopTraversal, RemoveNode, or
 * null/undefined (continue unchanged).
 */

export const DontTraverseChildren = 1;
export const StopTraversal = 2;
export const RemoveNode = 3;

export class NodeTraverser
{
	/**
	 * @param {import('../nodes.js').ContentNode} node
	 * @param {?Function} enter (node) => Node|number|null
	 * @param {?Function} leave (node) => Node|number|null
	 * @returns {?Node}
	 */
	traverse(node, enter = null, leave = null)
	{
		this.enter = enter;
		this.leave = leave;
		this.stop = false;
		return this.traverseNode(node);
	}


	/** @returns {?Node} */
	traverseNode(node)
	{
		let children = true;
		if (this.enter) {
			const res = this.enter(node);
			if (res instanceof Object && typeof res.getChildren === 'function') {
				node = res;
			} else if (res === DontTraverseChildren) {
				children = false;
			} else if (res === StopTraversal) {
				this.stop = true;
				return node;
			} else if (res === RemoveNode) {
				return null;
			}
		}

		if (children) {
			// dispatch on the child-container shape: the fields are mutually
			// exclusive per node class (verified against nodes.js), and the
			// branches preserve the slot order of the reference: for a table
			// the caption precedes the rows, for a figure the image the caption
			if (node.children !== undefined) { // ContentNode
				this.traverseArray(node.children);
			} else if (node.items !== undefined) { // ListNode, DefinitionListNode
				this.traverseArray(node.items);
			} else if (node.cells !== undefined) { // TableRowNode
				this.traverseArray(node.cells);
			} else if (node.rows !== undefined) { // TableNode
				this.traverseChildProperty(node, 'caption');
				if (!this.stop) this.traverseArray(node.rows);
			} else if (node.image !== undefined) { // FigureNode
				this.traverseChildProperty(node, 'image');
				if (!this.stop) this.traverseChildProperty(node, 'caption');
			} else if (node.content !== undefined) { // DocumentNode and most nodes
				this.traverseChildProperty(node, 'content');
			}
		}

		if (!this.stop && this.leave) {
			const res = this.leave(node);
			if (res instanceof Object && typeof res.getChildren === 'function') {
				node = res;
			} else if (res === StopTraversal) {
				this.stop = true;
			} else if (res === RemoveNode) {
				return null;
			}
		}

		return node;
	}


	/**
	 * Traverses a child array in place: removed children are written back as
	 * null and pruned afterwards, compacting in place with no allocation
	 * (PHP walk() semantics).
	 * @param {Array} array
	 */
	traverseArray(array)
	{
		for (const [i, subnode] of array.entries()) {
			if (!subnode) continue;
			const res = this.traverseNode(subnode);
			if (res !== subnode) {
				array[i] = res;
			}
			if (this.stop) break;
		}

		let w = 0;
		for (const item of array) {
			if (item) array[w++] = item;
		}
		if (w !== array.length) array.length = w;
	}


	/**
	 * Traverses one child held in a property, writing a replacement back.
	 * @param {Object} container
	 * @param {string} key
	 */
	traverseChildProperty(container, key)
	{
		const subnode = container[key];
		if (subnode === undefined || subnode === null) return;
		const res = this.traverseNode(subnode);
		if (res !== subnode) {
			container[key] = res;
		}
	}
}

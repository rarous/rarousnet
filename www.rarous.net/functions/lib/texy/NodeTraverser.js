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

/**
 * Child slots of every node shape: [container object, property or index].
 * @param {import('../nodes.js').ContentNode} node
 * @returns {Array<{container: Object, key: string|number}>}
 */
function childSlots(node)
{
	switch (node.constructor.name) {
		case 'DocumentNode':
			return [{ container: node, key: 'content' }];
		case 'ContentNode':
			return node.children.map((child, index) => ({ container: node.children, key: index }));
		case 'FigureNode':
			return [
				{ container: node, key: 'image' },
				...(node.caption !== null ? [{ container: node, key: 'caption' }] : []),
			];
		case 'ListNode':
		case 'DefinitionListNode':
			return node.items.map((item, index) => ({ container: node.items, key: index }));
		case 'TableNode':
			return [
				...(node.caption !== null ? [{ container: node, key: 'caption' }] : []),
				...node.rows.map((row, index) => ({ container: node.rows, key: index })),
			];
		case 'TableRowNode':
			return node.cells.map((cell, index) => ({ container: node.cells, key: index }));
		default:
			// most nodes hold their children in `content`
			return node.content !== undefined
				? [{ container: node, key: 'content' }]
				: [];
	}
}


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
			if (res instanceof Object && res !== null && typeof res.getChildren === 'function') {
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
			for (const slot of childSlots(node)) {
				const subnode = slot.container[slot.key];
				if (subnode === undefined || subnode === null) continue;
				const res = this.traverseNode(subnode);
				if (res !== subnode) {
					slot.container[slot.key] = res;
				}
				if (this.stop) break;
			}
			// array containers prune removed items (PHP walk() semantics)
			for (const array of [node.children, node.items, node.rows, node.cells]) {
				if (Array.isArray(array)) {
					const filtered = array.filter(item => item !== null && item !== undefined);
					if (filtered.length !== array.length) {
						array.length = 0;
						array.push(...filtered);
					}
				}
			}
		}

		if (!this.stop && this.leave) {
			const res = this.leave(node);
			if (res instanceof Object && res !== null && typeof res.getChildren === 'function') {
				node = res;
			} else if (res === StopTraversal) {
				this.stop = true;
			} else if (res === RemoveNode) {
				return null;
			}
		}

		return node;
	}
}

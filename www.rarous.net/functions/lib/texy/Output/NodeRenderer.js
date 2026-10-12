/**
 * Base for AST output generators (port of Texy\Output\NodeRenderer):
 * dispatch by node class with extensible, chainable handlers.
 * Serialization, escaping and configuration are format-specific and belong
 * to subclasses.
 */

/**
 * @template T
 */
export class NodeRenderer
{
	constructor()
	{
		/** @type {Map<Function, Function>} node class => handler */
		this.handlers = new Map();

		/** @type {Map<Function, ?Function>} lookups incl. inherited ones */
		this.resolved = new Map();
	}


	/**
	 * Registers how a node class is rendered. Renderers for one class form
	 * a chain, called from the last registered to the first, with the
	 * built-in one at the end. Return null to pass the node on to the
	 * previous renderer.
	 * @param {Function} nodeClass
	 * @param {Function} renderer fn(node, self, previous): mixed
	 */
	addRenderer(nodeClass, renderer)
	{
		const previous = this.findRenderer(nodeClass);
		this.handlers.set(nodeClass, (node, self) => {
			const result = renderer(node, self, previous);
			if (result !== null && result !== undefined) {
				return result;
			}
			if (previous === null) {
				throw new Error('No renderer for node class ' + node.constructor.name);
			}
			return previous(node, self);
		});
		this.resolved = new Map();
	}


	/**
	 * Renders a single node via its registered renderer.
	 * @returns {T}
	 */
	renderNode(node)
	{
		// exact match first - the common case must not pay for the
		// inheritance walk
		const renderer = this.handlers.has(node.constructor)
			? this.handlers.get(node.constructor)
			: this.findRenderer(node.constructor);
		return renderer
			? renderer(node, this)
			: this.renderUnknown(node);
	}


	/**
	 * Renders a node this format has no renderer for: degrades to the
	 * node's content, keeping the document renderable everywhere.
	 * @returns {T}
	 */
	renderUnknown(node) // abstract
	{
		throw new Error('renderUnknown not implemented');
	}


	/**
	 * Renders the node's children, for renderUnknown() implementations.
	 * @returns {Array<T>}
	 */
	renderChildrenOf(node)
	{
		const result = [];
		for (const child of node.getChildren()) {
			result.push(this.renderNode(child));
		}

		return result;
	}


	/**
	 * Finds the renderer for a node class, falling back to ones registered
	 * for its ancestors, so that a subclass of a built-in node renders
	 * without its own handler.
	 * @param {Function} nodeClass
	 * @returns {?Function}
	 */
	findRenderer(nodeClass)
	{
		if (this.resolved.has(nodeClass)) {
			return this.resolved.get(nodeClass);
		}

		let handler = this.handlers.get(nodeClass) ?? null;
		if (handler === null) {
			let proto = Object.getPrototypeOf(nodeClass);
			while (proto && proto !== Object.prototype) {
				if (this.handlers.has(proto)) {
					handler = this.handlers.get(proto);
					break;
				}
				proto = Object.getPrototypeOf(proto);
			}
		}

		this.resolved.set(nodeClass, handler);
		return handler;
	}
}

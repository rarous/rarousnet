/**
 * Processes {{macro}} script commands (port of Texy\Modules\DirectiveModule).
 *
 * Directive dispatching to named handlers is a transform pass in the
 * reference (DirectiveModule::processDirectives); this port covers the
 * parse phase, so the module only registers the syntax and exposes
 * addDirective for consumers running their own passes.
 */

import { Module } from './Module.js';
import { Syntax } from '../Syntax.js';
import { DirectiveNode } from '../nodes.js';
import { NodeTraverser, RemoveNode } from '../NodeTraverser.js';
import { toLower } from '../helpers.js';

export class DirectiveModule extends Module
{
	constructor(texy)
	{
		super();
		/** @type {Object<string, Function>} name -> handler(value, args, node) */
		this.handlers = {};
		this.fallback = null;
		this.texy = texy;
	}


	/**
	 * Registers a directive handler (case-insensitive name).
	 * @param {string} name
	 * @param {Function} handler
	 */
	addDirective(name, handler)
	{
		this.handlers[name.toLowerCase()] = handler;
	}


	beforeParse()
	{
		this.texy.addLineSyntax(
			Syntax.Directive,
			String.raw`~
				\{\{
				((?:
					[^}]++ |   # content not containing }
					}          # or single }
				)+)
				}}
			~Ux`,
			(context, matches, offsets) => this.parse(context, matches, offsets),
		);
	}


	/**
	 * Parses {{macro}}.
	 * @param {import('../Parsing/ParseContext.js').ParseContext} context
	 * @param {Array<?string>} matches
	 * @param {Array<?number>} offsets
	 * @returns {?DirectiveNode}
	 */
	parse(context, matches, offsets)
	{
		return matches[1].trim() === ''
			? null
			: new DirectiveNode(matches[1], { offset: offsets[0], length: matches[0].length });
	}


	/**
	 * Dispatches directives to their named handlers and runs as the first
	 * transform pass; a handler may still change configuration the later
	 * passes depend on. A handled directive is removed unless the handler
	 * returns a replacement. {{texy: ...}} consumes its args into
	 * document.meta.
	 * @param {import('../nodes.js').DocumentNode} doc
	 */
	processDirectives(doc)
	{
		new NodeTraverser().traverse(doc, node => {
			if (!(node instanceof DirectiveNode)) {
				return null;
			}

			const parsed = node.parseContent();
			if (parsed.name === 'texy' && parsed.args.length > 0) {
				for (const arg of parsed.args) {
					doc.meta[arg] = true;
				}
				return RemoveNode;
			}

			const handler = this.handlers[toLower(parsed.name)] ?? this.fallback;
			if (handler === null || handler === undefined) {
				return null;
			}
			return handler(parsed.value, parsed.args, node) ?? RemoveNode;
		});
	}

}

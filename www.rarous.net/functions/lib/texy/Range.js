/**
 * Source range of an AST node.
 *
 * Offsets are UTF-16 code-unit indices into the normalized source string
 * (JS-native). The PHP reference counts bytes; the difference only matters
 * for non-ASCII text and is bridged by the test-suite dumpers. All offsets
 * in the engine are exact after parsing.
 */
export class Range
{
	/**
	 * @param {number} offset 0-based offset, in UTF-16 code units
	 * @param {number} length of the range, in UTF-16 code units
	 */
	constructor(offset, length)
	{
		this.offset = offset;
		this.length = length;
	}
}


/**
 * The common base of all AST nodes.
 */
export class Node
{
	/** @type {?Range} */
	range = null;
}

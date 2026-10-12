/**
 * Piece of ready-made HTML in the rendered tree (port of
 * Texy\Output\Html\Raw): it bypasses text escaping and is tokenized by
 * the well-forming engine as-is.
 */

export class Raw
{
	/**
	 * @param {string} html
	 */
	constructor(html)
	{
		this.html = html;
	}
}

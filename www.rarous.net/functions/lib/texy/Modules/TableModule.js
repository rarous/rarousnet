/**
 * Table module (port of Texy\Modules\TableModule).
 */

import { Module } from './Module.js';
import { Syntax } from '../Syntax.js';
import { ModifierHVAlign } from '../Patterns.js';
import { Modifier } from '../Modifier.js';
import { ContentNode, TableCellNode, TableNode, TableRowNode, TextNode } from '../nodes.js';
import { OffsetMap } from '../Parsing/OffsetMap.js';
import { match, replace } from '../Regexp.js';

export class TableModule extends Module
{
	constructor(texy)
	{
		super();
		this.texy = texy;
		this.disableTables = false;
	}


	beforeParse()
	{
		this.texy.addBlockSyntax(
			Syntax.Table,
			String.raw`~^
				(?:` + ModifierHVAlign + String.raw`\n)? # modifier (1)
				\|                                   # table start
				.*                                   # content
			$~mUx`,
			(context, matches, offsets) => this.parseTable(context, matches, offsets),
		);
	}


	/**
	 * Parses tables.
	 */
	parseTable(context, matches, offsets)
	{
		if (this.disableTables) return null;

		const [, mMod] = matches;

		const startOffset = offsets[0];

		context.getBlockParser().moveBackward();

		const caption = this.parseCaption(context);

		const rows = [];
		let isHead = false;
		/** @type {Object<number, {node: TableCellNode, text: string}>} */
		let prevRow = {};
		const colModifier = {};
		let colCounter = 0;
		/** @type {Map<TableCellNode, Array<{content: string, offset: number}>>} */
		const cellTexts = new Map();

		for (;;) {
			let lineMatches;

			if (context.getBlockParser().next(String.raw`~^ \| ([=-]) [+|=-]{2,} $~Umx`) !== null) {
				isHead = !isHead;
				prevRow = {};
				continue;
			}

			lineMatches = context.getBlockParser().next(
				String.raw`~^ ( \| ) (.*) (?: | \| [ \t]* ` + ModifierHVAlign + String.raw`?)$~Ux`,
			);
			if (lineMatches !== null) {
				// smarter head detection: if the first row is followed by a separator line, it is a head row
				if (rows.length === 0 && !isHead
					&& context.getBlockParser().next(String.raw`~^ \| [=-] [+|=-]{2,} $~Umx`) !== null) {
					isHead = true;
					context.getBlockParser().moveBackward();
				}

				const mContent = lineMatches.matches[2];
				const mRowMod = lineMatches.matches[3];
				const lineBaseOffset = lineMatches.offsets[2]; // content after first |

				const cells = [];
				let content = mContent.replaceAll('\\|', '\x13');
				content = replace(content, String.raw`~(\[[^]]*)\|~`, '$1\x13');

				let col = 0;
				let lastCell = null;
				let cellOffset = 0; // position within $content

				let m;
				for (const cell of content.split('|')) {
					const originalCell = cell;
					const unescapedCell = cell.replaceAll('\x13', '|');
					const cellAbsoluteOffset = lineBaseOffset + cellOffset;

					// rowSpan: ^ at end of cell or cell is just ^
					if (prevRow[col] !== undefined
						&& (m = match(unescapedCell, String.raw`~\^[ \t]*$|\*??(.*)[ \t]+\^$~AU`)) !== null) {
						prevRow[col].node.rowspan++;
						const cellText = m.matches[1] ?? '';
						const cellTextOffset = m.offsets[1] !== null && m.offsets[1] >= 0
							? cellAbsoluteOffset + m.offsets[1]
							: cellAbsoluteOffset;
						// Append text to the cell above
						const lines = cellTexts.get(prevRow[col].node);
						lines.push({ content: String(cellText), offset: cellTextOffset });
						cellTexts.set(prevRow[col].node, lines);
						col += prevRow[col].node.colspan;
						lastCell = null;
						cellOffset += originalCell.length + 1; // +1 for |
						continue;
					}

					// colSpan: empty cell extends previous cell
					if (unescapedCell === '' && lastCell !== null) {
						lastCell.colspan++;
						delete prevRow[col];
						col++;
						cellOffset += originalCell.length + 1;
						continue;
					}

					// common cell
					const cellMatches = match(unescapedCell, String.raw`~
						( \*?? )                          # head mark (1)
						[ \t]*
						` + ModifierHVAlign + String.raw`??   # modifier (2)
						(.*)                              # content (3)
						` + ModifierHVAlign + String.raw`?    # modifier (4)
						[ \t]*
					$~AUx`);

					if (cellMatches) {
						const mHead = cellMatches.matches[1];
						const mModCol = cellMatches.matches[2];
						const mCellContent = cellMatches.matches[3];
						const mCellContentOffset = cellMatches.offsets[3];
						const mCellMod = cellMatches.matches[4];

						const cellIsHeader = isHead || (mHead === '*');

						// column modifier inheritance
						if (mModCol) {
							colModifier[col] = Modifier.parse(mModCol, cellMatches.offsets[2] >= 0 ? cellAbsoluteOffset + cellMatches.offsets[2] : null);
						}
						const cellMod = colModifier[col] ? colModifier[col].clone() : new Modifier;
						cellMod.setProperties(mCellMod);

						// Calculate absolute offset of cell content
						const contentAbsoluteOffset = cellAbsoluteOffset + mCellContentOffset;

						// Create cell node - text will be parsed later
						lastCell = new TableCellNode(new ContentNode(), 1, 1, cellIsHeader, cellMod,
							{ offset: cellAbsoluteOffset, length: originalCell.length });
						cells.push(lastCell);
						cellTexts.set(lastCell, [{ content: mCellContent, offset: contentAbsoluteOffset }]);
						prevRow[col] = { node: lastCell, text: mCellContent };
						col++;
					}

					cellOffset += originalCell.length + 1; // +1 for |
				}

				// even up with empty cells
				while (col < colCounter) {
					const cellMod = colModifier[col] ? colModifier[col].clone() : new Modifier;
					const emptyCell = new TableCellNode(new ContentNode(), 1, 1, isHead, cellMod);
					cells.push(emptyCell);
					cellTexts.set(emptyCell, [{ content: '', offset: 0 }]);
					prevRow[col] = { node: emptyCell, text: '' };
					col++;
				}

				colCounter = col;

				if (cells.length > 0) {
					const rowMod = Modifier.parse(mRowMod, lineMatches.offsets[3] ?? null);
					rows.push(new TableRowNode(cells, isHead, rowMod,
						{ offset: lineMatches.offsets[0], length: lineMatches.length }));
				} else {
					// redundant row - decrement rowspan
					for (const item of Object.values(prevRow)) {
						item.node.rowspan--;
					}
				}

				continue;
			}

			break;
		}

		if (rows.length === 0) return null;

		// Parse cell text content after rowspan/colspan is determined
		for (const row of rows) {
			for (const cell of row.cells) {
				if (cellTexts.has(cell)) {
					let lines = cellTexts.get(cell);

					// right-trim: drop blank trailing fragments, trim the last one
					while (lines.length > 0 && lines[lines.length - 1].content.replace(/[\t ]+$/, '').replace(/\n/g, ' ').trim() === '') {
						lines.pop();
					}
					if (lines.length > 0) {
						lines = [...lines];
						lines[lines.length - 1] = {
							content: lines[lines.length - 1].content.replace(/[\t ]+$/, ''),
							offset: lines[lines.length - 1].offset,
						};
					}

					if (lines.length > 1) {
						// multiline - parse as block (disable nested tables)
						const [outdented, map] = OffsetMap.outdentLines(lines);
						this.disableTables = true;
						let parsed;
						try {
							parsed = context.parseBlock(outdented);
						} finally {
							this.disableTables = false;
						}
						map.applyTo(parsed);
						cell.content.children = parsed.children;
					} else {
						// single line - parse as inline
						const text = lines[0]?.content ?? '';
						const trimmed = text.replace(/^[\t ]+/, '');
						const trimOffset = text.length - trimmed.length;
						const baseOffset = (lines[0]?.offset ?? 0) + trimOffset;
						cell.content.children = context.parseInline(trimmed, baseOffset).children;
					}

					// empty cell gets &nbsp;
					if (cell.content.children.length === 0) {
						cell.content.children = [new TextNode('\u00A0')];
					}
				}
			}
		}

		return new TableNode(
			rows,
			Modifier.parse(mMod, offsets[1]),
			{ offset: startOffset, length: matches[0].length },
			caption,
		);
	}


	/**
	 * Parses the optional caption line |## Text preceding the first row.
	 */
	parseCaption(context)
	{
		const matches = context.getBlockParser().next(
			String.raw`~^
				\|                            # opening pipe
				( [\#=] ){2,}  (?! [|\#=+] )  # opening chars (1)
				(.+)                          # caption (2)
				\1*                           # matching closing chars
				\|? [ \t]*                    # optional closing pipe and spaces
			$~Umx`,
		);

		if (matches === null || matches.matches[2] === null || matches.offsets[2] === null) return null;

		// space after the opening chars is a separator, not content
		const text = matches.matches[2].replace(/[\t ]+$/, '');
		const trimmed = text.replace(/^[\t ]+/, '');
		const offset = matches.offsets[2] + text.length - trimmed.length;

		return context.parseInline(trimmed, offset);
	}
}

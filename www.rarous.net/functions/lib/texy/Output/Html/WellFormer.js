/**
 * Call-driven well-forming and formatting engine (port of
 * Texy\Output\Html\WellFormer).
 *
 * Fixes pairing, content model and nesting of the rendered tree, produces
 * indented, wrapped HTML. The output buffer is a list of segments;
 * whitespace fix-ups that the original string machine encoded with control
 * bytes are explicit operations here. Segment boundaries reproduce the
 * byte-level quirks of the reference:
 * - Pre segments (preserved text) are exempt from trims and wrapping;
 * - a BarrierEat marks a former \x07 site: blocks trims, transparent to
 *   back-tab eating;
 * - a BarrierClose marks a former \x08 site: blocks trims and back-tab
 *   eating.
 */

import { Element } from './Element.js';
import { Raw } from './Raw.js';
import { Text, childContent, flowContent, hasOptionalEnd, inlineElements, isKnown, prohibitedAncestors, voidElements } from './Schema.js';
import { escapeHtml, freezeSpaces, unfreezeSpaces } from '../../helpers.js';
import { matchAll, replace } from '../../Regexp.js';
import { wordwrap } from '../../wordwrap.js';

const Normal = 0;
const Pre = 1;
const BarrierEat = 2;
const BarrierClose = 3;

/** Strips trailing characters from a string (PHP rtrim with a char list). */
function rtrim(s, chars)
{
	const set = chars.split('').map(c => c.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')).join('');
	return s.replace(new RegExp('[' + set + ']+$'), '');
}

/** Do the two [segmentCount, offset] positions match (PHP === on arrays)? */
function samePos(a, b)
{
	return a !== null && a[0] === b[0] && a[1] === b[1];
}

export class WellFormer
{
	/**
	 * @param {import('./Config.js').Config} config
	 */
	constructor(config)
	{
		this.config = config;
		this.segs = [];
		this.textBuffer = '';
		/** @type {[number, number]} text emitted since the last tag */
		this.fragmentStart = [0, 0];
		/** eat spaces immediately following the last emitted tag */
		this.eatSpaces = false;
		/** @type {?[number, number]} position right after the last soft newline */
		this.softMark = null;
		/** the soft newline at softMark has already absorbed a second one */
		this.softCollapsed = false;
		/** indent space counter */
		this.space = config.baseIndent;
		/** @type {Object<string, number>} */
		this.tagUsed = {};
		/** @type {Array<{tag: string, open: ?string, close: ?string, closeIndent: ?number, dtdContent: Map<string, number>, indent: number}>} newest-first */
		this.tagStack = [];
		this.baseDTD = flowContent;
	}


	/**
	 * Feeds a rendered tree node: tags, display text and raw HTML islands.
	 * @param {Element|Raw|string} child
	 */
	feed(child)
	{
		if (child instanceof Raw) {
			this.raw(child.html);

		} else if (!(child instanceof Element)) {
			this.text(child);

		} else if (child.name === null || child.name === '') {
			for (const inner of child.children) {
				this.feed(inner); // transparent wrapper
			}
		} else {
			this.startTag(child.name, Element.formatAttrs(child.attrs), child.isVoid);
			if (!child.isVoid) {
				for (const inner of child.children) {
					this.feed(inner);
				}

				this.endTag(child.name);
			}
		}
	}


	/**
	 * Plain (unescaped) text.
	 * @param {string} s
	 */
	text(s)
	{
		this.escapedText(escapeHtml(s));
	}


	/**
	 * Raw HTML fragment: tokenized by the same grammar the reference used.
	 * Unmatched pieces (stray "<", trailing text) keep their position.
	 * @param {string} html
	 */
	raw(html)
	{
		let offset = 0;
		const matches = matchAll(html, String.raw`~
			( [^<]*+ )
			< (?: (!--.*--) | (/?) ([a-z][a-z0-9._:-]*) (|[ \n].*) \s* (/?) ) >
		~Uisx`);

		for (const m of matches) {
			const gap = html.slice(offset, m.offsets[0] - offset);
			if (gap !== '') { // unmatched garbage bypassed the parser untouched
				this.flushText();
				this.append(gap);
				this.endFragment();
			}

			offset = m.offsets[0] + m.matches[0].length;

			const mText = m.matches[1] ?? '';
			const mComment = m.matches[2];
			const mEnd = m.matches[3];
			const mTag = m.matches[4];
			const mEmpty = m.matches[6];

			if (mText !== '') {
				this.escapedText(mText);
			}

			if (mComment) {
				this.comment(mComment);
			} else if (mTag) {
				const empty = Boolean(mEmpty) || voidElements.has(mTag);
				if (empty && mEnd) { // bad tag (closing a void element); still ends the text fragment
					this.flushText();
					this.endFragment();
				} else if (mEnd) {
					this.endTag(mTag);
				} else {
					this.startTag(mTag, m.matches[5] ?? '', empty);
				}
			}
		}

		const rest = html.slice(offset);
		if (rest !== '') {
			this.escapedText(rest);
		}
	}


	/**
	 * HTML comment (inner content in the form `!-- ... --`).
	 * @param {string} inner
	 */
	comment(inner)
	{
		this.flushText();
		this.append('<');
		this.appendPre(inner);
		this.append('>');
		this.endFragment();
	}


	/**
	 * Already escaped text content (internal and raw-fragment path).
	 * Buffered until the next tag: whitespace shrinking must span the whole
	 * inter-tag fragment, not individual text nodes.
	 * @param {string} s
	 */
	escapedText(s)
	{
		this.textBuffer += s;
	}


	flushText()
	{
		const s = this.textBuffer;
		if (s === '') {
			return;
		}

		this.textBuffer = '';
		const item = this.tagStack[0];
		if (item && !item.dtdContent.has(Text)) { // text not allowed?
			return;
		}

		if (this.openPreserving()) {
			this.appendPre(s); // inside pre & textarea preserve spaces verbatim
		} else {
			this.append(replace(s, '~[ \n]+~', ' ')); // otherwise shrink multiple spaces
		}
	}


	/**
	 * Is a tag whose content keeps whitespace verbatim currently open?
	 */
	openPreserving()
	{
		return Object.keys(this.tagUsed).some(tag => this.tagUsed[tag] > 0 && this.config.preserveSpaces.includes(tag));
	}


	/**
	 * @param {string} tag
	 * @param {string} attr
	 * @param {boolean} empty void element
	 */
	startTag(tag, attr, empty)
	{
		this.flushText();
		let dtdContent = this.baseDTD;

		if (!isKnown(tag)) {
			// Unknown tags (custom elements) are always allowed and inherit the
			// content model from the parent - transparent wrappers
			let allowed = true;
			const item = this.tagStack[0];
			if (item) {
				dtdContent = item.dtdContent;
			}
			this.startTagBody(tag, attr, empty, allowed, dtdContent);
			return;
		}

		// Known HTML tags must respect content model rules
		dtdContent = this.closeOptionalTags(tag, dtdContent);
		let allowed = dtdContent.has(tag);

		// Deep prohibitions: certain elements cannot be nested anywhere inside
		// others (e.g., <a> cannot contain <a> or <button> at any depth)
		if (allowed) {
			for (const pTag of prohibitedAncestors(tag)) {
				if ((this.tagUsed[pTag] ?? 0) > 0) {
					allowed = false;
					break;
				}
			}
		}

		this.startTagBody(tag, attr, empty, allowed, dtdContent);
	}


	/**
	 * @param {string} tag
	 * @param {string} attr
	 * @param {boolean} empty
	 * @param {boolean} allowed
	 * @param {Map<string, number>} dtdContent
	 */
	startTagBody(tag, attr, empty, allowed, dtdContent)
	{
		// Void elements don't go on the stack - they have no closing tag
		if (empty) {
			if (!allowed) {
				return;
			}

			const indent = this.config.indent && !this.openPreserving();

			if (indent && tag === 'br') {
				// trim only the current fragment, not previously emitted markup
				this.stripTail(" \t\n\r\0\x0B", this.fragmentStart);
				this.append(`<${tag}${attr}>\n${'\t'.repeat(Math.max(0, this.space - 1))}`);
				this.eatBarrier();

			} else if (indent && !inlineElements.has(tag)) {
				const tabs = '\t'.repeat(this.space);
				this.softNewline();
				this.append(`${tabs}<${tag}${attr}>`);
				this.softNewline();
				this.append(tabs);

			} else {
				this.append(`<${tag}${attr}>`);
			}

			this.endFragment();
			return;
		}

		let open = null;
		let close = null;
		let closeIndent = null;
		let indent = 0;

		if (allowed) {
			open = `<${tag}${attr}>`;
			close = `</${tag}>`;
			dtdContent = isKnown(tag)
				? childContent(tag, dtdContent)
				: dtdContent; // unknown tags keep the inherited content model

			// Format output with indentation for block elements
			if (this.config.indent && !inlineElements.has(tag)) {
				closeIndent = this.space;
				this.append(`\n${'\t'.repeat(this.space++)}${open}`);
				this.eatBarrier();
				indent = 1;
			} else {
				this.append(open);
			}
		}

		// Push tag to stack for tracking open elements
		this.tagStack.unshift({ tag, open, close, closeIndent, dtdContent, indent });
		this.tagUsed[tag] = (this.tagUsed[tag] ?? 0) + 1;
		this.endFragment();
	}


	/**
	 * @param {string} tag
	 */
	endTag(tag)
	{
		this.flushText();
		try {
			this.processEndTag(tag);
		} finally {
			this.endFragment();
		}
	}


	/**
	 * @param {string} tag
	 */
	processEndTag(tag)
	{
		// has start tag?
		if (!(this.tagUsed[tag] > 0)) {
			return;
		}

		// autoclose tags
		const tmp = [];
		let back = true;
		let removed = 0;
		for (const item of [...this.tagStack]) {
			this.emitClose(item);
			this.space -= item.indent;
			this.tagUsed[item.tag]--;
			back = back && inlineElements.has(item.tag);
			removed++;
			if (item.tag === tag) {
				break;
			}

			tmp.unshift(item);
		}

		this.tagStack.splice(0, removed);

		if (!back || tmp.length === 0) {
			return;
		}

		// allowed-check
		const item = this.tagStack[0];
		const dtdContent = item ? item.dtdContent : this.baseDTD;
		if (!dtdContent.has(tmp[0].tag)) {
			return;
		}

		// autoopen tags
		for (const reopens of tmp) {
			if (reopens.open !== null) {
				this.append(reopens.open);
			}
			this.space += reopens.indent;
			this.tagUsed[reopens.tag]++;
			this.tagStack.unshift(reopens);
		}
	}


	/**
	 * Emits the closing tag of a stack frame; block closes eat the preceding
	 * indentation tab and re-indent for the parent.
	 * @param {{tag: string, open: ?string, close: ?string, closeIndent: ?number, dtdContent: Map<string, number>, indent: number}} item
	 */
	emitClose(item)
	{
		if (item.close === null) {
			return;
		}

		if (item.closeIndent !== null) {
			this.backtabEat();
			this.segs.push([BarrierClose, '']);
			this.append(`${item.close}\n${'\t'.repeat(item.closeIndent)}`);
		} else {
			this.append(item.close);
		}
	}


	/********************* output buffer operations ****************/


	/**
	 * Appends markup/text to the buffer, consuming leading spaces while the
	 * eat-spaces mode (set right after an indented open tag or <br>) is on.
	 * @param {string} s
	 */
	append(s)
	{
		if (s === '') {
			return;
		}

		if (this.eatSpaces) {
			s = s.replace(/^ +/, '');
			if (s === '') {
				return; // fully eaten, keep eating
			}
			this.eatSpaces = false;
		}

		const last = this.segs[this.segs.length - 1];
		if (last && last[0] === Normal) {
			last[1] += s;
		} else {
			this.segs.push([Normal, s]);
		}
	}


	/**
	 * Marks a former \x07 site: blocks the final right-trim across it and
	 * turns on eating of the spaces that follow.
	 */
	eatBarrier()
	{
		this.segs.push([BarrierEat, '']);
		this.eatSpaces = true;
	}


	/**
	 * Appends preserved text: exempt from space eating, trims and wrapping.
	 * @param {string} s
	 */
	appendPre(s)
	{
		if (s === '') {
			return;
		}

		this.eatSpaces = false; // preserved content is not eaten
		this.segs.push([Pre, s]);
	}


	/**
	 * Soft newline around empty block voids (former \r): trailing tabs and
	 * spaces before it are trimmed, and two adjacent soft newlines collapse
	 * into a single "\n".
	 */
	softNewline()
	{
		this.stripTail(' \t');

		if (samePos(this.softMark, this.endPos()) && !this.softCollapsed) {
			this.softCollapsed = true;
			return;
		}

		this.append("\n");
		this.softMark = this.endPos();
		this.softCollapsed = false;
	}


	/**
	 * Back-tab: removes spaces and at most one tab immediately before a
	 * block closing tag. Passes through eat-barriers, stops at close
	 * barriers and preserved text.
	 */
	backtabEat()
	{
		for (let i = this.segs.length - 1; i >= 0; i--) {
			const type = this.segs[i][0];
			if (type === BarrierEat || (type === Normal && this.segs[i][1] === '')) {
				continue; // transparent
			}
			if (type === Normal) {
				this.segs[i][1] = this.segs[i][1].replace(/\t? *$/, '');
			}
			return; // eaten chars must be contiguous - one segment only
		}
	}


	/**
	 * Strips trailing characters from the buffer, walking segments backward;
	 * stops at any barrier or preserved segment, and at limit (fragment start).
	 * @param {string} chars
	 * @param {?[number, number]} limit
	 */
	stripTail(chars, limit = null)
	{
		for (let i = this.segs.length - 1; i >= 0; i--) {
			if (this.segs[i][0] !== Normal) {
				return;
			}

			const s = this.segs[i][1];
			if (limit !== null && limit[0] - 1 === i) { // fragment starts inside this segment
				this.segs[i][1] = s.slice(0, limit[1]) + rtrim(s.slice(limit[1]), chars);
				return;
			}
			if (limit !== null && limit[0] - 1 > i) {
				return; // before the fragment entirely
			}

			const t = rtrim(s, chars);
			this.segs[i][1] = t;
			if (t !== '') {
				return;
			}
		}
	}


	/**
	 * @returns {[number, number]}
	 */
	endPos()
	{
		const last = this.segs[this.segs.length - 1];
		return [this.segs.length, last ? last[1].length : 0];
	}


	endFragment()
	{
		this.fragmentStart = this.endPos();
	}


	/**
	 * Closes stack frames whose content model cannot host the incoming tag,
	 * returning the content model the tag should be checked against.
	 * @param {string} tag
	 * @param {Map<string, number>} dtdContent
	 * @returns {Map<string, number>}
	 */
	closeOptionalTags(tag, dtdContent)
	{
		let removed = 0;
		for (const item of [...this.tagStack]) {
			// is tag allowed here?
			dtdContent = item.dtdContent;
			if (dtdContent.has(tag)) {
				break;
			}

			// auto-close hidden, optional and inline tags
			if (item.close !== null
				&& !hasOptionalEnd(item.tag)
				&& !inlineElements.has(item.tag)
			) {
				break;
			}

			// close it
			this.emitClose(item);
			this.space -= item.indent;
			this.tagUsed[item.tag]--;
			removed++;
			dtdContent = this.baseDTD;
		}

		if (removed) {
			this.tagStack.splice(0, removed);
		}

		return dtdContent;
	}


	/**
	 * Flushes open tags and finalizes the output (trim, indentation cleanup,
	 * line wrapping).
	 * @returns {string}
	 */
	finish()
	{
		this.flushText();

		// empty out stack
		for (const item of [...this.tagStack]) {
			this.emitClose(item);
		}

		this.tagStack = [];
		this.tagUsed = {};

		// right trim inside normal segments; barriers and preserved text
		// interrupt the [\t ]+ runs exactly like the control bytes did
		const wrap = this.config.lineWrap > 0;
		let s = '';
		const lastIndex = this.segs.length - 1;
		for (const [i, [type, text]] of this.segs.entries()) {
			if (type === Pre) {
				// wordwrap must not break inside preserved text - encode its
				// whitespace as non-breakable for the duration of the wrap
				s += wrap ? freezeSpaces(text) : text;
			} else if (type === Normal) {
				let t = replace(text, String.raw`~[\t ]+(?=\n)~`, '');
				if (i === lastIndex) {
					t = replace(t, String.raw`~[\t ]+\z~`, '');
				}
				s += t;
			}
		}

		this.segs = [];
		this.fragmentStart = [0, 0];
		this.eatSpaces = false;
		this.softMark = null;
		this.softCollapsed = false;

		// line wrap
		if (wrap) {
			s = replace(s, '~^(\t*)(.*)$~m', m => m[1] + wordwrap(m[2], this.config.lineWrap, "\n" + m[1]));
		}

		// unfreeze attribute values (and wrap-protected preserved text)
		return unfreezeSpaces(s);
	}
}

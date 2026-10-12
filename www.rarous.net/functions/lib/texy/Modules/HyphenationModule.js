/**
 * Breaks long words with soft hyphens for better line wrapping (port of
 * Texy\Modules\HyphenationModule, the `longwords` feature).
 */

import { matchAll, replace } from '../Regexp.js';
import { Syntax } from '../Syntax.js';
import { Module } from './Module.js';

const Dont = 0; // don't hyphenate
const Here = 1; // hyphenate here
const After = 2; // hyphenate after

/** Words longer than this many characters are not hyphenated at all. */
const SafeLimit = 1000;


export class HyphenationModule extends Module
{
	/**
	 * @param {import('../Texy.js').Texy} texy
	 */
	constructor(texy)
	{
		super();
		this.texy = texy;

		/** words longer than this many characters get hyphenation hints */
		this.wordLimit = 20;

		this.consonants = new Set([
			'b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'q', 'r', 's', 't', 'v', 'w', 'x', 'z',
			'B', 'C', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'V', 'W', 'X', 'Z',
			'č', 'ď', 'ň', 'ř', 'š', 'ť', 'ž', // Czech
			'Č', 'Ď', 'Ň', 'Ř', 'Š', 'Ť', 'Ž',
		]);

		this.vowels = new Set([
			'a', 'e', 'i', 'o', 'u', 'y',
			'A', 'E', 'I', 'O', 'U', 'Y',
			'á', 'é', 'ě', 'í', 'ó', 'ú', 'ů', 'ý', // Czech
			'Á', 'É', 'Ě', 'Í', 'Ó', 'Ú', 'Ů', 'Ý',
		]);

		this.before_r = new Set([
			'b', 'B', 'c', 'C', 'd', 'D', 'f', 'F', 'g', 'G', 'k', 'K', 'p', 'P', 'r', 'R', 't', 'T', 'v', 'V',
			'č', 'Č', 'ď', 'Ď', 'ř', 'Ř', 'ť', 'Ť', // Czech
		]);

		this.before_l = new Set([
			'b', 'B', 'c', 'C', 'd', 'D', 'f', 'F', 'g', 'G', 'k', 'K', 'l', 'L', 'p', 'P', 't', 'T', 'v', 'V',
			'č', 'Č', 'ď', 'Ď', 'ť', 'Ť', // Czech
		]);

		this.before_h = new Set(['c', 'C', 's', 'S']);

		this.doubleVowels = new Set(['a', 'A', 'o', 'O']);

		if (texy.allowed[Syntax.Hyphenation] === undefined) {
			texy.allowed[Syntax.Hyphenation] = true;
		}
	}


	/**
	 * Adds soft hyphens to long words.
	 * @param {string} text
	 * @returns {string}
	 */
	postLine(text)
	{
		// \x15 (protected text) and \x16 (replaced content) break words,
		// \x17 (markup boundary) is transparent - see the TextRunPass image alphabet
		return replace(
			text,
			String.raw`~[^ \n\t\x15\x16\x{2013}\x{2014}\x{ad}-]{` + this.wordLimit + ',}~',
			m => this.pattern(m[0]),
		);
	}


	/**
	 * Parses long words.
	 * @param {string} mWord
	 * @returns {string}
	 */
	pattern(mWord)
	{
		if ([...mWord].length > SafeLimit) {
			return mWord;
		}

		// a run of image marker bytes counts as one pseudo-character
		const chars = matchAll(mWord, String.raw`~[\x15-\x17]+|.~`).map(m => m.matches[0]);
		if (chars.length < this.wordLimit) {
			return mWord;
		}

		const s = [''];
		const trans = [-1];
		chars.forEach((char, key) => {
			if (char.charCodeAt(0) < 32) { // marker bytes
				return;
			}

			s.push(char);
			trans.push(key);
		});

		s.push('');
		const len = s.length - 2;

		const positions = [];
		let a = 0;
		let last = 1;

		while (++a < len) {
			if (s[a] === '\u00A0') {
				a++;
				continue; // here and after never
			}

			const hyphen = this.getHyphen(s[a], s[a - 1], s[a + 1]);

			if (hyphen === Dont && (a - last > this.wordLimit * 0.6)) {
				positions.push(last = a - 1); // hyphenate here
			}

			if (hyphen === Here) {
				positions.push(last = a - 1); // hyphenate here
			}

			if (hyphen === After) {
				positions.push(last = a);
				a++; // hyphenate after
			}
		}

		a = positions[positions.length - 1];
		if (a === len - 1 && this.consonants.has(s[len])) {
			positions.pop();
		}

		const syllables = [];
		last = 0;
		for (const pos of positions) {
			if (pos - last > this.wordLimit * 0.6) {
				syllables.push(chars.splice(0, trans[pos] - trans[last]).join(''));
				last = pos;
			}
		}

		syllables.push(chars.join(''));
		return syllables.join('\u00AD');
	}


	/**
	 * @param {string} ch
	 * @param {string} prev
	 * @param {string} next
	 * @returns {number}
	 */
	getHyphen(ch, prev, next)
	{
		if (ch === '.') {
			return Here;

		} else if (this.consonants.has(ch)) { // consonants
			if (this.vowels.has(next)) {
				return this.vowels.has(prev) ? Here : Dont;

			} else if ((ch === 's') && (prev === 'n') && this.consonants.has(next)) {
				return After;

			} else if (this.consonants.has(next) && this.vowels.has(prev)) {
				if (next === 'r') {
					return this.before_r.has(ch) ? Here : After;

				} else if (next === 'l') {
					return this.before_l.has(ch) ? Here : After;

				} else if (next === 'h') { // CH
					return this.before_h.has(ch)
						? Dont
						: After;
				}

				return After;
			}

			return Dont;

		} else if ((ch === 'u') && this.doubleVowels.has(prev)) {
			return After;

		} else if (this.vowels.has(ch) && this.vowels.has(prev)) {
			return Here;
		}

		return Dont; // do not hyphenate
	}
}

/**
 * URL scheme security policy: which schemes may appear in links and in
 * images (port of Texy\UrlPolicy). A null pattern means no restriction;
 * scheme-less (relative) URLs always pass.
 */

import { match } from './Regexp.js';

export class UrlPolicy
{
	/** @type {?string} PCRE pattern matching allowed link schemes, e.g. '~https?:|ftp:|mailto:~A'; null = allow all */
	linkPattern = null;

	/** @type {?string} PCRE pattern matching allowed image schemes, e.g. '~https?:~A'; null = allow all */
	imagePattern = null;


	/**
	 * @param {string} url
	 * @returns {boolean}
	 */
	isLinkAllowed(url)
	{
		return this.isAllowed(url, this.linkPattern);
	}


	/**
	 * @param {string} url
	 * @returns {boolean}
	 */
	isImageAllowed(url)
	{
		return this.isAllowed(url, this.imagePattern);
	}


	/**
	 * @param {string} url
	 * @param {?string} pattern
	 * @returns {boolean}
	 */
	isAllowed(url, pattern)
	{
		return pattern === null
			|| !match(url, String.raw`~\s*[a-z][a-z0-9+.-]{0,20}:~Ai`) // no scheme (relative URL)
			|| match(url, pattern) !== null;
	}
}

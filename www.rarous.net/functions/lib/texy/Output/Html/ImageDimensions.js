/**
 * Detects image dimensions from the file system
 * (Config.imageFileRoot), cached for the renderer's lifetime (port of
 * Texy\Output\Html\ImageDimensions). The only file-system touch of
 * rendering, kept out of the renderer proper.
 */

import { readFileSync, statSync } from 'node:fs';
import { isRelative } from '../../helpers.js';

/**
 * Reads the size of an image file buffer: [width, height] or null when the
 * format is not recognized. PNG, GIF, JPEG, BMP and WebP headers - the
 * image formats that matter in practice (the reference uses PHP's
 * getimagesize()).
 * @param {Buffer} buf
 * @returns {?[number, number]}
 */
export function imageSize(buf)
{
	// PNG: 8-byte signature, then IHDR (width, height as u32 BE at 16, 20)
	if (buf.length >= 24
		&& buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47
		&& buf[4] === 0x0D && buf[5] === 0x0A && buf[6] === 0x1A && buf[7] === 0x0A
	) {
		return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
	}

	// GIF: signature, then logical screen size (u16 LE at 6, 8)
	if (buf.length >= 10 && buf.toString('latin1', 0, 3) === 'GIF') {
		return [buf.readUInt16LE(6), buf.readUInt16LE(8)];
	}

	// JPEG: scan the segment stream for SOFn
	if (buf.length >= 4 && buf[0] === 0xFF && buf[1] === 0xD8) {
		let offset = 2;
		while (offset + 9 < buf.length) {
			if (buf[offset] !== 0xFF) {
				offset++;
				continue;
			}
			const marker = buf[offset + 1];
			if (marker === 0xFF) {
				offset++;
				continue;
			}
			// SOF0-SOF15, except DHT (C4), JPG (C8) and DAC (CC)
			if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
				return [buf.readUInt16BE(offset + 7), buf.readUInt16BE(offset + 5)];
			}
			if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { // standalone
				offset += 2;
				continue;
			}
			offset += 2 + buf.readUInt16BE(offset + 2);
		}
		return null;
	}

	// BMP: 'BM', then width/height (i32 LE at 18, 22)
	if (buf.length >= 26 && buf[0] === 0x42 && buf[1] === 0x4D) {
		return [Math.abs(buf.readInt32LE(18)), Math.abs(buf.readInt32LE(22))];
	}

	// WebP: RIFF container
	if (buf.length >= 30 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
		const chunk = buf.toString('latin1', 12, 16);
		if (chunk === 'VP8X') { // canvas size minus one, 3-byte LE each, at 24
			return [
				1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)),
				1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)),
			];
		}
		if (chunk === 'VP8L') { // signature byte, then 14-bit LE width/height minus one
			const bits = buf.readUInt32LE(21);
			return [(bits & 0x3FFF) + 1, ((bits >>> 14) & 0x3FFF) + 1];
		}
		if (chunk === 'VP8 ') { // 3-byte frame tag, sync code, then u16 LE width/height
			return [buf.readUInt16LE(26) & 0x3FFF, buf.readUInt16LE(28) & 0x3FFF];
		}
		return null;
	}

	return null;
}


export class ImageDimensions
{
	/**
	 * @param {import('./Config.js').Config} config
	 */
	constructor(config)
	{
		this.config = config;
		/** @type {Map<string, ?[number, number]>} results cached per file path */
		this.cache = new Map();
	}


	/**
	 * Detects image dimensions from file system. Does not modify the node.
	 * @param {import('../../nodes.js').ImageNode} node
	 * @returns {[?number, ?number]}
	 */
	detect(node)
	{
		let [width, height] = [node.width, node.height];

		const fileRoot = this.config.imageFileRoot;
		if (
			node.url === null || !isRelative(node.url) || node.url.includes('..')
			|| fileRoot === null
		) {
			return [width, height];
		}

		const size = this.getSize(fileRoot.replace(/[\/\\]+$/, '') + '/' + node.url);
		if (size === null) {
			return [width, height];
		}

		if (width === null && height === null) {
			[width, height] = size;
		} else if (height === null) {
			height = Math.round(size[1] / size[0] * width);
		} else if (width === null) {
			width = Math.round(size[0] / size[1] * height);
		}

		return [width, height];
	}


	/**
	 * Returns [width, height] of an image file, cached for the renderer's
	 * lifetime.
	 * @param {string} file
	 * @returns {?[number, number]}
	 */
	getSize(file)
	{
		if (!this.cache.has(file)) {
			let size = null;
			try {
				if (statSync(file).isFile()) {
					size = imageSize(readFileSync(file));
				}
			} catch {
				// intentionally ignored, like the reference's @ operator
			}
			this.cache.set(file, size);
		}

		return this.cache.get(file);
	}
}

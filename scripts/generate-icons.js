"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const ICON_SIZES = [16, 32, 48, 128];
const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT_DIR = path.join(ROOT_DIR, "assets", "icons");

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function writePng(filePath, size, getPixel) {
  const scanlines = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * (size * 4 + 1);
    scanlines[rowOffset] = 0;
    for (let x = 0; x < size; x += 1) {
      const offset = rowOffset + 1 + x * 4;
      const [red, green, blue, alpha] = getPixel(x, y);
      scanlines[offset] = red;
      scanlines[offset + 1] = green;
      scanlines[offset + 2] = blue;
      scanlines[offset + 3] = alpha;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    createChunk("IHDR", header),
    createChunk("IDAT", zlib.deflateSync(scanlines)),
    createChunk("IEND", Buffer.alloc(0)),
  ]);
  fs.writeFileSync(filePath, png);
}

function drawIcon(size) {
  const dark = [20, 33, 61, 255];
  const light = [248, 249, 250, 255];
  const gold = [252, 163, 17, 255];
  const transparent = [0, 0, 0, 0];
  const margin = Math.round(size * 0.16);
  const boardStart = Math.round(size * 0.24);
  const boardEnd = size - boardStart;
  const lineWidth = Math.max(1, Math.round(size * 0.055));
  const cornerRadius = Math.max(2, Math.round(size * 0.19));

  return (x, y) => {
    const nearCorner =
      (x < cornerRadius && y < cornerRadius && (x - cornerRadius) ** 2 + (y - cornerRadius) ** 2 > cornerRadius ** 2) ||
      (x >= size - cornerRadius && y < cornerRadius && (x - (size - cornerRadius - 1)) ** 2 + (y - cornerRadius) ** 2 > cornerRadius ** 2) ||
      (x < cornerRadius && y >= size - cornerRadius && (x - cornerRadius) ** 2 + (y - (size - cornerRadius - 1)) ** 2 > cornerRadius ** 2) ||
      (x >= size - cornerRadius && y >= size - cornerRadius && (x - (size - cornerRadius - 1)) ** 2 + (y - (size - cornerRadius - 1)) ** 2 > cornerRadius ** 2);
    if (nearCorner) {
      return transparent;
    }
    if (x < margin || x >= size - margin || y < margin || y >= size - margin) {
      return dark;
    }
    if (x < boardStart || x >= boardEnd || y < boardStart || y >= boardEnd) {
      return dark;
    }

    const boardSize = boardEnd - boardStart;
    const firstLine = boardStart + Math.round(boardSize / 3);
    const secondLine = boardStart + Math.round((boardSize * 2) / 3);
    if (
      Math.abs(x - firstLine) < lineWidth ||
      Math.abs(x - secondLine) < lineWidth ||
      Math.abs(y - firstLine) < lineWidth ||
      Math.abs(y - secondLine) < lineWidth
    ) {
      return gold;
    }

    const cellSize = boardSize / 3;
    const centerX = boardStart + (Math.floor((x - boardStart) / cellSize) + 0.5) * cellSize;
    const centerY = boardStart + (Math.floor((y - boardStart) / cellSize) + 0.5) * cellSize;
    const dotRadius = Math.max(1, size * 0.032);
    if ((x - centerX) ** 2 + (y - centerY) ** 2 <= dotRadius ** 2) {
      return dark;
    }
    return light;
  };
}

function generateIcons(outputDir = DEFAULT_OUTPUT_DIR) {
  fs.mkdirSync(outputDir, { recursive: true });
  for (const size of ICON_SIZES) {
    writePng(path.join(outputDir, `icon-${size}.png`), size, drawIcon(size));
  }
}

if (require.main === module) {
  generateIcons();
}

module.exports = { ICON_SIZES, generateIcons };

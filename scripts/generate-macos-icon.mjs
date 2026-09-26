import { Buffer } from 'node:buffer';
import { deflateSync } from 'node:zlib';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PRODUCT } from '../packages/metadata/dist/index.js';

const outputDirectory = process.argv[2];
if (!outputDirectory) throw new Error('An iconset output directory is required.');

const colors = [
  [11, 110, 153, 255],
  [32, 164, 100, 255],
];
const iconSizes = [16, 32, 128, 256, 512];
const initials = [...PRODUCT.shortName.replace(/[^A-Za-z]/g, '')]
  .slice(0, 2)
  .map((character) => character.toUpperCase());

function chunk(type, data) {
  // iconutil consumes PNGs, so emit standard PNG chunks without adding an image dependency.
  const typeBytes = Buffer.from(type);
  const content = Buffer.concat([typeBytes, data]);
  let checksumValue = 0xffffffff;
  for (const byte of content) {
    checksumValue ^= byte;
    for (let bit = 0; bit < 8; bit += 1)
      checksumValue = (checksumValue >>> 1) ^ (0xedb88320 & -(checksumValue & 1));
  }
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((checksumValue ^ 0xffffffff) >>> 0);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, content, checksum]);
}

function png(size) {
  // Generate deterministic branded artwork from shared product metadata for every icon scale.
  const pixels = Buffer.alloc(size * size * 4);
  const radius = size * 0.2;
  const chartLeft = size * 0.23;
  const chartBottom = size * 0.75;
  const barWidth = size * 0.13;
  const barGap = size * 0.08;
  const barHeights = [0.28, 0.48, 0.68];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const edgeX = Math.min(x, size - 1 - x);
      const edgeY = Math.min(y, size - 1 - y);
      const rounded =
        edgeX >= radius || edgeY >= radius || Math.hypot(radius - edgeX, radius - edgeY) <= radius;
      const pixel = (y * size + x) * 4;
      const blend = Math.max(0, Math.min(1, (x + y) / (size * 1.5)));
      pixels[pixel] = Math.round(colors[0][0] * (1 - blend) + colors[1][0] * blend);
      pixels[pixel + 1] = Math.round(colors[0][1] * (1 - blend) + colors[1][1] * blend);
      pixels[pixel + 2] = Math.round(colors[0][2] * (1 - blend) + colors[1][2] * blend);
      pixels[pixel + 3] = rounded ? 255 : 0;

      const barIndex = Math.floor((x - chartLeft) / (barWidth + barGap));
      const barStart = chartLeft + barIndex * (barWidth + barGap);
      const isBar =
        barIndex >= 0 &&
        barIndex < barHeights.length &&
        x >= barStart &&
        x <= barStart + barWidth &&
        y >= chartBottom - size * barHeights[barIndex] &&
        y <= chartBottom;
      const isBaseline =
        x >= chartLeft &&
        x <= chartLeft + barHeights.length * barWidth + (barHeights.length - 1) * barGap &&
        y >= chartBottom &&
        y <= chartBottom + size * 0.06;
      if (rounded && (isBar || isBaseline)) {
        pixels[pixel] = 255;
        pixels[pixel + 1] = 255;
        pixels[pixel + 2] = 255;
        pixels[pixel + 3] = 235;
      }
    }
  }

  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    rows[y * (size * 4 + 1)] = 0;
    pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
for (const baseSize of iconSizes) {
  await writeFile(join(outputDirectory, `icon_${baseSize}x${baseSize}.png`), png(baseSize));
  await writeFile(join(outputDirectory, `icon_${baseSize}x${baseSize}@2x.png`), png(baseSize * 2));
}
process.stdout.write(
  `Generated ${PRODUCT.iconName}.icns source for ${initials.join('')} from ${PRODUCT.displayName} ${PRODUCT.version}.\n`,
);

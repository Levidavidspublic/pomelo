// Regenerate with node --import tsx scripts/pomelo/make-icon.mts
import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";

const size = 1024;
const background = [41, 47, 62] as const;
const shadow = [29, 34, 47] as const;
const rind = [220, 232, 160] as const;
const pith = [255, 244, 211] as const;
const segments = [
  [240, 123, 145], [249, 151, 162], [235, 114, 138], [246, 139, 154],
  [251, 160, 169], [237, 120, 147], [248, 147, 160], [242, 130, 150],
] as const;
const fullTurn = 2 * Math.PI;
const segmentAngle = fullTurn / segments.length;

function sample(x: number, y: number) {
  // The straight sides and circular corners share the same center.
  const cornerX = Math.max(0, Math.abs(x - size / 2) - 252);
  const cornerY = Math.max(0, Math.abs(y - size / 2) - 252);
  if (cornerX ** 2 + cornerY ** 2 > 218 ** 2) return undefined;

  const dx = x - size / 2;
  const dy = y - 500;
  const radiusSquared = dx ** 2 + dy ** 2;
  if (radiusSquared > 350 ** 2) {
    return dx ** 2 + (dy - 20) ** 2 <= 350 ** 2 ? shadow : background;
  }
  if (radiusSquared > 320 ** 2) return rind;
  if (radiusSquared > 279 ** 2 || radiusSquared < 26 ** 2) return pith;

  const angle = (Math.atan2(dy, dx) + Math.PI / 16 + fullTurn) % fullTurn;
  const segment = Math.floor(angle / segmentAngle);
  const angleWithinSegment = angle % segmentAngle;
  const nearestSeam = Math.min(angleWithinSegment, segmentAngle - angleWithinSegment);
  const seamDistance = Math.sqrt(radiusSquared) * Math.sin(nearestSeam);
  return seamDistance < 10 ? pith : segments[segment];
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, "ascii");
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
  return chunk;
}

export function makeIcon(): Buffer {
  // Each PNG scanline starts with a zero filter byte, followed by RGBA pixels.
  const stride = 1 + size * 4;
  const scanlines = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Average four subpixel samples to smooth the silhouette and segment edges.
      const samples = [
        sample(x + 0.25, y + 0.25), sample(x + 0.75, y + 0.25),
        sample(x + 0.25, y + 0.75), sample(x + 0.75, y + 0.75),
      ];
      let red = 0;
      let green = 0;
      let blue = 0;
      let coverage = 0;
      for (const color of samples) {
        if (!color) continue;
        red += color[0];
        green += color[1];
        blue += color[2];
        coverage++;
      }
      if (coverage === 0) continue;

      const offset = y * stride + 1 + x * 4;
      scanlines[offset] = Math.round(red / coverage);
      scanlines[offset + 1] = Math.round(green / coverage);
      scanlines[offset + 2] = Math.round(blue / coverage);
      scanlines[offset + 3] = Math.round(255 * coverage / samples.length);
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // Bits per channel.
  header[9] = 6; // PNG color type for RGBA.
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = new URL("../../packaging/pomelo/", import.meta.url);
  mkdirSync(directory, { recursive: true });
  writeFileSync(new URL("icon.png", directory), makeIcon());
}

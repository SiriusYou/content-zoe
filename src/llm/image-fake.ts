import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";

import type { ImageSpec } from "../pipeline/image/spec.ts";
import {
  ImageProviderError,
  type ImageProvider,
  type ImageProviderErrorCode,
} from "./image-provider.ts";

export interface FakeImageProviderCall {
  readonly spec: ImageSpec;
  readonly absolutePath: string;
  readonly timeoutMs: number;
  readonly feedback?: string;
}

export type FakeImageCall = FakeImageProviderCall;

export interface FakeImageProviderOptions {
  failWith?: ImageProviderErrorCode;
}

export class FakeImageProvider implements ImageProvider {
  readonly name = "fake-image";
  readonly calls: FakeImageProviderCall[] = [];

  private readonly failWith?: ImageProviderErrorCode;

  constructor(options: FakeImageProviderOptions = {}) {
    this.failWith = options.failWith;
  }

  get lastFeedback(): string | undefined {
    return this.calls.at(-1)?.feedback;
  }

  async generate(
    spec: ImageSpec,
    absolutePath: string,
    timeoutMs: number,
    feedback?: string,
  ): Promise<void> {
    this.calls.push({ spec, absolutePath, timeoutMs, feedback });

    if (!path.isAbsolute(absolutePath)) {
      throw new ImageProviderError({
        code: "parse",
        message: `image output path must be absolute: ${absolutePath}`,
      });
    }

    if (this.failWith) {
      throw new ImageProviderError(
        this.failWith,
        `synthetic fake image failure: ${this.failWith}`,
      );
    }

    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(
      absolutePath,
      makePng(spec.dimensions.w, spec.dimensions.h),
    );
  }
}

function makePng(width: number, height: number): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      const offset = rowStart + 1 + x * 4;
      raw[offset] = 0x2f;
      raw[offset + 1] = 0x67;
      raw[offset + 2] = 0xb1;
      raw[offset + 3] = 0xff;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcBytes = Buffer.alloc(4);
  crcBytes.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crcBytes]);
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

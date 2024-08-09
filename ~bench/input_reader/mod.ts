// Copyright 2024 Im-Beast. MIT license.
import { stdin } from "jsr:@beast/compat";

import type { InputEvent } from "./types.ts";
import { decodeMouseSGR, decodeMouseVT_UTF8 } from "./decoders/mouse.ts";
import { decodeKey } from "./decoders/keyboard.ts";

const textDecoder = new TextDecoder();

/**
 * Read, decode and yield events from stdin
 */
export async function* inputEvents() {
  const stream = await stdin({ raw: true });
  for await (const chunk of stream) {
    yield* decodeBuffer(chunk);
  }
}

export function justFunc(buffer: Uint8Array) {
  return decodeKey(buffer, textDecoder.decode(buffer));
}

/**
 * Decode character(s) from buffer that was sent to stdin from terminal on mostly
 * @see https://invisible-island.net/xterm/ctlseqs/ctlseqs.txt for reference used to create this function
 */
export function* decodeBuffer(
  buffer: Uint8Array,
): Generator<InputEvent, void, void> {
  const code = textDecoder.decode(buffer);
  const lastIndex = code.lastIndexOf("\x1b");

  if (code.indexOf("\x1b") !== lastIndex) {
    yield* decodeBuffer(buffer.subarray(0, lastIndex));
    yield* decodeBuffer(buffer.subarray(lastIndex));
  } else {
    yield decodeMouseVT_UTF8(buffer, code) ?? decodeMouseSGR(buffer, code) ??
      decodeKey(buffer, code);
  }
}

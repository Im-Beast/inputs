import type { KeyEvent } from "../keyboard/shared.ts";
import { type MouseEvent, mouseEvent } from "./shared.ts";

import { Char } from "../../chars.ts";
import { maybeMultiple } from "../../decode.ts";
import { mouseX10Modifiers } from "./x10.ts";

/**
 * Mouse SGR – "\x1b[?1006h"
 *
 * Caller has to make sure that first three chars of buffer are ["\x1b", "[", "<"].
 *
 * B, X and Y are encoded numbers
 * CSI < B ; X ; Y (M/m)
 *
 * @example
 * `\x1b[<2;69;420M`
 */
export function decodeSGRMouse(buffer: Uint8Array): null | [MouseEvent, ...KeyEvent[]] {
  let release: boolean | undefined;
  const numbers = [0, 0, 0];
  let i = 3, j = 0;
  loop: while (i < buffer.length) {
    const char = buffer[i++];

    switch (char) {
      case Char["m"]:
        release = true;
        break loop;
      case Char["M"]:
        release = false;
        break loop;
      case Char[";"]:
        ++j;
        continue;
    }

    // Decode numbers
    numbers[j] *= 10;
    numbers[j] += char - Char["0n"];
  }

  // Invalid or incomplete SGR sequence, missing ending
  if (typeof release === "undefined") {
    return null;
  }

  const [encodedButton, x, y] = numbers;

  const modifiers = mouseX10Modifiers(encodedButton + 32);
  modifiers.release = release;
  return maybeMultiple(mouseEvent(x, y, modifiers), buffer, i);
}

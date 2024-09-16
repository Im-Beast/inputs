import type { KeyEvent } from "../keyboard/shared.ts";
import { type MouseEvent, mouseEvent } from "./shared.ts";

import { Char } from "../../chars.ts";
import { maybeMultiple } from "../../decode.ts";
import { mouseX10Modifiers } from "./x10.ts";

/**
 * Mouse URXVT – "\x1b[?10015h"
 *
 * Caller has to make sure that first two chars of buffer are ["\x1b", "["].
 * Even with above guarantees decoding buffer might still fail, as CSI <num> is also
 * used by other protocols (such as kitty).
 *
 * B, X and Y are encoded numbers\
 * CSI B ; X ; Y M
 *
 * @example
 * `\x1b[2;69;420M`
 */
export function decodeURXVTMouse(buffer: Uint8Array): null | [MouseEvent, ...KeyEvent[]] {
  // TODO: move parsing numbers like this into its own function
  const numbers = [0, 0, 0];
  let i = 2, j = 0, complete = false;
  while (i < buffer.length) {
    const char = buffer[i++];
    if (char === Char["M"]) {
      complete = true;
      break;
    } else if (char === Char[";"]) {
      ++j;
      continue;
    } else if (char < Char["0n"] || char > Char["9n"]) {
      return null;
    }

    // Decode numbers
    numbers[j] *= 10;
    numbers[j] += char - Char["0n"];
  }

  if (!complete) return null;

  // This encoding doesn't even support modifiers
  const [encodedButton, x, y] = numbers;
  return maybeMultiple(mouseEvent(x, y, mouseX10Modifiers(encodedButton)), buffer, i);
}

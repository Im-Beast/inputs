import { Char } from "../../chars.ts";
import { KeyPress, maybeMultiple, MousePress, mousePress } from "../../decode.ts";
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
export function decodeSGRMouse(buffer: Uint8Array): [MousePress, ...KeyPress[]] {
  const numbers = [0, 0, 0];
  let i = 3, j = 0;
  while (i < buffer.length) {
    const char = buffer[i++];
    if (char === Char["m"] || char === Char["M"]) {
      break;
    } else if (char === Char[";"]) {
      ++j;
      continue;
    }

    // Decode numbers
    numbers[j] *= 10;
    numbers[j] += char - Char["0n"];
  }

  const [encodedButton, x, y] = numbers;
  const modifiers = mouseX10Modifiers(encodedButton + 32);
  modifiers.release = buffer[i - 1] === Char["m"];
  return maybeMultiple(mousePress(x, y, modifiers), buffer, i);
}

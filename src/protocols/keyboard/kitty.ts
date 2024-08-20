import { Char } from "../../chars.ts";
import { KeyPress, keyPress, maybeMultiple } from "../../decode.ts";

/**
 * Keyboard kitty – "\x1b[>1u"
 * @link https://sw.kovidgoyal.net/kitty/keyboard-protocol
 *
 * CSI number; modifier u\
 * TODO: CSI unicode_key_code ; modifiers ; text_as_code_points u\
 * TODO: CSI key_code ; modifier u\
 * TODO: CSI key_code ; modifier : event u\
 * @example
 * `\x1b[111;5u`
 */
export function decodeKittyKey(buffer: Uint8Array): [KeyPress, ...KeyPress[]] | undefined {
  const numbers = [0, 0];
  let i = 2, j = 0;
  while (i < buffer.length) {
    const char = buffer[i++];
    if (char === Char["u"]) {
      break;
    } else if (char === Char[";"]) {
      ++j;
      continue;
    } else if (char < Char["0n"] || char > Char["9n"]) {
      return;
    }

    // Decode numbers
    numbers[j] *= 10;
    numbers[j] += char - Char["0n"];
  }

  let [key, modifiers] = numbers;
  modifiers -= 1;

  const shift = !!(modifiers & 1);
  const alt = !!(modifiers & 2);
  const ctrl = !!(modifiers & 4);
  // TODO: Right now hyper, meta and super keys are being merged together, what should be done with them?
  const meta = !!(modifiers & (8 | 16 | 32));
  // TODO: should capslock and numlock be added to the KeyPress?
  const _caps_lock = !!(modifiers & 64);
  const _num_lock = !!(modifiers & 128);

  return maybeMultiple(keyPress(String.fromCharCode(key), shift, ctrl, meta, alt), buffer, i + 1);
}

import { Char } from "../../chars.ts";
import { KeyPress, maybeMultiple, MousePress, mousePress } from "../../decode.ts";
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
export function decodeURXVTMouse(buffer: Uint8Array): [MousePress, ...KeyPress[]] | undefined {
    // TODO: move parsing numbers like this into its own function
    const numbers = [0, 0, 0];
    let i = 2, j = 0;
    while (i < buffer.length) {
        const char = buffer[i++];
        if (char === Char["M"]) {
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

    // This encoding doesn't even support modifiers
    const [encodedButton, x, y] = numbers;
    return maybeMultiple(mousePress(x, y, mouseX10Modifiers(encodedButton)), buffer, i + 1);
}

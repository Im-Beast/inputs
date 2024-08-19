import { Char } from "../../chars.ts";
import { type KeyPress, maybeMultiple, MouseButton, type MousePress, mousePress } from "../../decode.ts";

/**
 * Returns calculated mouse X10 modifiers
 */
export function mouseX10Modifiers(encodedButton: number): Partial<MousePress> {
    // Low two bits encode button (or 3 – release)
    // If scroll is used – button encodes its direction
    const button = encodedButton & 3;

    // Then modifiers are stored in the next 3 bits
    // We offset them by 2 bit places so they can be easily bitmasked
    const modifiers = (encodedButton & 63) >> 2;
    const shift = !!(modifiers & 1);
    // Technically meta, however most terminals decode it as an alt
    const alt = !!(modifiers & 2);
    const ctrl = !!(modifiers & 4);
    // Release events aren't reported for the scroll
    // Used with button-event and any-event tracking modes
    const drag = !!(encodedButton & 64);
    const scroll = (encodedButton & 96) === 96 && button !== 3;

    // TODO: Buttons through 6 to 11?

    // Drag & Release is true when Any-event tracking mode is enabled and user just moves their mouse
    if (drag && button === 3) {
        return { move: true, ctrl, alt, shift };
    } else if (scroll) {
        return { scroll: button, ctrl, alt, shift };
    } else if (button === 3) {
        return { release: true, drag, ctrl, alt, shift };
    } else {
        return { button, drag, ctrl, alt, shift };
    }
}

/**
 * Converts a pair of UTF-8 code points into UTF-16 code unit
 * @example
 * `"Ą" = [ 196, 132 ] = [ 11000100, 10000100 ] -> 00100000100 = 260`
 */
function utf8CodePointsToUtf16CodeUnit(a: number, b: number): number | undefined {
    if ((a & 0xE0) == 0xC0 && (b & 0xC0) == 0x80) {
        return ((a & 0x1F) << 6) | (b & 0x3F);
    }
}

// TODO: Mouse highlight tracking?

/**
 * Mouse X10 – "\x1b[?9h"
 *
 * Caller has to make sure that first three chars of buffer are ["\x1b", "[", "M"].
 *
 * B, X, Y are offset by +32 ASCII code points
 * CSI M B X Y
 *
 * Supported extensions/schemes:
 *  - Normal tracking mode ("\x1b[?1000h")
 *  - Button-event tracking ("\x1b[?1002h")
 *  - Any-event tracking ("\x1b[?1003h")
 *  - UTF-8 Extended coordinates ("\x1b[?1005h")
 *
 * @example
 * `\x1b[M @@`
 */
export function decodeX10Mouse(buffer: Uint8Array): [MousePress, ...KeyPress[]] {
    // X10 Compatibility mode ("\x1b[?9h")
    const button = buffer[3] - 32;

    // UTF-8 Extended coordinates ("\x1b[?1005h")
    let i = 5, charUnit: number | undefined;
    let x = 0, y = 0;
    if (buffer[4] > Char["DEL"] && (charUnit = utf8CodePointsToUtf16CodeUnit(buffer[4], buffer[5]))) {
        x = charUnit - 32;
        ++i;
    } else {
        x = buffer[4] - 32;
    }

    if (buffer[i] > Char["DEL"] && (charUnit = utf8CodePointsToUtf16CodeUnit(buffer[i], buffer[i + 1]))) {
        y = charUnit - 32;
        ++i;
    } else {
        y = buffer[i] - 32;
    }

    // Normal tracking mode ("\x1b[?1000h")
    // Button-event tracking ("\x1b[?1002h")
    // Any-event tracking ("\x1b[?1003h")
    if (button > MouseButton.Right) {
        const encodedButton = buffer[3];
        return maybeMultiple(mousePress(x, y, mouseX10Modifiers(encodedButton)), buffer, i + 1);
    }

    return mousePress(x, y, { button });
}

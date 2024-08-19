import { Char } from "./chars.ts";
import { decodeKittyKey } from "./protocols/keyboard/kitty.ts";
import {
  decodeXTermCSIFunctionKeys,
  decodeXTermSS3FunctionKeys,
  decodeXTermUtf8Key,
} from "./protocols/keyboard/xterm.ts";
import { decodeSGRMouse } from "./protocols/mouse/sgr.ts";
import { decodeURXVTMouse } from "./protocols/mouse/urxvt.ts";
import { decodeX10Mouse } from "./protocols/mouse/x10.ts";

// FIXME: Change wording from "meta" to "super" so its obvious what's being conveyed
export interface KeyPress {
  key: string;

  shift: boolean;
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
}

export const enum MouseButton {
  Left = 0,
  Middle,
  Right,
}

export const enum MouseScroll {
  Up,
  Down,
}

// TODO: Maybe it should be split into multiple interfaces, TBD
export interface MousePress extends KeyPress {
  key: "mouse";

  button?: MouseButton;
  scroll?: MouseScroll;

  release: boolean;
  drag: boolean;
  move: boolean;

  x: number;
  y: number;
}

export function keyPress(key: string, shift = false, ctrl = false, meta = false, alt = false): [KeyPress] {
  return [{ key, shift, ctrl, meta, alt }];
}

export function mousePress(x: number, y: number, other?: Partial<MousePress>): [MousePress] {
  return [{
    key: "mouse",
    x,
    y,
    shift: false,
    ctrl: false,
    meta: false,
    alt: false,
    release: false,
    drag: false,
    move: false,
    ...other,
  }];
}

export function maybeMultiple<T extends KeyPress>(
  keyPress: [T, ...KeyPress[]],
  buffer: Uint8Array,
  length: number,
): [T, ...KeyPress[]] {
  if (buffer.length > length) keyPress.push(...decodeBuffer(buffer.slice(length)));
  return keyPress;
}

/**
 * A lot of information has been taken from @link {https://invisible-island.net/xterm/ctlseqs/ctlseqs.txt}.\
 * I cannot be more thankful to the authors of this document ❤️.
 */
export function decodeBuffer(buffer: Uint8Array): [KeyPress, ...KeyPress[]] {
  // TODO: Support glueing together cut buffers (mostly windows mouse issue)

  // We start by checking keys that always start with "\x1b"
  // as it later allows us to always decode "\x1b" as a modifier key
  //
  // Length check here is just a fast dismiss
  if (buffer.length > 2 && buffer[0] === Char["ESC"]) {
    // CSI prefix
    if (buffer[1] === Char["["]) {
      if (buffer[2] === Char["<"]) {
        return decodeSGRMouse(buffer);
      }

      if (buffer[2] === Char["M"]) {
        return decodeX10Mouse(buffer);
      }

      // TODO: This is a very vague condition
      if (buffer[2] >= Char["1n"] && buffer[2] <= Char["9n"]) {
        const decoded = decodeKittyKey(buffer) ?? decodeURXVTMouse(buffer);
        if (decoded) {
          return decoded;
        }
      }

      return decodeXTermCSIFunctionKeys(buffer);
    }

    // SS3 prefix
    if (buffer[1] === Char["O"]) {
      return decodeXTermSS3FunctionKeys(buffer);
    }
  }

  return decodeXTermUtf8Key(buffer);
}

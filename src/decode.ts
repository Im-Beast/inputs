import type { KeyEvent } from "./protocols/keyboard/shared.ts";
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

let remnantBuffer: Uint8Array | undefined;

/** Used in testing to make sure properly escaped keys don't leave remnant buffers */
export function getRemnant() {
  return remnantBuffer;
}

function maybeRemnant(event: [KeyEvent, ...KeyEvent[]] | null, buffer: Uint8Array): KeyEvent[] {
  if (event) {
    remnantBuffer = undefined;
    return event;
  }

  remnantBuffer = buffer;
  return [];
}

export function maybeMultiple<T extends KeyEvent>(
  keyPress: [T, ...KeyEvent[]],
  buffer: Uint8Array,
  length: number,
): [T, ...KeyEvent[]] {
  if (buffer.length > length) keyPress.push(...decodeBuffer(buffer.slice(length)));
  return keyPress;
}

/**
 * A lot of information has been taken from @link {https://invisible-island.net/xterm/ctlseqs/ctlseqs.txt}.\
 * I cannot be more thankful to the authors of this document ❤️.
 */
export function decodeBuffer(buffer: Uint8Array): KeyEvent[] {
  if (remnantBuffer) {
    buffer = new Uint8Array([...remnantBuffer, ...buffer]);
  }

  // We start by checking keys that always start with "\x1b"
  // as it later allows us to always decode "\x1b" as a modifier key
  //
  // Length check here is just a fast dismiss
  if (buffer.length > 2 && buffer[0] === Char["ESC"]) {
    // CSI prefix
    if (buffer[1] === Char["["]) {
      // Shortest Mouse SGR sequence is
      // "\x1b[<1;1;1M" (9 chars)
      if (buffer[2] === Char["<"] && buffer.length > 8) {
        return maybeRemnant(decodeSGRMouse(buffer), buffer);
      }

      // Shortest X10 Mouse sequence is
      // "\x1b[M @@" (6) chars
      if (buffer[2] === Char["M"] && buffer.length > 5) {
        return maybeRemnant(decodeX10Mouse(buffer), buffer);
      }

      if (buffer[2] >= Char["1n"] && buffer[2] <= Char["9n"]) {
        let decoded: KeyEvent[] | null = null;
        // The shortest URXVT sequence is
        // "\x1b[1;1;1M" (8 chars)
        if (buffer.length > 7) {
          decoded = decodeURXVTMouse(buffer);
        }
        // Shortest kitty sequence is
        // "\x1b[1;1u" (6 chars)
        if (!decoded && buffer.length > 6) {
          decoded = decodeKittyKey(buffer);
        }

        if (decoded) {
          remnantBuffer = undefined;
          return decoded;
        }
      }

      return maybeRemnant(decodeXTermCSIFunctionKeys(buffer), buffer);
    }

    // SS3 prefix
    if (buffer[1] === Char["O"]) {
      return maybeRemnant(decodeXTermSS3FunctionKeys(buffer), buffer);
    }
  }

  return maybeRemnant(decodeXTermUtf8Key(buffer), buffer);
}

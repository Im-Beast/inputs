export async function* decodeStdout() {
  Deno.stdin.setRaw(true);
  for await (const chunk of Deno.stdin.readable) {
    if (chunk[0] === 3) break;

    console.log(Deno.inspect(chunk, { breakLength: 99999, colors: true, compact: true }), [
      new TextDecoder().decode(chunk),
    ]);

    yield decodeBuffer(chunk);
  }
}

export interface KeyPress {
  key: string;

  shift: boolean;
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
}

function keyPress(key: string, shift = false, ctrl = false, meta = false, alt = false): KeyPress {
  return { key, meta, ctrl, shift, alt };
}

/**
 * Returns a KeyPress with calculated modifiers
 * Modifiers byte is a char "1"..="9", so we convert it to a number first.
 * We also offset it by 1 (thus -49, not -48) to be able to bitmask it easily.
 */
function modifierKeypress(key: string, modifiers: number): KeyPress {
  modifiers -= 49;
  const meta = modifiers === 0;
  const shift = !!(modifiers & 1);
  const alt = !!(modifiers & 2);
  const ctrl = !!(modifiers & 4);
  return keyPress(key, shift, ctrl, meta, alt);
}

/**
 * A lot of information has been taken from @link {https://invisible-island.net/xterm/ctlseqs/ctlseqs.txt}.\
 * I cannot be more thankful to the authors of this document ❤️.
 */
export function decodeBuffer(buffer: Uint8Array): KeyPress {
  // TODO: handle cases where multiple inputs have been pressed at once

  const len = buffer.length;

  // All "normal" ASCII characters.
  //
  // "\0x1b" at the second last position signifies pressed alt.
  // "\0x18" ast the start signifies pressed meta key.
  //
  // Character is always encoded at the last position.
  if (len === 1 || (buffer[0] === 27 && len === 2) || buffer[0] === 24) {
    const charByte = buffer[len - 1];
    const alt = buffer[len - 2] === 27;
    // Length has to be larger than 1 otherwise it would correspond to ctrl+x
    const meta = len > 1 && buffer[0] === 24;

    // "!"..="@" | "["..="~"
    if ((charByte > 32 && charByte < 65) || (charByte > 90 && charByte < 127)) {
      return { key: String.fromCharCode(charByte), meta, alt, ctrl: false, shift: false };
    }

    // "A"..="Z"
    if (charByte > 64 && charByte < 91) {
      return keyPress(String.fromCharCode(charByte), true, false, meta, alt);
    }

    let key = "unknown <1>";
    // deno-fmt-ignore
    switch (charByte) {
      // "\x00"
      case 0: return keyPress("space", false, true, meta, alt);
      // " "
      case 32: key = "space"; break;
      // "\n"
      //
      // Ctrl+J is normally used to send NL/LF (same as Ctrl+I or Return).
      // However instead of sending "\r" it sends "\n".
      // This behavior seems to be followed by every major terminal.
      // We use it then to distinguish it as "j" being pressed with at least ctrl
      case 10: return keyPress("j", false, true, meta, alt);
      // "\r"
      case 13: key = "return"; break;
      // "\x1b"
      case 27: key = "escape"; break;
      // "\b", "\x7f"
      case 8:
      case 127: key = "backspace"; break;
      // "\t"
      case 9: key = "tab"; break;

      // ctrl + "a"..="z"
      //
      // When ctrl is held while typing any character between "a" to "z" its charcode is offset by 96.
      // This means that some characters have exactly the same buffer, e.g. Ctrl+I = Tab, Ctrl+M = Return.
      //
      // See link above, section "Single-character functions" for more examples.
      default:
        if (charByte > 0 && charByte <= 26) {
          return keyPress(String.fromCharCode(charByte + 96), false, true, meta, alt);
        }
    }

    return keyPress(key, false, false, meta, alt);
  }

  // "\x1b"
  if (buffer[0] !== 27) {
    throw new Error(
      "Something is not being handled:" + Deno.inspect(new TextDecoder().decode(buffer)),
    );
  }

  // Insert | Delete | PageUp | PageDown | Home | End | Arrows | F1..=F12 (CSI prefix)
  if (buffer[1] === 91) {
    // F1..=F4
    let fKey = buffer[len - 1] - 79;
    if (fKey > 0 && fKey < 5) {
      return modifierKeypress(`f${fKey}`, buffer[len - 2]);
    }

    // Home | End | Arrows
    if (buffer[len - 1] !== 126) {
      let key = "unknown <2>";

      // deno-fmt-ignore
      switch (buffer[len - 1]) {
        case 65: key = "up"; break;
        case 66: key = "down"; break;
        case 67: key = "right"; break;
        case 68: key = "left"; break;
        case 70: key = "end"; break;
        case 72: key = "home"; break;
      }

      // If buffer is smaller than 6 codepoints it has no modifiers.
      if (len < 6) return keyPress(key);
      return modifierKeypress(key, buffer[len - 2]);
    }

    // Insert | Delete | PageUp | PageDown
    // Function key sequences only exist with buffer length
    // of 5 and 7, so to check if its a special key instead
    // we can use this intrinsic
    if (len !== 5 && len !== 7) {
      let key = "unknown <3>";

      // deno-fmt-ignore
      switch (buffer[2]) {
        case 50: key = "insert"; break;
        case 51: key = "delete"; break;
        case 53: key = "pageup"; break;
        case 54: key = "pagedown"; break;
      }

      // If buffer is smaller than 6 codepoints it has no modifiers.
      if (len < 6) return keyPress(key);
      return modifierKeypress(key, buffer[len - 2]);
    }

    // Whoever designed this is a maniac?
    // F5  – CSI 1 5 ~
    // F6  – CSI 1 7 ~ <- ???
    // F7  – CSI 1 8 ~
    // F8  – CSI 1 9 ~
    // F9  – CSI 2 0 ~
    // F10 - CSI 2 1 ~
    // F11 - CSI 2 3 ~ <- ???
    // F12 - CSI 2 4 ~
    if (buffer[2] === 49) {
      fKey = buffer[3] - 48;
      if (fKey > 5) fKey--;
    } else {
      // We are starting from 0 and its F9, so we add 9
      fKey = buffer[3] - 39;
      if (fKey > 10) fKey--;
    }

    // If buffer has only five codepoints, then it has no modifiers.
    if (len === 5) return keyPress(`f${fKey}`);
    return modifierKeypress(`f${fKey}`, buffer[len - 2]);
  }

  // F1..=F4 (SS3 prefix)
  if (buffer[1] === 79) {
    // If buffer has only three codepoints, then it has no modifiers.
    if (buffer.length === 3) {
      const fKey = buffer[2] - 79;
      return keyPress(`f${fKey}`);
    }

    const fKey = buffer[3] - 79;
    return modifierKeypress(`f${fKey}`, buffer[2]);
  }

  return keyPress("unknown <end>");
}

if (import.meta.main) {
  for await (const key of decodeStdout()) {
    console.log(key);
  }
}

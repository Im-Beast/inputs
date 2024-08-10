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
  // TODO: Rewrite hardcoded charpoints into const enum

  // We start by checking keys that always start with "\x1b"
  // as it later allows us to always decode "\x1b" as a modifier key
  //
  // Length check here is just a fast dismiss
  if (buffer.length > 2 && buffer[0] === 27) {
    // Insert | Delete | PageUp | PageDown | Home | End | Arrows | F1..=F12 (CSI prefix)
    if (buffer[1] === 91) {
      // F1..=F4
      let fKey = buffer[6] - 79;
      if (fKey > 0 && fKey < 5) {
        return modifierKeypress(`f${fKey}`, buffer[5]);
      }

      // Home | End | Arrows
      if (buffer[3] !== 126 && buffer[4] !== 126 && buffer[5] !== 126 && buffer[6] !== 126) {
        let key = "unknown <1>";

        // If fifth character is a semicolon (";") then it has encoded modifiers
        const hasModifiers = buffer[4] === 59;

        // deno-fmt-ignore
        switch (buffer[hasModifiers ? 6 : 2]) {
        case 65: key = "up"; break;
        case 66: key = "down"; break;
        case 67: key = "right"; break;
        case 68: key = "left"; break;
        case 70: key = "end"; break;
        case 72: key = "home"; break;
      }

        if (hasModifiers) return modifierKeypress(key, buffer[5]);
        return keyPress(key);
      }

      // Insert | Delete | PageUp | PageDown
      // F5..=F12 as well as some other CSI encoded special keys end with tilde ("~")
      if (buffer[3] === 126 || (buffer[3] == 59 && buffer[5] === 126)) {
        let key = "unknown <2>";

        // deno-fmt-ignore
        switch (buffer[2]) {
        case 50: key = "insert"; break;
        case 51: key = "delete"; break;
        case 53: key = "pageup"; break;
        case 54: key = "pagedown"; break;
      }

        // If 4th character is a semicolon (";"), then it encodes modifiers
        if (buffer[3] === 59) return modifierKeypress(key, buffer[4]);
        return keyPress(key);
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

      // If 5th character is a semicolon (";"), then it encodes modifiers
      if (buffer[4] === 59) return modifierKeypress(`f${fKey}`, buffer[5]);
      return keyPress(`f${fKey}`);
    }

    // Shift + Return | F1..=F4 (SS3 prefix)
    if (buffer[1] === 79) {
      // Shift + Return produces this code for some reason
      if (buffer[2] === 77) return keyPress("return", true);

      // If F key is encoded at the third position
      // then it has no modifiers
      if (buffer[2] > 79) {
        const fKey = buffer[2] - 79;
        return keyPress(`f${fKey}`);
      }

      const fKey = buffer[3] - 79;
      return modifierKeypress(`f${fKey}`, buffer[2]);
    }
  }

  // All "normal" ASCII characters.
  //
  // Legacy modifier encoding:
  //  - "\x1b" at the second last position signifies pressed alt.
  //  - "\x18@s" ast the start signifies pressed meta key.
  //
  // Character is always encoded at the last position.
  if (buffer[0] < 127) {
    // "\x1b"
    const alt = buffer.length > 1 && (buffer[0] === 27 || buffer[3] == 27);
    // "\x18@s"
    const meta = buffer[0] === 24 && buffer[1] === 64 && buffer[2] === 115;
    const charByte = buffer[(alt ? 1 : 0) + (meta ? 3 : 0)];

    // "!"..="@" | "["..="~"
    if ((charByte > 32 && charByte < 65) || (charByte > 90 && charByte < 127)) {
      return keyPress(String.fromCharCode(charByte), false, false, meta, alt);
    }

    // "A"..="Z"
    if (charByte > 64 && charByte < 91) {
      return keyPress(String.fromCharCode(charByte), true, false, meta, alt);
    }

    let key = "unknown <4>";
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

  return keyPress("unknown <end>");
}

if (import.meta.main) {
  for await (const key of decodeStdout()) {
    console.log(key);
  }
}

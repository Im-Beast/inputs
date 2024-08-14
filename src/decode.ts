export async function* decodeStdout() {
  const ENABLE_MOUSE = "\x1b[>1u\x1b[?1005h\x1b[?1015h\x1b[?1002h\x1b[?9h"; //"\x1b[?9h\x1b[?1000h\x1b[?1002h\x1b[?1005h\x1b[?1006h\x1b[?1003h";
  const DISABLE_MOUSE = "\x1b[<1u\x1b[?1005l\x1b[?1015l\x1b[?1002l\x1b[?9l"; //"\x1b[?9l\x1b[?1000l\x1b[?1002l\x1b[?1005l\x1b[?1006l\x1b[?1003l";

  Deno.stdin.setRaw(true);
  console.log(ENABLE_MOUSE);

  for await (const chunk of Deno.stdin.readable) {
    console.log(Deno.inspect(chunk, { breakLength: 99999, colors: true, compact: true }), [
      new TextDecoder().decode(chunk),
    ]);

    const decoded = decodeBuffer(chunk);
    if (decoded[0].key === "c" && decoded[0].ctrl) break;

    yield decoded;
  }

  console.log(DISABLE_MOUSE);
}

const textDecoder = new TextDecoder();

const enum Char {
  "NULL" = 0,
  "Backspace" = 8,
  "Tab" = 9,
  "LF" = 10,
  "CR" = 13,
  "CANCEL" = 24,
  "ESC" = 27,
  "SPACE" = 32,
  "!" = 33,
  ";" = 59,
  "0n" = 48,
  "1n" = 49,
  "2n" = 50,
  "3n" = 51,
  "4n" = 52,
  "5n" = 53,
  "6n" = 54,
  "7n" = 55,
  "8n" = 56,
  "9n" = 57,
  "<" = 60,
  "@" = 64,
  "A" = 65,
  "B" = 66,
  "C" = 67,
  "D" = 68,
  "F" = 70,
  "H" = 72,
  "I" = 73,
  "M" = 77,
  "O" = 79,
  "Z" = 90,
  "[" = 91,
  "a" = 97,
  "m" = 109,
  "s" = 115,
  "u" = 117,
  "z" = 122,
  "~" = 126,
  "DEL" = 127,
}

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

function keyPress(key: string, shift = false, ctrl = false, meta = false, alt = false): [KeyPress] {
  return [{ key, shift, ctrl, meta, alt }];
}

function mousePress(x: number, y: number, other?: Partial<MousePress>): [MousePress] {
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

function maybeMultiple(keyPress: [KeyPress], buffer: Uint8Array, length: number) {
  if (buffer.length > length) keyPress.push(...decodeBuffer(buffer.slice(length)));
  return keyPress;
}

/**
 * Returns a KeyPress with calculated modifiers
 * Modifiers byte is a char "1"..="9", so we convert it to a number first.
 * We also offset it by 1 (thus -49, not -48) to be able to bitmask it easily.
 */
function modifierKeypress(key: string, modifiers: number): [KeyPress] {
  modifiers -= Char["0n"] + 1;
  const meta = modifiers === 0;
  const shift = !!(modifiers & 1);
  const alt = !!(modifiers & 2);
  const ctrl = !!(modifiers & 4);
  return keyPress(key, shift, ctrl, meta, alt);
}

/**
 * Returns calculated mouse X10 modifiers
 */
function mouseX10Modifiers(encodedButton: number): Partial<MousePress> {
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

/**
 * A lot of information has been taken from @link {https://invisible-island.net/xterm/ctlseqs/ctlseqs.txt}.\
 * I cannot be more thankful to the authors of this document ❤️.
 */
export function decodeBuffer(buffer: Uint8Array): [KeyPress, ...KeyPress[]] {
  // TODO: Support kitty protocol
  // TODO: Support glueing together cut buffers (mostly windows mouse issue)

  // We start by checking keys that always start with "\x1b"
  // as it later allows us to always decode "\x1b" as a modifier key
  //
  // Length check here is just a fast dismiss
  if (buffer.length > 2 && buffer[0] === Char["ESC"]) {
    // Mouse | Insert | Delete | PageUp | PageDown | Home | End | Arrows | F1..=F12 (CSI prefix)
    if (buffer[1] === Char["["]) {
      // Mouse (SGR, "\x1b[?1006h")
      if (buffer[2] === Char["<"]) {
        // B, X and Y are encoded numbers
        // CSI < B ; X ; Y (M/m)
        const numbers = [0, 0, 0];
        let i = 3, j = 0;
        for (; i < buffer.length; ++i) {
          const char = buffer[i];
          if (char === Char[";"]) {
            ++j;
            continue;
          } else if (char === Char["m"] || char === Char["M"]) {
            break;
          }

          // Decode numbers
          numbers[j] *= 10;
          numbers[j] += char - Char["0n"];
        }

        const [encodedButton, x, y] = numbers;
        const modifiers = mouseX10Modifiers(encodedButton);
        modifiers.release ||= buffer[i] === Char["m"];
        return mousePress(x, y, modifiers);
      }

      // Kitty | Mouse (URXVT, "\x1b[?1015h")
      if (buffer[2] >= Char["1n"] && buffer[2] <= Char["9n"]) {
        // TODO: move parsing numbers like this into its own function
        mouse: {
          // B, X and Y are encoded numbers
          // CSI B ; X ; Y M
          const numbers = [0, 0, 0];
          let i = 2, j = 0;
          for (; i < buffer.length; ++i) {
            const char = buffer[i];
            if (char === Char[";"]) {
              ++j;
              continue;
            } else if (char === Char["M"]) {
              break;
            } else if (char < Char["0n"] || char > Char["9n"]) {
              break mouse;
            }

            // Decode numbers
            numbers[j] *= 10;
            numbers[j] += char - Char["0n"];
          }

          // This encoding doesn't even support modifiers
          const [encodedButton, x, y] = numbers;
          return mousePress(x, y, mouseX10Modifiers(encodedButton));
        }

        kitty: {
          const numbers = [0, 0];
          let i = 2, j = 0;
          for (; i < buffer.length; ++i) {
            const char = buffer[i];
            if (char === Char[";"]) {
              ++j;
              continue;
            } else if (char === Char["u"]) {
              break;
            } else if (char < Char["0n"] || char > Char["9n"]) {
              break kitty;
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
      }

      // TODO: Mouse highlight tracking?
      // Mouse (X10, "\x1b[?9h")
      if (buffer[2] === Char["M"]) {
        // X10 Compatibility mode ("\x1b[?9h")
        // CSI M B X Y
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
        // CSI M B X Y
        if (button > MouseButton.Right) {
          const encodedButton = buffer[3];
          return maybeMultiple(mousePress(x, y, mouseX10Modifiers(encodedButton)), buffer, i + 1);
        }

        return mousePress(x, y, { button });
      }

      // TODO: Don't precalculate?
      // F1..=F4
      let fKey = buffer[5] - Char["O"];
      if (fKey > 0 && fKey < 5) {
        return maybeMultiple(modifierKeypress(`f${fKey}`, buffer[4]), buffer, 6);
      }

      // Home | End | Arrows
      if (
        buffer[1] === Char["["] && (
          (buffer[2] >= Char["A"] && buffer[2] <= Char["H"]) ||
          (buffer[3] === Char[";"] && buffer[5] >= Char["A"] && buffer[5] <= Char["H"])
        )
      ) {
        let key = "unknown <1>";

        // If fourth character is a semicolon (";") then it has encoded modifiers
        const hasModifiers = buffer[3] === Char[";"];

        // deno-fmt-ignore
        switch (buffer[hasModifiers ? 5 : 2]) {
          case Char["A"]: key = "up"; break;
          case Char["B"]: key = "down"; break;
          case Char["C"]: key = "right"; break;
          case Char["D"]: key = "left"; break;

          case Char["F"]: key = "end"; break;
          case Char["H"]: key = "home"; break;
        }

        if (hasModifiers) return maybeMultiple(modifierKeypress(key, buffer[4]), buffer, 6);
        return maybeMultiple(keyPress(key), buffer, 3);
      }

      // Insert | Delete | PageUp | PageDown
      // F5..=F12 as well as some other CSI encoded special keys end with tilde ("~")
      if (buffer[3] === Char["~"] || (buffer[3] == Char[";"] && buffer[5] === Char["~"])) {
        let key = "unknown <2>";

        // deno-fmt-ignore
        switch (buffer[2]) {
          case Char["2n"]: key = "insert"; break;
          case Char["3n"]: key = "delete"; break;

          case Char["5n"]: key = "pageup"; break;
          case Char["6n"]: key = "pagedown"; break;
        }

        // If 4th character is a semicolon (";"), then it encodes modifiers
        if (buffer[3] === Char[";"]) {
          return maybeMultiple(modifierKeypress(key, buffer[4]), buffer, 6);
        }
        return maybeMultiple(keyPress(key), buffer, 4);
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
      if (buffer[2] === Char["1n"]) {
        fKey = buffer[3] - Char["0n"];
        if (fKey > 5) fKey--;
      } else {
        // We are starting from 0 and its F9, so we add 9
        fKey = buffer[3] - Char["0n"] + 9;
        if (fKey > 10) fKey--;
      }

      // If 5th character is a semicolon (";"), then it encodes modifiers
      if (buffer[4] === Char[";"]) {
        return maybeMultiple(modifierKeypress(`f${fKey}`, buffer[5]), buffer, 7);
      }
      return maybeMultiple(keyPress(`f${fKey}`), buffer, 5);
    }

    // Shift + Return | F1..=F4 (SS3 prefix)
    if (buffer[1] === Char["O"]) {
      // Shift + Return produces this code for some reason
      if (buffer[2] === Char["M"]) {
        return maybeMultiple(keyPress("return", true), buffer, 3);
      }

      // If F key is encoded at the third position
      // then it has no modifiers
      if (buffer[2] > Char["O"]) {
        const fKey = buffer[2] - Char["O"];
        return maybeMultiple(keyPress(`f${fKey}`), buffer, 3);
      }

      const fKey = buffer[3] - Char["O"];
      return maybeMultiple(modifierKeypress(`f${fKey}`, buffer[2]), buffer, 4);
    }
  }

  // Legacy modifier encoding:
  //  - "\x1b" at the second last position signifies pressed alt.
  //  - "\x18@s" ast the start signifies pressed meta key.
  //  - Character is always encoded at the last position.
  const meta = buffer[0] === Char["CANCEL"] && buffer[1] === Char["@"] && buffer[2] === Char["s"];
  const alt = buffer.length > 1 && (buffer[0] === Char["ESC"] || (meta && buffer[3] == Char["ESC"]));
  const startPos = (alt ? 1 : 0) + (meta ? 3 : 0);
  const charByte = buffer[startPos];

  // "!"..="@" | "["..="~"
  if (
    (charByte >= Char["!"] && charByte <= Char["@"]) ||
    (charByte >= Char["["] && charByte <= Char["~"])
  ) {
    const character = String.fromCharCode(charByte);
    return maybeMultiple(keyPress(character, false, false, meta, alt), buffer, startPos + 1);
  }

  // "A"..="Z"
  if (charByte >= Char["A"] && charByte <= Char["Z"]) {
    const character = String.fromCharCode(charByte);
    return maybeMultiple(keyPress(character, true, false, meta, alt), buffer, startPos + 1);
  }

  let key = "unknown <4>";
  let ctrl = false;

  // deno-fmt-ignore
  switch (charByte) {
    // "\x00"
    case Char["NULL"]:
      ctrl = true;
      key = "space";
      break;
    // " "
    case Char["SPACE"]: key = "space"; break;
    // "\n"
    //
    // Ctrl+J is normally used to send NL/LF (same as Ctrl+I or Return).
    // However instead of sending "\r" it sends "\n".
    // This behavior seems to be followed by every major terminal.
    // We use it then to distinguish it as "j" being pressed with at least ctrl
    case Char["LF"]:
      ctrl = true;
      key = "j";
      break;
    // "\r"
    case Char["CR"]: key = "return"; break;
    // "\x1b"
    case Char["ESC"]: key = "escape"; break;
    // "\b", "\x7f"
    case Char["Backspace"]:
    case Char["DEL"]: key = "backspace"; break;
    // "\t"
    case Char["Tab"]: key = "tab"; break;
    // ctrl + "a"..="z"
    //
    // When ctrl is held while typing any character between "a" to "z" its charcode is offset by 96.
    // This means that some characters have exactly the same buffer, e.g. Ctrl+I = Tab, Ctrl+M = Return.
    //
    // See link above, section "Single-character functions" for more examples.
    default:
      if (charByte >= (Char["a"] - 96) && charByte <= (Char["z"] - 96)) {
        return maybeMultiple(keyPress(String.fromCharCode(charByte + 96), false, true, meta, alt), buffer, startPos + 1);
      } else {
        // Number of leading 1s in first byte tells us how many codepoints the character contains
        // deno-fmt-ignore
        const codePoints =
          (charByte & 0xf0) === 0xf0 ? 4 :
          (charByte & 0xe0) === 0xe0 ? 3 :
          (charByte & 0xc0) === 0xc0 ? 2 : 1;

        if (buffer.length > startPos + codePoints) {
          const character = textDecoder.decode(buffer.slice(startPos, startPos + codePoints));
          // We have to check whether it is lower case as well, since there are characters that dont have casings e.g. emojis
          const shift = character.toUpperCase() === character && character.toLowerCase() !== character;

          const kp = keyPress(character, shift, false, meta, alt);
          kp.push(...decodeBuffer(buffer.slice(startPos + codePoints)));
          return kp
        }

        const character = textDecoder.decode(buffer);
        const shift = character.toUpperCase() === character && character.toLowerCase() !== character;
        return keyPress(character, shift, false, meta, alt);
      }
  }

  return maybeMultiple(keyPress(key, false, ctrl, meta, alt), buffer, startPos + 1);
}

if (import.meta.main) {
  for await (const key of decodeStdout()) {
    console.log(key);
  }
}

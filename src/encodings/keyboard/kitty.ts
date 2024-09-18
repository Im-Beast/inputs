import type { KeyEvent } from "./shared.ts";

import { Char } from "../../chars.ts";
import { maybeMultiple } from "../../decode.ts";

/**
 * Event generated with kitty protocol, which can contain much
 * more detailed and accurate information
 *
 * The {@linkcode KittyKeyEvent["modifiers"]} does not contain shift, ctrl and alt, as they are unambigious in this scenario.
 */
export interface KittyKeyEvent extends KeyEvent {
  modifiers: {
    meta: boolean;
    super: boolean;
    hyper: boolean;
    numLock: boolean;
    capsLock: boolean;
  };
  release: boolean;
  repeat: boolean;
}

/**
 * Returns a KeyPress with calculated modifiers
 * Modifiers byte is a char "1"..="9", so we convert it to a number first.
 * We also offset it by 1 (thus -49, not -48) to be able to bitmask it easily.
 */
function modifierKittyKeyEvent(key: string, modifiers: number, event: number): [KittyKeyEvent] {
  modifiers &&= modifiers - 1;
  const shift = !!(modifiers & 1);
  const alt = !!(modifiers & 2);
  const ctrl = !!(modifiers & 4);
  const meta = !!(modifiers & 8);
  const superKey = !!(modifiers & 16);
  const hyper = !!(modifiers & 32);
  const capsLock = !!(modifiers & 64);
  const numLock = !!(modifiers & 128);

  const legacyMeta = meta || superKey || hyper;

  const repeat = event === 2;
  const release = event === 3;

  if (capsLock || shift) {
    // When capslock is enabled or shift is pressed – keys are reported in
    // their lowercase counterparts, thus we make them uppercase in these cases
    key = key.toUpperCase();
  }

  return [{
    key,
    alt,
    shift,
    ctrl,
    meta: legacyMeta,

    modifiers: {
      hyper,
      meta,
      super: superKey,

      capsLock,
      numLock,
    },

    repeat,
    release,
  }];
}

/**
 * Keyboard kitty – "\x1b[>1u"
 * @link https://sw.kovidgoyal.net/kitty/keyboard-protocol
 *
 * CSI key_code u\
 * CSI key_code; modifier u\
 * CSI key_code ; modifier : event u\
 * TODO: CSI unicode_key_code ; modifiers ; text_as_code_points u\
 * @example
 * `\x1b[111u`
 * `\x1b[111;5u`
 * `\x1b[111;5u:3`
 */
export function decodeKittyKey(buffer: Uint8Array): null | [KittyKeyEvent, ...KeyEvent[]] {
  const numbers = [0, 0, 0];
  let i = 2, j = 0, ending: number | undefined;
  while (i < buffer.length) {
    const char = buffer[i++];
    // ~ABCDEFGHPQS u
    if (
      char === Char["u"] || (
        j === 2 && (
          char === Char["~"] ||
          (char >= Char["A"] && char <= Char["H"]) ||
          (char >= Char["P"] && char <= Char["S"])
        )
      )
    ) {
      ending = char;
      break;
    } else if (char === Char[";"] || char === Char[":"]) {
      ++j;
      continue;
    } else if (char < Char["0n"] || char > Char["9n"]) {
      return null;
    }

    // Decode numbers
    numbers[j] *= 10;
    numbers[j] += char - Char["0n"];
  }

  // Invalid or incomplete sequence
  if (typeof ending === "undefined") {
    return null;
  }

  const [keyCode, modifiers, event] = numbers;

  let key = "unknown";
  if (keyCode < 57344) {
    if (keyCode > 31) {
      key = String.fromCharCode(keyCode);
    } else {
      switch (keyCode) {
        case Char["ESC"]:
          key = "escape";
          break;
        case Char["CR"]:
          if (ending === Char["u"]) key = "return";
          else key = "f3";
          break;
        case Char["Tab"]:
          key = "tab";
          break;
        case Char["DEL"]:
          key = "backspace";
          break;
        case Char["SPACE"]:
          key = "space";
          break;

        case 1: {
          switch (ending) {
            case Char["D"]:
              key = "left";
              break;
            case Char["C"]:
              key = "right";
              break;
            case Char["A"]:
              key = "up";
              break;
            case Char["B"]:
              key = "down";
              break;

            case Char["H"]:
              key = "home";
              break;
            case Char["F"]:
              key = "end";
              break;

            case Char["P"]:
              key = "f1";
              break;
            case Char["Q"]:
              key = "f2";
              break;
            case Char["S"]:
              key = "f4";
              break;
          }
          break;
        }

        case 5:
          key = "pageup";
          break;
        case 6:
          key = "pagedown";
          break;
      }
    }
  } else if (keyCode < 57363) {
    // Why is there a gap between those ranges?
    const keys = ["capslock", "scrolllock", "numlock", "printscreen", "pause", "menu"];
    key = keys[keyCode - 57358];
  } else if (keyCode > 57376) {
    // deno-fmt-ignore
    const keys = [
      // Function keys
      "f13", "f14", "f15", "f16", "f17", "f18", "f19", "f20",
      "f21", "f22", "f23", "f24", "f25", "f26", "f27", "f28",
      "f29", "f30", "f31", "f32", "f33", "f34", "f35",
      // Keypad keys
      "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
      ".", "/", "*", "-", "+", "return", "=", "|", "left",
      "right", "up", "down", "pageup", "pagedown", "home",
      "end", "insert", "delete", "begin",
      // Media keys
      "play", "pause", "playpause", "reverse", "stop", "fastforward",
      "rewind", "tracknext", "trackprevious", "record",
      "volumedown", "volumeup", "volumemute",
      // Special keys
      // - Left ones
      "shift", "ctrl", "alt", "super", "hyper", "meta",
      // - Right ones
      "shift", "ctrl", "alt", "super", "hyper", "meta",
      // - whatever the heck ISO_LEVEL_{3,5} ones are
      "shift", "shift"
    ];

    key = keys[keyCode - 57376];
  }

  return maybeMultiple(modifierKittyKeyEvent(key, modifiers, event), buffer, i + 1);
}

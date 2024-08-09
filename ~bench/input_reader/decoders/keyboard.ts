// Copyright 2024 Im-Beast. MIT license.
/** Decode code sequence to {KeyPress} object. */
import type { Alphabet, Key, KeyPressEvent } from "../types.ts";

const lowerCaseAlphabet = "abcdefghijklmnopqrstuvwxyz";

/**
 * Decode {buffer} and/or {code} to {KeyPressEvent} object
 */
export function decodeKey(buffer: Uint8Array, code: string): KeyPressEvent {
  if (code[0] === "\x1b") code = code.slice(1);
  let key = code as Key;
  let ctrl = false;
  let meta = false;
  let shift = false;

  switch (code) {
    case "\r":
    case "\n":
      key = "return";
      break;
    case "\t":
      key = "tab";
      break;
    case "\b":
    case "\x7f":
      key = "backspace";
      break;
    case "\x1b":
      key = "escape";
      break;
    case " ":
      key = "space";
      break;
    default:
      {
        if (buffer[0] !== 27) {
          const offset96 = String.fromCharCode(buffer[0] + 96);
          if (lowerCaseAlphabet.indexOf(offset96) !== -1) {
            key = offset96 as Alphabet;
            ctrl = true;
            break;
          }
        }

        if (code.length === 1) {
          shift = code !== code.toLowerCase();
          meta = buffer[0] === 27;
          break;
        } else if (buffer.length === 1) {
          key = "escape";
          break;
        }

        const modifier = code.match(/\d+.+(\d+)/)?.[1] ?? "";
        switch (modifier) {
          case "5":
            ctrl = true;
            break;
          case "3":
            meta = true;
            break;
          case "2":
            shift = true;
            break;
        }

        code = code.replace(`1;${modifier}`, "").replace(`;${modifier}`, "").replace("1;", "");
        switch (code) {
          case "OP":
          case "[P":
            key = "f1";
            break;
          case "OG":
          case "[Q":
            key = "f2";
            break;
          case "OR":
          case "[R":
            key = "f3";
            break;
          case "OS":
          case "[S":
            key = "f4";
            break;
          case "[15~":
            key = "f5";
            break;
          case "[17~":
            key = "f6";
            break;
          case "[18~":
            key = "f7";
            break;
          case "[19~":
            key = "f8";
            break;
          case "[20~":
            key = "f9";
            break;
          case "[21~":
            key = "f10";
            break;
          case "[23~":
            key = "f11";
            break;
          case "[24~":
            key = "f12";
            break;

          case "[A":
            key = "up";
            break;
          case "[B":
            key = "down";
            break;
          case "[C":
            key = "right";
            break;
          case "[D":
            key = "left";
            break;

          case "[2~":
            key = "insert";
            break;
          case "[3~":
            key = "delete";
            break;

          case "[5~":
            key = "pageup";
            break;
          case "[6~":
            key = "pagedown";
            break;

          case "[H":
            key = "home";
            break;
          case "[F":
            key = "end";
            break;

          case "[E":
            key = "clear";
            break;
        }
      }
      break;
  }

  return {
    buffer,
    ctrl,
    key,
    meta,
    shift,
  };
}

// Copyright 2024 Im-Beast. MIT license.
import type { MousePressEvent, MouseScrollEvent } from "../types.ts";

/**
 * Decode SGR mouse mode code sequence to {MouseEvent} object.
 * If it can't convert specified {code} to {MouseEvent} it returns undefined.
 */
export function decodeMouseSGR(
  buffer: Uint8Array,
  code: string,
): MousePressEvent | MouseScrollEvent | undefined {
  const action = code.at(-1);
  if (!code.startsWith("\x1b[<") || (action !== "m" && action !== "M")) {
    return undefined;
  }

  const release = action === "m";

  const xSeparator = code.indexOf(";");
  let modifiers = +code.slice(3, xSeparator);
  const ySeparator = code.indexOf(";", xSeparator + 1);
  let x = +code.slice(xSeparator + 1, ySeparator);
  let y = +code.slice(ySeparator + 1, code.length - 1);

  x -= 1;
  y -= 1;

  let scroll: MouseScrollEvent["scroll"] = 0;
  if (modifiers >= 64) {
    scroll = modifiers % 2 === 0 ? -1 : 1;
    modifiers -= scroll < 0 ? 64 : 65;
  }

  let drag = false;
  if (modifiers >= 32) {
    drag = true;
    modifiers -= 32;
  }

  let ctrl = false;
  if (modifiers >= 16) {
    ctrl = true;
    modifiers -= 16;
  }

  let meta = false;
  if (modifiers >= 8) {
    meta = true;
    modifiers -= 8;
  }

  let shift = false;
  if (modifiers >= 4) {
    shift = true;
    modifiers -= 4;
  }

  let move = false;
  if (modifiers >= 3) {
    move = true;
    modifiers -= 3;
  }

  let button: MousePressEvent["button"];
  if (!scroll && !move) {
    button = modifiers as MousePressEvent["button"];
  }

  return {
    key: "mouse",
    scroll,
    button,
    release,
    drag,
    buffer,
    x,
    y,
    ctrl,
    meta,
    shift,
  };
}

/**
 * Decode VT and UTF8 mouse mode code sequence to {MouseEvent} object.
 * If it can't convert specified {code} to {MouseEvent} it returns undefined.
 */
export function decodeMouseVT_UTF8(
  buffer: Uint8Array,
  code: string,
): MousePressEvent | MouseScrollEvent | undefined {
  if (!code.startsWith("\x1b[M")) return undefined;

  const modifiers = code.charCodeAt(3);
  let x = code.charCodeAt(4);
  let y = code.charCodeAt(5);

  x -= 0o41;
  y -= 0o41;

  const buttonInfo = modifiers & 3;
  let release = false;

  let button: MousePressEvent["button"];
  if (buttonInfo === 3) {
    release = true;
  } else {
    button = buttonInfo as MousePressEvent["button"];
  }

  const shift = !!(modifiers & 4);
  const meta = !!(modifiers & 8);
  const ctrl = !!(modifiers & 16);
  const scroll = button && !!(modifiers & 32) && !!(modifiers & 64) ? (modifiers & 3 ? 1 : -1) : 0;
  if (scroll) button = undefined;
  const drag = !scroll && !!(modifiers & 64);

  return {
    key: "mouse",
    scroll,
    buffer,
    drag,
    button,
    release,
    x,
    y,
    ctrl,
    meta,
    shift,
  };
}

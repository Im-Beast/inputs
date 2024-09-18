import type { KeyEvent } from "../keyboard/shared.ts";

export const enum MouseButton {
  Left = 0,
  Middle,
  Right,
}

export const enum MouseScroll {
  Up = 0,
  Down,
}

// TODO: Maybe it should be split into multiple interfaces, TBD
export interface MouseEvent extends KeyEvent {
  key: "mouse";
  x: number;
  y: number;

  button?: MouseButton;
  scroll?: MouseScroll;

  release: boolean;
  drag: boolean;
  move: boolean;
}

export type MouseEventModifiers = Partial<Omit<MouseEvent, "key" | "x" | "y">>;

export function mouseEvent(x: number, y: number, modifiers?: MouseEventModifiers): [MouseEvent] {
  return [{
    key: "mouse",

    x,
    y,

    release: false,
    drag: false,
    move: false,

    shift: false,
    meta: false,
    ctrl: false,
    alt: false,

    ...modifiers,
  }];
}

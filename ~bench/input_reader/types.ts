// Copyright 2024 Im-Beast. MIT license.

/** Generates number types that range from {From} to {To}  */
export type Range<From extends number, To extends number> = number extends From ? number
  : _Range<From, To, []>;
type _Range<From extends number, To extends number, R extends unknown[]> = R["length"] extends To ? To
  :
    | (R["length"] extends Range<0, From> ? From : R["length"])
    | _Range<From, To, [To, ...R]>;

export type InputEvent = KeyPressEvent | MouseEvent | MousePressEvent | MouseScrollEvent;

/** Interface defining key press issued to stdin */
export interface KeyPressEvent {
  key: Key;
  meta: boolean;
  ctrl: boolean;
  shift: boolean;
  buffer: Uint8Array;
}

/** Interface defining any mouse event issued to stdin */
export interface MouseEvent {
  key: "mouse";
  buffer: Uint8Array;
  x: number;
  y: number;
  meta: boolean;
  ctrl: boolean;
  shift: boolean;
}

/** Interface defining mouse press issued to stdin */
export interface MousePressEvent extends MouseEvent {
  drag: boolean;
  release: boolean;
  /** undefined when `release` is true */
  button: 0 | 1 | 2 | undefined;
}

export interface MouseMoveEvent extends MouseEvent {
  move: true;
}

export interface MouseScrollEvent extends MouseEvent {
  /**
   *  - 1 – Scrolls downwards
   *  - 0 – Doesn't scroll
   *  - -1 – Scrolls upwards
   */
  scroll: 1 | 0 | -1;
}

export type Key =
  | Alphabet
  | Chars
  | SpecialKeys
  | `${Range<0, 10>}`
  | `f${Range<1, 12>}`;

/** Type defining letters from the latin alphabet */
export type Alphabet =
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "w"
  | "x"
  | "y"
  | "z";

/** Type defining special keys */
export type SpecialKeys =
  | "return"
  | "tab"
  | "backspace"
  | "escape"
  | "space"
  | "up"
  | "down"
  | "left"
  | "right"
  | "clear"
  | "insert"
  | "delete"
  | "pageup"
  | "pagedown"
  | "home"
  | "end"
  | "tab";

/** Type defining interpunction characters */
export type Chars =
  | "!"
  | "@"
  | "#"
  | "$"
  | "%"
  | "^"
  | "&"
  | "*"
  | "("
  | ")"
  | "-"
  | "_"
  | "="
  | "+"
  | "["
  | "{"
  | "]"
  | "}"
  | "'"
  | '"'
  | ";"
  | ":"
  | ","
  | "<"
  | "."
  | ">"
  | "/"
  | "?"
  | "\\"
  | "|";

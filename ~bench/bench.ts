import { justFunc as oldDecodeBuffer } from "./input_reader/mod.ts";
import { decodeBuffer, type KeyPress } from "../src/decode.ts";

type ExpectedResult = [name: string, ansi: string, KeyPress];

function key(key: string, modifiers: Partial<KeyPress> = {}): KeyPress {
  return Object.assign({
    key,
    alt: false,
    ctrl: false,
    meta: false,
    shift: false,
  }, modifiers);
}

function modifierTests(
  type: "CSI" | "SS3" | "Legacy",
  name: string,
  baseAnsi: string,
  expectedKey: string,
  override: Partial<KeyPress> = {},
): ExpectedResult[] {
  if (type === "Legacy") {
    const meta = "\x18@s";
    const alt = "\x1b";

    return [
      [`${name} (${type})`, baseAnsi, key(expectedKey, override)],
      [`Meta + ${name} (${type})`, meta + baseAnsi, key(expectedKey, { meta: true, ...override })],
      [`Alt + ${name} (${type})`, alt + baseAnsi, key(expectedKey, { alt: true, ...override })],
      [
        `Meta + Alt + ${name} (${type})`,
        meta + alt + baseAnsi,
        key(expectedKey, { meta: true, alt: true, ...override }),
      ],
    ];
  }

  const insertModifier = (string: string, modifier: number) => {
    const stringModifier = type === "CSI" ? `;${1 + modifier}` : `${1 + modifier}`;
    return string.length > 1
      ? string.replace(/(.+)(.)/, `$1${stringModifier}$2`)
      : string + stringModifier;
  };

  const meta = 0;
  const shift = 1;
  const alt = 2;
  const ctrl = 4;

  return [
    [`${name} (${type})`, baseAnsi, key(expectedKey, override)],
    [
      `Meta + ${name} (${type})`,
      insertModifier(baseAnsi, meta),
      key(expectedKey, { meta: true, ...override }),
    ],
    [
      `Shift + ${name} (${type})`,
      insertModifier(baseAnsi, shift),
      key(expectedKey, { shift: true, ...override }),
    ],
    [
      `Alt + ${name} (${type})`,
      insertModifier(baseAnsi, alt),
      key(expectedKey, { alt: true, ...override }),
    ],
    [
      `Ctrl + ${name} (${type})`,
      insertModifier(baseAnsi, ctrl),
      key(expectedKey, { ctrl: true, ...override }),
    ],
    [
      `Shift + Alt + ${name} (${type})`,
      insertModifier(baseAnsi, shift | alt),
      key(expectedKey, { shift: true, alt: true, ...override }),
    ],
    [
      `Shift + Ctrl + ${name} (${type})`,
      insertModifier(baseAnsi, shift | ctrl),
      key(expectedKey, { shift: true, ctrl: true, ...override }),
    ],
    [
      `Alt + Ctrl + ${name} (${type})`,
      insertModifier(baseAnsi, alt | ctrl),
      key(expectedKey, { alt: true, ctrl: true, ...override }),
    ],
  ];
}

const BENCH_CASES: Uint8Array[] = ([
  // Alphabet
  ...Array.from({ length: 26 }, (_, i) => {
    const lowerCase = String.fromCharCode(97 + i);
    const upperCase = String.fromCharCode(65 + i);

    const rules: ExpectedResult[] = [
      [lowerCase, lowerCase, key(lowerCase)],
      [upperCase, upperCase, key(upperCase, { shift: true })],
    ];

    // Excluded letters due to them being aliases to other common functionality
    const ctrlKey = String.fromCharCode(97 + i - 96);
    if (!["h", "m", "i"].includes(lowerCase)) {
      rules.push(
        ...modifierTests("Legacy", lowerCase, lowerCase, lowerCase),
        ...modifierTests("Legacy", lowerCase, ctrlKey, lowerCase, {
          ctrl: true,
        }),
      );
    } else {
      switch (lowerCase) {
        case "h":
          rules.push([`Ctrl + ${lowerCase} -> Backspace`, ctrlKey, key("backspace")]);
          break;
        case "m":
          rules.push([`Ctrl + ${lowerCase} -> Return`, ctrlKey, key("return")]);
          break;
        case "i":
          rules.push([`Ctrl + ${lowerCase} -> Tab`, ctrlKey, key("tab")]);
          break;
      }
    }

    return rules;
  }).flat(),

  ...modifierTests("Legacy", "Space", " ", "space"),
  ["Ctrl + Space", "\x00", key("space", { ctrl: true })],
  ...modifierTests("Legacy", "Tab", "\t", "tab"),
  // FIXME: ["Shift + Tab", "\x1b[Z", key("tab", { shift: true })],

  ["Return", "\r", key("return")],
  ["Shift + Return", "\x1bOM", key("return", { shift: true })],
  ["Alt + Return", "\x1b\r", key("return", { alt: true })],

  ["Escape", "\x1b", key("escape")],
  ["Alt + Escape", "\x1b\x1b", key("escape", { alt: true })],

  ["ArrowUp", "\x1b[A", key("up")],
  ...modifierTests("CSI", "ArrowUp", "\x1b[1;A", "up"),
  ["ArrowDown", "\x1b[B", key("down")],
  ...modifierTests("CSI", "ArrowDown", "\x1b[1;B", "down"),
  ["ArrowRight", "\x1b[C", key("right")],
  ...modifierTests("CSI", "ArrowRight", "\x1b[1;C", "right"),
  ["ArrowLeft", "\x1b[D", key("left")],
  ...modifierTests("CSI", "ArrowLeft", "\x1b[1;D", "left"),

  // Other special keys
  ...modifierTests("CSI", "Insert", "\x1b[2~", "insert"),
  ...modifierTests("CSI", "Delete", "\x1b[3~", "delete"),
  ...modifierTests("CSI", "PageUp", "\x1b[5~", "pageup"),
  ...modifierTests("CSI", "PageDown", "\x1b[6~", "pagedown"),
  ["Home", "\x1b[H", key("home")],
  ...modifierTests("CSI", "Home", "\x1b[1;H", "home"),
  ["End", "\x1b[F", key("end")],
  ...modifierTests("CSI", "End", "\x1b[1;F", "end"),

  // Function keys
  // F1..=F5
  ...Array.from({ length: 5 }, (_, i) => {
    const n = i + 1;
    const rules: ExpectedResult[] = [
      ...modifierTests("CSI", `F${n}`, `\x1b[1${n}~`, `f${n}`),
      ...modifierTests("SS3", `F${n}`, `\x1bO${String.fromCharCode(80 + i)}`, `f${n}`),
    ];
    return rules;
  }).flat(),
  // F6..=F12
  ...modifierTests("CSI", "F6", "\x1b[17~", "f6"),
  ...modifierTests("CSI", "F7", "\x1b[18~", "f7"),
  ...modifierTests("CSI", "F8", "\x1b[19~", "f8"),
  ...modifierTests("CSI", "F9", "\x1b[20~", "f9"),
  ...modifierTests("CSI", "F10", "\x1b[21~", "f10"),
  ...modifierTests("CSI", "F11", "\x1b[23~", "f11"),
  ...modifierTests("CSI", "F12", "\x1b[24~", "f12"),
] as ExpectedResult[]).map((x) => new TextEncoder().encode(x[1]));

Deno.bench("old", () => {
  for (const buffer of BENCH_CASES) {
    oldDecodeBuffer(buffer);
  }
});

Deno.bench("new", { baseline: true }, () => {
  for (const buffer of BENCH_CASES) {
    decodeBuffer(buffer);
  }
});

import { assertArrayIncludes, assertEquals } from "jsr:@std/assert";
import { decodeBuffer, type KeyPress, type MousePress } from "../src/decode.ts";

type ExpectedResult = [name: string, ansi: string, KeyPress];

function mouse(modifiers: Partial<MousePress>): MousePress {
  return {
    key: "mouse",
    x: 0,
    y: 0,
    shift: false,
    ctrl: false,
    meta: false,
    alt: false,
    release: false,
    drag: false,
    move: false,
    ...modifiers,
  };
}

function key(key: string, modifiers: Partial<KeyPress> = {}): KeyPress {
  return {
    key,
    alt: false,
    ctrl: false,
    meta: false,
    shift: false,
    ...modifiers,
  };
}

function modifierTests(
  type: "CSI" | "SS3" | "Legacy",
  name: string,
  baseAnsi: string,
  expectedKey: string,
  override: Partial<KeyPress> = {},
  skipDefault = false,
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
    return string.length > 1 ? string.replace(/(.+)(.)/, `$1${stringModifier}$2`) : string + stringModifier;
  };

  const meta = 0;
  const shift = 1;
  const alt = 2;
  const ctrl = 4;

  const rules: ExpectedResult[] = [
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

  if (!skipDefault) {
    rules.push([`${name} (${type})`, baseAnsi, key(expectedKey, override)]);
  }

  return rules;
}

//  TODO: emojis and stuff
const EXPECTED_RESULTS: ExpectedResult[] = [
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
  ...modifierTests("CSI", "ArrowUp", "\x1b[1A", "up", {}, true),
  ["ArrowDown", "\x1b[B", key("down")],
  ...modifierTests("CSI", "ArrowDown", "\x1b[1B", "down", {}, true),
  ["ArrowRight", "\x1b[C", key("right")],
  ...modifierTests("CSI", "ArrowRight", "\x1b[1C", "right", {}, true),
  ["ArrowLeft", "\x1b[D", key("left")],
  ...modifierTests("CSI", "ArrowLeft", "\x1b[1D", "left", {}, true),

  // Other special keys
  ...modifierTests("CSI", "Insert", "\x1b[2~", "insert"),
  ...modifierTests("CSI", "Delete", "\x1b[3~", "delete"),
  ...modifierTests("CSI", "PageUp", "\x1b[5~", "pageup"),
  ...modifierTests("CSI", "PageDown", "\x1b[6~", "pagedown"),
  ["Home", "\x1b[H", key("home")],
  ...modifierTests("CSI", "Home", "\x1b[1H", "home", {}, true),
  ["End", "\x1b[F", key("end")],
  ...modifierTests("CSI", "End", "\x1b[1F", "end", {}, true),

  // Function keys
  // F1..=F4
  ...Array.from({ length: 4 }, (_, i) => {
    const n = i + 1;
    const rules: ExpectedResult[] = [
      ...modifierTests("CSI", `F${n}`, `\x1b[1${n}~`, `f${n}`),
      ...modifierTests("CSI", `F${n}`, `\x1b[1${String.fromCharCode(80 + i)}`, `f${n}`, {}, true),
      ...modifierTests("SS3", `F${n}`, `\x1bO${String.fromCharCode(80 + i)}`, `f${n}`),
    ];
    return rules;
  }).flat(),
  // F5..=F12
  ...modifierTests("CSI", "F5", "\x1b[15~", "f5"),
  ...modifierTests("CSI", "F6", "\x1b[17~", "f6"),
  ...modifierTests("CSI", "F7", "\x1b[18~", "f7"),
  ...modifierTests("CSI", "F8", "\x1b[19~", "f8"),
  ...modifierTests("CSI", "F9", "\x1b[20~", "f9"),
  ...modifierTests("CSI", "F10", "\x1b[21~", "f10"),
  ...modifierTests("CSI", "F11", "\x1b[23~", "f11"),
  ...modifierTests("CSI", "F12", "\x1b[24~", "f12"),

  // Non-ASCII characters
  // TODO: add more
  ["æ", "æ", key("æ")],
  ["Æ", "Æ", key("Æ", { shift: true })],
  ["ą", "ą", key("ą", { shift: false })],
  ["Ą", "Ą", key("Ą", { shift: true })],
  ["þ", "þ", key("þ", { shift: false })],
  ["Þ", "Þ", key("Þ", { shift: true })],
  ["„", "„", key("„", { shift: false })],
  ["Family", "👪", key("👪")],
  ["Dog", "🐕", key("🐕")],

  // Mouse
  ...Array.from({ length: (232 / 32) ** 2 }, (_, i) => {
    const x = ((i * 32) + 1) % 232;
    const y = Math.floor((i / (232 / 32)) + 1) % 232;

    const utfX = i % 2015;
    const utfY = Math.floor(i / 2015);

    const en = (x: number) => String.fromCharCode(x + 32);

    const modifiers: [number, string, Partial<MousePress>][] = [
      [4, "Shift", { shift: true }],
      [8, "Alt", { alt: true }],
      [16, "Control", { ctrl: true }],
      [12, "Alt + Shift", { alt: true, shift: true }],
      [24, "Control + Alt", { ctrl: true, alt: true }],
      [20, "Shift + Control", { shift: true, ctrl: true }],
      [28, "Shift + Alt + Control", { shift: true, alt: true, ctrl: true }],
    ];

    // TODO: URXVT, SGR
    const X10 = (x: number, y: number, suffix: string): ExpectedResult[][] =>
      modifiers.map(([modifier, modifierName, modifierObj]) => [
        [
          `${modifierName} + Mouse move (${x}, ${y}) ${suffix}`,
          `\x1b[M${en(modifier + 35) + en(x) + en(y)}`,
          mouse({ x, y, move: true, ...modifierObj }),
        ],
        [
          `${modifierName} + Mouse left click (${x}, ${y}) ${suffix}`,
          `\x1b[M${en(modifier + 0) + en(x) + en(y)}`,
          mouse({ x, y, button: 0, ...modifierObj }),
        ],
        [
          `${modifierName} + Mouse middle click (${x}, ${y}) ${suffix}`,
          `\x1b[M${en(modifier + 1) + en(x) + en(y)}`,
          mouse({ x, y, button: 1, ...modifierObj }),
        ],
        [
          `${modifierName} + Mouse right click (${x}, ${y}) ${suffix}`,
          `\x1b[M${en(modifier + 2) + en(x) + en(y)}`,
          mouse({ x, y, button: 2, ...modifierObj }),
        ],
        [
          `${modifierName} + Mouse release click (${x}, ${y}) ${suffix}`,
          `\x1b[M${en(modifier + 3) + en(x) + en(y)}`,
          mouse({ x, y, release: true, ...modifierObj }),
        ],

        [
          `${modifierName} + Mouse scroll up (${x}, ${y}) ${suffix}`,
          `\x1b[M${en(modifier + 64) + en(x) + en(y)}`,
          mouse({ x, y, scroll: 0, ...modifierObj }),
        ],
        [
          `${modifierName} + Mouse scroll down (${x}, ${y}) ${suffix}`,
          `\x1b[M${en(modifier + 65) + en(x) + en(y)}`,
          mouse({ x, y, scroll: 1, ...modifierObj }),
        ],
      ]);

    const rules: ExpectedResult[] = [
      ...X10(x, y, "X10 (ASCII)"),
      ...X10(utfX, utfY, "X10 (UTF)"),
    ].flat();

    return rules;
  }).flat(),
];

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

Deno.test("decodeBuffer() – 1 input", () => {
  for (const [name, ansi, keyPress] of EXPECTED_RESULTS) {
    const ansiBuffer = textEncoder.encode(ansi);
    const escaped = Deno.inspect(textDecoder.decode(ansiBuffer));

    assertEquals(decodeBuffer(ansiBuffer), [keyPress], `${name}: ${escaped}`);
  }
});

Deno.test("decodeBuffer() – 2 inputs at once", () => {
  const POSSIBLE_MULTIPLE = EXPECTED_RESULTS.filter((result) => {
    // Escape key cannot be sent together with other keys
    // Possibly to avoid mixing it with legacy modifier encoding
    if (/Escape/.test(result[0])) return false;
    return true;
  });

  for (let i = 0; i < POSSIBLE_MULTIPLE.length; ++i) {
    const [nameA, ansiA, keyPressA] = POSSIBLE_MULTIPLE[i];
    for (let j = 0; j < 4; ++j) {
      const [nameB, ansiB, keyPressB] = POSSIBLE_MULTIPLE[(i + j) % POSSIBLE_MULTIPLE.length];
      const expectedResult = [keyPressA, keyPressB];

      const permutations = [[ansiA + ansiB, `"${nameA}" + "${nameB}"`], [ansiB + ansiA, `"${nameB}" + "${nameA}"`]];

      for (const [ansi, name] of permutations) {
        const ansiBuffer = textEncoder.encode(ansi);
        const escaped = Deno.inspect(textDecoder.decode(ansiBuffer));
        assertArrayIncludes(decodeBuffer(ansiBuffer) as KeyPress[], expectedResult, `${name}: ${escaped}`);
      }
    }
  }
});

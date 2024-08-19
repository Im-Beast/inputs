// deno-fmt-ignore
const baseKeys = [
  "escape", "f1","f4", "f5", "f9", "f12", "delete",
  "`", "~", "1", "4", "5", "9", "0", "-", "_", "=", "+", "backspace",
  "tab", "q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "[", "{", "]", "}", "\\", "|",
  "a", "s", "d", "f", "g", "h", "j", "k", "l", ";", ":", "'", '"', "return (enter)",
  "z", "x", "c", "v", "b", "n", "m", ",", "<", ".", ">", "/", "?",
  "space", "home", "end", "pageup", "pagedown"
];

const modifiers = ["shift", "ctrl", "alt", "meta (win)"];
const keysToPress = baseKeys.map((key) => {
  return [key, ...modifiers.map((modifier) => `${modifier} + ${key}`)];
}).flat();

const keyBuffers = new Map<string, Uint8Array[]>();

console.clear();
console.log("\nType key it asks you to. If you can't hit the key for some reason – press escape.\n");

let i = 0;
let lastKey = 0;
console.log("Type key \x1b[1m\x1b[32m%s\x1b[0m", keysToPress[i]);

Deno.stdin.setRaw(true, { cbreak: true });
for await (const buffer of Deno.stdin.readable) {
  const key = keysToPress[i];
  const buffers = keyBuffers.get(key) ?? (keyBuffers.set(key, []).get(key)!);

  if (Date.now() - lastKey > 5) {
    if (++i >= keysToPress.length) break;
    console.log("\x1b[1A\x1b[MType key \x1b[1m\x1b[32m%s\x1b[0m", keysToPress[i]);
    lastKey = Date.now();
  }

  buffers.push(buffer);
}

console.log(keyBuffers);

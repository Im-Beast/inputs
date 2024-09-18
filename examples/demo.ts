import { decodeBuffer } from "../src/decode.ts";

export async function* decodeStdout() {
  const ENABLE_MOUSE = "\x1b[>1u\x1b[=2u\x1b[?1005h\x1b[?1015h\x1b[?1002h\x1b[?9h"; //"\x1b[?9h\x1b[?1000h\x1b[?1002h\x1b[?1005h\x1b[?1006h\x1b[?1003h";
  const DISABLE_MOUSE = "\x1b[<u\x1b[?1005l\x1b[?1015l\x1b[?1002l\x1b[?9l"; //"\x1b[?9l\x1b[?1000l\x1b[?1002l\x1b[?1005l\x1b[?1006l\x1b[?1003l";

  Deno.stdin.setRaw(true);
  console.log(ENABLE_MOUSE);

  for await (const chunk of Deno.stdin.readable) {
    console.log(Deno.inspect(chunk, { breakLength: 99999, colors: true, compact: true }), [
      new TextDecoder().decode(chunk),
    ]);

    const decoded = decodeBuffer(chunk);
    if (decoded?.[0]?.key === "c" && decoded[0].ctrl) break;

    yield decoded;
  }

  console.log(DISABLE_MOUSE);
}

if (import.meta.main) {
  for await (const key of decodeStdout()) {
    console.log(key);
  }
}

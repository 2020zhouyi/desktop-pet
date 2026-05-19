const state = process.argv[2] ?? "waving";
const durationArg = process.argv[3];
const body = { state };

if (durationArg !== undefined) {
  body.durationMs = Number(durationArg);
}

const res = await fetch("http://127.0.0.1:7777/state", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

if (!res.ok) {
  console.error(await res.text());
  process.exit(1);
}

console.log(await res.text());

const state = process.argv[2] ?? "waving";
const durationMs = Number(process.argv[3] ?? 1800);

const res = await fetch("http://127.0.0.1:7777/state", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ state, durationMs }),
});

if (!res.ok) {
  console.error(await res.text());
  process.exit(1);
}

console.log(await res.text());

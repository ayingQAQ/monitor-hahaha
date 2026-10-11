import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { gunzipSync } from "node:zlib";

const file = process.argv[2] || "theme.tar.gz";
gunzipSync(await readFile(file));
const listing = spawnSync("tar", ["-tzf", file], { encoding: "utf8" });
assert.equal(listing.status, 0, "Archive must be readable");
const entries = listing.stdout
  .trim()
  .split(/\r?\n/)
  .map((entry) => entry.replace(/^\.\//, ""));
assert.ok(
  entries.includes("theme.json"),
  "Hub requires theme.json at archive root, without a wrapper directory",
);
assert.ok(
  entries.includes("dist/index.html"),
  "Hub requires dist/index.html at archive root",
);
assert.ok(
  entries.every(
    (entry) => !entry.startsWith("/") && !entry.split("/").includes(".."),
  ),
  "Unsafe archive path",
);
for (const notice of ["LICENSE", "THIRD_PARTY.md", "THIRD_PARTY_NOTICES.txt"])
  assert.ok(entries.includes(notice), `Missing ${notice}`);
const manifest = spawnSync("tar", ["-xOf", file, "theme.json"], {
  encoding: "utf8",
});
assert.equal(manifest.status, 0);
const actual = JSON.parse(manifest.stdout);
const expected = JSON.parse(await readFile("theme.json", "utf8"));
assert.equal(actual.short, expected.short);
assert.equal(actual.version, expected.version);
console.log(`Hub archive layout verified: ${actual.short} ${actual.version}`);

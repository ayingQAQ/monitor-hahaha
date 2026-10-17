import assert from "node:assert/strict";
import { appendFile, readFile } from "node:fs/promises";

const read = async (file) => JSON.parse(await readFile(file, "utf8"));
const [theme, pkg, lock] = await Promise.all([
  read("theme.json"), read("package.json"), read("package-lock.json"),
]);
assert.match(theme.version, /^\d+\.\d+\.\d+$/, "Use a stable x.y.z theme version");
assert.equal(pkg.version, theme.version, "package.json and theme.json versions differ");
assert.equal(lock.version, theme.version, "package-lock.json version differs");
assert.equal(lock.packages[""].version, theme.version, "Lockfile root version differs");
assert.equal(theme.short, "monitor-hahaha", "Unexpected theme short name");
const tag = process.env.RELEASE_TAG || "";
if (tag) assert.equal(tag, `v${theme.version}`, "Tag must match theme.json version");

if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT,
    `version=${theme.version}\nartifact=${theme.short}-${theme.version}\npublish=${Boolean(tag)}\ntag=${tag}\n`);
}
console.log(`Version verified: ${theme.version}${tag ? ` (${tag})` : " (build only)"}`);

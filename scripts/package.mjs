import {
  cp,
  mkdir,
  readFile,
  readdir,
  lstat,
  stat,
  writeFile,
  rm,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import path from "node:path";

const manifest = JSON.parse(await readFile("theme.json", "utf8"));
for (const key of [
  "name",
  "short",
  "description",
  "version",
  "author",
  "url",
]) {
  if (typeof manifest[key] !== "string")
    throw new Error(`Missing manifest field: ${key}`);
}
if (!/^[A-Za-z0-9_-]+$/.test(manifest.short))
  throw new Error("Invalid short name");
const stage = path.resolve(".cache/package", manifest.short);
if (!stage.startsWith(path.resolve(".cache/package") + path.sep))
  throw new Error("Unsafe staging path");
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
await cp("dist", path.join(stage, "dist"), { recursive: true });
await cp("theme.json", path.join(stage, "theme.json"));
for (const notice of ["LICENSE", "THIRD_PARTY.md", "THIRD_PARTY_NOTICES.txt"])
  await cp(notice, path.join(stage, notice));
await cp("preview.png", path.join(stage, "preview.png"));
await stat(path.join(stage, "dist/index.html"));
let count = 0,
  total = 0;
async function check(directory) {
  for (const name of await readdir(directory)) {
    const file = path.join(directory, name),
      info = await lstat(file);
    count++;
    if (info.isSymbolicLink()) throw new Error("Symlinks are not allowed");
    if (info.isDirectory()) await check(file);
    else {
      if (!info.isFile() || info.size > 8 * 1024 ** 2)
        throw new Error(`Unsupported entry: ${file}`);
      total += info.size;
    }
  }
}
await check(stage);
if (total > 64 * 1024 ** 2 || count > 2000)
  throw new Error("Theme exceeds installer limits");
const archive = spawnSync(
  "tar",
  [
    "-czf",
    "theme.tar.gz",
    "-C",
    stage,
    "dist",
    "theme.json",
    "preview.png",
    "LICENSE",
    "THIRD_PARTY.md",
    "THIRD_PARTY_NOTICES.txt",
  ],
  { stdio: "inherit" },
);
if (archive.status !== 0) throw new Error("tar failed");
const data = await readFile("theme.tar.gz");
gunzipSync(data); // validates stream completion and CRC, same purpose as gzip -t
if (data.length > 32 * 1024 ** 2) throw new Error("Archive exceeds 32 MiB");
// Hub reads the manifest directly from the staging root, then creates <short>.
const layout = spawnSync(process.execPath, ["scripts/check-package.mjs"], {
  stdio: "inherit",
});
if (layout.status !== 0)
  throw new Error("Hub archive layout validation failed");
await writeFile(
  ".cache/theme.sha256",
  `${createHash("sha256").update(data).digest("hex")}  theme.tar.gz\n`,
);
console.log(
  `theme.tar.gz verified: ${count} entries, ${total} unpacked bytes, ${data.length} compressed bytes`,
);

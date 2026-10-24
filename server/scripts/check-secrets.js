// Checks tracked/staged files without ever printing credential values or file content.
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config.js";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
const files = git("ls-files", "-z").split("\0").filter(Boolean);
const forbidden = files.filter(
  (file) => /(^|\/)\.env(?:\.|$)/.test(file) && file !== "server/.env.example",
);
if (forbidden.length)
  throw new Error(
    "An environment file is tracked or staged; stop before committing.",
  );
const key =
  config.apiKey && config.apiKey !== "your_key_here" ? config.apiKey : null;
if (key) {
  for (const file of files) {
    const staged = git("show", `:${file}`);
    let working = "";
    try {
      working = await readFile(file, "utf8");
    } catch {}
    if (staged.includes(key) || working.includes(key))
      throw new Error(
        `Credential detected in ${file}; stop before committing.`,
      );
  }
  async function checkBuild(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await checkBuild(path);
      else if ((await readFile(path, "utf8")).includes(key))
        throw new Error("Credential detected in browser build.");
    }
  }
  await checkBuild("dist");
  if (git("log", "-p", "--all").includes(key))
    throw new Error(
      "Credential detected in Git history. STOP and notify the repository owner.",
    );
}
console.log(
  "Secret check passed: no tracked environment secrets or supplied key in source, index, history, or browser build.",
);

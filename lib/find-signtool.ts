import fs from "fs";
import { join } from "path";

const known_bases = ["C:\\Program Files (x86)", "C:", "D:"];
const folders: (string | RegExp)[] = ["Windows Kits", "10", "bin", /^[.\d]+$/, "x64"];
const binary = "signtool.exe";

export default function findSignTool(path_from_config?: string): string | undefined {
  if (path_from_config && fs.existsSync(path_from_config)) {
    return path_from_config;
  }

  for (const base of known_bases) {
    const path = dig(base, folders, binary);
    if (path) {
      return path;
    }
  }
}

function dig(
  base: string,
  folders: (string | RegExp)[],
  binary: string
): string | undefined {
  let path = base;

  for (const folder of folders) {
    if (typeof folder === "string") {
      path = join(path, folder);
      if (!fs.existsSync(path)) return;
    } else if (folder instanceof RegExp) {
      let next = fs.readdirSync(path).find((item) => folder.test(item));
      if (!next) return;
      path = join(path, next);
      if (!fs.existsSync(path)) return;
    } else {
      throw unexpected(folder);
    }
  }
  path = join(path, binary);
  if (!fs.existsSync(path)) return;

  return path;
}

function unexpected(value: unknown): Error {
  return new Error(
    "expected string or regexp, got " + Object.prototype.toString.call(value)
  );
}

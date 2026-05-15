import fs from "fs";
import path from "path";

const config_file = path.join(import.meta.dir, "..", ".config");

export interface Config {
  signtool?: string;
  thumbprint?: string;
}

export function load_config(): Config {
  let content: string;
  try {
    content = fs.readFileSync(config_file, "utf8");
  } catch {
    console.error(
      "Not found .config file at " + config_file + "\n" +
      "Create one with format: key=value (see .config.example)"
    );
    process.exit(1);
  }

  const result: Config = {};
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (value.length === 0) continue;
    if (key === "signtool" || key === "thumbprint") {
      result[key] = value;
    }
  }
  return result;
}

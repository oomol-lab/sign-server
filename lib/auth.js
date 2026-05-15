import fs from "fs";
import path from "path";
import { timingSafeEqual } from "crypto";

const token_file = path.join(import.meta.dir, "..", ".token");

function load_credentials() {
  let content;
  try {
    content = fs.readFileSync(token_file, "utf8");
  } catch {
    console.error(
      "Not found .token file at " + token_file + "\n" +
      "Create one with format: username:password (see .token.example)"
    );
    process.exit(1);
  }
  const lines = content
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("#") && s.includes(":"));
  if (lines.length === 0) {
    console.error(
      "Invalid .token file. Expected at least one line of: username:password"
    );
    process.exit(1);
  }
  return lines;
}

const credentials_list = load_credentials();
const expected_bufs = credentials_list.map((cred) =>
  Buffer.from("Basic " + Buffer.from(cred).toString("base64"))
);

export function check_auth(req) {
  const header = req.headers.get("authorization");
  if (!header) return false;
  const got = Buffer.from(header);
  for (const expected of expected_bufs) {
    if (got.length === expected.length && timingSafeEqual(got, expected)) {
      return true;
    }
  }
  return false;
}

export function unauthorized(extra_headers = {}) {
  return new Response("Unauthorized", {
    status: 401,
    headers: {
      ...extra_headers,
      "WWW-Authenticate": 'Basic realm="sign-server", charset="UTF-8"',
      "Content-Type": "text/plain",
    },
  });
}

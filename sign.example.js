// Drop-in custom sign script for electron-builder.
//
// Configure via environment variables (typically in your CI):
//   SIGN_SERVER_URL=http://signer.intranet:3000   # required, may be IP or domain
//   SIGN_SERVER_USER=admin                        # required, HTTP Basic Auth
//   SIGN_SERVER_PASS=secret                       # required, HTTP Basic Auth
//
// Wire it up in your electron-builder config:
//   "win": { "sign": "./sign.example.js" }

const fs = require("fs");
const { basename } = require("path");
const crypto = require("crypto");
const { pipeline } = require("stream/promises");

const SIGN_SERVER_URL = (process.env.SIGN_SERVER_URL || "").replace(/\/+$/, "");
const SIGN_SERVER_USER = process.env.SIGN_SERVER_USER || "";
const SIGN_SERVER_PASS = process.env.SIGN_SERVER_PASS || "";

if (!SIGN_SERVER_URL) {
  throw new Error("SIGN_SERVER_URL is required, e.g. http://signer.intranet:3000");
}
if (!SIGN_SERVER_USER || !SIGN_SERVER_PASS) {
  throw new Error("SIGN_SERVER_USER and SIGN_SERVER_PASS are required");
}

const authHeader =
  "Basic " +
  Buffer.from(`${SIGN_SERVER_USER}:${SIGN_SERVER_PASS}`).toString("base64");

/** @type {import('app-builder-lib').CustomWindowsSign} */
module.exports = async function sign({ path, hash, isNest }) {
  const fileHash = await computeHash(path);

  let resp = await fetch(`${SIGN_SERVER_URL}/exists`, {
    method: "POST",
    headers: { Authorization: authHeader },
    body: fileHash,
  });
  if (!resp.ok) {
    throw new Error(`sign-server /exists failed: ${resp.status} ${await resp.text()}`);
  }

  const exist = await resp.json();
  const body = new FormData();
  if (exist) {
    body.append("file", fileHash);
  } else {
    body.append("file", await fs.openAsBlob(path), basename(path));
  }
  body.append("hash", hash);
  body.append("isNest", isNest ? "1" : "");

  resp = await fetch(`${SIGN_SERVER_URL}/sign`, {
    method: "POST",
    headers: { Authorization: authHeader },
    body,
  });
  if (!resp.ok) {
    throw new Error(`sign-server /sign failed: ${resp.status} ${await resp.text()}`);
  }

  await pipeline(resp.body, fs.createWriteStream(path));
};

async function computeHash(path) {
  const hash = crypto.createHash("md5");
  for await (const chunk of fs.createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

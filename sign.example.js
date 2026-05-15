// Drop-in custom sign script for electron-builder.
//
// Configure via environment variables (typically in your CI):
//   SIGN_SERVER_URL=http://signer.intranet:3000   # required, may be IP or domain
//   SIGN_SERVER_USER=admin                        # required, HTTP Basic Auth
//   SIGN_SERVER_PASS=secret                       # required, HTTP Basic Auth
//   SIGN_SERVER_CHUNK_THRESHOLD=16777216          # optional, bytes; default 16 MiB
//   SIGN_SERVER_CHUNK_SIZE=4194304                # optional, bytes; default 4 MiB
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

const CHUNK_THRESHOLD = Number(process.env.SIGN_SERVER_CHUNK_THRESHOLD) || 16 * 1024 * 1024;
const CHUNK_SIZE = Number(process.env.SIGN_SERVER_CHUNK_SIZE) || 4 * 1024 * 1024;
const CHUNK_MAX_RETRY = 3;

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
  const name = basename(path);

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
    const size = fs.statSync(path).size;
    if (size > CHUNK_THRESHOLD) {
      await uploadChunked(path, fileHash, name, size);
      body.append("file", fileHash);
    } else {
      body.append("file", await fs.openAsBlob(path), name);
    }
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

async function uploadChunked(filePath, fileHash, name, fileSize) {
  const total = Math.ceil(fileSize / CHUNK_SIZE);

  // Resume: only trust server state when total matches; otherwise restart.
  const received = new Set();
  try {
    const resp = await fetch(`${SIGN_SERVER_URL}/chunk/status`, {
      method: "POST",
      headers: { Authorization: authHeader },
      body: fileHash,
    });
    if (resp.ok) {
      const status = await resp.json();
      if (status && status.total === total) {
        for (const i of status.received || []) received.add(i);
      } else if (status && status.total != null) {
        await fetch(`${SIGN_SERVER_URL}/chunk/abort`, {
          method: "POST",
          headers: { Authorization: authHeader },
          body: fileHash,
        });
      }
    }
  } catch {}

  const fd = fs.openSync(filePath, "r");
  try {
    for (let i = 0; i < total; i++) {
      if (received.has(i)) continue;
      const offset = i * CHUNK_SIZE;
      const length = Math.min(CHUNK_SIZE, fileSize - offset);
      const buf = Buffer.alloc(length);
      fs.readSync(fd, buf, 0, length, offset);
      await sendChunk(fileHash, i, total, name, buf);
    }
  } finally {
    fs.closeSync(fd);
  }

  const fin = await fetch(`${SIGN_SERVER_URL}/chunk/finalize`, {
    method: "POST",
    headers: { Authorization: authHeader },
    body: fileHash,
  });
  if (!fin.ok) {
    throw new Error(`sign-server /chunk/finalize failed: ${fin.status} ${await fin.text()}`);
  }
}

async function sendChunk(fileHash, index, total, name, buf) {
  const url =
    `${SIGN_SERVER_URL}/chunk` +
    `?hash=${fileHash}` +
    `&index=${index}` +
    `&total=${total}` +
    `&name=${encodeURIComponent(name)}`;
  let lastError;
  for (let attempt = 0; attempt < CHUNK_MAX_RETRY; attempt++) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/octet-stream",
        },
        body: buf,
      });
      if (resp.ok) return;
      lastError = new Error(
        `sign-server /chunk[${index}] failed: ${resp.status} ${await resp.text()}`
      );
    } catch (e) {
      lastError = e;
    }
    if (attempt < CHUNK_MAX_RETRY - 1) {
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  throw lastError;
}

async function computeHash(path) {
  const hash = crypto.createHash("md5");
  for await (const chunk of fs.createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

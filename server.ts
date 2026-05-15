// The server provides a /sign API that returns signed file.
// Caches are stored at node_modules/.sign-temp, here's how the cache works:
// There are 2 levels of file cache:
// 1. All user uploaded files (isNest = false) are cached.
// 2. Signed files are cached.
// When isNest is false, this file will be preserved as long as possible;
// Signed files and those with isNest = true will be deleted after the job.
// Because the code signing includes a timestamp, it makes different files at each time.
//
// exists(file content hash):
//    return exists node_modules/.sign-temp/{file content hash}
//
// sign(file = hash or blob, method = sha1):
//    graph = read node_modules/.sign-temp/meta.json/{method}
//    if file is blob, write node_modules/.sign-temp/{hash of file}/{file}
//    if file is hash {
//       if exists node_modules/.sign-temp/{graph[file]} then return that file
//       file = read node_modules/.sign-temp/{file}/*
//    }
//    new_file = {
//       write file to $TEMP/file
//       signtool {options(method)} $TEMP/file
//       read $TEMP/file
//    }
//    write node_modules/.sign-temp/{hash of new_file}/{new_file}
//    graph[hash of file] = hash(new_file)
//    save graph
//    return new_file
//
// client.sign(file, method):
//    POST /upload-fast "hash(file)"
//       => true,  use that hash
//       => false, use file blob
//
//    POST /sign { file = hash or blob, method }
//       => new_file blob
//

import os from "os";
import path from "path";
import findSignTool from "./lib/find-signtool.ts";
import findCertificate from "./lib/find-certificate.ts";
import makeSignFn, { type SignBody, type HashMethod } from "./lib/make-sign-fn.ts";
import { cache } from "./lib/utils.ts";
import {
  chunks_clear,
  chunk_status,
  chunk_save,
  chunk_finalize,
  chunk_abort,
} from "./lib/chunks.ts";
import { check_auth, unauthorized } from "./lib/auth.ts";
import { load_config } from "./lib/config.ts";

const indexPath = path.join(import.meta.dir, "index.html");

const config = load_config();
const signtool = await findSignTool(config.signtool);
const certificates = await findCertificate(config.thumbprint).catch(() => []);

if (!signtool) {
  console.error("Not found SignTool.exe");
}

if (certificates.length === 0) {
  console.error("Not found certificate");
}

if (certificates.length > 1) {
  console.error(
    "Found multiple certificates:",
    certificates.map((e) => e.subject)
  );
}

if (!signtool || certificates.length !== 1) {
  process.exit(1);
}

const certificate = certificates[0];
const sign = makeSignFn(signtool, certificate);

cache.clear();
chunks_clear();

const CORS = { "Access-Control-Allow-Origin": "*" };

function is_valid_hash(s: string | null): s is string {
  return typeof s === "string" && /^[a-f0-9]{32}$/i.test(s);
}

const server = Bun.serve({
  hostname: "0.0.0.0",
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);

    if (!check_auth(req)) {
      return unauthorized(CORS);
    }

    if (req.method === "GET" && url.pathname === "/") {
      return new Response(Bun.file(indexPath), {
        headers: { ...CORS, "Content-Type": "text/html" },
      });
    }

    // POST /exists "hash of file" => (json) true | false
    if (req.method === "POST" && url.pathname === "/exists") {
      const hash = await req.text();
      return Response.json(cache.has(hash), { headers: CORS });
    }

    // POST /chunk/status "hash" => (json) { received: number[], total, name }
    if (req.method === "POST" && url.pathname === "/chunk/status") {
      const hash = await req.text();
      if (!is_valid_hash(hash)) {
        return new Response("invalid hash", { status: 400, headers: CORS });
      }
      return Response.json(chunk_status(hash), { headers: CORS });
    }

    // POST /chunk?hash=&index=&total=&name= (body = chunk bytes)
    //   => (json) { received: number[] }
    if (req.method === "POST" && url.pathname === "/chunk") {
      const hash = url.searchParams.get("hash");
      const index_str = url.searchParams.get("index");
      const total_str = url.searchParams.get("total");
      const name = url.searchParams.get("name");
      if (!is_valid_hash(hash) || !index_str || !total_str || !name) {
        return new Response("missing required query params", { status: 400, headers: CORS });
      }
      const index = Number(index_str);
      const total = Number(total_str);
      if (
        !Number.isInteger(index) || !Number.isInteger(total) ||
        total <= 0 || index < 0 || index >= total
      ) {
        return new Response("invalid index/total", { status: 400, headers: CORS });
      }
      try {
        const data = new Uint8Array(await req.arrayBuffer());
        const received = await chunk_save(hash, index, total, name, data);
        return Response.json({ received }, { headers: CORS });
      } catch (error) {
        return new Response((error as Error).message, { status: 500, headers: CORS });
      }
    }

    // POST /chunk/finalize "hash" => (json) { ok: true }
    if (req.method === "POST" && url.pathname === "/chunk/finalize") {
      const hash = await req.text();
      if (!is_valid_hash(hash)) {
        return new Response("invalid hash", { status: 400, headers: CORS });
      }
      try {
        await chunk_finalize(hash);
        return Response.json({ ok: true }, { headers: CORS });
      } catch (error) {
        return new Response((error as Error).message, { status: 400, headers: CORS });
      }
    }

    // POST /chunk/abort "hash" => (json) { ok: true }
    if (req.method === "POST" && url.pathname === "/chunk/abort") {
      const hash = await req.text();
      if (!is_valid_hash(hash)) {
        return new Response("invalid hash", { status: 400, headers: CORS });
      }
      chunk_abort(hash);
      return Response.json({ ok: true }, { headers: CORS });
    }

    // POST /sign FormData { file, hash, isNest } => (octet-stream) signed file
    //            file   = "hash of exist file" or (new file) { name, buffer }
    //            hash   = "sha1" or "sha256"
    //            isNest = "" or "1"
    if (req.method === "POST" && url.pathname === "/sign") {
      let body: SignBody | null;
      try {
        body = await parseSignBody(req);
      } catch {
        return new Response("expected form data", { status: 400, headers: CORS });
      }
      if (!body) {
        return new Response("expected form data", { status: 400, headers: CORS });
      }
      try {
        return await sign(body, CORS);
      } catch (error) {
        return new Response((error as Error).message, { status: 400, headers: CORS });
      }
    }

    return new Response(null, { status: 404, headers: CORS });
  },
  error(error) {
    return new Response(error.message, { status: 500, headers: CORS });
  },
});

async function parseSignBody(req: Request): Promise<SignBody | null> {
  const fd = await req.formData();
  const fileField = fd.get("file");
  if (fileField == null) return null;

  let file: SignBody["file"];
  if (typeof fileField === "string") {
    file = fileField;
  } else {
    const buffer = new Uint8Array(await fileField.arrayBuffer());
    file = { name: fileField.name, buffer };
  }

  return {
    file,
    hash: fd.get("hash") as HashMethod,
    isNest: fd.get("isNest") as string | null,
  };
}

// stolen from npm:local-access
const nets = os.networkInterfaces();
for (const k in nets) {
  const tmp = nets[k]!.find((x) => x.family === "IPv4" && !x.internal);
  if (tmp) {
    console.log(`serving http://${tmp.address}:${server.port}`);
  }
}

import fs from "fs";
import os from "os";
import path from "path";
import { cache, cache_dir } from "./cache.ts";

// Chunk storage layout (under cache_dir):
//   ./.chunks/{hash}/manifest.json   { hash, name, total }
//   ./.chunks/{hash}/chunk-{index}   chunk bytes (atomic via .tmp + rename)
//
// Lifecycle: chunks are wiped at server start (see chunks_clear) and removed
// after a successful finalize. A failed finalize keeps chunks so the client
// can retry; a hash-mismatch failure deletes them so the client re-uploads.

export const chunks_dir = path.join(cache_dir, ".chunks");

fs.mkdirSync(chunks_dir, { recursive: true });

interface ChunkManifest {
  hash: string;
  name: string;
  total: number;
}

function hash_dir(hash: string): string {
  return path.join(chunks_dir, hash);
}

function manifest_path(hash: string): string {
  return path.join(hash_dir(hash), "manifest.json");
}

function chunk_path(hash: string, index: number): string {
  return path.join(hash_dir(hash), `chunk-${index}`);
}

function read_manifest(hash: string): ChunkManifest | null {
  try {
    return JSON.parse(fs.readFileSync(manifest_path(hash), "utf8"));
  } catch {
    return null;
  }
}

export interface ChunkStatus {
  received: number[];
  total: number | null;
  name: string | null;
}

export function chunks_clear(): void {
  fs.rmSync(chunks_dir, { recursive: true, force: true });
  fs.mkdirSync(chunks_dir, { recursive: true });
}

export function chunk_status(hash: string): ChunkStatus {
  const dir = hash_dir(hash);
  if (!fs.existsSync(dir)) {
    return { received: [], total: null, name: null };
  }
  const manifest = read_manifest(hash);
  const received: number[] = [];
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(/^chunk-(\d+)$/);
    if (m) received.push(parseInt(m[1], 10));
  }
  received.sort((a, b) => a - b);
  return {
    received,
    total: manifest?.total ?? null,
    name: manifest?.name ?? null,
  };
}

export async function chunk_save(
  hash: string,
  index: number,
  total: number,
  name: string,
  data: Uint8Array
): Promise<number[]> {
  const dir = hash_dir(hash);
  fs.mkdirSync(dir, { recursive: true });

  const manifest: ChunkManifest = { hash, name, total };
  fs.writeFileSync(manifest_path(hash), JSON.stringify(manifest));

  const dest = chunk_path(hash, index);
  const tmp = dest + ".tmp";
  await Bun.write(tmp, data);
  fs.renameSync(tmp, dest);

  return chunk_status(hash).received;
}

export async function chunk_finalize(hash: string): Promise<void> {
  const dir = hash_dir(hash);
  if (!fs.existsSync(dir)) {
    throw new Error("no chunks for hash " + hash);
  }
  const manifest = read_manifest(hash);
  if (!manifest) {
    throw new Error("missing manifest for hash " + hash);
  }

  for (let i = 0; i < manifest.total; i++) {
    if (!fs.existsSync(chunk_path(hash, i))) {
      throw new Error(`missing chunk ${i} for hash ${hash}`);
    }
  }

  const dummy = Math.random().toString(36).slice(2);
  const assembly_dir = path.join(os.tmpdir(), `sign-server-assembly-${dummy}`);
  fs.mkdirSync(assembly_dir, { recursive: true });
  const assembled = path.join(assembly_dir, manifest.name);

  try {
    const writer = Bun.file(assembled).writer();
    const hasher = new Bun.CryptoHasher("md5");
    for (let i = 0; i < manifest.total; i++) {
      const buf = await Bun.file(chunk_path(hash, i)).bytes();
      hasher.update(buf);
      writer.write(buf);
    }
    await writer.end();

    const actual = hasher.digest("hex");
    if (actual !== hash) {
      fs.rmSync(dir, { recursive: true, force: true });
      throw new Error(`hash mismatch: expected ${hash}, got ${actual}`);
    }

    await cache.set(hash, assembled);
    const meta = cache.meta();
    meta.keep[hash] = manifest.name;
    cache.meta(meta);

    fs.rmSync(dir, { recursive: true, force: true });
  } finally {
    fs.rmSync(assembly_dir, { recursive: true, force: true });
  }
}

export function chunk_abort(hash: string): void {
  fs.rmSync(hash_dir(hash), { recursive: true, force: true });
}

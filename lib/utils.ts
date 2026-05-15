export * from "./cache.ts";

export async function compute_hash(file: string | Uint8Array): Promise<string> {
  const hasher = new Bun.CryptoHasher("md5");
  if (typeof file === "string") {
    for await (const chunk of Bun.file(file).stream()) {
      hasher.update(chunk);
    }
    return hasher.digest("hex");
  } else if (file instanceof Uint8Array) {
    hasher.update(file);
    return hasher.digest("hex");
  } else {
    throw new Error(
      "unknown hash target " + Object.prototype.toString.call(file)
    );
  }
}

export const md5 = compute_hash;

export interface ExecOptions {
  timeout?: number;
}

export async function exec(
  file: string,
  args: string[],
  options: ExecOptions = {}
): Promise<string> {
  const proc = Bun.spawn([file, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
    timeout: options.timeout,
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    let message = `Exit code: ${exitCode}.`;
    if (stdout.length > 0) message += "\n" + stdout;
    if (stderr.length > 0) message += "\n" + stderr;
    throw new Error(message);
  }

  return stdout;
}

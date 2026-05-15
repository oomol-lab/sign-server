import { exec } from "./utils.ts";

export interface Certificate {
  thumbprint: string;
  subject: string;
  store: string;
  isLocalMachine: boolean;
}

interface RawCertInfo {
  Subject: string;
  PSParentPath: string;
  Thumbprint: string;
}

export default async function findCertificate(thumbprint?: string): Promise<Certificate[]> {
  // stolen from npm:app-builder-lib/src/codeSign/windowsCodeSign.ts
  const raw = await exec("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "Get-ChildItem -Recurse Cert: -CodeSigningCert | Select-Object -Property Subject,PSParentPath,Thumbprint | ConvertTo-Json -Compress",
  ]);
  const certList: RawCertInfo[] = raw.length === 0 ? [] : toArray(JSON.parse(raw));
  let result: Certificate[] = [];
  for (const certInfo of certList) {
    const parentPath = certInfo.PSParentPath;
    const store = parentPath.slice(parentPath.lastIndexOf("\\") + 1);
    const isLocalMachine = parentPath.includes("Certificate::LocalMachine");
    result.push({
      thumbprint: certInfo.Thumbprint,
      subject: certInfo.Subject,
      store,
      isLocalMachine,
    });
  }
  if (thumbprint) {
    const want = normalize(thumbprint);
    result = result.filter((e) => normalize(e.thumbprint) === want);
  }
  return result;
}

function normalize(thumbprint: string): string {
  return thumbprint.replace(/\s+/g, "").toLowerCase();
}

function toArray<T>(a: T | T[] | null | undefined): T[] {
  return a == null ? [] : Array.isArray(a) ? a : [a];
}

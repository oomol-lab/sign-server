# Sign Server

English | [简体中文](./README.zh-CN.md)

An HTTP wrapper around Microsoft [SignTool.exe](https://learn.microsoft.com/en-us/dotnet/framework/tools/signtool-exe) that lets you sign Windows binaries from any machine on your LAN — including Linux/macOS CI runners that cannot access the hardware UKey directly.

> [!WARNING]
> This service exposes a hardware-backed code-signing certificate over HTTP. **Do not expose it to the public internet.** Run it only on a trusted intranet, and protect it with the built-in HTTP Basic Auth (see [Configure Authentication](#2-configure-authentication)).

## Features

- HTTP API for signing files with a hardware UKey on a remote Windows host
- Content-addressed cache to skip re-uploading unchanged binaries
- HTTP Basic Auth with multi-account support
- Built-in Web UI for manual signing and connectivity testing
- Drop-in [`sign.js`](./sign.example.js) for Electron Builder

## Requirements

- Windows host with the code-signing UKey physically connected
- [Bun](https://bun.com)
- [SignTool.exe](https://developer.microsoft.com/en-us/windows/downloads/windows-sdk) (ships with the Windows SDK)

## 1. Prepare the Windows Machine

1. Install the UKey driver (e.g. **SafeNet**).
   - In the driver client settings, enable **"Enable single logon"**.
2. Install the certificate (e.g. via **DigiCertHardwareCertificateInstaller**).
   - Make sure the certificate is also installed into the local certificate store.
3. Verify the setup in PowerShell:

   ```powershell
   gci -Recurse Cert: -CodeSigningCert
   ```

   The certificates installed in steps 1 and 2 should appear. If not, confirm the UKey is connected and try again.
4. Install [Bun](https://bun.com).
5. Install **SignTool.exe** from the [Windows SDK installer](https://developer.microsoft.com/en-us/windows/downloads/windows-sdk).

> [!NOTE]
> Some of the steps above cannot be completed over Windows Remote Desktop.

## 2. Configure Authentication

Create a `.token` file (already in `.gitignore`) before starting the service:

```bash
cp .token.example .token
# edit .token, fill in username:password
```

**File format.** Each non-empty, non-comment line is parsed as a `username:password` pair. Any matching pair grants access; multiple accounts are supported. All endpoints — including the Web UI — require authentication.

```
# .token
admin:s3cret
ci-bot:another-secret
```

## 3. Start the Service

```bash
git clone https://github.com/netless-io/sign-server
cd sign-server
bun start
# serving http://192.0.2.10:3000
```

Take note of the URL printed above — that's your `SIGN_SERVER_URL`. The host can be either an IP address or a DNS name (e.g. `http://signer.intranet:3000`); you'll need it when integrating with Electron Builder (see [Section 4](#4-integrate-with-electron-builder)).

If `bun start` reports an error, see the table below.

### Troubleshooting

| Error | Resolution |
| --- | --- |
| `Not found .token file` | Create a `.token` file in the project root following the format of `.token.example`. |
| `Invalid .token file` | Ensure each entry in `.token` follows the `username:password` format. |
| `Not found SignTool.exe` | Set `config.signtool` in `package.json` to the absolute path of `SignTool.exe`. |
| `Not found certificate` | Re-check [Section 1](#1-prepare-the-windows-machine) and confirm the UKey is connected. |
| `Found multiple certificates` | Set `config.thumbprint` in `package.json` to the 40-char thumbprint of the certificate to use. Run `gci -Recurse Cert: -CodeSigningCert \| Select Subject,Thumbprint` to list candidates. |

### Web UI

Visit the URL printed at startup in a browser to access the built-in Web UI, which provides a minimal upload-and-sign interface. The browser will prompt for the credentials defined in `.token`. Use it to verify the end-to-end signing flow before integrating with your build pipeline.

## 4. Integrate with Electron Builder

Refer to the [official documentation on custom signing](https://www.electron.build/tutorials/code-signing-windows-apps-on-unix#integrate-signing-with-electron-builder) for context.

[`sign.example.js`](./sign.example.js) is a drop-in custom sign script. Wire it up in your `electron-builder` config:

```json
{
  "win": { "sign": "./sign.example.js" }
}
```

The script is fully configured via environment variables — no code changes required:

```bash
SIGN_SERVER_URL=http://signer.intranet:3000 \
SIGN_SERVER_USER=admin \
SIGN_SERVER_PASS=secret \
  electron-builder ...
```

`SIGN_SERVER_URL` accepts either an IP address or a DNS name.

> [!NOTE]
> The sample script uses the native `fetch()` API, so `electron-builder` must run under **Node.js 18 or newer**. On older versions, import `{ fetch, FormData }` from [undici](https://www.npmjs.com/package/undici).

## API Reference

All endpoints require HTTP Basic Auth.

### `POST /exists`

Check whether a file with the given content hash is already cached on the server.

- **Body** — raw text: the file's content hash
- **Response** — JSON `true` | `false`

### `POST /sign`

Sign a file and return the signed bytes.

- **Body** — `multipart/form-data`:
  - `file` — either a hash string (cache hit) or the file blob
  - `hash` — `"sha1"` or `"sha256"`
  - `isNest` — `"1"` for nested signatures, `""` otherwise
- **Response** — `application/octet-stream`: the signed file

## SignTool.exe Cheatsheet

```text
signtool sign
  /debug /td sha256 /tr http://timestamp.digicert.com /as
  /fd {hash} /sha1 {thumbprint} /s {store} /sm
  {file.exe}
```

## References

- [SignTool.exe (Sign Tool)](https://learn.microsoft.com/en-us/dotnet/framework/tools/signtool-exe)
- [Integrate signing with Electron Builder](https://www.electron.build/tutorials/code-signing-windows-apps-on-unix#integrate-signing-with-electron-builder)
- [`app-builder-lib/src/codeSign/windowsCodeSign.ts`](https://github.com/electron-userland/electron-builder/blob/-/packages/app-builder-lib/src/codeSign/windowsCodeSign.ts)

## License

[MIT](./LICENSE.txt)

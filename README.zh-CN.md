# Sign Server

[English](./README.md) | 简体中文

将 Microsoft [SignTool.exe](https://learn.microsoft.com/en-us/dotnet/framework/tools/signtool-exe) 封装为 HTTP 服务，让局域网内的任意机器（包括无法直连硬件 UKey 的 Linux/macOS CI 机器）都可以远程为 Windows 二进制文件做代码签名。

> [!WARNING]
> 本服务通过 HTTP 暴露了硬件 UKey 中的代码签名证书。**请勿暴露到公网。** 仅在可信内网中运行，并启用内置的 HTTP Basic Auth（见 [配置鉴权](#2-配置鉴权)）。

## 功能特性

- 通过 HTTP API 远程调用 Windows 主机上的 UKey 进行代码签名
- 基于内容哈希的缓存机制，避免重复上传相同文件
- 大文件支持分段上传，规避网关请求大小限制并支持失败重试
- 支持多账号的 HTTP Basic Auth
- 内置 Web UI，可手动签名、验证连通性
- 提供开箱即用的 [`sign.js`](./sign.example.js) 示例，直接对接 Electron Builder

## 环境要求

- 已物理连接代码签名 UKey 的 Windows 主机
- [Bun](https://bun.com)
- [SignTool.exe](https://developer.microsoft.com/en-us/windows/downloads/windows-sdk)（随 Windows SDK 安装）

## 1. 准备 Windows 机器

1. 安装硬件 UKey 驱动（例如 **SafeNet**）。
   - 在驱动客户端设置中开启 **"启用单点登录（Enable single logon）"**。
2. 正确安装证书（例如使用 **DigiCertHardwareCertificateInstaller**）。
   - 同时把证书安装到本机的证书存储中。
3. 在 PowerShell 中执行以下命令进行验证：

   ```powershell
   gci -Recurse Cert: -CodeSigningCert
   ```

   如果能看到第 1、2 步安装的证书，则配置成功；否则请确认 UKey 已连接后重试。
4. 安装 [Bun](https://bun.com)。
5. 通过 [Windows SDK 安装器](https://developer.microsoft.com/en-us/windows/downloads/windows-sdk) 安装 **SignTool.exe**。

> [!NOTE]
> 上述部分步骤无法通过 Windows 远程桌面客户端完成。

## 2. 配置鉴权

服务启动前必须先创建 `.token` 文件（已加入 `.gitignore`）：

```bash
cp .token.example .token
# 编辑 .token，填入 username:password
```

**文件格式。** 每行非空、非 `#` 注释的内容会被解析为一组 `username:password`，列表中任意一组匹配即可通过；支持多账号。所有接口（包括 Web UI）均需要鉴权。

```
# .token
admin:s3cret
ci-bot:another-secret
```

## 3. 配置 SignTool 与证书

创建 `.config` 文件（已加入 `.gitignore`）：

```bash
cp .config.example .config
# 编辑 .config，填入 signtool 路径与证书指纹
```

**文件格式。** 每行一组 `key=value`，以 `#` 开头的行为注释。两个字段均可留空：`signtool` 留空时会自动在 Windows SDK 默认路径下搜索；`thumbprint` 仅在机器上存在多张代码签名证书时才需要指定。

```
# .config
signtool=C:/Program Files (x86)/Windows Kits/10/bin/x64/signtool.exe
thumbprint=ABCDEF0123456789ABCDEF0123456789ABCDEF01
```

## 4. 启动服务

```bash
git clone https://github.com/netless-io/sign-server
cd sign-server
bun start
# serving http://192.0.2.10:3000
```

记下输出的 URL —— 这就是你的 `SIGN_SERVER_URL`。其中的主机部分既可以是 IP 地址，也可以是域名（例如 `http://signer.intranet:3000`），下一节对接 Electron Builder 时会用到（见 [第 5 节](#5-对接-electron-builder)）。

如果运行 `bun start` 时报错，请参考下表。

### 错误对照表

| 错误信息 | 解决方案 |
| --- | --- |
| `Not found .token file` | 在项目根目录创建 `.token` 文件，参考 `.token.example`。 |
| `Invalid .token file` | 检查 `.token` 内容，每行须为 `username:password` 格式。 |
| `Not found .config file` | 在项目根目录创建 `.config` 文件，参考 `.config.example`。 |
| `Not found SignTool.exe` | 在 `.config` 的 `signtool` 字段填入 `SignTool.exe` 的绝对路径。 |
| `Not found certificate` | 重新检查 [第 1 节](#1-准备-windows-机器) 的步骤，并确认 UKey 已连接。 |
| `Found multiple certificates` | 在 `.config` 的 `thumbprint` 字段中填入要使用的证书指纹（40 位十六进制字符）。可执行 `gci -Recurse Cert: -CodeSigningCert \| Select Subject,Thumbprint` 列出候选。 |

### Web UI

在浏览器中访问启动时输出的 URL 可打开内置 Web UI，提供一个简单的上传并签名示例。首次访问时浏览器会弹出登录框，输入 `.token` 中的用户名/密码即可。建议在接入构建流水线之前，先在此处验证签名链路是否正常。

## 5. 对接 Electron Builder

自定义签名的用法可参考 [官方文档](https://www.electron.build/tutorials/code-signing-windows-apps-on-unix#integrate-signing-with-electron-builder)。

[`sign.example.js`](./sign.example.js) 是一份开箱即用的自定义签名脚本，在 `electron-builder` 配置中引用即可：

```json
{
  "win": { "sign": "./sign.example.js" }
}
```

脚本完全通过环境变量配置，无需修改任何代码：

```bash
SIGN_SERVER_URL=http://signer.intranet:3000 \
SIGN_SERVER_USER=admin \
SIGN_SERVER_PASS=secret \
  electron-builder ...
```

`SIGN_SERVER_URL` 既可以填 IP 地址，也可以填域名。

> [!NOTE]
> 该示例脚本使用了原生 `fetch()` API，因此 `electron-builder` 至少需要 **Node.js 18** 才能运行。如版本较低，请从 [undici](https://www.npmjs.com/package/undici) 导入 `{ fetch, FormData }`。

## API 参考

所有接口均需要 HTTP Basic Auth。

### `POST /exists`

查询服务端是否已缓存指定哈希的文件。

- **请求体** — 纯文本：文件内容哈希
- **响应** — JSON `true` | `false`

### `POST /sign`

对文件进行签名并返回签名后的字节流。

- **请求体** — `multipart/form-data`：
  - `file` — 已缓存文件的哈希字符串，或文件 blob
  - `hash` — `"sha1"` 或 `"sha256"`
  - `isNest` — 嵌套签名传 `"1"`，否则传 `""`
- **响应** — `application/octet-stream`：签名后的文件

### 分段上传

适合**大文件**的场景：把文件切成多个小块分别上传，规避网关请求大小限制；中途失败可按分段重试或断点续传。上传完成后再以哈希调用 `/sign` 即可（无需重传）。

服务进程重启时会清空所有未完成的分段，断点续传仅在同一进程生命周期内有效。

`sign.example.js` 默认对大于 16 MiB 的文件启用分段上传，块大小 4 MiB，可通过 `SIGN_SERVER_CHUNK_THRESHOLD` / `SIGN_SERVER_CHUNK_SIZE` 环境变量调整。

#### `POST /chunk/status`

查询某哈希文件已上传的分段，用于断点续传。

- **请求体** — 纯文本：最终文件的 MD5 哈希
- **响应** — JSON `{ "received": number[], "total": number | null, "name": string | null }`

#### `POST /chunk`

上传单个分段。

- **Query 参数**：
  - `hash` — 最终文件的 MD5 哈希
  - `index` — 分段下标（从 0 开始）
  - `total` — 分段总数
  - `name` — 原始文件名（需 URL 编码）
- **请求体** — `application/octet-stream`：当前分段的原始字节
- **响应** — JSON `{ "received": number[] }`

#### `POST /chunk/finalize`

合并所有分段为完整文件，并校验 MD5 与传入哈希一致。校验通过后写入缓存，后续 `/sign` 可直接传哈希。

- **请求体** — 纯文本：最终文件的 MD5 哈希
- **响应** — `200 { "ok": true }`；分段缺失或哈希不匹配时返回 `400` 与错误信息

#### `POST /chunk/abort`

放弃当前未完成的分段上传，删除已上传的分段。

- **请求体** — 纯文本：最终文件的 MD5 哈希
- **响应** — JSON `{ "ok": true }`

## SignTool.exe 速查表

```text
signtool sign
  /debug /td sha256 /tr http://timestamp.digicert.com /as
  /fd {hash} /sha1 {thumbprint} /s {store} /sm
  {file.exe}
```

## 参考资料

- [SignTool.exe (Sign Tool)](https://learn.microsoft.com/en-us/dotnet/framework/tools/signtool-exe)
- [Integrate signing with Electron Builder](https://www.electron.build/tutorials/code-signing-windows-apps-on-unix#integrate-signing-with-electron-builder)
- [`app-builder-lib/src/codeSign/windowsCodeSign.ts`](https://github.com/electron-userland/electron-builder/blob/-/packages/app-builder-lib/src/codeSign/windowsCodeSign.ts)

## 许可证

[MIT](./LICENSE.txt)

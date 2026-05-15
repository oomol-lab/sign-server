# <samp>SIGN SERVER</samp>

<samp>[English](./README.md) | 简体中文</samp>

<samp>把 [SignTool.exe](https://learn.microsoft.com/en-us/dotnet/framework/tools/signtool-exe) 封装成一个 HTTP 服务。</samp><br>
<samp>本工具仅供在本地（内网）运行，请谨慎使用。</samp>

## <samp>1. 准备 Windows 机器</samp>

<p>
  <samp>1. 安装硬件 UKey 驱动，我使用的是 SafeNet；</samp><br>
  <samp>&nbsp;&nbsp;&nbsp;<strong>注意</strong>：记得在驱动客户端设置中开启"启用单点登录（enable single logon）"。</samp><br>
  <samp>2. 正确安装证书，我使用的是 DigiCertHardwareCertificateInstaller；</samp><br>
  <samp>&nbsp;&nbsp;&nbsp;<strong>注意</strong>：记得把证书也安装到本机的证书存储中。</samp><br>
  <samp>3. 在 PowerShell 中运行以下命令，确认上述步骤是否完成：</samp>
</p>
<p>
  <samp>&nbsp;&nbsp;&nbsp;<strong>gci -Recurse Cert: -CodeSigningCert</strong></samp>
</p>
<p>
  <samp>&nbsp;&nbsp;&nbsp;如果能看到第 1、2 步安装的证书名称，则说明配置成功。</samp><br>
  <samp>&nbsp;&nbsp;&nbsp;否则，请确认硬件 UKey 已连接，再重试一次。</samp><br>
</p>
<p>
  <samp>4. 安装 <a href="https://bun.com" target="_blank">Bun</a>；</samp><br>
  <samp>5. 从 <a href="https://developer.microsoft.com/en-us/windows/downloads/windows-sdk" target="_blank">Windows SDK 安装器</a> 安装 SignTool.exe。</samp>
</p>

<samp><strong>注意</strong>：上述部分步骤无法通过 Windows 远程桌面客户端完成。</samp>

## <samp>2. 配置鉴权</samp>

<samp>服务启动前必须先创建 <code>.token</code> 文件（已加入 <code>.gitignore</code>），用于 HTTP Basic Auth：</samp>

<p>
  <samp>cp .token.example .token</samp><br>
  <samp># 编辑 .token，填入 username:password</samp>
</p>

<samp>文件格式：每一行非空、非 <code>#</code> 注释的内容都会被解析为一组 <code>username:password</code>，列表中任意一个匹配即可通过；支持多账号。所有接口（包括 Web UI）均需要鉴权。</samp>

## <samp>3. 启动服务</samp>

<p>
  <samp>git clone https://github.com/netless-io/sign-server</samp><br>
  <samp>cd sign-server</samp><br>
  <samp>bun start</samp><br>
  <samp>------</samp><br>
  <samp>serving http://{local-ip}:3000</samp>
</p>

<samp>记下上面输出的 {local-ip}，它将用于 <a href="https://www.electron.build/tutorials/code-signing-windows-apps-on-unix#integrate-signing-with-electron-builder" target="_blank">sign.js</a> 中（见下一节）。</samp>

<samp>如果运行 'bun start' 时报错，请参考下面的错误对照表。</samp>

### <samp>错误与解决方案</samp>

<dl>
  <dt><samp>Not found .token file</samp></dt>
  <dd><samp>在项目根目录创建 <code>.token</code> 文件，参考 <code>.token.example</code> 的格式。</samp></dd>
  <dt><samp>Invalid .token file</samp></dt>
  <dd><samp>检查 <code>.token</code> 文件内容，必须为 <code>username:password</code> 格式。</samp></dd>
  <dt><samp>Not found SignTool.exe</samp></dt>
  <dd><samp>编辑 package.json 中的 config.signtool 字段，填入 SignTool.exe 的绝对路径。</samp></dd>
  <dt><samp>Not found certificate</samp></dt>
  <dd><samp>确认 <a href="#1-准备-windows-机器">第一节</a> 的所有步骤均已完成，且硬件 UKey 当前处于连接状态。</samp></dd>
  <dt><samp>Found multiple certificates</samp></dt>
  <dd><samp>编辑 package.json 中的 config.subject 字段，指定要使用的证书主题。</samp></dd>
</dl>

### <samp>附赠：内置 Web UI</samp>

<samp>可以通过上面输出的地址（http://{local-ip}:3000）访问内置的 Web UI，里面有一个简单的上传并签名文件的示例。首次访问时浏览器会弹出登录框，输入 <code>.token</code> 文件中的用户名/密码即可。在进入下一节之前，可以先在这里测试代码签名是否正常工作。</samp>

## <samp>4. 为 Electron Builder 编写 sign.js</samp>

<samp>关于自定义签名的用法，请参考 <a href="https://www.electron.build/tutorials/code-signing-windows-apps-on-unix#integrate-signing-with-electron-builder" target="_blank">官方文档</a>。</samp>

<samp>示例脚本见 <a href="./example-sign.js">example sign.js</a>，记得将其中的 {local-ip} 替换为真实的 IP 地址。鉴权凭据通过环境变量传入：</samp>

<p>
  <samp>SIGN_SERVER_USER=admin SIGN_SERVER_PASS=secret electron-builder ...</samp>
</p>

<samp><strong>注意</strong>：由于该脚本使用了原生 fetch() API 上传文件，运行 electron-builder 至少需要 Node.js 18。如果版本较低，可以从 <a href="https://www.npmjs.com/package/undici" target="_blank">"undici"</a> 导入 {fetch, FormData}。</samp>

## <samp>SignTool.exe 速查表</samp>

<samp>signtool sign<br>
&nbsp;&nbsp;/debug /td sha256 /tr http://timestamp.digicert.com /as<br>
&nbsp;&nbsp;/fd {hash} /sha1 {thumbprint} /s {store} /sm<br>
&nbsp;&nbsp;{file.exe}</samp>

## <samp>参考资料</samp>

- [<samp>SignTool.exe (Sign Tool)</samp>](https://learn.microsoft.com/en-us/dotnet/framework/tools/signtool-exe)
- [<samp>Integrate signing with Electron Builder</samp>](https://www.electron.build/tutorials/code-signing-windows-apps-on-unix#integrate-signing-with-electron-builder)
- <samp>[app-builder-lib/src/codeSign/windowsCodeSign.ts](https://github.com/electron-userland/electron-builder/blob/-/packages/app-builder-lib/src/codeSign/windowsCodeSign.ts)</samp>

## <samp>许可证</samp>

<samp>MIT License。</samp>

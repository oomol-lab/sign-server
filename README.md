# <samp>SIGN SERVER</samp>

<samp>English | [简体中文](./README.zh-CN.md)</samp>

<samp>Wraps [SignTool.exe](https://learn.microsoft.com/en-us/dotnet/framework/tools/signtool-exe) as an HTTP service.</samp><br>
<samp>This tool is intended to run on a local (intranet) machine only. Use with caution.</samp>

## <samp>1. Prepare the Windows Machine</samp>

<p>
  <samp>1. Install the hardware UKey driver. I am using SafeNet.</samp><br>
  <samp>&nbsp;&nbsp;&nbsp;<strong>Note</strong>: remember to turn on "enable single logon" in the driver client settings.</samp><br>
  <samp>2. Install the certificate properly. I am using DigiCertHardwareCertificateInstaller.</samp><br>
  <samp>&nbsp;&nbsp;&nbsp;<strong>Note</strong>: remember to also install the certificate into the local certificate store.</samp><br>
  <samp>3. Run the following command in PowerShell to verify the steps above:</samp>
</p>
<p>
  <samp>&nbsp;&nbsp;&nbsp;<strong>gci -Recurse Cert: -CodeSigningCert</strong></samp>
</p>
<p>
  <samp>&nbsp;&nbsp;&nbsp;If you can see the certificate names installed in steps 1 and 2, the setup is successful.</samp><br>
  <samp>&nbsp;&nbsp;&nbsp;Otherwise, make sure the hardware UKey is connected and try again.</samp><br>
</p>
<p>
  <samp>4. Install <a href="https://bun.com" target="_blank">Bun</a>.</samp><br>
  <samp>5. Install SignTool.exe from the <a href="https://developer.microsoft.com/en-us/windows/downloads/windows-sdk" target="_blank">Windows SDK installer</a>.</samp>
</p>

<samp><strong>Note</strong>: some of the steps above cannot be completed over Windows Remote Desktop.</samp>

## <samp>2. Configure Authentication</samp>

<samp>Before starting the service you must create a <code>.token</code> file (already in <code>.gitignore</code>), used for HTTP Basic Auth:</samp>

<p>
  <samp>cp .token.example .token</samp><br>
  <samp># edit .token, fill in username:password</samp>
</p>

<samp>File format: every non-empty line that is not a <code>#</code> comment is parsed as a <code>username:password</code> pair. Any match in the list grants access; multiple accounts are supported. All endpoints (including the Web UI) require authentication.</samp>

## <samp>3. Start the Service</samp>

<p>
  <samp>git clone https://github.com/netless-io/sign-server</samp><br>
  <samp>cd sign-server</samp><br>
  <samp>bun start</samp><br>
  <samp>------</samp><br>
  <samp>serving http://{local-ip}:3000</samp>
</p>

<samp>Note down the {local-ip} printed above. It will be used in <a href="https://www.electron.build/tutorials/code-signing-windows-apps-on-unix#integrate-signing-with-electron-builder" target="_blank">sign.js</a> (see the next section).</samp>

<samp>If 'bun start' reports an error, refer to the error reference table below.</samp>

### <samp>Errors and Solutions</samp>

<dl>
  <dt><samp>Not found .token file</samp></dt>
  <dd><samp>Create a <code>.token</code> file in the project root, following the format of <code>.token.example</code>.</samp></dd>
  <dt><samp>Invalid .token file</samp></dt>
  <dd><samp>Check the contents of <code>.token</code>; it must be in <code>username:password</code> format.</samp></dd>
  <dt><samp>Not found SignTool.exe</samp></dt>
  <dd><samp>Edit the config.signtool field in package.json and provide the absolute path to SignTool.exe.</samp></dd>
  <dt><samp>Not found certificate</samp></dt>
  <dd><samp>Make sure all steps in <a href="#1-prepare-the-windows-machine">section 1</a> have been completed and the hardware UKey is currently connected.</samp></dd>
  <dt><samp>Found multiple certificates</samp></dt>
  <dd><samp>Edit the config.subject field in package.json to specify which certificate subject to use.</samp></dd>
</dl>

### <samp>Bonus: Built-in Web UI</samp>

<samp>You can visit the address printed above (http://{local-ip}:3000) to access the built-in Web UI, which provides a simple example of uploading and signing a file. On first access, the browser will prompt for credentials; enter the username/password from the <code>.token</code> file. Before moving on to the next section, you can use this page to verify that code signing works correctly.</samp>

## <samp>4. Write sign.js for Electron Builder</samp>

<samp>For details on custom signing, refer to the <a href="https://www.electron.build/tutorials/code-signing-windows-apps-on-unix#integrate-signing-with-electron-builder" target="_blank">official documentation</a>.</samp>

<samp>See <a href="./example-sign.js">example sign.js</a> for a sample script; remember to replace {local-ip} with the real IP address. Authentication credentials are passed via environment variables:</samp>

<p>
  <samp>SIGN_SERVER_USER=admin SIGN_SERVER_PASS=secret electron-builder ...</samp>
</p>

<samp><strong>Note</strong>: because the script uses the native fetch() API to upload files, running electron-builder requires at least Node.js 18. For older versions, import {fetch, FormData} from <a href="https://www.npmjs.com/package/undici" target="_blank">"undici"</a>.</samp>

## <samp>SignTool.exe Cheatsheet</samp>

<samp>signtool sign<br>
&nbsp;&nbsp;/debug /td sha256 /tr http://timestamp.digicert.com /as<br>
&nbsp;&nbsp;/fd {hash} /sha1 {thumbprint} /s {store} /sm<br>
&nbsp;&nbsp;{file.exe}</samp>

## <samp>References</samp>

- [<samp>SignTool.exe (Sign Tool)</samp>](https://learn.microsoft.com/en-us/dotnet/framework/tools/signtool-exe)
- [<samp>Integrate signing with Electron Builder</samp>](https://www.electron.build/tutorials/code-signing-windows-apps-on-unix#integrate-signing-with-electron-builder)
- <samp>[app-builder-lib/src/codeSign/windowsCodeSign.ts](https://github.com/electron-userland/electron-builder/blob/-/packages/app-builder-lib/src/codeSign/windowsCodeSign.ts)</samp>

## <samp>License</samp>

<samp>MIT License.</samp>

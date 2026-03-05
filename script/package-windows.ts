import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, writeFile, mkdir, cp } from "fs/promises";
import path from "path";
import { execSync } from "child_process";
import fs from "fs";

const DIST = "dist-windows";

async function packageForWindows() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
  await mkdir(path.join(DIST, "public"), { recursive: true });

  console.log("Step 1/4: Building frontend...");
  await viteBuild({
    build: {
      outDir: path.resolve(DIST, "public"),
      emptyOutDir: true,
    },
  });

  console.log("Step 2/4: Bundling server...");
  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: path.join(DIST, "server.cjs"),
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: ["better-sqlite3"],
    logLevel: "info",
  });

  console.log("Step 3/4: Creating launcher files...");

  const packageJson = {
    name: "ic-recon",
    version: "1.0.0",
    private: true,
    scripts: {
      start: "node server.cjs",
    },
    dependencies: {
      "better-sqlite3": "^12.6.2",
    },
  };
  await writeFile(
    path.join(DIST, "package.json"),
    JSON.stringify(packageJson, null, 2),
  );

  const batContent = `@echo off
title IC Recon - Intercompany Reconciliation Platform
echo.
echo  ============================================
echo   IC Recon - Intercompany Reconciliation
echo  ============================================
echo.

cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js is not installed.
    echo  Please install Node.js from https://nodejs.org
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\\better-sqlite3" (
    echo  First-time setup: Installing database driver...
    echo  This only needs to happen once.
    echo.
    call npm install --production --no-optional 2>nul
    if %errorlevel% neq 0 (
        echo.
        echo  [ERROR] Failed to install dependencies.
        echo  If you are behind a corporate proxy, run these commands first:
        echo    npm config set proxy http://your-proxy:port
        echo    npm config set https-proxy http://your-proxy:port
        echo    npm config set strict-ssl false
        echo  Then run this file again.
        echo.
        pause
        exit /b 1
    )
    echo.
    echo  Setup complete!
    echo.
)

echo  Starting IC Recon server...
echo  Open your browser to: http://localhost:5000
echo.
echo  Press Ctrl+C to stop the server.
echo.

set PORT=5000
set NODE_ENV=production
node server.cjs

pause
`;
  await writeFile(path.join(DIST, "start.bat"), batContent);

  const silentVbs = `Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strPath = fso.GetParentFolderName(WScript.ScriptFullPath)
WshShell.CurrentDirectory = strPath

If Not fso.FolderExists(strPath & "\\node_modules\\better-sqlite3") Then
    WshShell.Run "cmd /c cd /d """ & strPath & """ && npm install --production --no-optional", 1, True
End If

WshShell.Run "cmd /c cd /d """ & strPath & """ && set PORT=5000 && set NODE_ENV=production && node server.cjs", 0, False

WScript.Sleep 2000
WshShell.Run "http://localhost:5000", 1, False
`;
  await writeFile(path.join(DIST, "start-silent.vbs"), silentVbs);

  const readmeContent = `# IC Recon - Intercompany Reconciliation Platform
## Windows Installation

### Prerequisites
- Node.js v18 or later (download from https://nodejs.org)

### Quick Start
1. Double-click **start.bat** to launch (shows console window)
2. Open http://localhost:5000 in your browser

### Silent Start (No Console Window)
- Double-click **start-silent.vbs** to run in background
- It will automatically open your browser

### Auto-Start with Windows
1. Press Win+R, type: shell:startup
2. Copy **start-silent.vbs** (or a shortcut to it) into that folder

### First Run
On first launch, the app will install the database driver automatically.
This requires an internet connection just once. After that, it works fully offline.

### Corporate Network / Proxy Issues
If the first-time setup fails behind a corporate proxy, open Command Prompt and run:
    npm config set proxy http://your-proxy-server:port
    npm config set https-proxy http://your-proxy-server:port
    npm config set strict-ssl false
Then double-click start.bat again.

### Stopping the App
- If started with start.bat: press Ctrl+C in the console window
- If started with start-silent.vbs: open Task Manager, find "node.exe", and End Task

### Data
All data is stored in the "data" folder (SQLite database).
To back up, simply copy the "data" folder.
To reset, delete the "data" folder and restart.
`;
  await writeFile(path.join(DIST, "README.txt"), readmeContent);

  console.log("Step 4/4: Package ready!");
  console.log("");
  console.log(`Output folder: ${DIST}/`);
  console.log("Contents:");

  const files = fs.readdirSync(DIST);
  for (const f of files) {
    const stat = fs.statSync(path.join(DIST, f));
    const size = stat.isDirectory()
      ? "[DIR]"
      : `${(stat.size / 1024).toFixed(0)} KB`;
    console.log(`  ${f.padEnd(25)} ${size}`);
  }

  console.log("");
  console.log("To create a zip: zip the entire dist-windows folder.");
  console.log(
    "Users only need Node.js installed. The database driver installs automatically on first launch.",
  );
}

packageForWindows().catch((err) => {
  console.error(err);
  process.exit(1);
});

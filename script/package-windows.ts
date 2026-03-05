import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, writeFile, mkdir, cp } from "fs/promises";
import path from "path";
import { execSync } from "child_process";
import fs from "fs";

const DIST = "dist-windows";

async function packageForWindows() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
  await mkdir(path.join(DIST, "public"), { recursive: true });

  console.log("Step 1/5: Building frontend...");
  await viteBuild({
    build: {
      outDir: path.resolve(DIST, "public"),
      emptyOutDir: true,
    },
  });

  console.log("Step 2/5: Bundling server...");
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

  console.log("Step 3/5: Pre-bundling better-sqlite3 for Windows...");
  const bsq3Source = path.resolve("node_modules/better-sqlite3");
  const bsq3Dest = path.join(DIST, "node_modules", "better-sqlite3");
  await mkdir(path.join(bsq3Dest, "lib"), { recursive: true });
  await mkdir(path.join(bsq3Dest, "build", "Release"), { recursive: true });

  await cp(
    path.join(bsq3Source, "lib"),
    path.join(bsq3Dest, "lib"),
    { recursive: true },
  );

  const bsq3Pkg = JSON.parse(
    fs.readFileSync(path.join(bsq3Source, "package.json"), "utf-8"),
  );
  await writeFile(
    path.join(bsq3Dest, "package.json"),
    JSON.stringify(bsq3Pkg, null, 2),
  );

  const prebuildDir = path.join(bsq3Source, "prebuilds");
  if (fs.existsSync(prebuildDir)) {
    await cp(prebuildDir, path.join(bsq3Dest, "prebuilds"), { recursive: true });
    console.log("  Copied prebuilds directory");
  }

  if (fs.existsSync(path.join(bsq3Source, "build"))) {
    await cp(
      path.join(bsq3Source, "build"),
      path.join(bsq3Dest, "build"),
      { recursive: true },
    );
    console.log("  Copied build directory (Linux native binary)");
  }

  const bindingsModules = ["bindings", "file-uri-to-path", "node-addon-api", "prebuild-install", "node-abi"];
  for (const mod of bindingsModules) {
    const modSrc = path.resolve("node_modules", mod);
    if (fs.existsSync(modSrc)) {
      await cp(modSrc, path.join(DIST, "node_modules", mod), { recursive: true });
      console.log(`  Copied dependency: ${mod}`);
    }
  }

  console.log("Step 4/5: Creating launcher files...");

  const packageJson = {
    name: "ic-recon",
    version: "1.0.0",
    private: true,
    scripts: {
      start: "node server.cjs",
      "install-sqlite": "npm install better-sqlite3@12.6.2 --no-optional",
    },
    dependencies: {
      "better-sqlite3": "^12.6.2",
    },
  };
  await writeFile(
    path.join(DIST, "package.json"),
    JSON.stringify(packageJson, null, 2),
  );

  const installBat = `@echo off
echo.
echo  Installing better-sqlite3 for Windows...
echo  This compiles the native database driver for your system.
echo.

cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js is not installed.
    echo  Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

npm install better-sqlite3@12.6.2 --build-from-source
if %errorlevel% neq 0 (
    echo.
    echo  Native build failed. Trying prebuilt binary...
    npm install better-sqlite3@12.6.2
)

if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] Installation failed.
    echo.
    echo  You may need Visual C++ Build Tools. Options:
    echo    1. Run: npm install --global windows-build-tools
    echo    2. Or install Visual Studio Build Tools with C++ workload
    echo.
    echo  If behind a proxy, also run:
    echo    npm config set proxy http://your-proxy:port
    echo    npm config set https-proxy http://your-proxy:port
    echo    npm config set strict-ssl false
    echo.
    pause
    exit /b 1
)

echo.
echo  Installation complete! Run start.bat to launch the app.
echo.
pause
`;
  await writeFile(path.join(DIST, "install.bat"), installBat);

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

if not exist "node_modules\\better-sqlite3\\build\\Release\\better_sqlite3.node" (
    if not exist "node_modules\\better-sqlite3\\prebuilds\\win32-x64" (
        echo  The database driver needs to be compiled for Windows.
        echo  Running install.bat...
        echo.
        call install.bat
        if %errorlevel% neq 0 exit /b 1
    )
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

Dim hasNative, hasPrebuilt
hasNative = fso.FileExists(strPath & "\\node_modules\\better-sqlite3\\build\\Release\\better_sqlite3.node")
hasPrebuilt = fso.FolderExists(strPath & "\\node_modules\\better-sqlite3\\prebuilds\\win32-x64")

If Not hasNative And Not hasPrebuilt Then
    WshShell.Run "cmd /c cd /d """ & strPath & """ && call install.bat", 1, True
End If

WshShell.Run "cmd /c cd /d """ & strPath & """ && set PORT=5000&& set NODE_ENV=production&& node server.cjs", 0, False

WScript.Sleep 2000
WshShell.Run "http://localhost:5000", 1, False
`;
  await writeFile(path.join(DIST, "start-silent.vbs"), silentVbs);

  const readmeContent = `# IC Recon - Intercompany Reconciliation Platform
=============================================

## Prerequisites
- Node.js v18 or later (download from https://nodejs.org)
  Use the LTS version. This is the ONLY thing you need to install.

## Installation Steps

### Step 1: Install the database driver
  Double-click "install.bat"
  This compiles the SQLite database driver for your Windows system.
  It only needs to run once.

  If it fails, see "Troubleshooting" below.

### Step 2: Launch the app
  Double-click "start.bat" (shows console window)
  OR
  Double-click "start-silent.vbs" (runs silently in background, opens browser)

### Step 3: Open in browser
  Go to http://localhost:5000

## Auto-Start with Windows
  1. Press Win+R, type: shell:startup, press Enter
  2. Copy "start-silent.vbs" (or a shortcut) into that folder
  The app will start automatically when you log in.

## Stopping the App
  - start.bat: Press Ctrl+C in the console window
  - start-silent.vbs: Open Task Manager > find "node.exe" > End Task

## Data & Backup
  All data is stored in the "data" folder (SQLite database).
  - To back up: Copy the entire "data" folder
  - To reset: Delete the "data" folder and restart

## Troubleshooting

### "install.bat failed" / Build tools error
  better-sqlite3 needs C++ compilation. Install Visual Studio Build Tools:
  1. Go to https://visualstudio.microsoft.com/visual-cpp-build-tools/
  2. Download and install Build Tools
  3. Select "Desktop development with C++" workload
  4. Run install.bat again

  Alternative (requires admin):
    npm install --global windows-build-tools

### Proxy / Corporate network errors
  Open Command Prompt and run:
    npm config set proxy http://your-proxy-server:port
    npm config set https-proxy http://your-proxy-server:port
    npm config set strict-ssl false
  Then run install.bat again.

### Port 5000 already in use
  Edit start.bat and change PORT=5000 to another port (e.g., PORT=8080)

## Zero-Install Alternative
  If you cannot install build tools on your corporate laptop, ask a colleague
  with an unrestricted machine to:
  1. Clone the repo and run: npm install
  2. Run: npx tsx script/package-windows.ts
  3. Then run: npm install (inside the dist-windows folder)
  4. Copy the entire dist-windows folder to your laptop
  Since node_modules will already contain the compiled driver, no build
  tools will be needed on your machine - just Node.js.
`;
  await writeFile(path.join(DIST, "README.txt"), readmeContent);

  console.log("Step 5/5: Package ready!");
  console.log("");
  console.log(`Output folder: ${DIST}/`);
  console.log("Contents:");

  function listDir(dir: string, indent = "  ") {
    const entries = fs.readdirSync(dir).sort();
    for (const e of entries) {
      const full = path.join(dir, e);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        if (e === "node_modules") {
          const mods = fs.readdirSync(full);
          console.log(`${indent}${e}/ (${mods.length} packages)`);
        } else {
          console.log(`${indent}${e}/`);
        }
      } else {
        const size = `${(stat.size / 1024).toFixed(0)} KB`;
        console.log(`${indent}${e.padEnd(30)} ${size}`);
      }
    }
  }

  listDir(DIST);
  console.log("");
  console.log("DEPLOYMENT OPTIONS:");
  console.log("  Option A (easiest): Copy this folder + run install.bat on target machine");
  console.log("  Option B (zero-install): Run 'npm install' inside this folder first,");
  console.log("           then copy the entire folder (with node_modules) to target machine.");
  console.log("           Target machine only needs Node.js, no internet or build tools.");
}

packageForWindows().catch((err) => {
  console.error(err);
  process.exit(1);
});

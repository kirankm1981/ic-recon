# IC Recon - Intercompany Reconciliation Platform
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

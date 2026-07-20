// Clarity Lite — Electron main process.
// Loads the single self-contained offline HTML file into a BrowserWindow.
// No network access is required or used.
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 940,
    height: 780,
    title: 'Clarity Lite',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // In dev, www/ sits next to electron/ on disk. When packaged by
  // electron-builder, www/ is copied into the app's resources dir via
  // "extraResources" (see package.json) since asar can't include files
  // that live outside the electron/ directory.
  const indexPath = app.isPackaged
    ? path.join(process.resourcesPath, 'www', 'index.html')
    : path.join(__dirname, '..', 'www', 'index.html');
  win.loadFile(indexPath);

  // Desktop (PC/Mac) reads from farther away than a phone — zoom the whole UI
  // 20% larger for comfortable reading. Desktop-only: the Android build uses
  // Capacitor, not this file, so its sizing is unaffected.
  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(1.2);
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

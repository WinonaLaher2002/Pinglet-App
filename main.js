

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const WINDOW_WIDTH = 430;
const WINDOW_HEIGHT = 860;

function getAppIconPath() {
  const iconByPlatform = {
    win32: path.join(__dirname, 'assets', 'icon.ico'),
    darwin: path.join(__dirname, 'assets', 'icon.icns'),
    linux: path.join(__dirname, 'assets', 'icon.png')
  };

  const preferredIcon = iconByPlatform[process.platform] || iconByPlatform.linux;
  if (fs.existsSync(preferredIcon)) return preferredIcon;

  const fallbackPng = path.join(__dirname, 'assets', 'icon.png');
  return fs.existsSync(fallbackPng) ? fallbackPng : undefined;
}

function createWindow() {
  const iconPath = getAppIconPath();
  const mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: WINDOW_WIDTH,
    minHeight: WINDOW_HEIGHT,
    frame: true,
    autoHideMenuBar: true,
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js') // Optional, but recommended for security
    }
  });

  // Keep the window in a portrait ratio when resized/maximized.
  mainWindow.setAspectRatio(WINDOW_WIDTH / WINDOW_HEIGHT);
  mainWindow.loadFile('index.html'); // Loads your UI file
}

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    const iconPath = getAppIconPath();
    if (iconPath) app.dock.setIcon(iconPath);
  }

  createWindow();

  app.on('activate', function () {
    // Re-create window on macOS when dock icon is clicked and no other windows are open
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

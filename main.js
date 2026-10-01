const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const http = require('http');

let mainWindow = null;

const PORT = process.env.PORT || 5000;
const SERVER_URL = `http://localhost:${PORT}`;

// Check if local server is ready
function checkServerReady(url, maxRetries = 60, interval = 300) {
  return new Promise((resolve, reject) => {
    let retries = 0;
    const check = () => {
      http.get(`${url}/api`, (res) => {
        if (res.statusCode === 200 || res.statusCode === 304) {
          resolve(true);
        } else {
          retry();
        }
      }).on('error', () => {
        retry();
      });
    };

    const retry = () => {
      retries++;
      if (retries >= maxRetries) {
        reject(new Error('Server initialization timed out.'));
      } else {
        setTimeout(check, interval);
      }
    };

    check();
  });
}

function startBackendServer() {
  // Set environment variables for the embedded server
  process.env.PORT = PORT.toString();
  process.env.DB_MODE = process.env.DB_MODE || 'local';
  process.env.DATA_PATH = process.env.DATA_PATH || path.join(app.getPath('userData'), 'database');

  // Load server directly in the Electron Node process
  try {
    require('./server/server.js');
    console.log('Backend server initialized in Electron main process.');
  } catch (err) {
    if (err.code === 'EADDRINUSE' || err.message?.includes('EADDRINUSE')) {
      console.log('Port 5000 is already active, connecting to existing instance.');
    } else {
      console.error('Failed to load server module:', err);
      throw err;
    }
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 868,
    minWidth: 1024,
    minHeight: 700,
    title: 'Kawudulla Central College - Library Management System',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    backgroundColor: '#0F172A',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Check if React dev server (http://localhost:3000) is running
  let targetUrl = SERVER_URL;
  try {
    const isDevRunning = await new Promise((resolve) => {
      const req = http.get('http://localhost:3000', (res) => {
        resolve(res.statusCode === 200 || res.statusCode === 304);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(800, () => {
        req.destroy();
        resolve(false);
      });
    });
    if (isDevRunning) {
      targetUrl = 'http://localhost:3000';
    }
  } catch (e) {
    targetUrl = SERVER_URL;
  }

  mainWindow.loadURL(targetUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    // Start local server
    startBackendServer();

    // Wait until local Express server is ready
    await checkServerReady(SERVER_URL);

    // Create desktop window
    await createWindow();
  } catch (error) {
    dialog.showErrorBox(
      'Startup Error',
      `Failed to launch Kawudulla Library System: ${error.message}`
    );
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

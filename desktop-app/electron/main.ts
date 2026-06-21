import { app, BrowserWindow, session, ipcMain } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { extname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// The built Electron app will find the HTML file at `dist/index.html`
// Development mode: not packaged AND NODE_ENV is not 'production'
// Production mode: packaged OR NODE_ENV is 'production'
const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

// Mitigation for occasional Chromium/Electron GPU crashes on some macOS versions
// (seen as EXC_BAD_ACCESS / SIGSEGV in CrBrowserMain in packaged apps).
if (process.platform === 'darwin') {
  app.disableHardwareAcceleration();
}

const APP_NAME = 'Next Foody Dashboard';
app.setName(APP_NAME);
if (process.platform === 'win32') {
  app.setAppUserModelId('com.nextfoody.dashboard');
}

const PROTOCOL_NAME = 'bellami-desktop';
app.setAsDefaultProtocolClient(PROTOCOL_NAME);

let mainWindow: BrowserWindow | null = null;
let kitchenWindows: BrowserWindow[] = [];
let barWindows: BrowserWindow[] = [];
let dispatchWindows: BrowserWindow[] = [];

function getAppOriginFromMainWindow(): string | null {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return null;
    const currentUrl = mainWindow.webContents.getURL();
    if (!currentUrl) return null;
    const u = new URL(currentUrl);
    return u.origin;
  } catch {
    return null;
  }
}

async function openNewKitchenWindow(options?: { branchId?: string }) {
  try {
    const origin = getAppOriginFromMainWindow();
    const fallbackDevOrigin = 'http://localhost:5173';
    const baseOrigin = origin || fallbackDevOrigin;

    const win = new BrowserWindow({
      width: 1200,
      height: 800,
      show: true,
      webPreferences: {
        preload: join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        devTools: isDev,
      },
    });

    kitchenWindows.push(win);

    win.on('closed', () => {
      kitchenWindows = kitchenWindows.filter((w) => w && !w.isDestroyed() && w !== win);
    });

    const branchId = String(options?.branchId || '').trim();
    const url = branchId
      ? `${baseOrigin}/kitchen?branchId=${encodeURIComponent(branchId)}`
      : `${baseOrigin}/kitchen`;

    console.log('[KitchenWindow] loading URL:', url);
    await win.loadURL(url);
    try {
      win.show();
      win.focus();
    } catch {
      // ignore
    }
    return true;
  } catch (e) {
    console.error('Failed to open Kitchen window:', e);
    return false;
  }
}

async function openNewBarWindow(options?: { branchId?: string }) {
  try {
    const origin = getAppOriginFromMainWindow();
    const fallbackDevOrigin = 'http://localhost:5173';
    const baseOrigin = origin || fallbackDevOrigin;

    const win = new BrowserWindow({
      width: 1200,
      height: 800,
      show: true,
      webPreferences: {
        preload: join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        devTools: isDev,
      },
    });

    barWindows.push(win);

    win.on('closed', () => {
      barWindows = barWindows.filter((w) => w && !w.isDestroyed() && w !== win);
    });

    const branchId = String(options?.branchId || '').trim();
    const url = branchId
      ? `${baseOrigin}/bar?branchId=${encodeURIComponent(branchId)}`
      : `${baseOrigin}/bar`;

    console.log('[BarWindow] loading URL:', url);
    await win.loadURL(url);
    try {
      win.show();
      win.focus();
    } catch {
      // ignore
    }
    return true;
  } catch (e) {
    console.error('Failed to open Bar window:', e);
    return false;
  }
}

async function openNewDispatchWindow(options?: { branchId?: string }) {
  try {
    const origin = getAppOriginFromMainWindow();
    const fallbackDevOrigin = 'http://localhost:5173';
    const baseOrigin = origin || fallbackDevOrigin;

    const win = new BrowserWindow({
      width: 1200,
      height: 800,
      show: true,
      webPreferences: {
        preload: join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        devTools: isDev,
      },
    });

    dispatchWindows.push(win);

    win.on('closed', () => {
      dispatchWindows = dispatchWindows.filter((w) => w && !w.isDestroyed() && w !== win);
    });

    const branchId = String(options?.branchId || '').trim();
    const url = branchId
      ? `${baseOrigin}/dispatch?branchId=${encodeURIComponent(branchId)}`
      : `${baseOrigin}/dispatch`;

    console.log('[DispatchWindow] loading URL:', url);
    await win.loadURL(url);
    try {
      win.show();
      win.focus();
    } catch {
      // ignore
    }
    return true;
  } catch (e) {
    console.error('Failed to open Dispatch window:', e);
    return false;
  }
}

ipcMain.handle('open-kitchen-window', async (_event, options: { branchId?: string }) => {
  console.log('[KitchenWindow] IPC open-kitchen-window called', options || {});
  return openNewKitchenWindow(options);
});

ipcMain.handle('open-bar-window', async (_event, options: { branchId?: string }) => {
  console.log('[BarWindow] IPC open-bar-window called', options || {});
  return openNewBarWindow(options);
});

ipcMain.handle('open-dispatch-window', async (_event, options: { branchId?: string }) => {
  console.log('[DispatchWindow] IPC open-dispatch-window called', options || {});
  return openNewDispatchWindow(options);
});

ipcMain.handle(
  'open-window-devtools',
  async (
    _event,
    options?: { target?: 'main' | 'kitchen' | 'bar' | 'dispatch' }
  ) => {
    try {
      const target = String(options?.target || 'main').trim();
      const pickLastAlive = (wins: BrowserWindow[]) => {
        const alive = wins.filter((w) => w && !w.isDestroyed());
        return alive.length > 0 ? alive[alive.length - 1] : null;
      };

      const win =
        target === 'kitchen'
          ? pickLastAlive(kitchenWindows)
          : target === 'bar'
            ? pickLastAlive(barWindows)
            : target === 'dispatch'
              ? pickLastAlive(dispatchWindows)
              : mainWindow && !mainWindow.isDestroyed()
                ? mainWindow
                : null;

      if (!win || win.isDestroyed()) return false;
      if (win.webContents.isDestroyed()) return false;
      win.webContents.openDevTools({ mode: 'detach' });
      return true;
    } catch (e) {
      console.error('Failed to open DevTools:', e);
      return false;
    }
  }
);

app.on('open-url', (event, url) => {
  event.preventDefault();
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.webContents.isDestroyed()) return;
    mainWindow.webContents.send('oauth-callback', url);
    mainWindow.focus();
  } catch {
    // ignore
  }
});

app.on('second-instance', (_event, commandLine) => {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();

    const url = commandLine.find((arg) => arg.startsWith(`${PROTOCOL_NAME}://`));
    if (url && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('oauth-callback', url);
    }
  } catch {
    // ignore
  }
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

function createWindow() {
  let iconPath: string | undefined;
  const iconExt = process.platform === 'darwin' ? 'icns' : 'png';

  const possiblePaths = [
    app.isPackaged ? join(process.resourcesPath, 'build', `icon.${iconExt}`) : null,
    !app.isPackaged ? join(__dirname, '..', 'build', `icon.${iconExt}`) : null,
    process.platform === 'darwin' ? join(__dirname, '..', 'build', 'icon.png') : null,
    join(__dirname, '..', '..', 'build', `icon.${iconExt}`),
  ].filter((p): p is string => Boolean(p));

  for (const p of possiblePaths) {
    if (existsSync(p)) {
      iconPath = p;
      break;
    }
  }

  const pngIconPath = iconPath?.endsWith('.icns') ? join(__dirname, '..', 'build', 'icon.png') : iconPath;

  if (process.platform === 'darwin' && app.dock && pngIconPath) {
    if (existsSync(pngIconPath)) {
      try {
        app.dock.setIcon(pngIconPath);
      } catch (error) {
        console.error('Failed to set dock icon:', error);
      }
    }
  }

  const windowIconPath = pngIconPath;

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: windowIconPath,
    resizable: true,
    maximizable: true,
    fullscreenable: true,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: isDev,
    },
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  try {
    mainWindow.webContents.setWindowOpenHandler((details) => {
      try {
        const url = details.url;
        const isOauthLike =
          url.includes('accounts.google.com') ||
          url.includes('__clerk') ||
          url.includes('clerk.') ||
          url.includes('oauth');
        if (isOauthLike) {
          const authWindow = new BrowserWindow({
            parent: mainWindow || undefined,
            modal: true,
            width: 520,
            height: 720,
            show: true,
            webPreferences: {
              nodeIntegration: false,
              contextIsolation: true,
            },
          });
          authWindow.loadURL(url).catch((e) => {
            console.error('Failed to load auth popup URL:', e);
            try {
              authWindow.close();
            } catch {
              // ignore
            }
          });
          return { action: 'deny' };
        }
      } catch {
        // ignore
      }
      return { action: 'allow' };
    });
  } catch {
    // ignore
  }

  if (!isDev) {
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow?.webContents.closeDevTools();
    });
  }

  const ses = session.defaultSession;
  try {
    ses.webRequest.onBeforeRequest(
      {
        urls: ['https://accounts.google.com/*'],
      },
      (details, callback) => {
        try {
          const u = new URL(details.url);
          const lowerUrl = details.url.toLowerCase();
          const isOauthRelated = lowerUrl.includes('oauth') || lowerUrl.includes('o/oauth2');
          if (!isOauthRelated) {
            callback({ cancel: false });
            return;
          }
          console.log('[OAuth] accounts.google.com request:', details.url);
          if (!u.pathname.includes('/o/oauth2/') && !u.pathname.includes('/oauth2/')) {
            callback({ cancel: false });
            return;
          }
          const prompt = u.searchParams.get('prompt');
          if (!prompt) {
            u.searchParams.set('prompt', 'select_account');
          } else if (!prompt.split(' ').includes('select_account')) {
            u.searchParams.set('prompt', `select_account ${prompt}`);
          }
          const newUrl = u.toString();
          if (newUrl !== details.url) {
            console.log('[OAuth] redirecting Google auth URL to force account chooser');
            callback({ redirectURL: newUrl });
            return;
          }
        } catch {
          // ignore
        }
        callback({ cancel: false });
      }
    );
  } catch {
    // ignore
  }

  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'geolocation') {
      callback(true);
    } else {
      callback(false);
    }
  });

  ses.setPermissionCheckHandler((_webContents, permission) => {
    if (permission === 'geolocation') {
      return true;
    }
    return false;
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    const distPath = join(__dirname, '../dist');
    const indexPath = join(distPath, 'index.html');

    const server = createServer((req, res) => {
      let filePath = join(distPath, req.url === '/' ? 'index.html' : req.url || 'index.html');

      if (!filePath.startsWith(distPath)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        filePath = join(distPath, 'index.html');
      }

      if (!existsSync(filePath)) {
        res.writeHead(404);
        res.end('File not found');
        return;
      }

      try {
        const content = readFileSync(filePath);
        const ext = extname(filePath);
        const contentType =
          ext === '.html'
            ? 'text/html'
            : ext === '.js'
              ? 'application/javascript'
              : ext === '.css'
                ? 'text/css'
                : ext === '.json'
                  ? 'application/json'
                  : ext === '.png'
                    ? 'image/png'
                    : ext === '.jpg' || ext === '.jpeg'
                      ? 'image/jpeg'
                      : ext === '.svg'
                        ? 'image/svg+xml'
                        : ext === '.webp'
                          ? 'image/webp'
                          : 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      } catch (error: any) {
        console.error('Error serving file:', error);
        res.writeHead(500);
        res.end('Internal server error');
      }
    });

    let port = 5174;
    const tryStartServer = () => {
      if (!mainWindow) return;

      server.listen(port, '127.0.0.1', () => {
        if (!mainWindow) return;
        const url = `http://127.0.0.1:${port}`;
        mainWindow.loadURL(url).catch((error) => {
          if (!mainWindow) return;
          console.error('Failed to load from HTTP server:', error);
          mainWindow.loadFile(indexPath).catch((fileError: any) => {
            if (!mainWindow) return;
            console.error('Failed to load from file://:', fileError);
            mainWindow.webContents.executeJavaScript(`
              document.body.innerHTML = '<div style="padding: 20px; font-family: system-ui;"><h1>Error Loading App</h1><p>Failed to load application</p><p>Error: ${fileError.message}</p></div>';
            `);
          });
        });
      });

      server.on('error', (error: any) => {
        if (!mainWindow) return;

        if (error.code === 'EADDRINUSE') {
          port++;
          tryStartServer();
        } else {
          console.error('HTTP server error:', error);
          mainWindow.loadFile(indexPath);
        }
      });
    };

    tryStartServer();
  }

  if (!mainWindow) return;

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load:', errorCode, errorDescription, validatedURL);
  });

  mainWindow.webContents.on('console-message', (_event, _level, _message) => {
    // no-op
  });
}

// Play notification sound using system audio
function playNotificationSound(type: 'newOrder' | 'statusChange' = 'statusChange') {
  const platform = process.platform;

  
  const playSound = (command: string, callback?: (error: any) => void) => {
    exec(command, (error) => {
      if (error) {
        console.warn(`Failed to play sound with command: ${command}`, error.message);
        if (callback) callback(error);
      }
    });
  };

  try {
    if (platform === 'darwin') {
      // macOS: Use afplay with system sounds
      if (type === 'newOrder') {
        // Play a more attention-grabbing sound (double beep)
        // Try Glass.aiff first, fallback to Ping.aiff if not available
        playSound('afplay /System/Library/Sounds/Glass.aiff', () => {
          // Fallback to Ping if Glass fails
          playSound('afplay /System/Library/Sounds/Ping.aiff');
        });
        setTimeout(() => {
          playSound('afplay /System/Library/Sounds/Glass.aiff', () => {
            playSound('afplay /System/Library/Sounds/Ping.aiff');
          });
        }, 200);
      } else {
        // Play a simple notification sound
        playSound('afplay /System/Library/Sounds/Ping.aiff', () => {
          // Fallback to Submarine if Ping fails
          playSound('afplay /System/Library/Sounds/Submarine.aiff');
        });
      }
    } else if (platform === 'win32') {
      // Windows: Use PowerShell to play beep
      if (type === 'newOrder') {
        playSound('powershell -c "[console]::beep(800,300); [console]::beep(1000,300)"');
      } else {
        playSound('powershell -c "[console]::beep(800,200)"');
      }
    } else {
      // Linux: Use beep command or speaker-test
      if (type === 'newOrder') {
        playSound('beep -f 800 -l 200 -n -f 1000 -l 200', () => {
          // Fallback to speaker-test if beep is not available
          playSound('speaker-test -t sine -f 800 -l 1 -s 1 > /dev/null 2>&1');
        });
      } else {
        playSound('beep -f 800 -l 200', () => {
          playSound('speaker-test -t sine -f 800 -l 1 -s 1 > /dev/null 2>&1');
        });
      }
    }
  } catch (error) {
    console.error('Error playing notification sound:', error);
  }
}

// Handle IPC call to play notification sound
ipcMain.handle('play-notification-sound', (event, type: 'newOrder' | 'statusChange') => {
  playNotificationSound(type);
  return true;
});

// Handle IPC call to set badge count
ipcMain.handle('set-badge-count', (event, count: number) => {
  try {
    // Set badge count on the app (works on macOS and Linux)
    app.setBadgeCount(count > 0 ? count : 0);
    return true;
  } catch (error) {
    console.error('Error setting badge count:', error);
    return false;
  }
});

// Restart the app (used after clearing storage to simulate fresh install)
ipcMain.handle('restart-app', async () => {
  try {
    app.relaunch();
    app.exit(0);
    return true;
  } catch (error) {
    console.error('Error restarting app:', error);
    return false;
  }
});

// Clear Electron session data (cookies/cache/storage)
// This is the only reliable way to reset embedded OAuth state in Electron.
ipcMain.handle('clear-auth-session', async () => {
  try {
    const ses = session.defaultSession;
    await ses.clearCache();
    await ses.clearStorageData({
      storages: [
        'cookies',
        'filesystem',
        'indexdb',
        'localstorage',
        'shadercache',
        'websql',
        'serviceworkers',
        'cachestorage',
      ],
    });

    try {
      const cookieList = await ses.cookies.get({});
      await Promise.all(
        cookieList.map((c) => {
          const protocol = c.secure ? 'https://' : 'http://';
          const host = (c.domain || '').startsWith('.') ? (c.domain || '').slice(1) : (c.domain || '');
          const url = `${protocol}${host}${c.path || '/'}`;
          return ses.cookies.remove(url, c.name);
        })
      );
    } catch {
      // ignore
    }

    return true;
  } catch (error) {
    console.error('Error clearing auth session:', error);
    return false;
  }
});

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    // On macOS, re-create a window when the dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});


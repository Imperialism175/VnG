const { app, BrowserWindow, shell } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const http = require('http')

/** @type {import('child_process').ChildProcess | null} */
let serverProcess = null
/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null

const SERVER_PORT = process.env.PORT || '3001'
const isDev = !app.isPackaged

function getServerPaths() {
  if (isDev) {
    const root = path.join(__dirname, '..')
    return { script: path.join(root, 'server', 'server.js'), cwd: root }
  }
  const unpacked = path.join(process.resourcesPath, 'app.asar.unpacked')
  return { script: path.join(unpacked, 'server', 'server.js'), cwd: unpacked }
}

function startGameServer() {
  const { script, cwd } = getServerPaths()

  serverProcess = spawn(process.execPath, [script], {
    cwd,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: SERVER_PORT,
      HOST: '0.0.0.0',
    },
    stdio: isDev ? 'inherit' : 'ignore',
    windowsHide: true,
  })

  serverProcess.on('error', (err) => {
    console.error('Server failed to start:', err)
  })
}

function waitForServer(maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0
    const check = () => {
      const req = http.get(`http://127.0.0.1:${SERVER_PORT}/api/rooms/ping`, (res) => {
        res.resume()
        resolve()
      })
      req.on('error', () => {
        attempts += 1
        if (attempts >= maxAttempts) reject(new Error('Server timeout'))
        else setTimeout(check, 200)
      })
    }
    check()
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    title: 'ВнГ',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(async () => {
  startGameServer()
  try {
    await waitForServer()
  } catch {
    // Server may not expose /ping — wait briefly and open anyway
    await new Promise((r) => setTimeout(r, 800))
  }
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

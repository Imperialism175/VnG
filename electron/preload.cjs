const { contextBridge } = require('electron')

const port = process.env.PORT || '3001'

contextBridge.exposeInMainWorld('vng', {
  isElectron: true,
  apiBase: `http://127.0.0.1:${port}`,
  wsBase: `ws://127.0.0.1:${port}/ws`,
  serverPort: port,
})

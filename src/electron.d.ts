/// <reference types="vite/client" />

interface VngElectronAPI {
  isElectron: boolean
  apiBase: string
  wsBase: string
  serverPort: string
}

interface Window {
  vng?: VngElectronAPI
}

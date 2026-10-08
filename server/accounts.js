import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes, pbkdf2Sync, randomUUID } from 'node:crypto'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ACCOUNTS_FILE = join(__dirname, 'data', 'accounts.json')

let accountsCache = null

function loadAccounts() {
  if (accountsCache) return accountsCache
  try {
    if (!existsSync(ACCOUNTS_FILE)) {
      accountsCache = []
      return accountsCache
    }
    accountsCache = JSON.parse(readFileSync(ACCOUNTS_FILE, 'utf8'))
    return accountsCache
  } catch (e) {
    console.error('Failed to load accounts.json', e)
    accountsCache = []
    return accountsCache
  }
}

function saveAccounts() {
  try {
    mkdirSync(dirname(ACCOUNTS_FILE), { recursive: true })
    writeFileSync(ACCOUNTS_FILE, JSON.stringify(accountsCache, null, 2), 'utf8')
  } catch (e) {
    console.error('Failed to save accounts.json', e)
  }
}

function hashPassword(passwordStr) {
  const salt = randomBytes(16).toString('hex')
  const hash = pbkdf2Sync(passwordStr, salt, 1000, 64, 'sha512').toString('hex')
  return { salt, hash }
}

function verifyPassword(passwordStr, salt, expectedHash) {
  const hash = pbkdf2Sync(passwordStr, salt, 1000, 64, 'sha512').toString('hex')
  return hash === expectedHash
}

export function registerAccount(email, password, displayName) {
  const accounts = loadAccounts()
  const lowerEmail = email.trim().toLowerCase()
  
  if (accounts.some(a => a.email === lowerEmail)) {
    throw new Error('Аккаунт с такой почтой уже существует')
  }

  const { salt, hash } = hashPassword(password)
  const newAccount = {
    id: randomUUID(),
    email: lowerEmail,
    displayName: displayName.trim().toUpperCase().slice(0, 3) || 'AAA', // 3 chars format
    salt,
    hash,
    createdAt: Date.now()
  }

  accounts.push(newAccount)
  saveAccounts()

  // Return non-sensitive data
  return {
    id: newAccount.id,
    email: newAccount.email,
    displayName: newAccount.displayName
  }
}

export function loginAccount(email, password) {
  const accounts = loadAccounts()
  const lowerEmail = email.trim().toLowerCase()
  
  const account = accounts.find(a => a.email === lowerEmail)
  if (!account) {
    throw new Error('Неверная почта или пароль')
  }

  if (!verifyPassword(password, account.salt, account.hash)) {
    throw new Error('Неверная почта или пароль')
  }

  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName
  }
}

export function findAccountById(id) {
  const accounts = loadAccounts()
  const account = accounts.find(a => a.id === id)
  if (!account) return null
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName
  }
}

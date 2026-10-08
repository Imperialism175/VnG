import React, { useState } from 'react'
import { Button, Input } from '@/components/ui/Button'
import { apiLogin, apiRegister } from '@/lib/api'

interface AuthPanelProps {
  onLogin: (account: { id: string; email: string; displayName: string }) => void
}

export function AuthPanel({ onLogin }: AuthPanelProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === 'register') {
        const res = await apiRegister(email, password, displayName)
        if (res.ok && res.account) {
          onLogin(res.account)
        }
      } else {
        const res = await apiLogin(email, password)
        if (res.ok && res.account) {
          onLogin(res.account)
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Ошибка сервера')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="vng-card p-4 flex flex-col gap-3">
      <h3 className="text-sm font-bold uppercase tracking-widest text-vng-amber">
        {mode === 'login' ? 'АВТОРИЗАЦИЯ ОПЕРАТОРА' : 'РЕГИСТРАЦИЯ ОПЕРАТОРА'}
      </h3>
      
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input 
          label="ЛОГИН (E-MAIL)" 
          type="email" 
          value={email} 
          onChange={e => setEmail(e.target.value)} 
          required 
        />
        
        {mode === 'register' && (
          <Input 
            label="ПОЗЫВНОЙ (ИМЯ 3 СИМВОЛА)" 
            value={displayName} 
            onChange={e => setDisplayName(e.target.value.toUpperCase().slice(0, 3).replace(/[^A-Z0-9]/g, ''))} 
            placeholder="AAA"
            required 
          />
        )}
        
        <Input 
          label="ПАРОЛЬ ДОСТУПА" 
          type="password" 
          value={password} 
          onChange={e => setPassword(e.target.value)} 
          required 
        />

        {error && <p className="text-xs text-vng-danger">{error}</p>}
        
        <Button type="submit" disabled={loading} className="w-full mt-2">
          {mode === 'login' ? 'ВОЙТИ В СИСТЕМУ' : 'СОЗДАТЬ АККАУНТ'}
        </Button>
      </form>
      
      <p className="text-xs text-vng-muted text-center cursor-pointer hover:text-white mt-1" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
        {mode === 'login' ? '[ НЕТ АККАУНТА? РЕГИСТРАЦИЯ ]' : '[ УЖЕ ЕСТЬ АККАУНТ? ВОЙТИ ]'}
      </p>
    </div>
  )
}

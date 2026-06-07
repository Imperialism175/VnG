import { useEffect, useMemo, useRef, useState } from 'react'
import { CHEAT_SECRET_CODE } from '@/lib/cheatState'

type CalcOp = '+' | '-' | '*' | '/' | null

interface FloatingCalculatorProps {
  open: boolean
  onClose: () => void
  onSecretCode?: () => void
}

function toNumber(value: string): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return 'Ошибка'
  const abs = Math.abs(value)
  if (abs >= 1e12) return value.toExponential(8)
  const rounded = Number(value.toFixed(10))
  return String(rounded)
}

function applyOperation(a: number, b: number, op: Exclude<CalcOp, null>): number {
  if (op === '+') return a + b
  if (op === '-') return a - b
  if (op === '*') return a * b
  if (op === '/') return b === 0 ? Number.NaN : a / b
  return b
}

export function FloatingCalculator({ open, onClose, onSecretCode }: FloatingCalculatorProps) {
  const [display, setDisplay] = useState('0')
  const [stored, setStored] = useState<number | null>(null)
  const [operator, setOperator] = useState<CalcOp>(null)
  const [waitingNext, setWaitingNext] = useState(false)
  const [lastOperand, setLastOperand] = useState<number | null>(null)
  const [position, setPosition] = useState<{ x: number; y: number }>(() => ({ x: 96, y: 96 }))
  const [dragging, setDragging] = useState(false)
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const x = Math.max(12, Math.round(window.innerWidth / 2 - 160))
    const y = Math.max(64, Math.round(window.innerHeight / 2 - 220))
    setPosition({ x, y })
  }, [open])

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: PointerEvent) => {
      const dragOffset = dragOffsetRef.current
      if (!dragOffset) return
      const maxX = Math.max(12, window.innerWidth - 340)
      const maxY = Math.max(48, window.innerHeight - 520)
      setPosition({
        x: Math.max(12, Math.min(maxX, Math.round(e.clientX - dragOffset.x))),
        y: Math.max(48, Math.min(maxY, Math.round(e.clientY - dragOffset.y))),
      })
    }
    const onUp = () => {
      setDragging(false)
      dragOffsetRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragging])

  const displayValue = useMemo(() => toNumber(display), [display])

  if (!open) return null

  function openSecretMenu() {
    onSecretCode?.()
    setDisplay('0')
    setStored(null)
    setOperator(null)
    setWaitingNext(false)
    setLastOperand(null)
  }

  function inputDigit(digit: string) {
    if (display === 'Ошибка') {
      setDisplay(digit)
      setWaitingNext(false)
      return
    }
    if (waitingNext) {
      setDisplay(digit)
      setWaitingNext(false)
      return
    }
    const next = display === '0' ? digit : `${display}${digit}`
    setDisplay(next)
  }

  function inputDot() {
    if (display === 'Ошибка') {
      setDisplay('0.')
      setWaitingNext(false)
      return
    }
    if (waitingNext) {
      setDisplay('0.')
      setWaitingNext(false)
      return
    }
    setDisplay((prev) => (prev.includes('.') ? prev : `${prev}.`))
  }

  function clearEntry() {
    setDisplay('0')
  }

  function clearAll() {
    setDisplay('0')
    setStored(null)
    setOperator(null)
    setWaitingNext(false)
    setLastOperand(null)
  }

  function backspace() {
    if (waitingNext || display === 'Ошибка') {
      setDisplay('0')
      return
    }
    setDisplay((prev) => {
      if (prev.length <= 1) return '0'
      const next = prev.slice(0, -1)
      return next === '-' ? '0' : next
    })
  }

  function toggleSign() {
    if (display === 'Ошибка') return
    setDisplay((prev) => (prev === '0' ? prev : prev.startsWith('-') ? prev.slice(1) : `-${prev}`))
  }

  function applyPercent() {
    if (display === 'Ошибка') return
    const current = displayValue
    if (stored !== null && operator) {
      const value = (stored * current) / 100
      setDisplay(formatNumber(value))
      return
    }
    setDisplay(formatNumber(current / 100))
  }

  function chooseOperator(nextOp: Exclude<CalcOp, null>) {
    const current = displayValue
    if (display === 'Ошибка') return
    if (stored === null) {
      setStored(current)
      setOperator(nextOp)
      setWaitingNext(true)
      setLastOperand(null)
      return
    }
    if (operator && !waitingNext) {
      const result = applyOperation(stored, current, operator)
      setDisplay(formatNumber(result))
      setStored(result)
    }
    setOperator(nextOp)
    setWaitingNext(true)
    setLastOperand(null)
  }

  function handleEquals() {
    if (display === CHEAT_SECRET_CODE) {
      openSecretMenu()
      return
    }
    evaluate()
  }

  function evaluate() {
    if (display === 'Ошибка') return
    if (!operator || stored === null) return
    const current = waitingNext ? (lastOperand ?? displayValue) : displayValue
    const result = applyOperation(stored, current, operator)
    if (!Number.isFinite(result)) {
      setDisplay('Ошибка')
      setStored(null)
      setOperator(null)
      setWaitingNext(true)
      setLastOperand(null)
      return
    }
    setDisplay(formatNumber(result))
    setStored(result)
    setLastOperand(current)
    setWaitingNext(true)
  }

  return (
    <div
      ref={panelRef}
      className="fixed z-[120] w-[320px] max-w-[calc(100vw-24px)] border border-vng-border bg-vng-bg text-vng-text select-none"
      style={{ left: position.x, top: position.y }}
      role="dialog"
      aria-label="Калькулятор"
    >
      <div
        className="flex items-center justify-between border-b border-vng-border px-2 py-1 cursor-move bg-vng-elevated"
        onPointerDown={(e) => {
          const rect = panelRef.current?.getBoundingClientRect()
          if (!rect) return
          dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
          setDragging(true)
        }}
      >
        <span className="text-xs uppercase tracking-wide">Калькулятор</span>
        <button type="button" onClick={onClose} className="vng-tui-btn vng-tui-btn--ghost text-xs px-2 py-0.5">
          ✕
        </button>
      </div>

      <div className="p-2">
        <div className="mb-2 border border-vng-border bg-vng-elevated px-2 py-2 text-right">
          <div className="text-xs text-vng-muted h-4">{operator ? `${stored ?? 0} ${operator}` : '\u00A0'}</div>
          <div className="text-2xl font-bold vng-mono truncate">{display}</div>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          <CalcBtn label="%" onClick={applyPercent} />
          <CalcBtn label="CE" onClick={clearEntry} />
          <CalcBtn label="C" onClick={clearAll} />
          <CalcBtn label="⌫" onClick={backspace} />

          <CalcBtn label="7" onClick={() => inputDigit('7')} />
          <CalcBtn label="8" onClick={() => inputDigit('8')} />
          <CalcBtn label="9" onClick={() => inputDigit('9')} />
          <CalcBtn label="÷" onClick={() => chooseOperator('/')} accent />

          <CalcBtn label="4" onClick={() => inputDigit('4')} />
          <CalcBtn label="5" onClick={() => inputDigit('5')} />
          <CalcBtn label="6" onClick={() => inputDigit('6')} />
          <CalcBtn label="×" onClick={() => chooseOperator('*')} accent />

          <CalcBtn label="1" onClick={() => inputDigit('1')} />
          <CalcBtn label="2" onClick={() => inputDigit('2')} />
          <CalcBtn label="3" onClick={() => inputDigit('3')} />
          <CalcBtn label="−" onClick={() => chooseOperator('-')} accent />

          <CalcBtn label="±" onClick={toggleSign} />
          <CalcBtn label="0" onClick={() => inputDigit('0')} />
          <CalcBtn label="." onClick={inputDot} />
          <CalcBtn label="+" onClick={() => chooseOperator('+')} accent />

          <button
            type="button"
            onClick={handleEquals}
            className="col-span-4 mt-1 border border-vng-border bg-vng-amber/10 text-vng-amber hover:bg-vng-amber/20 py-2 text-sm font-semibold"
          >
            =
          </button>
        </div>
      </div>
    </div>
  )
}

function CalcBtn({ label, onClick, accent = false }: { label: string; onClick: () => void; accent?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border border-vng-border py-2 text-sm vng-mono ${accent ? 'text-vng-blue bg-vng-blue/10 hover:bg-vng-blue/20' : 'bg-vng-bg hover:bg-vng-elevated'}`}
    >
      {label}
    </button>
  )
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import {
  Circle,
  Download,
  Eraser,
  Lock,
  LockOpen,
  Minus,
  Pencil,
  RectangleHorizontal,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react'
import { useRoom } from '@/context/RoomContext'
import type { BoardBackground, BoardState, BoardStroke } from '@/types'
import { generateId } from '@/lib/utils'

type Tool = BoardStroke['tool'] | 'eraser'

const ASPECT = 16 / 9
/** Толщина в штрихах задаётся для доски шириной 1000px и масштабируется */
const BASE_WIDTH = 1000
const CHALK_WHITE = '#f5f5f0'
const COLORS = [CHALK_WHITE, '#ffe066', '#ff8fab', '#74c0fc', '#8ce99a', '#ffa94d', '#ff6b6b', '#b197fc']
const WIDTHS = [
  { value: 3, label: 'Тонко' },
  { value: 6, label: 'Средне' },
  { value: 12, label: 'Толсто' },
]
const BACKGROUNDS: { id: BoardBackground; label: string }[] = [
  { id: 'chalk', label: 'Мел' },
  { id: 'grid', label: 'Клетка' },
  { id: 'white', label: 'Маркер' },
]
const TOOLS: { id: Tool; label: string; icon: typeof Pencil }[] = [
  { id: 'pen', label: 'Мел (P)', icon: Pencil },
  { id: 'line', label: 'Линия (L)', icon: Minus },
  { id: 'rect', label: 'Прямоугольник (R)', icon: RectangleHorizontal },
  { id: 'ellipse', label: 'Овал (O)', icon: Circle },
  { id: 'text', label: 'Текст (T)', icon: Type },
  { id: 'eraser', label: 'Ластик (E)', icon: Eraser },
]
const TOOL_KEYS: Record<string, Tool> = { p: 'pen', l: 'line', r: 'rect', o: 'ellipse', t: 'text', e: 'eraser' }

const EMPTY_BOARD: BoardState = { strokes: [], locked: false, background: 'chalk' }

function displayColor(color: string, bg: BoardBackground) {
  // Белый мел на маркерной доске не видно — рисуем его тёмным
  if (bg === 'white' && color.toLowerCase() === CHALK_WHITE) return '#1f2933'
  return color
}

function textFontPx(width: number, scale: number) {
  return Math.round((width * 3 + 14) * scale)
}

function drawStroke(ctx: CanvasRenderingContext2D, s: BoardStroke, w: number, h: number, bg: BoardBackground) {
  const scale = w / BASE_WIDTH
  const color = displayColor(s.color, bg)
  const pts = s.points
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = Math.max(1, s.width * scale)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (bg !== 'white') {
    // Лёгкое свечение — похоже на мел
    ctx.shadowColor = color
    ctx.shadowBlur = 2 * scale
    ctx.globalAlpha = 0.92
  }
  const x = (i: number) => pts[i * 2] * w
  const y = (i: number) => pts[i * 2 + 1] * h
  const n = Math.floor(pts.length / 2)
  if (s.tool === 'pen') {
    if (n === 1) {
      ctx.beginPath()
      ctx.arc(x(0), y(0), ctx.lineWidth / 2, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.moveTo(x(0), y(0))
      for (let i = 1; i < n - 1; i++) {
        const mx = (x(i) + x(i + 1)) / 2
        const my = (y(i) + y(i + 1)) / 2
        ctx.quadraticCurveTo(x(i), y(i), mx, my)
      }
      ctx.lineTo(x(n - 1), y(n - 1))
      ctx.stroke()
    }
  } else if (s.tool === 'line' && n >= 2) {
    ctx.beginPath()
    ctx.moveTo(x(0), y(0))
    ctx.lineTo(x(1), y(1))
    ctx.stroke()
  } else if (s.tool === 'rect' && n >= 2) {
    ctx.strokeRect(Math.min(x(0), x(1)), Math.min(y(0), y(1)), Math.abs(x(1) - x(0)), Math.abs(y(1) - y(0)))
  } else if (s.tool === 'ellipse' && n >= 2) {
    ctx.beginPath()
    ctx.ellipse((x(0) + x(1)) / 2, (y(0) + y(1)) / 2, Math.abs(x(1) - x(0)) / 2, Math.abs(y(1) - y(0)) / 2, 0, 0, Math.PI * 2)
    ctx.stroke()
  } else if (s.tool === 'text' && s.text) {
    const px = textFontPx(s.width, scale)
    ctx.font = `${px}px "Segoe Print", "Comic Sans MS", "Bradley Hand", cursive`
    ctx.textBaseline = 'top'
    s.text.split('\n').forEach((line, i) => ctx.fillText(line, x(0), y(0) + i * px * 1.2))
  }
  ctx.restore()
}

/** Ломаная для проверки попадания ластиком, в пикселях */
function strokeOutline(s: BoardStroke, w: number, h: number): Array<[number, number]> {
  const p = s.points
  const pt = (i: number): [number, number] => [p[i * 2] * w, p[i * 2 + 1] * h]
  const n = Math.floor(p.length / 2)
  if (s.tool === 'pen' || s.tool === 'line') return Array.from({ length: n }, (_, i) => pt(i))
  if (n < 1) return []
  const [x0, y0] = pt(0)
  if (s.tool === 'text') {
    const px = textFontPx(s.width, w / BASE_WIDTH)
    const lines = String(s.text ?? '').split('\n')
    const x1 = x0 + Math.max(...lines.map((l) => l.length)) * px * 0.55
    const y1 = y0 + lines.length * px * 1.2
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]
  }
  const [x1, y1] = n >= 2 ? pt(1) : pt(0)
  if (s.tool === 'rect') return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const rx = Math.abs(x1 - x0) / 2
  const ry = Math.abs(y1 - y0) / 2
  return Array.from({ length: 33 }, (_, i) => {
    const a = (i / 32) * Math.PI * 2
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as [number, number]
  })
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function strokeHit(s: BoardStroke, px: number, py: number, w: number, h: number, radius: number) {
  const outline = strokeOutline(s, w, h)
  const tol = radius + (s.width * w) / BASE_WIDTH / 2
  if (s.tool === 'text') {
    const [[x0, y0], , [x1, y1]] = outline
    return px >= x0 - radius && px <= x1 + radius && py >= y0 - radius && py <= y1 + radius
  }
  if (outline.length === 1) return Math.hypot(px - outline[0][0], py - outline[0][1]) <= tol
  for (let i = 0; i < outline.length - 1; i++) {
    const [ax, ay] = outline[i]
    const [bx, by] = outline[i + 1]
    if (distToSegment(px, py, ax, ay, bx, by) <= tol) return true
  }
  return false
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, bg: BoardBackground) {
  if (bg === 'white') {
    ctx.fillStyle = '#f8f9f4'
    ctx.fillRect(0, 0, w, h)
    return
  }
  const grad = ctx.createRadialGradient(w / 2, h / 2, w * 0.1, w / 2, h / 2, w * 0.75)
  grad.addColorStop(0, '#2f4a3a')
  grad.addColorStop(1, '#1f3328')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
  if (bg === 'grid') {
    const step = w / 32
    ctx.strokeStyle = 'rgba(245, 245, 240, 0.12)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let gx = step; gx < w; gx += step) {
      ctx.moveTo(gx, 0)
      ctx.lineTo(gx, h)
    }
    for (let gy = step; gy < h; gy += step) {
      ctx.moveTo(0, gy)
      ctx.lineTo(w, gy)
    }
    ctx.stroke()
  }
}

/** Общая школьная доска комнаты: рисуют все, ГМ может закрыть доску и стереть всё */
export function RoomBoard({ isGm }: { isGm: boolean }) {
  const { session, sendRoomMessage, subscribeRoomMessages, connected } = useRoom()
  const myId = session.playerId
  const [board, setBoard] = useState<BoardState>(EMPTY_BOARD)
  const [loaded, setLoaded] = useState(false)
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(CHALK_WHITE)
  const [width, setWidth] = useState(6)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; value: string } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const draftRef = useRef<BoardStroke | null>(null)
  const erasingRef = useRef<Set<string> | null>(null)
  const textInputRef = useRef<HTMLTextAreaElement>(null)
  const textDraftRef = useRef<{ x: number; y: number; value: string } | null>(null)
  const canDraw = isGm || !board.locked

  // ---- Синхронизация с сервером ----
  useEffect(() => {
    const unsub = subscribeRoomMessages((msg) => {
      if (msg.type === 'BOARD_STATE') {
        setBoard({
          strokes: Array.isArray(msg.board?.strokes) ? msg.board.strokes : [],
          locked: Boolean(msg.board?.locked),
          background: msg.board?.background ?? 'chalk',
        })
        setHiddenIds(new Set())
        setLoaded(true)
      } else if (msg.type === 'BOARD_STROKE') {
        setBoard((b) => (b.strokes.some((s) => s.id === msg.stroke.id) ? b : { ...b, strokes: [...b.strokes, msg.stroke] }))
      } else if (msg.type === 'BOARD_REMOVE') {
        const ids = new Set(msg.ids)
        setBoard((b) => ({ ...b, strokes: b.strokes.filter((s) => !ids.has(s.id)) }))
      } else if (msg.type === 'STATE_SYNC') {
        // Переподключились — забираем доску заново
        sendRoomMessage({ type: 'BOARD_REQUEST' })
      }
    })
    sendRoomMessage({ type: 'BOARD_REQUEST' })
    return unsub
  }, [subscribeRoomMessages, sendRoomMessage])

  useEffect(() => {
    if (connected) sendRoomMessage({ type: 'BOARD_REQUEST' })
  }, [connected, sendRoomMessage])

  // ---- Размер холста: 16:9, вписан в доступное место ----
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = () => {
      const availW = el.clientWidth
      // Под доской полочка для мела
      const availH = el.clientHeight - 22
      let w = availW
      let h = w / ASPECT
      if (availH > 0 && h > availH) {
        h = availH
        w = h * ASPECT
      }
      setSize({ w: Math.max(200, Math.floor(w)), h: Math.max(112, Math.floor(h)) })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const visibleStrokes = useMemo(
    () => board.strokes.filter((s) => !hiddenIds.has(s.id)),
    [board.strokes, hiddenIds]
  )

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !size.w) return
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== Math.round(size.w * dpr)) {
      canvas.width = Math.round(size.w * dpr)
      canvas.height = Math.round(size.h * dpr)
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawBackground(ctx, size.w, size.h, board.background)
    for (const s of visibleStrokes) drawStroke(ctx, s, size.w, size.h, board.background)
    if (draftRef.current) drawStroke(ctx, draftRef.current, size.w, size.h, board.background)
  }, [size, visibleStrokes, board.background])

  useEffect(() => {
    redraw()
  }, [redraw])

  // ---- Рисование ----
  function toBoardPoint(e: PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height, px: e.clientX - rect.left, py: e.clientY - rect.top }
  }

  function eraseAt(px: number, py: number) {
    const hits = board.strokes.filter(
      (s) => (isGm || s.player_id === myId) && !erasingRef.current?.has(s.id) && strokeHit(s, px, py, size.w, size.h, 8)
    )
    if (!hits.length) return
    hits.forEach((s) => erasingRef.current?.add(s.id))
    setHiddenIds((prev) => new Set([...prev, ...hits.map((s) => s.id)]))
  }

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    if (!canDraw || e.button > 0) return
    if (tool === 'text') return
    const p = toBoardPoint(e)
    e.currentTarget.setPointerCapture(e.pointerId)
    if (tool === 'eraser') {
      erasingRef.current = new Set()
      eraseAt(p.px, p.py)
      return
    }
    draftRef.current = {
      id: generateId(),
      player_id: myId,
      tool,
      color,
      width,
      points: tool === 'pen' ? [p.x, p.y] : [p.x, p.y, p.x, p.y],
    }
    redraw()
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (erasingRef.current) {
      const p = toBoardPoint(e)
      eraseAt(p.px, p.py)
      return
    }
    const draft = draftRef.current
    if (!draft) return
    const p = toBoardPoint(e)
    if (draft.tool === 'pen') {
      const lx = draft.points[draft.points.length - 2]
      const ly = draft.points[draft.points.length - 1]
      // Пропускаем почти одинаковые точки — меньше трафика
      if (Math.hypot((p.x - lx) * size.w, (p.y - ly) * size.h) < 1.5) return
      draft.points.push(p.x, p.y)
    } else {
      let { x, y } = p
      if (e.shiftKey && draft.tool !== 'line') {
        // Shift — квадрат / круг
        const dx = (x - draft.points[0]) * size.w
        const dy = (y - draft.points[1]) * size.h
        const d = Math.max(Math.abs(dx), Math.abs(dy))
        x = draft.points[0] + (Math.sign(dx) * d) / size.w
        y = draft.points[1] + (Math.sign(dy) * d) / size.h
      }
      draft.points[2] = x
      draft.points[3] = y
    }
    redraw()
  }

  function onPointerUp(e: PointerEvent<HTMLCanvasElement>) {
    if (canDraw && tool === 'text' && e.button === 0) {
      // Поле текста открываем на отпускании: иначе фокус сразу уходит с поля
      const p = toBoardPoint(e)
      textDraftRef.current = { x: p.x, y: p.y, value: '' }
      setTextDraft(textDraftRef.current)
      return
    }
    finishStroke()
  }

  function finishStroke() {
    if (erasingRef.current) {
      const ids = [...erasingRef.current]
      erasingRef.current = null
      if (ids.length) sendRoomMessage({ type: 'BOARD_REMOVE', ids })
      return
    }
    const draft = draftRef.current
    draftRef.current = null
    if (!draft) return
    const tooSmall =
      draft.tool !== 'pen' &&
      Math.hypot((draft.points[2] - draft.points[0]) * size.w, (draft.points[3] - draft.points[1]) * size.h) < 3
    if (tooSmall) {
      redraw()
      return
    }
    const stroke = { ...draft, points: draft.points.map((v) => Math.round(v * 10000) / 10000) }
    setBoard((b) => ({ ...b, strokes: [...b.strokes, stroke] }))
    sendRoomMessage({ type: 'BOARD_STROKE', stroke })
  }

  function commitText() {
    const draft = textDraftRef.current
    // Enter и потеря фокуса могут прийти оба — коммитим один раз
    textDraftRef.current = null
    if (!draft) return
    const value = draft.value.trim()
    if (value) {
      const stroke: BoardStroke = {
        id: generateId(),
        player_id: myId,
        tool: 'text',
        color,
        width,
        points: [draft.x, draft.y],
        text: value.slice(0, 300),
      }
      setBoard((b) => ({ ...b, strokes: [...b.strokes, stroke] }))
      sendRoomMessage({ type: 'BOARD_STROKE', stroke })
    }
    setTextDraft(null)
  }

  const textOpen = textDraft !== null
  useEffect(() => {
    if (!textOpen) return
    const id = window.requestAnimationFrame(() => textInputRef.current?.focus())
    return () => window.cancelAnimationFrame(id)
  }, [textOpen])

  const undo = useCallback(() => {
    const mine = [...board.strokes].reverse().find((s) => s.player_id === myId)
    if (!mine) return
    setBoard((b) => ({ ...b, strokes: b.strokes.filter((s) => s.id !== mine.id) }))
    sendRoomMessage({ type: 'BOARD_REMOVE', ids: [mine.id] })
  }, [board.strokes, myId, sendRoomMessage])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const next = TOOL_KEYS[e.key.toLowerCase()]
      if (next) setTool(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo])

  function downloadPng() {
    const canvas = canvasRef.current
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `vng-board-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`
    a.click()
  }

  const hasMine = board.strokes.some((s) => s.player_id === myId)

  return (
    <div className="vng-board flex-1 min-h-0">
      <div className="vng-board__toolbar" role="toolbar" aria-label="Инструменты доски">
        <div className="vng-board__group">
          {TOOLS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`vng-board__tool ${tool === id ? 'vng-board__tool--on' : ''}`}
              onClick={() => setTool(id)}
              disabled={!canDraw}
              title={label}
              aria-label={label}
              aria-pressed={tool === id}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>
        <div className="vng-board__group">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`vng-board__swatch ${color === c ? 'vng-board__swatch--on' : ''}`}
              style={{ background: c }}
              onClick={() => {
                setColor(c)
                if (tool === 'eraser') setTool('pen')
              }}
              disabled={!canDraw}
              title="Цвет мела"
              aria-label={`Цвет ${c}`}
            />
          ))}
        </div>
        <div className="vng-board__group">
          {WIDTHS.map((wOpt) => (
            <button
              key={wOpt.value}
              type="button"
              className={`vng-board__tool ${width === wOpt.value ? 'vng-board__tool--on' : ''}`}
              onClick={() => setWidth(wOpt.value)}
              disabled={!canDraw}
              title={wOpt.label}
              aria-label={wOpt.label}
            >
              <span className="vng-board__dot" style={{ width: wOpt.value + 2, height: wOpt.value + 2 }} />
            </button>
          ))}
        </div>
        <div className="vng-board__group">
          <button type="button" className="vng-board__tool" onClick={undo} disabled={!canDraw || !hasMine} title="Отменить (Ctrl+Z)" aria-label="Отменить">
            <Undo2 size={16} />
          </button>
          <button type="button" className="vng-board__tool" onClick={downloadPng} title="Сохранить картинку" aria-label="Сохранить картинку">
            <Download size={16} />
          </button>
        </div>
        {isGm && (
          <div className="vng-board__group vng-board__group--gm">
            <select
              value={board.background}
              onChange={(e) => sendRoomMessage({ type: 'BOARD_OPTIONS', background: e.target.value as BoardBackground })}
              className="vng-board__select"
              aria-label="Фон доски"
            >
              {BACKGROUNDS.map((b) => (
                <option key={b.id} value={b.id}>
                  Фон: {b.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={`vng-board__tool ${board.locked ? 'vng-board__tool--on' : ''}`}
              onClick={() => sendRoomMessage({ type: 'BOARD_OPTIONS', locked: !board.locked })}
              title={board.locked ? 'Доска закрыта для игроков — открыть' : 'Закрыть доску для игроков'}
              aria-label={board.locked ? 'Открыть доску для игроков' : 'Закрыть доску для игроков'}
            >
              {board.locked ? <Lock size={16} /> : <LockOpen size={16} />}
            </button>
            <button
              type="button"
              className="vng-board__tool vng-board__tool--danger"
              onClick={() => {
                if (board.strokes.length && window.confirm('Стереть всю доску у всех?')) sendRoomMessage({ type: 'BOARD_CLEAR' })
              }}
              disabled={!board.strokes.length}
              title="Стереть всё"
              aria-label="Стереть всё"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>

      {!canDraw && <p className="vng-board__notice">ГМ закрыл доску — можно только смотреть.</p>}

      <div ref={wrapRef} className="vng-board__stage">
        <div className="vng-board__frame" style={{ width: size.w, height: size.h }}>
          <canvas
            ref={canvasRef}
            className={`vng-board__canvas vng-board__canvas--${canDraw ? tool : 'view'}`}
            style={{ width: size.w, height: size.h }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={finishStroke}
          />
          {textDraft && (
            <textarea
              ref={textInputRef}
              className="vng-board__text-input"
              style={{
                left: textDraft.x * size.w,
                top: textDraft.y * size.h,
                color: displayColor(color, board.background),
                fontSize: textFontPx(width, size.w / BASE_WIDTH),
              }}
              value={textDraft.value}
              onChange={(e) => {
                textDraftRef.current = { ...textDraft, value: e.target.value }
                setTextDraft(textDraftRef.current)
              }}
              onBlur={commitText}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  commitText()
                } else if (e.key === 'Escape') {
                  textDraftRef.current = null
                  setTextDraft(null)
                }
              }}
              placeholder="Текст… (Enter — готово)"
              rows={1}
            />
          )}
          {!loaded && <span className="vng-board__loading">Загружаю доску…</span>}
        </div>
        <div className="vng-board__tray" style={{ width: size.w }} aria-hidden>
          <span className="vng-board__chalk" />
          <span className="vng-board__chalk vng-board__chalk--yellow" />
          <span className="vng-board__sponge" />
        </div>
      </div>
    </div>
  )
}

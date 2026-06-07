import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  getCheatState,
  patchCheatState,
  type CheatDieSides,
} from '@/lib/cheatState'
import {
  DEFAULT_PRO_MAX_SETTINGS,
  PRO_MAX_PRESETS,
  PRO_MAX_SCENE_SHAPES,
  type ProMaxMotion,
  type ProMaxRadius,
  type ProMaxSceneShape,
} from '@/lib/proMaxTheme'

const CHEAT_DICE: { sides: CheatDieSides; label: string }[] = [
  { sides: 4, label: 'd4' },
  { sides: 6, label: 'd6' },
  { sides: 8, label: 'd8' },
  { sides: 10, label: 'd10' },
  { sides: 12, label: 'd12' },
  { sides: 20, label: 'd20' },
  { sides: 100, label: 'd100' },
]

interface SecretCheatMenuProps {
  open: boolean
  onClose: () => void
}

export function SecretCheatMenu({ open, onClose }: SecretCheatMenuProps) {
  const [state, setState] = useState(getCheatState)
  const [position, setPosition] = useState({ x: 420, y: 96 })
  const [dragging, setDragging] = useState(false)
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    setState(getCheatState())
    const x = Math.max(12, Math.round(window.innerWidth / 2 - 160))
    const y = Math.max(64, Math.round(window.innerHeight / 2 - 280))
    setPosition({ x, y })
  }, [open])

  useEffect(() => subscribeLocal(() => setState(getCheatState())), [])

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: PointerEvent) => {
      const dragOffset = dragOffsetRef.current
      if (!dragOffset) return
      const maxX = Math.max(12, window.innerWidth - 340)
      const maxY = Math.max(48, window.innerHeight - 560)
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

  if (!open) return null

  function patch(patch: Parameters<typeof patchCheatState>[0]) {
    setState(patchCheatState(patch))
  }

  function updateDice(sides: CheatDieSides, raw: string) {
    const trimmed = raw.trim()
    const value = trimmed === '' ? null : Number(trimmed)
    patch({
      diceBySides: {
        [sides]: Number.isFinite(value) ? Math.max(1, Math.min(sides, Math.round(value!))) : null,
      },
    })
  }

  const pm = state.proMax

  return (
    <div
      ref={panelRef}
      className="fixed z-[121] w-[320px] max-w-[calc(100vw-24px)] max-h-[min(82vh,580px)] overflow-y-auto border border-vng-border bg-vng-bg/95 text-vng-text select-none vng-cheat-menu"
      style={{ left: position.x, top: position.y }}
      role="dialog"
      aria-label="Сервис"
    >
      <div
        className="sticky top-0 z-10 flex items-center justify-between border-b border-vng-border px-2 py-1 cursor-move bg-vng-elevated/90 backdrop-blur-sm"
        onPointerDown={(e) => {
          const rect = panelRef.current?.getBoundingClientRect()
          if (!rect) return
          dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
          setDragging(true)
        }}
      >
        <span className="text-[10px] uppercase tracking-widest text-vng-muted">Сервис</span>
        <button type="button" onClick={onClose} className="vng-tui-btn vng-tui-btn--ghost text-xs px-2 py-0.5">
          ✕
        </button>
      </div>

      <div className="p-2 space-y-3 text-xs">
        <CheatSection title="Pro Max UI">
          <CheatToggle
            label="Включить Pro Max"
            hint="Только для вас. Сбрасывается при закрытии вкладки."
            checked={state.proMaxActive}
            onChange={(v) => patch({ proMaxActive: v })}
          />
          {state.proMaxActive && (
            <>
              <div className="flex flex-wrap gap-1">
                {PRO_MAX_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    className="vng-tui-btn vng-tui-btn--ghost text-[10px] px-1.5 py-0.5"
                    onClick={() =>
                      patch({
                        proMax: { ...DEFAULT_PRO_MAX_SETTINGS, ...preset.settings },
                      })
                    }
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <ColorInput label="Текст" value={pm.text} onChange={(text) => patch({ proMax: { text } })} />
                <ColorInput label="Акцент" value={pm.accent} onChange={(accent) => patch({ proMax: { accent } })} />
                <ColorInput label="Фон" value={pm.bg} onChange={(bg) => patch({ proMax: { bg } })} />
              </div>
              <SliderRow
                label="Стекло"
                value={pm.glassOpacity}
                min={20}
                max={90}
                onChange={(glassOpacity) => patch({ proMax: { glassOpacity } })}
              />
              <SliderRow
                label="Размытие"
                value={pm.blurPx}
                min={4}
                max={32}
                onChange={(blurPx) => patch({ proMax: { blurPx } })}
              />
              <SliderRow
                label="Свечение"
                value={pm.glow}
                min={0}
                max={100}
                onChange={(glow) => patch({ proMax: { glow } })}
              />
              <label className="flex items-center justify-between gap-2">
                <span>Скругление</span>
                <select
                  value={pm.radius}
                  onChange={(e) => patch({ proMax: { radius: e.target.value as ProMaxRadius } })}
                  className="px-1.5 py-0.5 bg-vng-bg border border-vng-border text-xs"
                >
                  <option value="sharp">Острое</option>
                  <option value="soft">Мягкое</option>
                  <option value="round">Круглое</option>
                </select>
              </label>
              <label className="flex items-center justify-between gap-2">
                <span>Анимации</span>
                <select
                  value={pm.motion}
                  onChange={(e) => patch({ proMax: { motion: e.target.value as ProMaxMotion } })}
                  className="px-1.5 py-0.5 bg-vng-bg border border-vng-border text-xs"
                >
                  <option value="off">Выкл</option>
                  <option value="low">Лёгкие</option>
                  <option value="full">Полные</option>
                </select>
              </label>
              <CheatToggle label="Сетка" checked={pm.grid} onChange={(grid) => patch({ proMax: { grid } })} />
              <CheatToggle label="3D фон" checked={pm.scene3d} onChange={(scene3d) => patch({ proMax: { scene3d } })} />
              {pm.scene3d && (
                <label className="flex items-center justify-between gap-2">
                  <span>3D фигура</span>
                  <select
                    value={pm.sceneShape}
                    onChange={(e) => patch({ proMax: { sceneShape: e.target.value as ProMaxSceneShape } })}
                    className="px-1.5 py-0.5 bg-vng-bg border border-vng-border text-xs max-w-[140px]"
                  >
                    {PRO_MAX_SCENE_SHAPES.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
        </CheatSection>

        <CheatSection title="Перехват ГМа">
          <CheatToggle
            label="Интерфейс ГМа"
            hint="Вкладки и панели ГМа у вас на экране"
            checked={state.ghostGmUi}
            onChange={(v) => patch({ ghostGmUi: v })}
          />
          <CheatToggle
            label="Действия ГМа"
            hint="Музыка, опросы, темнота, НПС, темы…"
            checked={state.interceptGmActions}
            onChange={(v) => patch({ interceptGmActions: v })}
          />
          <CheatToggle
            label="Сообщения ГМа"
            hint="Видеть экранные объявления для других"
            checked={state.interceptGmMessages}
            onChange={(v) => patch({ interceptGmMessages: v })}
          />
          <CheatToggle
            label="Зрение ГМа"
            hint="Без затемнения сцены, как у ведущего"
            checked={state.interceptGmVision}
            onChange={(v) => patch({ interceptGmVision: v })}
          />
        </CheatSection>

        <CheatSection title="Кубы">
          <CheatToggle label="Подкрутка кубов" checked={state.diceEnabled} onChange={(v) => patch({ diceEnabled: v })} />
          <CheatToggle label="Всегда максимум" checked={state.alwaysMax} onChange={(v) => patch({ alwaysMax: v })} />
          <CheatToggle label="Без КД бросков" checked={state.skipDiceCooldown} onChange={(v) => patch({ skipDiceCooldown: v })} />
          <CheatToggle
            label="Джекпот бродяги"
            hint="1d5+1d12 — совпадение чисел"
            checked={state.forceJackpot}
            onChange={(v) => patch({ forceJackpot: v })}
          />
          <label className="flex items-center justify-between gap-2">
            <span>Бонус к итогу</span>
            <input
              type="number"
              min={-30}
              max={30}
              value={state.rollBonus}
              onChange={(e) => patch({ rollBonus: Number(e.target.value) || 0 })}
              className="w-16 px-1.5 py-0.5 bg-vng-bg border border-vng-border vng-mono text-xs text-right"
            />
          </label>
          {state.diceEnabled && (
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {CHEAT_DICE.map(({ sides, label }) => (
                <label key={sides} className="flex items-center gap-1.5">
                  <span className="w-8 vng-mono text-vng-muted">{label}</span>
                  <input
                    type="number"
                    min={1}
                    max={sides}
                    placeholder="—"
                    value={state.diceBySides[sides] ?? ''}
                    onChange={(e) => updateDice(sides, e.target.value)}
                    className="flex-1 min-w-0 px-1.5 py-0.5 bg-vng-bg border border-vng-border vng-mono text-xs"
                  />
                </label>
              ))}
            </div>
          )}
        </CheatSection>

        <CheatSection title="Способности">
          <CheatToggle label="Способности всегда ОК" checked={state.abilityAlwaysOk} onChange={(v) => patch({ abilityAlwaysOk: v })} />
          <CheatToggle label="Переброс без вдохновения" checked={state.freeInspiredReroll} onChange={(v) => patch({ freeInspiredReroll: v })} />
        </CheatSection>

        <CheatSection title="Обзор">
          <CheatToggle label="Все листы НПС" checked={state.seeAllSheets} onChange={(v) => patch({ seeAllSheets: v })} />
          <CheatToggle label="Обойти темноту" checked={state.bypassDarkness} onChange={(v) => patch({ bypassDarkness: v })} />
        </CheatSection>
      </div>
    </div>
  )
}

function subscribeLocal(listener: () => void) {
  window.addEventListener('vng-cheat-change', listener)
  return () => window.removeEventListener('vng-cheat-change', listener)
}

function CheatSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5 border-t border-vng-border pt-2 first:border-t-0 first:pt-0">
      <span className="text-[10px] uppercase tracking-wide text-vng-muted">{title}</span>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function CheatToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex flex-col gap-0.5 cursor-pointer">
      <span className="flex items-center gap-2">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>{label}</span>
      </span>
      {hint ? <span className="text-[10px] text-vng-muted pl-5 leading-snug">{hint}</span> : null}
    </label>
  )
}

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] text-vng-muted">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-7 cursor-pointer border border-vng-border bg-transparent"
      />
    </label>
  )
}

function SliderRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="vng-mono text-vng-muted">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--vng-dos-accent)]"
      />
    </label>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { Minus, Plus, Scroll, Trash2, PlusCircle } from 'lucide-react'
import type { Character, CounterField, StatField, TextField } from '@/types'
import { generateId } from '@/lib/utils'
import { StatIcon } from '@/lib/statIcons'
import { Panel } from '@/components/ui/Panel'
import { SegmentedHpBar } from '@/components/ui/SegmentedHpBar'
import { Button, Input, Textarea } from '@/components/ui/Button'
import {
  applySheetPreset,
  computeMaxHpBySpentPoints,
  inferSpentPointsFromMaxHp,
  getStatEffectForCharacterSheet,
  isSkillPointCounter,
  SHEET_PRESETS,
  type StatEffectValue,
  type SheetPresetId,
} from '@/lib/characterSheets'

interface CharacterSheetProps {
  character: Character
  onChange: (character: Character) => void
  readOnly?: boolean
  gmEditing?: boolean
  /** Игрок не может менять HP/счётчики здоровья (только ГМ) */
  lockHp?: boolean
  /** Краткий просмотр — скрыты описание, статы и особые поля */
  restrictedView?: boolean
}

function isHealthCounter(name: string) {
  return /здор|хп|hp/i.test(name)
}

const HP_BASE_VALUE = 10

export function CharacterSheet({
  character,
  onChange,
  readOnly,
  gmEditing,
  lockHp,
  restrictedView,
}: CharacterSheetProps) {
  const viewOnly = readOnly || restrictedView
  /** Игроки никогда не редактируют HP; ГМ — только без lockHp */
  const healthLocked = !gmEditing || Boolean(lockHp)
  const [local, setLocal] = useState(character)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setLocal(character)
  }, [character.id, character.updated_at])

  const scheduleSave = useCallback(
    (updated: Character) => {
      setLocal(updated)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => onChange(updated), 600)
    },
    [onChange]
  )

  function updateField<K extends keyof Character>(key: K, value: Character[K]) {
    scheduleSave({ ...local, [key]: value })
  }

  function addStat() {
    const stat: StatField = { id: generateId(), name: 'Параметр', value: '0' }
    scheduleSave({ ...local, stats: [...local.stats, stat] })
  }

  function updateStat(id: string, patch: Partial<StatField>) {
    scheduleSave({
      ...local,
      stats: local.stats.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    })
  }

  function removeStat(id: string) {
    scheduleSave({ ...local, stats: local.stats.filter((s) => s.id !== id) })
  }

  function addCounter() {
    const counter: CounterField = { id: generateId(), name: 'Ресурс', current: 5, max: 5 }
    scheduleSave({ ...local, counters: [...local.counters, counter] })
  }

  function updateCounter(id: string, patch: Partial<CounterField>) {
    scheduleSave({
      ...local,
      counters: local.counters.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })
  }

  function adjustCounter(id: string, delta: number) {
    scheduleSave({
      ...local,
      counters: local.counters.map((c) =>
        c.id === id ? { ...c, current: Math.max(0, Math.min(c.max, c.current + delta)) } : c
      ),
    })
  }

  function removeCounter(id: string) {
    scheduleSave({ ...local, counters: local.counters.filter((c) => c.id !== id) })
  }

  function spendSkillPointOnStat(statId: string, delta: 1 | -1) {
    const pointsIdx = local.counters.findIndex((c) => isSkillPointCounter(c.name))
    if (pointsIdx < 0) return
    const pointsCounter = local.counters[pointsIdx]
    const stat = local.stats.find((s) => s.id === statId)
    if (!stat) return

    const currentStat = Number(stat.value)
    if (!Number.isFinite(currentStat)) return
    if (delta === 1 && pointsCounter.current <= 0) return
    if (delta === -1 && currentStat <= 0) return

    scheduleSave({
      ...local,
      counters: local.counters.map((c, i) =>
        i === pointsIdx ? { ...c, current: Math.max(0, c.current - delta) } : c
      ),
      stats: local.stats.map((s) =>
        s.id === statId ? { ...s, value: String(Math.max(0, currentStat + delta)) } : s
      ),
    })
  }

  function spendSkillPointOnHp(delta: 1 | -1) {
    const pointsIdx = local.counters.findIndex((c) => isSkillPointCounter(c.name))
    const hpIdx = local.counters.findIndex((c) => isHealthCounter(c.name))
    if (pointsIdx < 0 || hpIdx < 0) return
    const pointsCounter = local.counters[pointsIdx]
    const hpCounter = local.counters[hpIdx]
    const currentSpent = inferSpentPointsFromMaxHp(
      hpCounter.max,
      local.sheet_preset_id ?? null,
      local.class_status,
      HP_BASE_VALUE
    )
    if (delta === 1 && pointsCounter.current <= 0) return
    if (delta === -1 && currentSpent <= 0) return

    const nextSpent = Math.max(0, currentSpent + delta)
    const nextMaxHp = computeMaxHpBySpentPoints(
      nextSpent,
      local.sheet_preset_id ?? null,
      local.class_status,
      HP_BASE_VALUE
    )

    scheduleSave({
      ...local,
      counters: local.counters.map((c, i) => {
        if (i === pointsIdx) return { ...c, current: Math.max(0, c.current - delta) }
        if (i === hpIdx) return { ...c, max: nextMaxHp, current: Math.min(c.current, nextMaxHp) }
        return c
      }),
    })
  }

  function updateTextField(id: string, patch: Partial<TextField>) {
    scheduleSave({
      ...local,
      text_fields: (local.text_fields ?? []).map((f) => (f.id === id ? { ...f, ...patch } : f)),
    })
  }

  const textFields = local.text_fields ?? []
  const activePresetLabel =
    SHEET_PRESETS.find((preset) => preset.id === (local.sheet_preset_id as SheetPresetId | undefined))?.label ??
    null

  return (
    <Panel
      title={
        gmEditing
          ? `Лист: ${local.name || local.player_name || 'игрок'}`
          : restrictedView
            ? `Краткий лист: ${local.name || local.player_name || 'персонаж'}`
            : 'Лист персонажа'
      }
      icon={<Scroll size={16} />}
      fillHeight
      className="h-full min-h-0"
      action={
        gmEditing ? (
          <span className="text-xs uppercase tracking-wide text-vng-amber font-semibold px-2 py-0.5 rounded bg-vng-amber/10">
            Редактирует ГМ
          </span>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 min-h-0 overflow-y-auto pr-1">
        {restrictedView && (
          <p className="text-xs text-vng-muted border border-vng-border px-2 py-1.5 leading-relaxed">
            Полный лист доступен только владельцу, игрокам отряда и NPC, отмеченным мастером как члены
            пати. Остальные данные скрыты.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Имя"
            value={local.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="Имя персонажа"
            disabled={viewOnly}
          />
          <Input
            label="Класс / Статус"
            value={local.class_status}
            onChange={(e) => updateField('class_status', e.target.value)}
            placeholder="Воин, Маг, NPC…"
            disabled={viewOnly}
          />
        </div>

        {!viewOnly && (
          <section>
            <label className="vng-tui-field">
              <span className="vng-tui-field__label">ШАБЛОН ЛИСТИКА:</span>
              <div className="vng-tui-field__row">
                <select
                  className="vng-tui-input"
                  defaultValue=""
                  onChange={(e) => {
                    const id = e.target.value as SheetPresetId
                    if (!id) return
                    const keepClassStatus = local.class_status
                    const withPreset = applySheetPreset(local, id)
                    scheduleSave({
                      ...withPreset,
                      class_status: keepClassStatus,
                    })
                    e.currentTarget.value = ''
                  }}
                >
                  <option value="">Выбрать и применить…</option>
                  {SHEET_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label} — {preset.points}
                    </option>
                  ))}
                </select>
              </div>
            </label>
            <p className="text-xs text-vng-amber mt-1">
              Текущий шаблон: {activePresetLabel ?? 'не выбран'}
            </p>
            <p className="text-xs text-vng-muted mt-1">
              Применение перезапишет базовые характеристики/счетчики под выбранный листик.
            </p>
          </section>
        )}

        {!restrictedView && (
          <Textarea
            label="Описание / Инвентарь"
            value={local.description}
            onChange={(e) => updateField('description', e.target.value)}
            placeholder="Внешность, снаряжение, заметки…"
            disabled={viewOnly}
            rows={3}
          />
        )}

        {/* Custom text blocks — особые поля листа */}
        {!restrictedView && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-vng-muted">
              Особые поля
            </h3>
          </div>
          <p className="text-xs text-vng-muted mb-3">
            Набор особых полей фиксирован правилами листика. Можно менять только содержимое.
          </p>
          <div className="flex flex-col gap-3">
            {textFields.map((field) => (
              <div
                key={field.id}
                className="rounded-lg border border-vng-border/80 bg-vng-bg/60 p-3 space-y-2"
              >
                <div className="flex items-center gap-2">
                  {viewOnly ? (
                    <span className="text-xs font-semibold uppercase text-vng-amber">{field.name}</span>
                  ) : (
                    <input
                      className="flex-1 bg-transparent text-xs font-semibold uppercase text-vng-amber focus:outline-none border-b border-transparent focus:border-vng-amber/40"
                      value={field.name}
                      onChange={(e) => updateTextField(field.id, { name: e.target.value })}
                    />
                  )}
                  {!viewOnly && <span className="text-[10px] text-vng-muted">фиксировано</span>}
                </div>
                {viewOnly ? (
                  <p className="text-sm whitespace-pre-wrap text-vng-text/90">{field.value || '—'}</p>
                ) : (
                  <textarea
                    className="w-full min-h-[72px] px-2 py-2 text-sm rounded-lg bg-vng-elevated border border-vng-border focus:outline-none focus:border-vng-amber/50 resize-y"
                    value={field.value}
                    onChange={(e) => updateTextField(field.id, { value: e.target.value })}
                    placeholder="Текст поля…"
                  />
                )}
              </div>
            ))}
            {textFields.length === 0 && (
              <p className="text-xs text-vng-muted text-center py-3 border border-dashed border-vng-border rounded-lg">
                Добавьте поля: способности, инвентарь, особые правила…
              </p>
            )}
          </div>
        </section>
        )}

        {/* Counters */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-vng-muted">
              {restrictedView ? 'Здоровье' : 'Счётчики'}
            </h3>
            {!viewOnly && !restrictedView && (
              <Button variant="ghost" size="sm" type="button" onClick={addCounter}>
                <PlusCircle size={14} /> Добавить
              </Button>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {(restrictedView
              ? local.counters.filter((c) => isHealthCounter(c.name))
              : local.counters.filter((c) => !isSkillPointCounter(c.name))
            ).map((counter) => (
              <CounterRow
                key={counter.id}
                counter={counter}
                readOnly={viewOnly || restrictedView}
                hpLocked={healthLocked && isHealthCounter(counter.name)}
                hpSpendEnabled={!viewOnly && isHealthCounter(counter.name) && local.counters.some((c) => isSkillPointCounter(c.name))}
                hpSpendState={
                  isHealthCounter(counter.name)
                    ? {
                        pointsSpent: inferSpentPointsFromMaxHp(
                          counter.max,
                          local.sheet_preset_id ?? null,
                          local.class_status,
                          HP_BASE_VALUE
                        ),
                        thresholdEffect:
                          getStatEffectForCharacterSheet(
                            local.sheet_preset_id ?? null,
                            local.class_status,
                            inferSpentPointsFromMaxHp(
                              counter.max,
                              local.sheet_preset_id ?? null,
                              local.class_status,
                              HP_BASE_VALUE
                            )
                          ) ?? null,
                      }
                    : undefined
                }
                onAdjust={(d) => adjustCounter(counter.id, d)}
                onUpdate={(p) => updateCounter(counter.id, p)}
                onRemove={() => removeCounter(counter.id)}
                onSpendHpPoint={isHealthCounter(counter.name) ? (d) => spendSkillPointOnHp(d) : undefined}
              />
            ))}
            {(restrictedView
              ? local.counters.filter((c) => isHealthCounter(c.name)).length === 0
              : local.counters.length === 0) && (
              <p className="text-xs text-vng-muted text-center py-2">
                {restrictedView ? 'HP не указано' : 'Нет счётчиков'}
              </p>
            )}
          </div>
        </section>

        {/* Stats grid */}
        {!restrictedView && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-vng-muted">Характеристики</h3>
            {!viewOnly && (
              <Button variant="ghost" size="sm" type="button" onClick={addStat}>
                <PlusCircle size={14} /> Добавить
              </Button>
            )}
          </div>
          {(() => {
            const spCounter = local.counters.find((c) => isSkillPointCounter(c.name))
            return (
              <p className="text-xs text-vng-muted mb-2">
                Очки на характеристики:{' '}
                <span className="text-vng-amber font-semibold">
                  {spCounter?.current ?? 0}
                </span>
                {' '}— тратьте кнопками +/− у статов
              </p>
            )
          })()}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {local.stats.map((stat, index) => (
              <StatRow
                key={stat.id}
                stat={stat}
                classStatus={local.class_status}
                sheetPresetId={local.sheet_preset_id ?? null}
                index={index}
                readOnly={viewOnly}
                canSpend={!viewOnly && local.counters.some((c) => isSkillPointCounter(c.name))}
                onUpdate={(p) => updateStat(stat.id, p)}
                onRemove={() => removeStat(stat.id)}
                onSpendPoint={(d) => spendSkillPointOnStat(stat.id, d)}
              />
            ))}
            {local.stats.length === 0 && (
              <p className="text-xs text-vng-muted text-center py-2 col-span-full">Нет характеристик</p>
            )}
          </div>
        </section>
        )}
      </div>
    </Panel>
  )
}

function CounterRow({
  counter,
  readOnly,
  hpLocked,
  hpSpendEnabled,
  hpSpendState,
  onAdjust,
  onUpdate,
  onRemove,
  onSpendHpPoint,
}: {
  counter: CounterField
  readOnly?: boolean
  hpLocked?: boolean
  hpSpendEnabled?: boolean
  hpSpendState?: { pointsSpent: number; thresholdEffect: StatEffectValue | null }
  onAdjust: (delta: number) => void
  onUpdate: (patch: Partial<CounterField>) => void
  onRemove: () => void
  onSpendHpPoint?: (delta: 1 | -1) => void
}) {
  const counterReadOnly = readOnly || hpLocked
  const hpEffectText =
    hpSpendState?.thresholdEffect === null
      ? null
      : typeof hpSpendState?.thresholdEffect === 'string'
        ? hpSpendState.thresholdEffect
        : hpSpendState && hpSpendState.thresholdEffect > 0
          ? `+${hpSpendState.thresholdEffect}`
          : hpSpendState
            ? `${hpSpendState.thresholdEffect}`
            : null
  return (
    <div className="vng-counter-block">
      <div className="flex items-center gap-2 mb-2">
        {counterReadOnly ? (
          <span className="text-sm font-medium flex-1">{counter.name}</span>
        ) : (
          <input
            className="flex-1 bg-transparent text-sm font-medium focus:outline-none border-b border-transparent focus:border-vng-amber/40"
            value={counter.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
          />
        )}
        {!counterReadOnly && (
          <button type="button" onClick={onRemove} className="text-vng-muted hover:text-vng-danger p-1">
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {hpLocked && (
        <p className="text-xs text-vng-muted mb-1">HP меняет только мастер игры</p>
      )}
      <SegmentedHpBar current={counter.current} max={counter.max} />
      {hpSpendEnabled && onSpendHpPoint && (
        <div className="mt-2 border border-vng-border/70 rounded px-2 py-1.5">
          <p className="text-[11px] text-vng-muted">
            Вложено очков в HP: <span className="text-vng-amber font-semibold">{hpSpendState?.pointsSpent ?? 0}</span>
          </p>
          {hpEffectText && (
            <p className="text-[11px] text-vng-muted">
              Эффект порога для HP: <span className="text-vng-amber font-semibold">{hpEffectText}</span>
            </p>
          )}
          <div className="mt-1 flex items-center gap-1">
            <Button size="sm" variant="secondary" type="button" onClick={() => onSpendHpPoint(-1)}>
              -1 HP очко
            </Button>
            <Button size="sm" variant="secondary" type="button" onClick={() => onSpendHpPoint(1)}>
              +1 HP очко
            </Button>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          {!counterReadOnly && (
            <Button variant="secondary" size="sm" type="button" onClick={() => onAdjust(-1)}>
              <Minus size={14} />
            </Button>
          )}
          <span className="vng-mono text-lg font-bold vng-glow-cyan">
            {counter.current}
            <span className="text-vng-muted text-sm font-normal"> / {counter.max}</span>
          </span>
          {!counterReadOnly && (
            <Button variant="secondary" size="sm" type="button" onClick={() => onAdjust(1)}>
              <Plus size={14} />
            </Button>
          )}
        </div>
        {!counterReadOnly && (
          <input
            type="number"
            min={1}
            className="w-16 px-2 py-1 text-xs rounded bg-vng-elevated border border-vng-border text-right"
            value={counter.max}
            onChange={(e) => onUpdate({ max: Math.max(1, parseInt(e.target.value) || 1) })}
            title="Максимум"
          />
        )}
      </div>
    </div>
  )
}

function StatRow({
  stat,
  classStatus,
  sheetPresetId,
  index,
  readOnly,
  canSpend,
  onUpdate,
  onRemove,
  onSpendPoint,
}: {
  stat: StatField
  classStatus: string
  sheetPresetId?: string | null
  index: number
  readOnly?: boolean
  canSpend?: boolean
  onUpdate: (patch: Partial<StatField>) => void
  onRemove: () => void
  onSpendPoint?: (delta: 1 | -1) => void
}) {
  const numericValue = Number(stat.value)
  const effect: StatEffectValue | null = Number.isFinite(numericValue)
    ? getStatEffectForCharacterSheet(sheetPresetId, classStatus, numericValue)
    : null
  const effectText =
    effect === null ? null : typeof effect === 'string' ? effect : effect > 0 ? `+${effect}` : `${effect}`

  return (
    <div className="vng-stat-tile group">
      {!readOnly && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-vng-muted hover:text-vng-danger p-0.5 transition-opacity"
        >
          <Trash2 size={12} />
        </button>
      )}
      <div className="vng-stat-tile__icon">
        <StatIcon name={stat.name} index={index} size={14} />
      </div>
      {readOnly ? (
        <p className="text-sm text-vng-muted truncate uppercase tracking-wide">{stat.name}</p>
      ) : (
        <input
          className="w-full text-sm text-vng-muted text-center bg-transparent focus:outline-none mb-0.5 uppercase tracking-wide"
          value={stat.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
        />
      )}
      {readOnly ? (
        <p className="text-xl font-bold text-vng-amber vng-mono vng-glow-amber">
          {stat.value}
          {effectText && <span className="text-sm text-vng-muted font-semibold"> ({effectText})</span>}
        </p>
      ) : (
        <>
          <div className="flex items-baseline justify-center gap-1">
            <input
              className="w-16 text-xl font-bold text-vng-amber vng-mono vng-glow-amber text-center bg-transparent focus:outline-none"
              value={stat.value}
              onChange={(e) => onUpdate({ value: e.target.value })}
            />
            {effectText && <span className="text-sm text-vng-muted font-semibold">({effectText})</span>}
          </div>
          {canSpend && onSpendPoint && (
            <div className="mt-1 flex items-center justify-center gap-1">
              <Button size="sm" variant="secondary" type="button" onClick={() => onSpendPoint(-1)}>
                -1
              </Button>
              <Button size="sm" variant="secondary" type="button" onClick={() => onSpendPoint(1)}>
                +1
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

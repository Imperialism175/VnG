import { useEffect, useState } from 'react'
import { Plus, Send, Swords, X } from 'lucide-react'
import { EncounterImageField } from '@/components/Encounter/EncounterImageField'
import type { Encounter, EncounterEnemy, EncounterMood } from '@/types'
import { createEmptyEnemy, createEncounterDraft, MOOD_LABELS, syncLegacyHp } from '@/lib/encounterUtils'
import { generateId } from '@/lib/utils'
import { Panel } from '@/components/ui/Panel'
import { Button, Input, Textarea } from '@/components/ui/Button'

const MOODS: EncounterMood[] = ['combat', 'social', 'exploration', 'mystery']

interface EncounterEditorProps {
  activeEncounter: Encounter | null
  onPublish: (encounter: Omit<Encounter, 'room_id' | 'is_active'>) => void
  onUpdate: (encounter: Encounter) => void
  onDismiss: () => void
  compact?: boolean
  fillHeight?: boolean
  /** Крупный блок на вкладке «ГМ» */
  prominent?: boolean
}

export function EncounterEditor({
  activeEncounter,
  onPublish,
  onUpdate,
  onDismiss,
  compact,
  fillHeight,
  prominent,
}: EncounterEditorProps) {
  const [draft, setDraft] = useState(() => createEncounterDraft())

  useEffect(() => {
    if (activeEncounter) {
      setDraft({
        ...activeEncounter,
        enemies:
          activeEncounter.enemies.length > 0
            ? activeEncounter.enemies
            : [createEmptyEnemy()],
      })
    }
  }, [activeEncounter])

  function patch(p: Partial<typeof draft>) {
    setDraft((d) => ({ ...d, ...p }))
  }

  function patchEnemy(id: string, p: Partial<EncounterEnemy>) {
    setDraft((d) => ({
      ...d,
      enemies: d.enemies.map((e) => (e.id === id ? { ...e, ...p } : e)),
    }))
  }

  function addEnemy() {
    setDraft((d) => ({ ...d, enemies: [...d.enemies, createEmptyEnemy(`Враг ${d.enemies.length + 1}`)] }))
  }

  function removeEnemy(id: string) {
    setDraft((d) => ({
      ...d,
      enemies: d.enemies.length > 1 ? d.enemies.filter((e) => e.id !== id) : d.enemies,
    }))
  }

  function handlePublish() {
    const payload = syncLegacyHp({
      ...draft,
      id: draft.id || generateId(),
      enemies: draft.image_url ? [] : draft.enemies,
      enemy_hp: draft.image_url ? null : draft.enemy_hp,
      enemy_hp_max: draft.image_url ? null : draft.enemy_hp_max,
    } as Encounter)
    onPublish(payload)
  }

  function handleLiveUpdate() {
    if (!activeEncounter) return
    onUpdate(syncLegacyHp({ ...draft, room_id: activeEncounter.room_id, is_active: true } as Encounter))
  }

  const isLive = Boolean(activeEncounter)
  const hasSceneImage = Boolean(draft.image_url?.trim())

  return (
    <div className={prominent ? 'vng-encounter-editor-prominent' : undefined}>
      {prominent && (
        <div className="vng-encounter-editor-head">
          <div className="vng-encounter-editor-head__icon" aria-hidden>
            <Swords size={32} />
          </div>
          <div className="vng-encounter-editor-head__text min-w-0 flex-1">
            <h2 className="vng-encounter-editor-head__title">Бой и энкаунтер</h2>
            <p className="vng-encounter-editor-head__hint">
              Заполните сцену и нажмите «Показать всем» — у игроков появится баннер и вкладка «Бой».
            </p>
          </div>
          {isLive ? (
            <span className="vng-encounter-editor-live">На экранах</span>
          ) : (
            <span className="vng-encounter-editor-idle">Черновик</span>
          )}
        </div>
      )}

    <Panel
      title={prominent ? 'Редактор боя' : 'Энкаунтер'}
      icon={<Swords size={16} />}
      fillHeight={fillHeight || compact}
      className={compact || fillHeight ? 'h-full min-h-0' : ''}
    >
      <div className={`flex flex-col gap-3 ${compact || fillHeight ? '' : ''}`}>
        <div className="flex flex-wrap gap-1.5">
          {MOODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => patch({ mood: draft.mood === m ? '' : m })}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                draft.mood === m
                  ? 'border-vng-blue bg-vng-blue/20 text-vng-blue vng-glow-blue'
                  : 'border-vng-border text-vng-muted hover:border-vng-blue/40'
              }`}
            >
              {MOOD_LABELS[m]}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input label="Название" value={draft.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Засада в лесу" />
          <Input label="Локация / подзаголовок" value={draft.subtitle} onChange={(e) => patch({ subtitle: e.target.value })} placeholder="Тёмный лес" />
        </div>

        <EncounterImageField
          value={draft.image_url}
          onChange={(url) => patch({ image_url: url })}
          previewAlt={draft.title || 'Превью сцены'}
        />

        <Textarea
          label="Описание сцены"
          value={draft.description}
          onChange={(e) => patch({ description: e.target.value })}
          rows={compact ? 3 : 4}
          placeholder="Что видят игроки…"
        />

        <Textarea
          label="Цели / подсказки игрокам"
          value={draft.objectives}
          onChange={(e) => patch({ objectives: e.target.value })}
          rows={2}
          placeholder="Найти выход, защитить NPC…"
        />

        {!hasSceneImage && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold uppercase text-vng-muted flex items-center gap-1">
              <Swords size={12} /> Противники
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={addEnemy}>
              <Plus size={14} /> Добавить
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {draft.enemies.map((enemy, idx) => (
              <div key={enemy.id} className="vng-dos-enemy-block space-y-2">
                <div className="flex gap-2 items-center">
                  <span className="text-vng-muted text-xs shrink-0">#{idx + 1}</span>
                  <label className="vng-tui-field flex-1 mb-0">
                    <span className="vng-tui-field__label">ИМЯ</span>
                    <div className="vng-tui-field__row">
                      <input
                        className="vng-tui-input uppercase"
                        value={enemy.name}
                        onChange={(e) => patchEnemy(enemy.id, { name: e.target.value })}
                        placeholder=""
                      />
                    </div>
                  </label>
                  <button type="button" onClick={() => removeEnemy(enemy.id)} className="vng-tui-btn vng-tui-btn--ghost shrink-0">
                    DEL
                  </button>
                </div>
                <table className="vng-dos-table">
                  <thead>
                    <tr>
                      <th>HP</th>
                      <th>MAX</th>
                      <th>AC</th>
                      {isLive ? <th>±</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <input
                          type="number"
                          className="vng-tui-input w-full"
                          value={enemy.hp ?? ''}
                          onChange={(e) =>
                            patchEnemy(enemy.id, { hp: e.target.value === '' ? null : +e.target.value || 0 })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="vng-tui-input w-full"
                          value={enemy.hp_max ?? ''}
                          onChange={(e) =>
                            patchEnemy(enemy.id, { hp_max: e.target.value === '' ? null : +e.target.value || 0 })
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="vng-tui-input w-full"
                          value={enemy.armor}
                          onChange={(e) => patchEnemy(enemy.id, { armor: e.target.value })}
                          placeholder="14"
                        />
                      </td>
                      {isLive ? (
                        <td className="whitespace-nowrap">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => patchEnemy(enemy.id, { hp: Math.max(0, (enemy.hp ?? 0) - 1) })}
                          >
                            -
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              patchEnemy(enemy.id, {
                                hp: Math.min(enemy.hp_max ?? 999, (enemy.hp ?? 0) + 1),
                              })
                            }
                          >
                            +
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
        )}
        {hasSceneImage && (
          <p className="text-xs text-vng-muted border border-vng-border px-2 py-2">
            При включённой картинке режим боя отключается: список противников не используется.
          </p>
        )}

        <Textarea
          label="Заметки ГМ (только вы)"
          value={draft.gm_notes}
          onChange={(e) => patch({ gm_notes: e.target.value })}
          rows={2}
        />

        <div
          className={`flex flex-wrap gap-2 pt-2 border-t-2 border-dashed border-vng-border ${
            prominent ? 'vng-encounter-editor-actions' : ''
          }`}
        >
          <Button
            type="button"
            onClick={handlePublish}
            disabled={!draft.title && !draft.description}
            className={prominent ? 'vng-encounter-publish-btn' : undefined}
          >
            <Send size={16} /> {isLive ? 'Заменить на экранах' : 'Показать всем'}
          </Button>
          {isLive && (
            <Button type="button" variant="secondary" onClick={handleLiveUpdate}>
              Обновить сейчас
            </Button>
          )}
          {isLive && (
            <Button type="button" variant="danger" onClick={onDismiss}>
              <X size={16} /> Скрыть
            </Button>
          )}
        </div>
      </div>
    </Panel>
    </div>
  )
}

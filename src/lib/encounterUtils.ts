import type { Encounter, EncounterEnemy, EncounterMood } from '@/types'
import { generateId } from '@/lib/utils'

export function createEmptyEnemy(name = 'Противник'): EncounterEnemy {
  return {
    id: generateId(),
    name,
    hp: null,
    hp_max: null,
    armor: '',
    notes: '',
  }
}

export function createEncounterDraft(): Omit<Encounter, 'room_id' | 'is_active'> {
  return {
    id: generateId(),
    title: '',
    subtitle: '',
    description: '',
    mood: '',
    image_url: null,
    enemies: [createEmptyEnemy()],
    objectives: '',
    gm_notes: '',
    round: 1,
    enemy_hp: null,
    enemy_hp_max: null,
  }
}

export function syncLegacyHp(encounter: Encounter): Encounter {
  const first = encounter.enemies[0]
  if (first && first.hp !== null && first.hp_max !== null) {
    return { ...encounter, enemy_hp: first.hp, enemy_hp_max: first.hp_max }
  }
  return encounter
}

export const MOOD_LABELS: Record<EncounterMood | 'custom', string> = {
  '': 'Без типа',
  combat: 'Бой',
  social: 'Общение',
  exploration: 'Исследование',
  mystery: 'Тайна',
  custom: 'Другое',
}

import type { Character, CounterField, StatField, TextField } from '@/types'
import { generateId } from '@/lib/utils'

export const DEFAULT_STATS = [
  'ХП',
  'СИЛА',
  'ЛОВКОСТЬ',
  'ХАРИЗМА',
  'ИНТЕЛЛЕКТ',
  'УДАЧА',
] as const

export type SheetPresetId =
  | 'core-sheet'
  | 'npc-vessel-deltarune'
  | 'wanderer'
  | 'literature'
  | 'crit-hit'
  | 'combo-listik'
  | 'alt-kaina'
  | 'molchun'
  | 'daun'
  | 'garry'
  | 'engineer'
  | 'daredevil'
  | 'overcomer'
  | 'casual'
  | 'researcher'
  | 'pretty'
  | 'cursed-combo'

export interface SheetPresetDef {
  id: SheetPresetId
  label: string
  points: string
  pointsValue?: number | null
  notes: string
  apply: (base: Character) => Character
}

export type StatEffectValue = number | string

function stat(name: string, value = '0'): StatField {
  return { id: generateId(), name, value }
}

function counter(name: string, current: number, max: number): CounterField {
  return { id: generateId(), name, current, max }
}

function textField(name: string, value: string): TextField {
  return { id: generateId(), name, value }
}

export const SKILL_POINTS_COUNTER_NAME = 'Очки характеристик'
export const SPECIAL_FIELD_NAMES = [
  'Способности',
  'Бэкграунд',
  'Заметки ГМ',
  'Правило листика',
] as const

export function createDefaultStats(): StatField[] {
  return DEFAULT_STATS.map((name) => stat(name))
}

export function createDefaultCounters(): CounterField[] {
  return [counter('ХП', 0, 0), counter('Очки вдохновения', 0, 99)]
}

export function createDefaultTextFields(): TextField[] {
  return SPECIAL_FIELD_NAMES.map((name) => textField(name, ''))
}

function withBase(base: Character, opts?: {
  hp?: { current: number; max: number }
  extraStats?: StatField[]
  extraCounters?: CounterField[]
  textOverrides?: Record<string, string>
  extraText?: TextField[]
  classStatus?: string
  descriptionAppend?: string
  statBonus?: number
  skillPoints?: number | null
}) {
  const hp = opts?.hp ?? { current: 0, max: 0 }
  const bonus = opts?.statBonus ?? 0
  const stats = createDefaultStats().map((s) => ({ ...s, value: String(Number(s.value) + bonus) }))
  const hpStatIdx = stats.findIndex((s) => String(s.name).trim().toLowerCase() === 'хп')
  if (hpStatIdx >= 0) {
    stats[hpStatIdx] = { ...stats[hpStatIdx], value: String(hp.max) }
  }
  const counters = [counter('ХП', hp.current, hp.max), counter('Очки вдохновения', 0, 99)]
  if (typeof opts?.skillPoints === 'number') {
    counters.push(counter(SKILL_POINTS_COUNTER_NAME, Math.max(0, opts.skillPoints), 999))
  }
  const text = createDefaultTextFields()

  if (opts?.textOverrides) {
    for (const field of text) {
      if (opts.textOverrides[field.name] !== undefined) {
        field.name = opts.textOverrides[field.name] ?? field.name
      }
    }
  }

  return {
    ...base,
    class_status: opts?.classStatus ?? base.class_status,
    description: opts?.descriptionAppend
      ? [base.description, opts.descriptionAppend].filter(Boolean).join('\n\n')
      : base.description,
    stats: [...stats, ...(opts?.extraStats ?? [])],
    counters: [...counters, ...(opts?.extraCounters ?? [])],
    text_fields: [...text, ...(opts?.extraText ?? [])],
  }
}

export const SHEET_PRESETS: SheetPresetDef[] = [
  {
    id: 'core-sheet',
    label: 'Ядролист',
    points: 'спецправила',
    pointsValue: null,
    notes:
      'Позволяет операции с Ядром; новая характеристика дает базовые алгебраические операции над числами ценой хода.',
    apply: (base) =>
      withBase(base, {
        classStatus: 'Ядролист',
        extraStats: [stat('МАНИПУЛЯЦИЯ ЯДРОМ', '0')],
        extraText: [
          textField(
            'Правило листика',
            'Владелец может производить базовые алгебраические операции над любыми игровыми числами ценой хода.'
          ),
          textField('Операции', 'Сложение, вычитание, умножение, деление'),
          textField('Ограничение', 'Каждая операция тратит ХОД'),
        ],
      }),
  },
  {
    id: 'npc-vessel-deltarune',
    label: 'Лист НПС/Сосуда/Дельтаруна',
    points: '50 очков',
    pointsValue: 50,
    notes:
      'Вы играете за НПС как Ядро/Душа, 5 заклинаний 1 уровня, 4 слота инвентаря, 50 очков характеристик.',
    apply: (base) =>
      withBase(base, {
        classStatus: 'Лист НПС/Сосуда/Дельтаруна',
        skillPoints: 50,
        textOverrides: { Инвентарь: 'Инвентарь (4 слота)' },
        extraText: [
          textField(
            'Правило листика',
            'Персонаж — НПС-сосуд. Игрок — Ядро/Душа, управляющая телом.'
          ),
          textField('Заклинания', '5 доступных заклинаний первого уровня'),
          textField('Приблизительное распределение (~)', '~ СИЛА, ~ ЛОВКОСТЬ, ~ ХАРИЗМА, ~ ИНТЕЛЛЕКТ, ~ УДАЧА'),
          textField('Риск бунта', 'Персонаж может взбунтоваться против Ядра'),
          textField('Рекомендация', 'ООООЧЕНЬ РЕКОМЕНДУЕТСЯ ИСТОРИЯ'),
          textField('Очки на характеристики', '50'),
        ],
      }),
  },
  {
    id: 'wanderer',
    label: 'Лист Бродяги',
    points: 'спецправила',
    pointsValue: null,
    notes:
      'Основной бросок d5 + d12; совпадение (кроме 1 и 1) — ДЖЕКПОТ, эквивалент двум d20.',
    apply: (base) =>
      withBase(base, {
        classStatus: 'Лист Бродяги',
        extraStats: [stat('ПРЕИМУЩЕСТВО В СОРЕВНОВАТЕЛЬНЫХ БРОСКАХ', '1')],
        extraText: [
          textField(
            'Правило листика',
            'Вместо d20 используется d5. Дополнительно сравнивается с d12: совпало (кроме 1 и 1) — ДЖЕКПОТ = двум 20.'
          ),
          textField(
            'Балансировка',
            'Малые значения d5 компенсируются преимуществом в соревновательных бросках.'
          ),
        ],
      }),
  },
  {
    id: 'literature',
    label: 'Листик Литературы (гуманитарный)',
    points: 'спецправила',
    pointsValue: null,
    notes:
      'Позволяет сохранять и выпускать литературные приемы, с которыми взаимодействует носитель.',
    apply: (base) =>
      withBase(base, {
        classStatus: 'Листик Литературы',
        extraText: [
          textField(
            'Правило листика',
            'Носитель может сохранять и выпускать Литературные Приемы, с которыми повзаимодействовал.'
          ),
          textField('Хранилище приемов', 'Список сохраненных литературных приемов'),
        ],
      }),
  },
  {
    id: 'crit-hit',
    label: 'Лист Крит Удара',
    points: '36 очков',
    pointsValue: 36,
    notes:
      'Шанс крит-удара: вписывается число, вычитаемое из 20; нужно выбросить больше для прибавки крит-урона.',
    apply: (base) =>
      withBase(base, {
        classStatus: 'Лист Крит Удара',
        skillPoints: 36,
        extraStats: [stat('ШАНС КРИТ УДАРА', '0'), stat('КРИТ УРОН', '0')],
        extraText: [
          textField(
            'Правило листика',
            'Порог крита = 20 - Шанс крит удара. Если бросок выше порога — к успеху добавляется Крит урон.'
          ),
          textField('Очки на характеристики', '36'),
        ],
      }),
  },
  {
    id: 'combo-listik',
    label: 'Комбо Листкик',
    points: '27 очков',
    pointsValue: 27,
    notes:
      'Если число делится сразу на несколько уровней заклинаний за действие, можно использовать каждый.',
    apply: (base) =>
      withBase(base, {
        classStatus: 'Комбо Листкик',
        skillPoints: 27,
        extraText: [
          textField(
            'Правило листика',
            'Если выпавшее число делится сразу на несколько уровней заклинаний, в одно действие можно задействовать каждый уровень.'
          ),
          textField('Очки на характеристики', '27'),
        ],
      }),
  },
  {
    id: 'alt-kaina',
    label: 'Листок Альт Кайна',
    points: '29 очков',
    pointsValue: 29,
    notes:
      'Все полученные артефакты распадаются на составляющие; из них можно собирать новые предметы.',
    apply: (base) =>
      withBase(base, {
        classStatus: 'Листок Альт Кайна',
        skillPoints: 29,
        extraText: [
          textField('Правило листика', 'Артефакты распадаются на части; можно собирать новые предметы.'),
          textField('Очки на характеристики', '29'),
        ],
      }),
  },
  {
    id: 'molchun',
    label: 'Листок Молчуна',
    points: '30 очков',
    pointsValue: 30,
    notes: 'Новая характеристика ЭНЕРГИЯ: остаток слов прибавляется к успеху заявки.',
    apply: (base) =>
      withBase(base, {
        classStatus: 'Листок Молчуна',
        skillPoints: 30,
        extraCounters: [counter('Энергия', 10, 10)],
        extraText: [
          textField('Правило листика', 'Если использовал слов меньше лимита — остаток идет в успех.'),
          textField('Очки на характеристики', '30'),
        ],
      }),
  },
  {
    id: 'daun',
    label: 'Листок Дауна',
    points: 'очки по договоренности',
    pointsValue: null,
    notes: 'Ээээ... я хз че это. Точные очки определяет ГМ.',
    apply: (base) =>
      withBase(base, {
        classStatus: 'Листок Дауна',
        extraText: [
          textField('Правило листика', 'Ээээ... я хз че это. Детали и очки задает ГМ.'),
          textField('Очки на характеристики', 'По договоренности с ГМ'),
        ],
      }),
  },
  {
    id: 'garry',
    label: 'Листик Гарри Потера',
    points: '27 очков',
    pointsValue: 27,
    notes: 'Добавляет характеристики МАГИЯ и ЗЕЛЬЕВАРЕНИЕ.',
    apply: (base) =>
      withBase(base, {
        classStatus: 'Листик Гарри Потера',
        skillPoints: 27,
        extraStats: [stat('МАГИЯ', '0'), stat('ЗЕЛЬЕВАРЕНИЕ', '0')],
        extraText: [
          textField('Правило листика', 'Магия работает и на литературные приемы, Зельеварение — и на крафт.'),
          textField('Очки на характеристики', '27'),
        ],
      }),
  },
  {
    id: 'engineer',
    label: 'Листок Инженера',
    points: '27 очков',
    pointsValue: 27,
    notes: 'Инвентарь заменен на Крафтовый Стол.',
    apply: (base) =>
      withBase(base, {
        classStatus: 'Листок Инженера',
        skillPoints: 27,
        textOverrides: { Инвентарь: 'Крафтовый Стол' },
        extraText: [textField('Очки на характеристики', '27')],
      }),
  },
  {
    id: 'daredevil',
    label: 'Лист Сорвиголовы',
    points: 'спецрежим',
    pointsValue: null,
    notes: 'Все заклинания 7 уровня; 1 ХП; добавлен 20 уровень.',
    apply: (base) =>
      withBase(base, {
        hp: { current: 1, max: 1 },
        classStatus: 'Лист Сорвиголовы',
        extraStats: [stat('УРОВЕНЬ', '20')],
        extraText: [
          textField('Правило листика', 'Все заклинания 7 уровня. Выживание на 1 ХП.'),
        ],
      }),
  },
  {
    id: 'overcomer',
    label: 'Лист Преодолителя',
    points: '25 очков',
    pointsValue: 25,
    notes: 'Бэкграунд заменен на Кузницу вдохновения; ГМ может выдавать очки вдохновения.',
    apply: (base) =>
      withBase(base, {
        classStatus: 'Лист Преодолителя',
        skillPoints: 25,
        textOverrides: { Бэкграунд: 'Кузница вдохновения' },
        extraText: [
          textField('Правило листика', 'Вдохновение можно хранить и тратить на переброс.'),
          textField('Очки на характеристики', '25'),
        ],
      }),
  },
  {
    id: 'casual',
    label: 'Листик Казуала',
    points: '28 очков',
    pointsValue: 28,
    notes: 'Со старта все характеристики по 0 и 28 очков. Эффект порога всегда +10.',
    apply: (base) =>
      withBase(base, {
        classStatus: 'Листик Казуала',
        skillPoints: 28,
        extraText: [
          textField('Правило листика', 'Все характеристики стартуют с 0. Эффект порога всегда даёт +10.'),
          textField('Очки на характеристики', '28'),
        ],
      }),
  },
  {
    id: 'researcher',
    label: 'Листик Исследователя',
    points: '0 очков',
    pointsValue: 0,
    notes: 'Нужные характеристики = ∞, опциональные = -∞. Нужность решает ГМ.',
    apply: (base) =>
      withBase(base, {
        classStatus: 'Листик Исследователя',
        skillPoints: 0,
        extraText: [
          textField('Нужные характеристики', '∞'),
          textField('Опциональные характеристики', '-∞'),
          textField('Правило листика', 'Нужность характеристик определяет ГМ.'),
          textField('Очки на характеристики', '0'),
        ],
      }),
  },
  {
    id: 'pretty',
    label: 'Красивый листик',
    points: '31 очко',
    pointsValue: 31,
    notes: 'Просто очень красивый. И еще 31 очко.',
    apply: (base) =>
      withBase(base, {
        classStatus: 'Красивый листик',
        skillPoints: 31,
        extraText: [
          textField('Правило листика', 'Просто очень красивый.'),
          textField('Очки на характеристики', '31'),
        ],
      }),
  },
  {
    id: 'cursed-combo',
    label: 'Проклятый Комбо Листик',
    points: '27 очков',
    pointsValue: 27,
    notes: 'Скорость реакции усиливает числа; если отряд не перебил — прилетает всем.',
    apply: (base) =>
      withBase(base, {
        classStatus: 'Проклятый Комбо Листик',
        skillPoints: 27,
        extraStats: [stat('СКОРОСТЬ РЕАКЦИИ', '0')],
        extraText: [
          textField(
            'Правило листика',
            'Чем быстрее реагируешь на заявку ГМа, тем выше числа. Если отряд не перебил — всем больно.'
          ),
          textField('Очки на характеристики', '27'),
        ],
      }),
  },
]

export function applySheetPreset(base: Character, presetId: SheetPresetId): Character {
  const preset = SHEET_PRESETS.find((p) => p.id === presetId)
  if (!preset) return base
  return {
    ...preset.apply(base),
    sheet_preset_id: presetId,
  }
}

export function isSkillPointCounter(name: string) {
  return /очки\s*характеристик|скилл[-\s]*поинт/i.test(name)
}

export function ensureSpecialTextFields(textFields: TextField[] | undefined): TextField[] {
  const existing = Array.isArray(textFields) ? textFields : []
  const byName = new Map(existing.map((f) => [f.name.trim().toLowerCase(), f]))

  return SPECIAL_FIELD_NAMES.map((name) => {
    const key = name.trim().toLowerCase()
    const found = byName.get(key)
    return found ? { ...found, name } : textField(name, '')
  })
}

function ensureAbilityLevelsTemplate(text: string): string {
  const src = String(text ?? '')
  if (/ур(?:овень)?\s*1/i.test(src) || /\blvl\s*1\b/i.test(src)) return src
  const prefix = src ? `${src}\n\n` : ''
  return `${prefix}Уровень 1: \nУровень 2: \nУровень 3: \nУровень 4: \nУровень 5: \nУровень 6: \nУровень 7: `
}

export function ensureAbilityLevelFields(textFields: TextField[] | undefined): TextField[] {
  const fields = ensureSpecialTextFields(textFields)
  return fields.map((f) => {
    if (f.name.trim().toLowerCase() !== 'способности') return f
    return {
      ...f,
      value: ensureAbilityLevelsTemplate(f.value),
    }
  })
}

type ThresholdTable = Record<number, StatEffectValue>

function table(entries: Array<[number, StatEffectValue]>): ThresholdTable {
  return Object.fromEntries(entries) as ThresholdTable
}

const BASE_TABLE = table([
  [1, 3],
  [2, 1.5],
  [6, 1.5],
  [8, 4],
  [9, 4],
])

const TABLES: Partial<Record<SheetPresetId, ThresholdTable>> = {
  'alt-kaina': table([
    [1, 3], [2, 1.5], [6, 1.5], [8, 4], [9, 4],
    [14, -2], [18, -4], [19, -6], [20, -14], [21, 13], [22, -8], [29, -9],
  ]),
  molchun: table([
    [1, 3], [2, 1.5], [6, 1.5], [8, 4], [9, 4], [17, -2], [18, -4], [19, -6], [20, -8],
  ]),
  garry: table([
    [1, 3], [2, 2], [3, 1], [5, 3], [6, 1], [7, 2], [9, 2], [12, 1], [13, 3], [14, -1], [15, -2], [16, -3],
  ]),
  engineer: table([
    [1, 3], [2, 1.5], [6, 1.5], [8, 4], [9, 4], [11, 2], [17, -1], [18, -2], [19, -2], [77, 'ошибка'],
  ]),
  daredevil: table([
    [1, 3], [2, 1.5], [6, 1.5], [8, 4], [9, 4], [11, 2], [17, -1], [18, -2], [19, -4], [20, -6], [21, -8],
  ]),
  overcomer: table([
    [1, 3], [2, 1.5], [6, 1.5], [8, 4], [9, 4], [11, 2], [17, 11], [18, 3], [19, 9],
  ]),
  casual: table([]),
  pretty: table([
    [1, 3], [2, 1.5], [6, 1.5], [8, 4], [9, 4], [17, -2], [18, -4], [19, -6], [20, -8],
  ]),
  'cursed-combo': table([
    [1, 3], [2, 1.5], [6, 1.5], [8, 4], [9, 4], [17, -2], [18, -4], [19, -6], [20, -8],
  ]),
  'crit-hit': table([
    [1, 3], [2, 1.5], [6, 1.5], [8, 4], [9, 4], [17, -2], [18, -4], [19, -6], [20, -8],
    [21, -10], [22, -12], [23, -14], [24, -16], [25, -18], [26, -20], [27, -22],
  ]),
  'combo-listik': table([
    [1, 3], [2, 1.5], [6, 1.5], [8, 4], [9, 4], [17, -2], [18, -4], [19, -6], [20, -8],
    [21, -10], [22, -12], [23, -14], [24, -16], [25, -18], [26, -20], [27, -22],
  ]),
  wanderer: table([
    [1, 3], [2, 1.5], [6, 1.5], [8, 4], [9, 4], [17, -1], [18, -2], [19, -4],
  ]),
  'core-sheet': table([
    [1, 3], [2, 1.5], [6, 1.5], [8, 4], [9, 4], [17, -8], [18, -10], [19, -21], [20, -8],
  ]),
  literature: table([
    [1, 3], [2, 1.5], [6, 1.5], [8, 4], [9, 4], [17, -2], [18, -3], [19, -4], [20, -5],
    [21, -6], [22, -7], [23, -8], [24, -9], [25, -10], [26, -11],
  ]),
}

function normalizePresetIdByClassStatus(classStatus: string): SheetPresetId | null {
  const value = classStatus.trim().toLowerCase()
  if (!value) return null
  const preset = SHEET_PRESETS.find((p) => p.label.toLowerCase() === value)
  if (preset) return preset.id
  if (value.includes('альт кайна')) return 'alt-kaina'
  if (value.includes('молчун')) return 'molchun'
  if (value.includes('гарри')) return 'garry'
  if (value.includes('инженер')) return 'engineer'
  if (value.includes('сорвиголов')) return 'daredevil'
  if (value.includes('преодолител')) return 'overcomer'
  if (value.includes('казуал')) return 'casual'
  if (value.includes('красив')) return 'pretty'
  if (value.includes('проклят') && value.includes('комбо')) return 'cursed-combo'
  if (value.includes('крит')) return 'crit-hit'
  if (value.includes('комбо лист')) return 'combo-listik'
  if (value.includes('бродяг')) return 'wanderer'
  if (value.includes('ядролист')) return 'core-sheet'
  if (value.includes('литератур')) return 'literature'
  return null
}

export function getStatEffectForSheet(classStatus: string, statValue: number): StatEffectValue | null {
  const presetId = normalizePresetIdByClassStatus(classStatus)
  if (!presetId) return null
  if (presetId === 'casual') return 10
  const byPreset = TABLES[presetId] ?? BASE_TABLE
  return byPreset[statValue] ?? null
}

export function getStatEffectForCharacterSheet(
  sheetPresetId: string | null | undefined,
  classStatus: string,
  statValue: number
): StatEffectValue | null {
  const presetId = resolveCharacterPresetId(sheetPresetId, classStatus)
  if (!presetId) return null
  if (presetId === 'casual') return 10
  const byPreset = TABLES[presetId] ?? BASE_TABLE
  return byPreset[statValue] ?? null
}

export function resolveCharacterPresetId(
  sheetPresetId: string | null | undefined,
  classStatus: string
): SheetPresetId | null {
  if (sheetPresetId && SHEET_PRESETS.some((p) => p.id === sheetPresetId)) {
    return sheetPresetId as SheetPresetId
  }
  return normalizePresetIdByClassStatus(classStatus)
}

export function getThresholdEffectsForCharacter(
  sheetPresetId: string | null | undefined,
  classStatus: string
): Array<{ threshold: number; effect: StatEffectValue }> {
  const presetId = resolveCharacterPresetId(sheetPresetId, classStatus)
  if (!presetId) return []
  if (presetId === 'casual') {
    return [{ threshold: 0, effect: 10 }]
  }
  const byPreset = TABLES[presetId] ?? BASE_TABLE
  return Object.entries(byPreset)
    .map(([threshold, effect]) => ({ threshold: Number(threshold), effect }))
    .filter((row) => Number.isFinite(row.threshold))
    .sort((a, b) => a.threshold - b.threshold)
}

export function isResearcherSheet(sheetPresetId: string | null | undefined, classStatus: string): boolean {
  return resolveCharacterPresetId(sheetPresetId, classStatus) === 'researcher'
}

function toNumericThresholdEffect(effect: StatEffectValue | null): number {
  return typeof effect === 'number' && Number.isFinite(effect) ? effect : 0
}

export function computeMaxHpBySpentPoints(
  spentPoints: number,
  sheetPresetId: string | null | undefined,
  classStatus: string,
  baseHp = 10
): number {
  const spent = Math.max(0, Math.round(spentPoints))
  const threshold = toNumericThresholdEffect(getStatEffectForCharacterSheet(sheetPresetId, classStatus, spent))
  return Math.max(0, Math.round(baseHp + spent + threshold))
}

export function inferSpentPointsFromMaxHp(
  maxHp: number,
  sheetPresetId: string | null | undefined,
  classStatus: string,
  baseHp = 10,
  searchLimit = 1200
): number {
  const target = Math.max(1, Math.round(maxHp))
  let bestSpent = 0
  let bestDiff = Number.POSITIVE_INFINITY
  for (let spent = 0; spent <= searchLimit; spent++) {
    const candidate = computeMaxHpBySpentPoints(spent, sheetPresetId, classStatus, baseHp)
    const diff = Math.abs(candidate - target)
    if (diff < bestDiff) {
      bestDiff = diff
      bestSpent = spent
      if (diff === 0) break
    }
  }
  return bestSpent
}


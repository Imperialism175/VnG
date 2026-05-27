import type { RoomTheme } from '@/types'

export type LevelVariant = 'main' | 'alt'

export interface LevelPreset {
  id: string
  title: string
  altTitle: string
  palette: Record<LevelVariant, RoomTheme>
}

export const LEVEL_PRESETS: LevelPreset[] = [
  {
    id: 'blue-abyss',
    title: 'Синяя Бездна',
    altTitle: 'Дно',
    palette: {
      main: { blue: '#5dd6ff', gold: '#b8f3ff', bg: '#001224' },
      alt: { blue: '#7ac7d9', gold: '#9fc2c9', bg: '#02070b' },
    },
  },
  {
    id: 'demo',
    title: 'Demo.*',
    altTitle: 'Demo*.',
    palette: {
      main: { blue: '#c69a55', gold: '#f0c27a', bg: '#1a120b' },
      alt: { blue: '#9f7b42', gold: '#d3a868', bg: '#0e0a08' },
    },
  },
  {
    id: 'flappy',
    title: 'Флеппи Берд',
    altTitle: 'Змейка',
    palette: {
      main: { blue: '#7be870', gold: '#f8f04d', bg: '#07270f' },
      alt: { blue: '#76e48f', gold: '#8cff64', bg: '#051108' },
    },
  },
  {
    id: 'minecraft',
    title: 'Майнкрафт',
    altTitle: 'Разговор',
    palette: {
      main: { blue: '#89ff89', gold: '#b8ff6a', bg: '#0e1a0e' },
      alt: { blue: '#d8c5a3', gold: '#f1ddb8', bg: '#1d1209' },
    },
  },
  {
    id: 'city-of-thieves',
    title: 'Город воров',
    altTitle: 'Сумерка',
    palette: {
      main: { blue: '#d54867', gold: '#f06aa2', bg: '#19050a' },
      alt: { blue: '#8e7aff', gold: '#c095ff', bg: '#0b0817' },
    },
  },
  {
    id: 'radicals',
    title: 'Радикалы',
    altTitle: 'Теракт',
    palette: {
      main: { blue: '#f0f0f0', gold: '#aaaaaa', bg: '#090909' },
      alt: { blue: '#d4d4d4', gold: '#7e7e7e', bg: '#040404' },
    },
  },
  {
    id: 'not-fair',
    title: 'Так не честно!',
    altTitle: 'Лего',
    palette: {
      main: { blue: '#6fd3ff', gold: '#f69cff', bg: '#060b17' },
      alt: { blue: '#7eff5c', gold: '#ffe25c', bg: '#10161f' },
    },
  },
  {
    id: 'shiny-desert',
    title: 'Блестящая пустыня',
    altTitle: 'Морской Бой DLC',
    palette: {
      main: { blue: '#ffd36e', gold: '#ff9fd0', bg: '#1a1203' },
      alt: { blue: '#7fd0ff', gold: '#a9f2ff', bg: '#04111a' },
    },
  },
  {
    id: 'wolf-at-door',
    title: 'Wolf at the door',
    altTitle: 'Абсолютная Лучезарность',
    palette: {
      main: { blue: '#666666', gold: '#888888', bg: '#000000' },
      alt: { blue: '#ffffff', gold: '#f0f0f0', bg: '#1e1e1e' },
    },
  },
  {
    id: 'coffin',
    title: 'Гроб.',
    altTitle: 'Будущее',
    palette: {
      main: { blue: '#7aa86f', gold: '#b5d980', bg: '#0a1208' },
      alt: { blue: '#9ae7ff', gold: '#d2f5ff', bg: '#050b10' },
    },
  },
  {
    id: 'grandpa-tv',
    title: 'Дедушкин телевизор',
    altTitle: 'Интернет',
    palette: {
      main: { blue: '#b8c6d9', gold: '#f0f0f0', bg: '#101419' },
      alt: { blue: '#ff8ad2', gold: '#7dd8ff', bg: '#0a0910' },
    },
  },
  {
    id: 'cemetery',
    title: 'Кладбище',
    altTitle: 'ПЛОХОЙ КОНЕЦ',
    palette: {
      main: { blue: '#8acb8a', gold: '#b4e9b4', bg: '#0a130a' },
      alt: { blue: '#b0b0b0', gold: '#d9d9d9', bg: '#070707' },
    },
  },
  {
    id: 'tutorial',
    title: 'Учебный уровень',
    altTitle: 'МA(†3Р)',
    palette: {
      main: { blue: '#fff3ad', gold: '#ffffff', bg: '#101010' },
      alt: { blue: '#f7f7f7', gold: '#ffffff', bg: '#000000' },
    },
  },
]

export function getLevelPreset(id: string | null | undefined): LevelPreset | null {
  if (!id) return null
  return LEVEL_PRESETS.find((level) => level.id === id) ?? null
}

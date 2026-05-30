import type { LucideIcon } from 'lucide-react'
import { Clover, Heart, PersonStanding, Scroll, Smile, Sword } from 'lucide-react'

const RULES: { icon: LucideIcon; patterns: RegExp[] }[] = [
  { icon: Heart, patterns: [/здор|хп|hp|выно|con|жиз|стам/i] },
  { icon: Sword, patterns: [/сил|атак|меч|str|attack|dmg|урон/i] },
  { icon: PersonStanding, patterns: [/ловк|dex|бег|скорост|уклон/i] },
  { icon: Smile, patterns: [/хариз|cha|обаян|smile/i] },
  { icon: Scroll, patterns: [/инт|маг|знан|int|arc|лор|свиток/i] },
  { icon: Clover, patterns: [/удач|luck|фортун/i] },
]

const FALLBACK: LucideIcon[] = [Heart, Sword, PersonStanding, Smile, Scroll, Clover]

export function pickStatIcon(name: string, index: number): LucideIcon {
  const n = name.trim()
  for (const { icon, patterns } of RULES) {
    if (patterns.some((p) => p.test(n))) return icon
  }
  return FALLBACK[index % FALLBACK.length]
}

interface StatIconProps {
  name: string
  index: number
  size?: number
  className?: string
}

export function StatIcon({ name, index, size = 16, className = '' }: StatIconProps) {
  const Icon = pickStatIcon(name, index)
  return <Icon size={size} className={className} strokeWidth={1.75} aria-hidden />
}

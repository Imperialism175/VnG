import type { LucideIcon } from 'lucide-react'
import { Eye, Heart, Scroll, Shield, Sword } from 'lucide-react'

const RULES: { icon: LucideIcon; patterns: RegExp[] }[] = [
  { icon: Sword, patterns: [/сил|атак|меч|str|attack|dmg|урон/i] },
  { icon: Shield, patterns: [/защ|брон|щит|def|armor|ac|кб/i] },
  { icon: Heart, patterns: [/здор|хп|hp|выно|con|жиз|стам/i] },
  { icon: Eye, patterns: [/мудр|вним|воспр|wis|per|инту|ловк|dex/i] },
  { icon: Scroll, patterns: [/инт|маг|знан|int|arc|лор|хариз|cha/i] },
]

const FALLBACK: LucideIcon[] = [Sword, Shield, Scroll, Eye, Heart]

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

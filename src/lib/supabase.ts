import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Character, Encounter, Player, RollEvent, Room } from '@/types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export const isSupabaseConfigured =
  Boolean(supabaseUrl && supabaseAnonKey) &&
  !supabaseUrl.includes('your-project') &&
  !supabaseAnonKey.includes('your-anon')

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

export type Database = {
  public: {
    Tables: {
      rooms: { Row: Room; Insert: Omit<Room, 'created_at'>; Update: Partial<Room> }
      players: { Row: Player; Insert: Omit<Player, 'joined_at'>; Update: Partial<Player> }
      characters: { Row: Character; Insert: Omit<Character, 'updated_at'>; Update: Partial<Character> }
      roll_events: { Row: RollEvent; Insert: Omit<RollEvent, 'created_at'>; Update: Partial<RollEvent> }
      encounters: { Row: Encounter; Insert: Omit<Encounter, 'created_at'>; Update: Partial<Encounter> }
    }
  }
}

let ctx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) ctx = new AudioContext()
    return ctx
  } catch {
    return null
  }
}

export function resumeRoomAudio(): void {
  const audio = getAudioContext()
  if (audio?.state === 'suspended') {
    void audio.resume().catch(() => {})
  }
}

function playTone(
  frequency: number,
  startTime: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine'
) {
  const audio = getAudioContext()
  if (!audio) return

  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = type
  osc.frequency.value = frequency
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
  osc.connect(gain)
  gain.connect(audio.destination)
  osc.start(startTime)
  osc.stop(startTime + duration + 0.05)
}

/** Тихий сигнал начала боя / появления энкаунтера */
export function playBattleStartCue() {
  resumeRoomAudio()
  const t = getAudioContext()?.currentTime ?? 0
  playTone(220, t, 0.12, 0.045, 'triangle')
  playTone(330, t + 0.14, 0.1, 0.05, 'triangle')
}

/** Тихий сигнал полноэкранного объявления */
export function playAnnounceCue() {
  resumeRoomAudio()
  const t = getAudioContext()?.currentTime ?? 0
  playTone(440, t, 0.14, 0.04, 'sine')
  playTone(554, t + 0.18, 0.1, 0.035, 'sine')
}

/** Короткий личный пинг от ГМа выбранному игроку */
export function playPlayerSignalCue() {
  resumeRoomAudio()
  const t = getAudioContext()?.currentTime ?? 0
  playTone(880, t, 0.08, 0.05, 'square')
  playTone(1175, t + 0.1, 0.1, 0.04, 'square')
}

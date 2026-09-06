/** خوانش متن فارسی با موتور گفتار مرورگر (در صورت پشتیبانی) */

export function ttsAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices()
  return voices.find((v) => v.lang.startsWith('fa')) ?? voices.find((v) => v.lang.startsWith('ar'))
}

export function speak(text: string, onEnd?: () => void) {
  if (!ttsAvailable()) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'fa-IR'
  u.rate = 0.85
  const v = pickVoice()
  if (v) u.voice = v
  u.onend = () => onEnd?.()
  u.onerror = () => onEnd?.()
  window.speechSynthesis.speak(u)
}

export function stopSpeaking() {
  if (ttsAvailable()) window.speechSynthesis.cancel()
}

// Efeitos sonoros curtos gerados via Web Audio API (sem arquivos de áudio).
// O navegador bloqueia áudio até a primeira interação do usuário; por isso o
// contexto é criado/retomado sob demanda.
let audioContext;

function getContext() {
  if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return undefined;
  if (!audioContext) {
    const Ctor = typeof AudioContext !== 'undefined' ? AudioContext : webkitAudioContext;
    audioContext = new Ctor();
  }
  if (audioContext.state === 'suspended') void audioContext.resume();
  return audioContext;
}

/**
 * Toca uma sequência de tons curtos.
 * @param {Array<{freq:number,start:number,duration:number}>} notes
 * @param {number} peak volume de pico (0..1)
 */
function playTones(notes, peak = 0.12) {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const note of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = note.freq;
    const startAt = now + note.start;
    const endAt = startAt + note.duration;
    // Envelope suave para evitar cliques.
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
    osc.connect(gain).connect(ctx.destination);
    osc.start(startAt);
    osc.stop(endAt + 0.02);
  }
}

export const sounds = {
  // Som suave ascendente ao iniciar.
  start() {
    playTones([
      { freq: 523.25, start: 0, duration: 0.14 },
      { freq: 783.99, start: 0.12, duration: 0.18 },
    ]);
  },
  // Som suave descendente ao concluir.
  finish() {
    playTones([
      { freq: 783.99, start: 0, duration: 0.14 },
      { freq: 587.33, start: 0.12, duration: 0.16 },
      { freq: 523.25, start: 0.26, duration: 0.2 },
    ]);
  },
  // Som de alerta (duas notas graves repetidas) para erros.
  error() {
    playTones([
      { freq: 311.13, start: 0, duration: 0.16 },
      { freq: 233.08, start: 0.18, duration: 0.22 },
    ], 0.16);
  },
};

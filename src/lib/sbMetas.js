// Reparto de videos por prioridad (Social Boost).
// Total fijo por semana y porcentajes por prioridad; el más bajo es 10%.

export const TOTAL_SEMANA = 30
export const PCT_PRIORIDAD = [30, 25, 20, 15, 10] // prioridad 1 a 5 (suman 100)

// slots: [{ cancion_id, prioridad, objetivo, slot }]
// Devuelve { [cancion_id]: { meta, sugerida, prioridad } } con las metas de la semana.
// - Si hay menos de 5 canciones, se usan los porcentajes de las prioridades más altas, reescalados a 100%.
// - Redondeo: se reparte el resto a quienes tienen mayor decimal; en empate gana la prioridad más alta.
// - Si una canción tiene una meta puesta a mano (objetivo), esa se respeta.
export function calcMetas(slots, total = TOTAL_SEMANA) {
  const orden = [...slots].sort((a, b) =>
    (a.prioridad ?? 99) - (b.prioridad ?? 99) || (a.slot ?? 0) - (b.slot ?? 0))
  const n = orden.length
  const out = {}
  if (!n) return out
  const pcts = PCT_PRIORIDAD.slice(0, n)
  const suma = pcts.reduce((a, b) => a + b, 0)
  const crudo = pcts.map(p => total * p / suma)
  const base = crudo.map(Math.floor)
  let resto = total - base.reduce((a, b) => a + b, 0)
  const porDecimal = crudo.map((c, i) => ({ i, dec: c - Math.floor(c) }))
    .sort((a, b) => b.dec - a.dec || a.i - b.i)
  for (let k = 0; k < resto; k++) base[porDecimal[k].i]++
  orden.forEach((s, i) => {
    out[s.cancion_id] = {
      sugerida: base[i],
      meta: s.objetivo != null ? s.objetivo : base[i],
      prioridad: s.prioridad ?? null,
    }
  })
  return out
}

// Primera prioridad libre (1 a 5), o null si están todas usadas
export function prioridadLibre(slots) {
  const usadas = new Set(slots.map(s => s.prioridad).filter(Boolean))
  return [1, 2, 3, 4, 5].find(p => !usadas.has(p)) ?? null
}

// Videos de la semana que pertenecen a canciones que ya NO están activas (salieron a mitad de semana)
// y que se descuentan del total: el reparto se hace con lo que queda.
export function totalRestante(huerfanos, total = TOTAL_SEMANA) {
  return Math.max(0, total - Math.max(0, huerfanos || 0))
}

// Precios de lista de Kolinset (CLP netos, + IVA). Los usa el conector de agentes.
// Ojo: la misma tabla de Playlisting está en Kolinset Finance (src/lib/finanzas.js);
// si cambia un precio, hay que cambiarlo en las dos plataformas.

export const PRECIO_CLIPPING = 1000000     // promete entre 1M y 3M de views
export const VIEWS_CLIPPING = { min: 1000000, max: 3000000 }
export const PRECIO_NANO_BLAST = 1000000

export const PLAYLISTING = [
  { streams: 10000, precio: 130000 },
  { streams: 20000, precio: 250000 },
  { streams: 30000, precio: 350000 },
  { streams: 50000, precio: 600000 },
  { streams: 100000, precio: 1000000 },
  { streams: 200000, precio: 2000000 },
  { streams: 300000, precio: 2250000 },
  { streams: 400000, precio: 3000000 },
  { streams: 500000, precio: 4000000 },
]

export const precioPlaylisting = streams => PLAYLISTING.find(p => p.streams === Number(streams))?.precio ?? null

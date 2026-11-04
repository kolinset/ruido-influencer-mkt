// Herramientas que el conector de agentes (/api/mcp) ofrece sobre ROSTER.
//
// Reglas:
// - Leer: el agente lo hace solo (campañas, roster, avance, métricas).
// - Cambiar algo (crear campaña, agregar influencers, cargar links, actualizar un
//   influencer, cambiar el estado): el agente solo PROPONE. La propuesta queda en
//   "propuestas_agentes", aparece en el Dashboard y se aplica cuando alguien del
//   equipo la aprueba con su sesión (api/propuestas.js).
// - No hay herramientas para borrar ni para SQL libre.
//
// "db" es cualquier objeto con query(texto, parámetros) → { rows } (el pool de pg).

import { PRECIO_CLIPPING, VIEWS_CLIPPING, PRECIO_NANO_BLAST, PLAYLISTING, precioPlaylisting } from '../src/lib/precios.js'

export const ESTADOS_INF = ['Contactado', 'Negociando', 'Confirmado', 'Brief enviado', 'Contenido recibido', 'Publicado']
export const TIPOS = ['Influencer MKT', 'Clipping', 'Nano Blast', 'Playlisting']
const ESTADOS_ABIERTOS = ['Programada', 'Activa', 'Pausada']
const MAX_LINKS = 200, MAX_CONVERTIR = 40

const RETENCION_HONORARIOS = 0.1525, IVA = 0.19
export const calcCosto = (base, tipo) => {
  const b = Number(base) || 0
  if (tipo === 'honorarios') return Math.round(b / (1 - RETENCION_HONORARIOS))
  if (tipo === 'factura_iva') return Math.round(b * (1 + IVA))
  return b
}

const num = n => Number(n) || 0
const plata = (n, moneda = 'CLP') => (moneda === 'USD' ? 'US$' : '$') + Math.round(num(n)).toLocaleString(moneda === 'USD' ? 'en-US' : 'es-CL')
const miles = n => Math.round(num(n)).toLocaleString('es-CL')
export const nombreCampana = (tipo, artista, cancion) => `[${tipo}] "${artista}" - "${cancion}"`
export const hoyChile = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })

export class ErrorHerramienta extends Error {}
const falla = m => { throw new ErrorHerramienta(m) }
const filas = async (db, t, p = []) => (await db.query(t, p)).rows
const fila = async (db, t, p = []) => (await db.query(t, p)).rows[0] || null

// ── Links ───────────────────────────────────────────────────────────────────
export function extraerLinks(texto) {
  const vistos = new Set(), out = []
  for (const parte of String(texto || '').split(/[\s,;"]+/)) {
    const l = parte.trim()
    if (!/^https?:\/\//i.test(l) || vistos.has(l)) continue
    vistos.add(l); out.push(l)
  }
  return out
}
const esTikTok = u => { try { const h = new URL(u).hostname.toLowerCase(); return h === 'tiktok.com' || h.endsWith('.tiktok.com') } catch { return false } }
const esMovilTikTok = u => /^https?:\/\/(vt|vm|m)\.tiktok\.com\//i.test(u) || /^https?:\/\/(www\.)?tiktok\.com\/t\//i.test(u)
const esEscritorioTikTok = u => /tiktok\.com\/@[^/]+\/(video|photo)\/\d+/.test(u || '')
const parseTikTok = u => { const m = (u || '').match(/tiktok\.com\/@([^/?#]+)\/(?:video|photo)\/(\d+)/); return m ? { handle: m[1], video_id: m[2] } : { handle: '', video_id: '' } }
export function cleanInstagram(url) {
  const raw = (url || '').trim()
  if (!/instagram\.com/i.test(raw)) return raw
  try {
    const u = new URL(raw)
    const m = u.pathname.match(/^\/(?:[^/]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/)
    return m ? `https://www.instagram.com/reel/${m[1]}/` : u.origin + u.pathname
  } catch { return raw }
}
async function convertir(urls, expand, limite = 4) {
  const out = new Array(urls.length); let i = 0
  async function w() { while (i < urls.length) { const k = i++; try { out[k] = (await expand(urls[k])) || null } catch { out[k] = null } } }
  await Promise.all(Array.from({ length: Math.min(limite, urls.length) }, w))
  return out
}

// ── Definiciones ────────────────────────────────────────────────────────────
const S = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false })
const motivo = { type: 'string', description: 'Por qué / de dónde viene, ej. "WhatsApp de la proveedora 3/11".' }

export const HERRAMIENTAS = [
  { name: 'buscar_clientes', description: 'Busca clientes de ROSTER por nombre (parcial).', inputSchema: S({ texto: { type: 'string' } }, ['texto']) },
  { name: 'listar_servicios', description: 'Servicios activos con su % utilizable (lo que se puede gastar del budget; el resto es margen de Kolinset).', inputSchema: S({}) },
  { name: 'listar_campanas', description: 'Lista campañas con filtros. Estados: Programada, Activa, Pausada, Cerrada (finalizada), Cancelada.',
    inputSchema: S({ estado: { type: 'string', enum: ['Programada', 'Activa', 'Pausada', 'Cerrada', 'Cancelada', 'Abiertas'] }, tipo: { type: 'string', enum: TIPOS }, cliente_id: { type: 'string' }, texto: { type: 'string', description: 'Parte del nombre, artista o canción.' }, limite: { type: 'integer', minimum: 1, maximum: 100 } }) },
  { name: 'ver_campana', description: 'Detalle de una campaña: datos, brief completo (lo que se manda o se mandó a los influencers; léelo antes de armar una lista), influencers (estado, costo, links de video, pago), budget utilizable/usado/restante, links cargados y métricas.',
    inputSchema: S({ campana_id: { type: 'string' } }, ['campana_id']) },
  { name: 'avance_campanas', description: 'Avance de todas las campañas abiertas según su tipo: Influencer MKT (quién falta por publicar), Clipping (views vs meta), Nano Blast (links cargados), Playlisting (recordar pedir números de Spotify for Artists). Marca cuáles están listas para finalizar.',
    inputSchema: S({}) },
  { name: 'buscar_influencers', description: 'Busca en el roster (solo activos): por categoría, red, rango de seguidores o nombre. Incluye su historial medido en campañas anteriores: costo por view (CPV, en CLP, con retención/IVA incluidos), views promedio por video y cuántas campañas se midieron. Puedes ordenar por CPV para armar listas más eficientes.',
    inputSchema: S({ categoria: { type: 'string' }, plataforma: { type: 'string', enum: ['TikTok', 'Instagram'], description: 'Red para el filtro de seguidores (por defecto TikTok).' }, seguidores_min: { type: 'integer', minimum: 0 }, seguidores_max: { type: 'integer', minimum: 0 }, texto: { type: 'string' }, excluir_campana_id: { type: 'string', description: 'No mostrar los que ya están en esta campaña.' }, ordenar_por: { type: 'string', enum: ['seguidores', 'cpv', 'views'], description: 'seguidores (por defecto), cpv (más barato por view primero; sin historial al final) o views (más views promedio por video primero).' }, limite: { type: 'integer', minimum: 1, maximum: 60 } }) },
  { name: 'historial_influencer', description: 'Historial de un influencer en campañas anteriores: en qué campañas estuvo, de qué tipo y de qué trataba cada una (extracto del brief), cuánto costó, cuántas views logró y su costo por view. Úsalo para decidir si calza con una campaña nueva.',
    inputSchema: S({ influencer_id: { type: 'string' } }, ['influencer_id']) },
  { name: 'proponer_crear_campana', description: 'PROPONE crear una campaña en ROSTER (se crea al aprobarla). Nombre automático: [Tipo] "Artista" - "Canción". Clipping: $1.000.000 neto y meta 1M–3M views por defecto. Nano Blast: $1.000.000 neto. Playlisting: con streams de la tabla sale el budget. El % utilizable lo pone el servicio.',
    inputSchema: S({ tipo: { type: 'string', enum: TIPOS }, artista: { type: 'string' }, cancion: { type: 'string' }, cliente_id: { type: 'string' }, solicitado_por: { type: 'string', description: 'Persona del cliente que lo pidió.' }, budget: { type: 'number', minimum: 1, description: 'Budget total neto (lo que cobra la agencia).' }, moneda: { type: 'string', enum: ['CLP', 'USD'] }, plataforma: { type: 'string', enum: ['TikTok', 'Instagram', 'Ambas'] }, brief: { type: 'string' }, fecha_inicio: { type: 'string', description: 'AAAA-MM-DD' }, fecha_termino: { type: 'string', description: 'AAAA-MM-DD' }, views_min: { type: 'integer', minimum: 0 }, views_max: { type: 'integer', minimum: 0 }, streams: { type: 'integer', minimum: 1, description: 'Solo Playlisting.' }, motivo },
      ['tipo', 'artista', 'cancion', 'cliente_id', 'motivo']) },
  { name: 'proponer_lista_influencers', description: 'PROPONE agregar influencers del roster a una campaña (la lista que revisa el cliente). Se agregan como "Contactado", costo 0, al aprobar.',
    inputSchema: S({ campana_id: { type: 'string' }, influencers: { type: 'array', minItems: 1, maxItems: 60, items: S({ influencer_id: { type: 'string' }, piezas: { type: 'integer', minimum: 1 }, nota: { type: 'string' } }, ['influencer_id']) }, motivo }, ['campana_id', 'influencers', 'motivo']) },
  { name: 'proponer_actualizar_influencer', description: 'PROPONE actualizar a un influencer dentro de una campaña: estado (Contactado → Negociando → Confirmado → Brief enviado → Contenido recibido → Publicado), costo negociado, piezas, links de video (TikTok/Instagram) o una nota. Los links de TikTok móviles se convierten solos.',
    inputSchema: S({ campana_id: { type: 'string' }, influencer_id: { type: 'string' }, estado: { type: 'string', enum: ESTADOS_INF }, costo: { type: 'integer', minimum: 0 }, piezas: { type: 'integer', minimum: 1 }, video_link_tt: { type: 'string' }, video_link_ig: { type: 'string' }, nota: { type: 'string' }, motivo }, ['campana_id', 'influencer_id', 'motivo']) },
  { name: 'proponer_agregar_links', description: `PROPONE cargar links de TikTok a una campaña de Clipping o Nano Blast (por ejemplo los que manda la proveedora por WhatsApp). Pega el texto tal cual: se sacan los links, se convierten los móviles y se descartan repetidos. Máximo ${MAX_LINKS} links (y ${MAX_CONVERTIR} móviles) por propuesta.`,
    inputSchema: S({ campana_id: { type: 'string' }, texto: { type: 'string', description: 'Texto o lista con los links.' }, motivo }, ['campana_id', 'texto', 'motivo']) },
  { name: 'proponer_cambiar_estado', description: 'PROPONE cambiar el estado de una campaña: Activa, Pausada o Cerrada (= finalizada). Usa avance_campanas para justificar que está lista.',
    inputSchema: S({ campana_id: { type: 'string' }, estado: { type: 'string', enum: ['Activa', 'Pausada', 'Cerrada'] }, motivo }, ['campana_id', 'estado', 'motivo']) },
  { name: 'ver_propuestas', description: 'Propuestas pendientes de aprobación y las últimas resueltas.', inputSchema: S({}) },
]

// ── Apoyo ───────────────────────────────────────────────────────────────────
async function campana(db, id) {
  const c = await fila(db, `SELECT c.*, cl.nombre AS client_nombre FROM campaigns c LEFT JOIN clients cl ON cl.id = c.client_id WHERE c.id::text = $1`, [String(id)])
  if (!c) falla(`No existe una campaña con id ${id}.`)
  return c
}
const abierta = c => { if (!ESTADOS_ABIERTOS.includes(c.estado)) falla(`La campaña "${c.nombre}" está ${c.estado}: no se puede modificar.`) }

const resumenCampana = c => ({
  id: c.id, nombre: c.nombre, tipo: c.tipo || 'Influencer MKT', cliente: c.client_nombre || c.cliente || null, estado: c.estado,
  artista: c.artista || null, cancion: c.cancion || null, plataforma: c.plataforma || 'Ambas',
  budget: num(c.budget), moneda: c.moneda || 'CLP', budget_texto: plata(c.budget, c.moneda),
  fecha_inicio: c.fecha_inicio || null, fecha_termino: c.fecha_termino || null,
})

async function guardarPropuesta(db, { agente, tipo, campana_id = null, resumen, motivo: m, datos }) {
  if (!m || !String(m).trim()) falla('Falta el motivo de la propuesta.')
  const r = await fila(db, `INSERT INTO propuestas_agentes (agente, tipo, campaign_id, resumen, motivo, datos) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, estado, created_at`,
    [agente, tipo, campana_id, resumen, String(m).trim().slice(0, 500), JSON.stringify(datos)])
  return { propuesta_id: r.id, estado: r.estado, propuesta: resumen, detalle: datos.vista || [],
    siguiente_paso: 'Queda pendiente hasta que alguien del equipo la apruebe en el Dashboard de ROSTER.' }
}
async function pendienteIgual(db, tipo, campanaId, clave) {
  const ps = await filas(db, `SELECT datos FROM propuestas_agentes WHERE estado = 'pendiente' AND tipo = $1 AND ($2::text IS NULL OR campaign_id::text = $2)`, [tipo, campanaId == null ? null : String(campanaId)])
  return ps.some(p => clave(typeof p.datos === 'string' ? JSON.parse(p.datos) : p.datos))
}

function avanceDe(c, infs, links, hoy) {
  const tipo = c.tipo || 'Influencer MKT'
  const base = { ...resumenCampana(c) }
  if (tipo === 'Influencer MKT') {
    const conVideo = i => (i.video_link_tt || i.video_link_ig) || i.estado === 'Publicado'
    const faltan = infs.filter(i => !conVideo(i))
    return { ...base, influencers: infs.length, publicados: infs.length - faltan.length, faltan_por_publicar: faltan.map(i => `${i.nombre} (${i.estado})`),
      listo_para_finalizar: infs.length > 0 && faltan.length === 0,
      texto: infs.length ? `${infs.length - faltan.length}/${infs.length} publicados` + (faltan.length ? `; faltan: ${faltan.map(i => i.nombre).join(', ')}` : '; todos publicaron') : 'Aún sin influencers en la campaña' }
  }
  if (tipo === 'Clipping') {
    const l = num(c.views_logradas), mn = num(c.views_min), mx = num(c.views_max)
    return { ...base, views_logradas: l, views_min: mn, views_max: mx, pct_del_minimo: mn ? Math.round(l / mn * 100) : null, links: num(c.contenidos_count),
      listo_para_finalizar: mn > 0 && l >= mn,
      texto: `${miles(l)} views` + (mn ? ` de ${miles(mn)}–${miles(mx)} (${Math.round(l / mn * 100)}% del mínimo)` : ' (sin meta cargada)') }
  }
  if (tipo === 'Nano Blast') {
    const ult = links.length ? links.reduce((a, x) => (x.created_at > a ? x.created_at : a), links[0].created_at) : null
    const dias = ult ? Math.max(0, Math.floor((Date.parse(hoy) - Date.parse(hoyChile(new Date(ult)))) / 86400000)) : null // fecha en Chile, no en UTC
    return { ...base, links_cargados: links.length, dias_desde_ultimo_link: dias, listo_para_finalizar: null,
      texto: `${links.length} links cargados` + (dias !== null ? `, el último hace ${dias} día(s)` : '') + '. Se finaliza cuando la proveedora confirme que subieron todos.' }
  }
  const dias = c.fecha_inicio ? Math.floor((Date.parse(hoy) - Date.parse(String(c.fecha_inicio).slice(0, 10))) / 86400000) : null
  return { ...base, dias_desde_inicio: dias, listo_para_finalizar: null,
    texto: 'Sin métricas automáticas: pedir al cliente los números de Spotify for Artists' + (dias !== null ? ` (lleva ${dias} días)` : '') }
}


// ── Historial medido de influencers (costo por view) ────────────────────────
// Cruza lo que se le pagó a cada influencer en cada campaña con las views de sus
// videos en el reporte de Tokchart de esa campaña (campaign_metrics.posts).
// Un video se asigna al influencer por su link (ID de TikTok / código de reel) o por su @usuario.
const sinArroba = h => String(h || '').trim().replace(/^@/, '').toLowerCase()
const reelDe = u => (String(u || '').match(/instagram\.com\/(?:[^/]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/) || [])[1] || ''
const ttIdDe = u => (String(u || '').match(/tiktok\.com\/@[^/]+\/(?:video|photo)\/(\d+)/) || [])[1] || ''

export async function historialMedido(db, influencerIds = null) {
  const p = [], w = []
  if (influencerIds) { p.push(influencerIds.map(String)); w.push(`ci.influencer_id::text = ANY($1)`) }
  const filasCi = await filas(db, `SELECT ci.influencer_id, ci.costo, ci.tipo_facturacion, ci.piezas, ci.estado, ci.video_link_tt, ci.video_link_ig,
      c.id AS campaign_id, c.nombre, c.tipo, c.moneda, c.created_at, c.brief, i.tt_usuario, i.ig_usuario
    FROM campaign_influencers ci JOIN campaigns c ON c.id = ci.campaign_id JOIN influencers i ON i.id = ci.influencer_id
    ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY c.created_at DESC`, p)
  const campIds = [...new Set(filasCi.map(r => r.campaign_id))]
  const mets = campIds.length ? await filas(db, `SELECT campaign_id, plataforma, posts FROM campaign_metrics WHERE campaign_id = ANY($1)`, [campIds]) : []
  const postsDe = new Map()
  for (const m of mets) {
    const ps = typeof m.posts === 'string' ? JSON.parse(m.posts || '[]') : (m.posts || [])
    const k = String(m.campaign_id); postsDe.set(k, [...(postsDe.get(k) || []), ...ps.map(x => ({ ...x, plataforma: m.plataforma }))])
  }
  return filasCi.map(r => {
    const ps = postsDe.get(String(r.campaign_id)) || []
    const tt = ttIdDe(r.video_link_tt), reel = reelDe(r.video_link_ig)
    const handles = new Set([sinArroba(r.tt_usuario), sinArroba(r.ig_usuario)].filter(Boolean))
    const suyos = ps.filter(x => (tt && String(x.video_id) === tt) || (reel && reelDe(x.link) === reel) || (x.handle && handles.has(sinArroba(x.handle))))
    const views = suyos.reduce((a, x) => a + num(x.views), 0)
    const costo = calcCosto(r.costo, r.tipo_facturacion)
    return { influencer_id: r.influencer_id, campaign_id: r.campaign_id, campana: r.nombre, tipo: r.tipo || 'Influencer MKT', moneda: r.moneda || 'CLP',
      fecha: r.created_at, estado: r.estado, piezas: num(r.piezas), costo, videos_medidos: suyos.length, views,
      cpv: costo > 0 && views > 0 ? costo / views : null, brief: r.brief || '' }
  })
}
function resumenHistorial(h) {
  const medidas = h.filter(x => x.cpv != null && x.moneda === 'CLP')
  const costo = medidas.reduce((a, x) => a + x.costo, 0), viewsPagadas = medidas.reduce((a, x) => a + x.views, 0)
  const conVideos = h.filter(x => x.videos_medidos > 0)
  const views = conVideos.reduce((a, x) => a + x.views, 0), videos = conVideos.reduce((a, x) => a + x.videos_medidos, 0)
  return { campanas_previas: h.length, campanas_medidas: medidas.length,
    cpv_promedio: viewsPagadas > 0 ? Math.round(costo / viewsPagadas * 100) / 100 : null,
    views_promedio_por_video: videos > 0 ? Math.round(views / videos) : null,
    costo_promedio: h.filter(x => x.costo > 0).length ? Math.round(h.filter(x => x.costo > 0).reduce((a, x) => a + x.costo, 0) / h.filter(x => x.costo > 0).length) : null }
}

// ── Ejecución ───────────────────────────────────────────────────────────────
export async function ejecutar(db, nombre, a = {}, { agente = 'agente', hoy = hoyChile(), expandTikTok = async () => null } = {}) {
  switch (nombre) {
    case 'buscar_clientes': {
      const t = String(a.texto || '').trim()
      if (t.length < 2) falla('Escribe al menos 2 letras.')
      return { clientes: await filas(db, `SELECT id, nombre FROM clients WHERE nombre ILIKE $1 ORDER BY nombre LIMIT 20`, [`%${t.replace(/[%_]/g, '')}%`]) }
    }

    case 'listar_servicios':
      return { servicios: (await filas(db, `SELECT id, nombre, utilizable_pct FROM services WHERE activo = true ORDER BY nombre`)).map(s => ({ ...s, utilizable_pct: num(s.utilizable_pct) })) }

    case 'listar_campanas': {
      const p = [], w = []
      if (a.estado === 'Abiertas') { p.push(ESTADOS_ABIERTOS); w.push(`c.estado = ANY($${p.length})`) }
      else if (a.estado) { p.push(a.estado); w.push(`c.estado = $${p.length}`) }
      if (a.tipo) { p.push(a.tipo); w.push(`COALESCE(c.tipo, 'Influencer MKT') = $${p.length}`) }
      if (a.cliente_id) { p.push(String(a.cliente_id)); w.push(`c.client_id::text = $${p.length}`) }
      if (a.texto) { p.push(`%${String(a.texto).replace(/[%_]/g, '')}%`); w.push(`(c.nombre ILIKE $${p.length} OR c.artista ILIKE $${p.length} OR c.cancion ILIKE $${p.length})`) }
      p.push(Math.min(Math.max(Number(a.limite) || 30, 1), 100))
      const rs = await filas(db, `SELECT c.*, cl.nombre AS client_nombre, (SELECT count(*) FROM campaign_influencers ci WHERE ci.campaign_id = c.id) AS n_influencers
        FROM campaigns c LEFT JOIN clients cl ON cl.id = c.client_id ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY c.created_at DESC LIMIT $${p.length}`, p)
      return { cantidad: rs.length, campanas: rs.map(c => ({ ...resumenCampana(c), influencers: num(c.n_influencers), links: num(c.contenidos_count), views_logradas: num(c.views_logradas) })) }
    }

    case 'ver_campana': {
      const c = await campana(db, a.campana_id)
      const infs = await filas(db, `SELECT ci.influencer_id, i.nombre, i.tt_usuario, i.tt_seguidores, i.ig_usuario, i.ig_seguidores, ci.estado, ci.costo, ci.piezas, ci.tipo_facturacion, ci.video_link_tt, ci.video_link_ig, ci.estado_pago, ci.notas
        FROM campaign_influencers ci JOIN influencers i ON i.id = ci.influencer_id WHERE ci.campaign_id = $1 ORDER BY i.tt_seguidores DESC NULLS LAST`, [c.id])
      const nLinks = num((await fila(db, `SELECT count(*) AS n FROM campaign_links WHERE campaign_id = $1`, [c.id]))?.n)
      const met = await filas(db, `SELECT plataforma, views, likes, comments, shares, engagement, fetched_at FROM campaign_metrics WHERE campaign_id = $1`, [c.id])
      const pct = c.utilizable_pct != null ? num(c.utilizable_pct) : 100
      const utilizable = Math.round(num(c.budget) * pct / 100)
      const usado = infs.reduce((s, i) => s + calcCosto(i.costo, i.tipo_facturacion), 0)
      return { ...resumenCampana(c), solicitado_por: c.solicitado_por || null, brief: c.brief || null, brief_nota: c.brief ? undefined : 'Esta campaña aún no tiene brief en ROSTER (pestaña Brief).',
        budget_detalle: { utilizable_pct: pct, utilizable, usado_en_influencers: usado, restante: utilizable - usado, texto: `Utilizable ${plata(utilizable, c.moneda)} (${pct}%), usado ${plata(usado, c.moneda)}, quedan ${plata(utilizable - usado, c.moneda)}` },
        influencers: infs.map(i => ({ ...i, costo: num(i.costo), costo_con_impuestos: calcCosto(i.costo, i.tipo_facturacion) })),
        links_cargados: nLinks, views_logradas: num(c.views_logradas), views_min: num(c.views_min), views_max: num(c.views_max),
        metricas: met, avance: avanceDe(c, infs, [], hoy).texto }
    }

    case 'avance_campanas': {
      const cs = await filas(db, `SELECT c.*, cl.nombre AS client_nombre FROM campaigns c LEFT JOIN clients cl ON cl.id = c.client_id WHERE c.estado = ANY($1) ORDER BY c.created_at DESC`, [ESTADOS_ABIERTOS])
      const ids = cs.map(c => c.id)
      const infs = ids.length ? await filas(db, `SELECT ci.campaign_id, i.nombre, ci.estado, ci.video_link_tt, ci.video_link_ig FROM campaign_influencers ci JOIN influencers i ON i.id = ci.influencer_id WHERE ci.campaign_id = ANY($1)`, [ids]) : []
      const links = ids.length ? await filas(db, `SELECT campaign_id, created_at FROM campaign_links WHERE campaign_id = ANY($1)`, [ids]) : []
      const av = cs.map(c => avanceDe(c, infs.filter(i => String(i.campaign_id) === String(c.id)), links.filter(l => String(l.campaign_id) === String(c.id)), hoy))
      return { campanas_abiertas: av.length, listas_para_finalizar: av.filter(x => x.listo_para_finalizar).map(x => x.nombre), avance: av }
    }

    case 'buscar_influencers': {
      const plat = a.plataforma === 'Instagram' ? 'ig' : 'tt'
      let rs = await filas(db, `SELECT i.id, i.nombre, i.tt_usuario, i.tt_seguidores, i.ig_usuario, i.ig_seguidores, i.tipos_contenido FROM influencers i WHERE i.estado = 'Activo'`)
      const cat = a.categoria ? String(a.categoria).toLowerCase().trim() : null
      const txt = a.texto ? String(a.texto).toLowerCase().trim() : null
      let excluir = new Set()
      if (a.excluir_campana_id) excluir = new Set((await filas(db, `SELECT influencer_id FROM campaign_influencers WHERE campaign_id::text = $1`, [String(a.excluir_campana_id)])).map(r => String(r.influencer_id)))
      const cats = i => (Array.isArray(i.tipos_contenido) ? i.tipos_contenido : typeof i.tipos_contenido === 'string' ? i.tipos_contenido.replace(/[{}"]/g, '').split(',') : []).map(x => String(x).trim()).filter(Boolean)
      rs = rs.filter(i => {
        const seg = num(i[`${plat}_seguidores`])
        if (a.seguidores_min != null && seg < a.seguidores_min) return false
        if (a.seguidores_max != null && seg > a.seguidores_max) return false
        if (cat && !cats(i).some(c => c.toLowerCase().includes(cat))) return false
        if (txt && ![i.nombre, i.tt_usuario, i.ig_usuario].some(v => String(v || '').toLowerCase().includes(txt))) return false
        return !excluir.has(String(i.id))
      })
      const hist = rs.length ? await historialMedido(db, rs.map(i => i.id)) : []
      const porInf = new Map()
      for (const h of hist) { const k = String(h.influencer_id); porInf.set(k, [...(porInf.get(k) || []), h]) }
      let out = rs.map(i => ({ id: i.id, nombre: i.nombre, tiktok: i.tt_usuario || null, tt_seguidores: num(i.tt_seguidores), instagram: i.ig_usuario || null, ig_seguidores: num(i.ig_seguidores), categorias: cats(i), ...resumenHistorial(porInf.get(String(i.id)) || []) }))
      const orden = a.ordenar_por || 'seguidores'
      const nul = (v, alto) => v == null ? (alto ? Infinity : -Infinity) : v
      if (orden === 'cpv') out.sort((x, y) => nul(x.cpv_promedio, true) - nul(y.cpv_promedio, true))
      else if (orden === 'views') out.sort((x, y) => nul(y.views_promedio_por_video, false) - nul(x.views_promedio_por_video, false))
      else out.sort((x, y) => num(y[`${plat}_seguidores`]) - num(x[`${plat}_seguidores`]))
      const lim = Math.min(Math.max(Number(a.limite) || 25, 1), 60)
      const r = { encontrados: out.length, nota: 'cpv_promedio = lo que pagó Kolinset (con retención/IVA) dividido por las views medidas en reportes de Tokchart, solo campañas en CLP.', influencers: out.slice(0, lim) }
      if (!out.length && cat) r.categorias_disponibles = (await filas(db, `SELECT nombre FROM categorias_influencer WHERE activo = true ORDER BY nombre`)).map(x => x.nombre)
      return r
    }

    case 'historial_influencer': {
      const inf = await fila(db, `SELECT id, nombre, tt_usuario, tt_seguidores, ig_usuario, ig_seguidores, estado, notas FROM influencers WHERE id::text = $1`, [String(a.influencer_id)])
      if (!inf) falla('No existe ese influencer.')
      const h = await historialMedido(db, [inf.id])
      return { influencer: { ...inf, tt_seguidores: num(inf.tt_seguidores), ig_seguidores: num(inf.ig_seguidores) }, ...resumenHistorial(h),
        campanas: h.map(x => ({ campana: x.campana, tipo: x.tipo, fecha: x.fecha, estado: x.estado, piezas: x.piezas, costo: x.costo, moneda: x.moneda,
          views: x.views, videos_medidos: x.videos_medidos, cpv: x.cpv == null ? null : Math.round(x.cpv * 100) / 100,
          brief: x.brief ? (x.brief.length > 300 ? x.brief.slice(0, 297) + '…' : x.brief) : null })) }
    }

    case 'proponer_crear_campana': {
      if (!TIPOS.includes(a.tipo)) falla(`Tipo inválido: usa ${TIPOS.join(', ')}.`)
      const artista = String(a.artista || '').trim(), cancion = String(a.cancion || '').trim()
      if (!artista || !cancion) falla('Faltan el artista y la canción.')
      const nombre = nombreCampana(a.tipo, artista, cancion)
      const cliente = await fila(db, `SELECT id, nombre FROM clients WHERE id::text = $1`, [String(a.cliente_id)])
      if (!cliente) falla('No existe ese cliente en ROSTER (búscalo con buscar_clientes; si es nuevo, el equipo debe crearlo).')
      const svc = await fila(db, `SELECT id, nombre, utilizable_pct FROM services WHERE activo = true AND lower(nombre) = lower($1)`, [a.tipo])
      if (!svc) falla(`No hay un servicio activo llamado "${a.tipo}" en ROSTER. Revisa listar_servicios.`)
      for (const k of ['fecha_inicio', 'fecha_termino']) if (a[k] && !/^\d{4}-\d{2}-\d{2}$/.test(a[k])) falla(`${k} debe ser AAAA-MM-DD.`)
      if (a.fecha_inicio && a.fecha_termino && a.fecha_termino < a.fecha_inicio) falla('La fecha de término es anterior a la de inicio.')

      const avisos = [], brief = []
      let budget = a.budget != null ? Math.round(Number(a.budget)) : null
      let vmin = a.views_min ?? null, vmax = a.views_max ?? null
      if (a.tipo === 'Clipping') {
        budget ??= PRECIO_CLIPPING
        if (budget === PRECIO_CLIPPING) { vmin ??= VIEWS_CLIPPING.min; vmax ??= VIEWS_CLIPPING.max }
        else avisos.push(`El precio de lista de Clipping es ${plata(PRECIO_CLIPPING)} por ${miles(VIEWS_CLIPPING.min)}–${miles(VIEWS_CLIPPING.max)} views.`)
        if (!vmin || !vmax) avisos.push('Falta la meta de views (views_min y views_max).')
      }
      if (a.tipo === 'Nano Blast') { budget ??= PRECIO_NANO_BLAST; if (budget !== PRECIO_NANO_BLAST) avisos.push(`El precio de lista de Nano Blast es ${plata(PRECIO_NANO_BLAST)}.`) }
      if (a.tipo === 'Playlisting') {
        if (!a.streams) falla('En Playlisting indica la meta de streams.')
        const precio = precioPlaylisting(a.streams)
        if (budget == null && precio == null) falla(`${miles(a.streams)} streams no está en la tabla (${PLAYLISTING.map(p => `${miles(p.streams)} = ${plata(p.precio)}`).join(', ')}). Indica el budget acordado.`)
        budget ??= precio
        if (precio != null && budget !== precio) avisos.push(`La tabla dice ${plata(precio)} para ${miles(a.streams)} streams.`)
        brief.push(`Meta: ${miles(a.streams)} streams en Spotify (revisar con Spotify for Artists del cliente).`)
      }
      if (!budget || budget <= 0) falla('Indica el budget (neto, lo que cobra la agencia).')
      if (a.brief) brief.push(String(a.brief).trim())
      if (await fila(db, `SELECT id FROM campaigns WHERE lower(nombre) = lower($1)`, [nombre])) falla(`Ya existe la campaña ${nombre}.`)
      if (await pendienteIgual(db, 'crear_campana', null, d => d.nombre?.toLowerCase() === nombre.toLowerCase())) falla(`Ya hay una propuesta pendiente para crear ${nombre}.`)

      const moneda = a.moneda || 'CLP'
      const pct = num(svc.utilizable_pct) || 100
      const plataforma = a.plataforma || (['Clipping', 'Nano Blast'].includes(a.tipo) ? 'TikTok' : 'Ambas')
      const datos = { nombre, client_id: cliente.id, cliente: cliente.nombre, service_id: svc.id, tipo: svc.nombre, utilizable_pct: pct, budget, moneda, plataforma,
        artista, cancion, brief: brief.join('\n\n'), fecha_inicio: a.fecha_inicio || null, fecha_termino: a.fecha_termino || null,
        views_min: vmin || 0, views_max: vmax || 0, solicitado_por: a.solicitado_por || '' }
      datos.vista = [
        `Cliente: ${cliente.nombre}${a.solicitado_por ? ` (pidió ${a.solicitado_por})` : ''}`,
        `Budget ${plata(budget, moneda)} neto · utilizable ${pct}% = ${plata(budget * pct / 100, moneda)} · margen ${plata(budget * (100 - pct) / 100, moneda)}`,
        `Plataforma: ${plataforma}` + (a.fecha_inicio ? ` · desde ${a.fecha_inicio}` : '') + (a.fecha_termino ? ` hasta ${a.fecha_termino}` : ''),
        ...(vmin ? [`Meta: ${miles(vmin)}–${miles(vmax)} views`] : []),
        ...brief.map(b => b.length > 160 ? b.slice(0, 157) + '…' : b),
        ...avisos.map(x => '⚠ ' + x),
      ]
      return guardarPropuesta(db, { agente, tipo: 'crear_campana', resumen: `Crear campaña ${nombre} para ${cliente.nombre} (${plata(budget, moneda)} neto)`, motivo: a.motivo, datos })
    }

    case 'proponer_lista_influencers': {
      const c = await campana(db, a.campana_id); abierta(c)
      const pedidos = a.influencers || []
      const ids = [...new Set(pedidos.map(x => String(x.influencer_id)))]
      const infs = await filas(db, `SELECT id, nombre, estado, tt_usuario, tt_seguidores FROM influencers WHERE id::text = ANY($1)`, [ids])
      const yaEn = new Set((await filas(db, `SELECT influencer_id FROM campaign_influencers WHERE campaign_id = $1`, [c.id])).map(r => String(r.influencer_id)))
      const noExisten = ids.filter(id => !infs.some(i => String(i.id) === id))
      const inactivos = infs.filter(i => i.estado !== 'Activo').map(i => i.nombre)
      const repetidos = infs.filter(i => yaEn.has(String(i.id))).map(i => i.nombre)
      const lista = infs.filter(i => i.estado === 'Activo' && !yaEn.has(String(i.id))).map(i => {
        const p = pedidos.find(x => String(x.influencer_id) === String(i.id))
        return { influencer_id: i.id, nombre: i.nombre, piezas: Math.max(1, Number(p?.piezas) || 1), nota: String(p?.nota || '').trim().slice(0, 300) }
      })
      if (!lista.length) falla(['Nadie nuevo para agregar.', noExisten.length && `No existen: ${noExisten.join(', ')}.`, inactivos.length && `Inactivos: ${inactivos.join(', ')}.`, repetidos.length && `Ya están en la campaña: ${repetidos.join(', ')}.`].filter(Boolean).join(' '))
      const datos = { influencers: lista, vista: lista.map(i => `${i.nombre}${i.piezas > 1 ? ` · ${i.piezas} piezas` : ''}${i.nota ? ` · ${i.nota}` : ''}`) }
      const r = await guardarPropuesta(db, { agente, tipo: 'lista_influencers', campana_id: c.id, resumen: `Agregar ${lista.length} influencer(s) a ${c.nombre}`, motivo: a.motivo, datos })
      return { ...r, omitidos: { no_existen: noExisten, inactivos, ya_en_la_campana: repetidos } }
    }

    case 'proponer_actualizar_influencer': {
      const c = await campana(db, a.campana_id); abierta(c)
      const ci = await fila(db, `SELECT ci.*, i.nombre FROM campaign_influencers ci JOIN influencers i ON i.id = ci.influencer_id WHERE ci.campaign_id = $1 AND ci.influencer_id::text = $2`, [c.id, String(a.influencer_id)])
      if (!ci) falla('Ese influencer no está en la campaña (agrégalo primero con proponer_lista_influencers).')
      const cambios = {}, vista = []
      if (a.estado) { if (!ESTADOS_INF.includes(a.estado)) falla(`Estado inválido: ${ESTADOS_INF.join(', ')}.`); if (a.estado !== ci.estado) { cambios.estado = a.estado; vista.push(`Estado: ${ci.estado} → ${a.estado}`) } }
      if (a.costo != null && Number(a.costo) !== num(ci.costo)) { cambios.costo = Math.round(Number(a.costo)); vista.push(`Costo: ${plata(ci.costo, c.moneda)} → ${plata(cambios.costo, c.moneda)}`) }
      if (a.piezas != null && Number(a.piezas) !== num(ci.piezas)) { cambios.piezas = Number(a.piezas); vista.push(`Piezas: ${ci.piezas} → ${cambios.piezas}`) }
      if (a.video_link_tt) {
        let u = String(a.video_link_tt).trim()
        if (!esTikTok(u)) falla('video_link_tt no es un link de TikTok.')
        if (esMovilTikTok(u)) { const conv = await expandTikTok(u); if (conv && esEscritorioTikTok(conv)) u = conv; else vista.push('⚠ No se pudo convertir el link móvil de TikTok; se guarda tal cual.') }
        if (u !== (ci.video_link_tt || '')) { cambios.video_link_tt = u; vista.push(`TikTok: ${u}`) }
      }
      if (a.video_link_ig) {
        const u = cleanInstagram(a.video_link_ig)
        if (!/instagram\.com/i.test(u)) falla('video_link_ig no es un link de Instagram.')
        if (u !== (ci.video_link_ig || '')) { cambios.video_link_ig = u; vista.push(`Instagram: ${u}`) }
      }
      if (a.nota && String(a.nota).trim()) { cambios.nota = String(a.nota).trim().slice(0, 300); vista.push(`Nota: ${cambios.nota}`) }
      if (!Object.keys(cambios).length) falla('No hay cambios respecto de lo que ya está guardado.')
      return guardarPropuesta(db, { agente, tipo: 'actualizar_influencer', campana_id: c.id, resumen: `Actualizar a ${ci.nombre} en ${c.nombre}`, motivo: a.motivo, datos: { influencer_id: ci.influencer_id, nombre: ci.nombre, cambios, vista } })
    }

    case 'proponer_agregar_links': {
      const c = await campana(db, a.campana_id); abierta(c)
      if (!['Clipping', 'Nano Blast'].includes(c.tipo)) falla(`"${c.nombre}" es ${c.tipo || 'Influencer MKT'}: los links de influencers van con proponer_actualizar_influencer.`)
      const todos = extraerLinks(a.texto)
      if (!todos.length) falla('No encontré links en el texto.')
      if (todos.length > MAX_LINKS) falla(`Son ${todos.length} links; el máximo por propuesta es ${MAX_LINKS}. Divídelos.`)
      const tt = todos.filter(esTikTok), noTikTok = todos.length - tt.length
      const moviles = tt.filter(esMovilTikTok)
      if (moviles.length > MAX_CONVERTIR) falla(`Hay ${moviles.length} links móviles; el máximo por propuesta es ${MAX_CONVERTIR}. Divídelos.`)
      const conv = await convertir(moviles, expandTikTok)
      const mapa = new Map(moviles.map((m, k) => [m, conv[k]]))
      const existentes = await filas(db, `SELECT link_original, video_id FROM campaign_links WHERE campaign_id = $1`, [c.id])
      const vistosId = new Set(existentes.map(x => x.video_id).filter(Boolean)), vistosOrig = new Set(existentes.map(x => x.link_original))
      const nuevas = []; let repetidos = 0, sinConvertir = 0
      for (const orig of tt) {
        if (vistosOrig.has(orig)) { repetidos++; continue }
        const final = esMovilTikTok(orig) ? mapa.get(orig) : orig
        const url = final && esEscritorioTikTok(final) ? final.split('?')[0] : ''
        const { handle, video_id } = parseTikTok(url)
        if (video_id && vistosId.has(video_id)) { repetidos++; continue }
        if (video_id) vistosId.add(video_id)
        if (!url) sinConvertir++
        vistosOrig.add(orig)
        nuevas.push({ link_original: orig, url, handle, video_id })
      }
      if (!nuevas.length) falla(`No hay links nuevos (${repetidos} ya estaban cargados${noTikTok ? `, ${noTikTok} no eran de TikTok` : ''}).`)
      const vista = [`${nuevas.length} links nuevos (hoy hay ${existentes.length})`]
      if (repetidos) vista.push(`${repetidos} repetidos (no se duplican)`)
      if (sinConvertir) vista.push(`⚠ ${sinConvertir} no se pudieron convertir (quedarán en rojo en la campaña)`)
      if (noTikTok) vista.push(`${noTikTok} no eran de TikTok (se ignoran)`)
      const handles = [...new Set(nuevas.map(n => n.handle).filter(Boolean))]
      if (handles.length) vista.push(`Cuentas: ${handles.slice(0, 12).map(h => '@' + h).join(', ')}${handles.length > 12 ? '…' : ''}`)
      return guardarPropuesta(db, { agente, tipo: 'agregar_links', campana_id: c.id, resumen: `Cargar ${nuevas.length} links a ${c.nombre}`, motivo: a.motivo, datos: { filas: nuevas, vista } })
    }

    case 'proponer_cambiar_estado': {
      const c = await campana(db, a.campana_id)
      if (!['Activa', 'Pausada', 'Cerrada'].includes(a.estado)) falla('Estado inválido: Activa, Pausada o Cerrada.')
      if (c.estado === a.estado) falla(`"${c.nombre}" ya está ${a.estado}.`)
      if (['Cerrada', 'Cancelada'].includes(c.estado) && a.estado !== 'Activa') falla(`"${c.nombre}" está ${c.estado}.`)
      if (await pendienteIgual(db, 'cambiar_estado', c.id, () => true)) falla(`Ya hay un cambio de estado pendiente para "${c.nombre}".`)
      const etiqueta = a.estado === 'Cerrada' ? 'Finalizar' : a.estado === 'Pausada' ? 'Pausar' : 'Activar'
      return guardarPropuesta(db, { agente, tipo: 'cambiar_estado', campana_id: c.id, resumen: `${etiqueta} ${c.nombre} (${c.estado} → ${a.estado})`, motivo: a.motivo, datos: { estado: a.estado, anterior: c.estado, vista: [] } })
    }

    case 'ver_propuestas': {
      const ps = await filas(db, `SELECT id, created_at, agente, tipo, resumen, motivo, estado, resuelta_por, resuelta_el FROM propuestas_agentes ORDER BY created_at DESC LIMIT 30`)
      return { pendientes: ps.filter(p => p.estado === 'pendiente'), ultimas_resueltas: ps.filter(p => p.estado !== 'pendiente').slice(0, 10) }
    }

    default:
      falla(`Herramienta desconocida: ${nombre}`)
  }
}

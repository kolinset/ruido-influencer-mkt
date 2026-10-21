import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { obtenerMetricas } from './_metricas.js'
import { calcMetas, totalRestante, TOTAL_SEMANA } from '../src/lib/sbMetas.js'

// Resumen diario por mail: 3 datos de cada campaña activa + Social Boost de la semana.
// Lo ejecuta Vercel todas las mañanas (ver "crons" en vercel.json). No necesita ningún computador prendido.
// - Vercel lo llama con "Authorization: Bearer <CRON_SECRET>" y el resumen se envía por mail (Resend).
// - Desde Roster (con sesión) se puede ver con ?preview=1 o enviar al momento con ?enviar=1.
// Variables en Vercel: RESEND_API_KEY, RESUMEN_PARA (mails separados por coma), CRON_SECRET,
// y opcional RESUMEN_DE (remitente; por defecto el de prueba de Resend).

export const config = { maxDuration: 60 }

const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, max: 1 })
const supabaseAuth = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

const RETENCION_HONORARIOS = 0.1525
const IVA = 0.19
const MAX_MES_SB = 120
const calcCosto = (base, tipo) => {
  const b = Number(base) || 0
  if (tipo === 'honorarios') return Math.round(b / (1 - RETENCION_HONORARIOS))
  if (tipo === 'factura_iva') return Math.round(b * (1 + IVA))
  return b
}

// ───── Formato ─────
const fmt = n => {
  n = Number(n) || 0
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',').replace(',0', '') + 'M'
  if (n >= 1e4) return Math.round(n / 1e3) + 'K'
  return n.toLocaleString('es-CL')
}
const plata = (n, moneda) => (moneda === 'USD' ? 'US$' : '$') + Math.round(Number(n) || 0).toLocaleString(moneda === 'USD' ? 'en-US' : 'es-CL')
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const delta = d => d > 0 ? ` <span style="color:#2E7D32;font-weight:600">+${fmt(d)} desde ayer</span>` : ''

// Fecha de hoy en Chile (YYYY-MM-DD) y lunes de esta semana
function hoyChile() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(x => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}
function lunesDe(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  const f = new Date(Date.UTC(y, m - 1, d))
  f.setUTCDate(f.getUTCDate() - ((f.getUTCDay() + 6) % 7))
  return f.toISOString().slice(0, 10)
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  async function worker() { while (i < items.length) { const k = i++; out[k] = await fn(items[k]) } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

// Views de ayer (para "+X desde ayer") y se guarda la foto de hoy. Si la tabla no existe, sigue sin comparación.
async function historial(fecha, filas) {
  try {
    const prev = (await pool.query(`
      SELECT DISTINCT ON (tipo, ref_id) tipo, ref_id, views FROM metricas_diarias
      WHERE fecha < $1 ORDER BY tipo, ref_id, fecha DESC`, [fecha])).rows
    const ayer = Object.fromEntries(prev.map(r => [r.tipo + ':' + r.ref_id, Number(r.views) || 0]))
    for (const f of filas) {
      await pool.query(`INSERT INTO metricas_diarias (fecha, tipo, ref_id, views) VALUES ($1, $2, $3, $4)
        ON CONFLICT (fecha, tipo, ref_id) DO UPDATE SET views = EXCLUDED.views`, [fecha, f.tipo, f.id, f.views])
    }
    return ayer
  } catch (e) {
    console.error('resumen historial:', e.message)
    return {}
  }
}

// ───── Datos ─────
async function armarResumen() {
  const fecha = hoyChile()

  // Campañas activas
  const camps = (await pool.query(`
    SELECT c.id, c.nombre, coalesce(cl.nombre, c.cliente) AS cliente, c.tipo, c.moneda, c.es_legacy,
      c.budget, c.budget_total, c.utilizable_pct, c.contenidos_count, c.views_logradas, c.views_min, c.views_max,
      c.reporte_url_tt, c.reporte_url_ig
    FROM campaigns c LEFT JOIN clients cl ON cl.id = c.client_id
    WHERE c.estado = 'Activa' ORDER BY c.created_at DESC`)).rows
  const ids = camps.map(c => c.id)
  const cis = ids.length ? (await pool.query(`
    SELECT ci.campaign_id, ci.costo, ci.tipo_facturacion, ci.video_link_tt, ci.video_link_ig, ci.estado, i.nombre
    FROM campaign_influencers ci LEFT JOIN influencers i ON i.id = ci.influencer_id
    WHERE ci.campaign_id = ANY($1::uuid[])`, [ids])).rows : []
  const playlists = ids.length ? Object.fromEntries((await pool.query(`
    SELECT campaign_id, count(*)::int AS n FROM campaign_playlists WHERE campaign_id = ANY($1::uuid[]) GROUP BY 1`, [ids])).rows.map(r => [r.campaign_id, r.n])) : {}
  const metricas = await mapLimit(camps, 4, c => (c.tipo === 'Playlisting' ? null : obtenerMetricas(pool, { campaign_id: c.id }, { frescoMin: 60 }).catch(() => null)))

  // Social Boost: canciones de esta semana
  const inicio = lunesDe(fecha)
  const sem = (await pool.query('SELECT id, sin_prioridad FROM sb_semanas WHERE inicio = $1', [inicio])).rows[0]
  const slots = sem ? (await pool.query(`
    SELECT ss.slot, ss.prioridad, ss.objetivo, c.id AS cancion_id, c.cancion, c.artista,
      (SELECT count(*) FROM sb_videos v WHERE v.cancion_id = c.id AND v.semana_id = ss.semana_id)::int AS vids_sem,
      (SELECT count(*) FROM sb_videos v WHERE v.cancion_id = c.id)::int AS vids_mes
    FROM sb_semana_slots ss JOIN sb_canciones c ON c.id = ss.cancion_id
    WHERE ss.semana_id = $1 ORDER BY ss.slot`, [sem.id])).rows : []
  const mes = inicio.slice(0, 8) + '01'
  const vidsMes = (await pool.query('SELECT count(*)::int AS n FROM sb_videos v JOIN sb_canciones c ON c.id = v.cancion_id WHERE c.mes = $1', [mes])).rows[0].n
  const vidsSem = sem ? (await pool.query('SELECT count(*)::int AS n FROM sb_videos WHERE semana_id = $1', [sem.id])).rows[0].n : 0
  const huerfanos = Math.max(0, vidsSem - slots.reduce((a, s) => a + s.vids_sem, 0))
  const metas = calcMetas(slots, totalRestante(huerfanos), !!sem?.sin_prioridad)
  const metricasSB = await mapLimit(slots, 4, s => obtenerMetricas(pool, { cancion_id: s.cancion_id }, { frescoMin: 60 }).catch(() => null))

  // Comparación con ayer
  const ayer = await historial(fecha, [
    ...camps.map((c, k) => metricas[k]?.disponible ? { tipo: 'campana', id: c.id, views: metricas[k].total.views } : null),
    ...slots.map((s, k) => metricasSB[k]?.disponible ? { tipo: 'cancion', id: s.cancion_id, views: metricasSB[k].total.views } : null),
  ].filter(Boolean))

  const campanas = camps.map((c, k) => {
    const m = metricas[k]
    const views = m?.disponible ? m.total.views : null
    const dViews = views != null && ayer['campana:' + c.id] != null ? views - ayer['campana:' + c.id] : 0
    const infs = cis.filter(x => x.campaign_id === c.id)
    const datos = []
    const alertas = []
    if (c.tipo === 'Playlisting') {
      datos.push(['Playlists', String(playlists[c.id] || 0)])
      datos.push(['Budget', plata(c.budget_total || c.budget, c.moneda)])
    } else {
      datos.push(['Views', views != null ? fmt(views) + delta(dViews) : '<span style="color:#A19890">sin reporte de Tokchart</span>'])
      if (c.tipo === 'Clipping') {
        const meta = Number(c.views_max) || 0
        const pct = meta ? Math.round((views ?? Number(c.views_logradas) ?? 0) / meta * 100) : null
        datos.push(['Meta', pct != null ? `${pct}% de ${fmt(meta)}` : 'sin meta'])
        datos.push(['Videos', fmt(c.contenidos_count)])
        if (pct != null && pct >= 100) alertas.push('llegó a la meta de views 🎉')
      } else if (c.tipo === 'Nano Blast') {
        datos.push(['Contenidos', fmt(c.contenidos_count)])
        datos.push(['Engagement', m?.engagement != null ? m.engagement.toFixed(2).replace('.', ',') + '%' : '—'])
      } else {
        const publicados = infs.filter(x => (x.video_link_tt || '').trim() || (x.video_link_ig || '').trim()).length
        datos.push(['Publicados', `${publicados} de ${infs.length}`])
        const pctUtil = Number(c.utilizable_pct) || 100
        const utilizable = c.es_legacy ? Number(c.budget) || 0 : Math.round((Number(c.budget_total) || 0) * pctUtil / 100)
        const usado = infs.reduce((a, x) => a + calcCosto(x.costo, x.tipo_facturacion), 0)
        const pctUsado = utilizable > 0 ? Math.round(usado / utilizable * 100) : null
        datos.push(['Presupuesto', pctUsado != null ? `${pctUsado}% usado` : '—'])
        if (pctUsado != null && pctUsado > 100) alertas.push(`pasó el presupuesto (${pctUsado}%)`)
        if (infs.length && publicados === infs.length) alertas.push('todos los influencers publicaron ✓')
      }
    }
    if (m?.errores && Object.keys(m.errores).length) alertas.push('no se pudo leer su reporte de Tokchart')
    const publicadosN = infs.filter(x => (x.video_link_tt || '').trim() || (x.video_link_ig || '').trim()).length
    const pendientes = infs.filter(x => !(x.video_link_tt || '').trim() && !(x.video_link_ig || '').trim() && !['Contactado', 'Negociando'].includes(x.estado)).map(x => x.nombre).filter(Boolean)
    const posts = m?.disponible ? Object.values(m.plataformas).flatMap(p => p.posts || []) : []
    const pctUtil = Number(c.utilizable_pct) || 100
    const utilizable = c.es_legacy ? Number(c.budget) || 0 : Math.round((Number(c.budget_total) || 0) * pctUtil / 100)
    const usado = infs.reduce((a, x) => a + calcCosto(x.costo, x.tipo_facturacion), 0)
    const texto = analizarCampana({
      tipo: c.tipo, views, dViews, tieneAyer: ayer['campana:' + c.id] != null, posts, pendientes,
      publicados: publicadosN, total: infs.length, pctUsado: utilizable > 0 ? Math.round(usado / utilizable * 100) : null,
      meta: Number(c.views_max) || 0, contenidos: Number(c.contenidos_count) || 0, playlists: playlists[c.id] || 0,
      engagement: m?.engagement, sinLeer: !!(m?.errores && Object.keys(m.errores).length),
    })
    return { nombre: c.nombre, cliente: c.cliente, tipo: c.tipo, datos, alertas, texto, views, dViews, viral: texto.viral, pendientes: pendientes.length }
  })

  const canciones = slots
    .slice().sort((a, b) => (sem?.sin_prioridad ? 0 : (a.prioridad ?? 99) - (b.prioridad ?? 99)) || a.slot - b.slot)
    .map(s => {
      const k = slots.indexOf(s)
      const m = metricasSB[k]
      const meta = metas[s.cancion_id]?.meta ?? 0
      const views = m?.disponible ? m.total.views : null
      const dViews = views != null && ayer['cancion:' + s.cancion_id] != null ? views - ayer['cancion:' + s.cancion_id] : 0
      return {
        nombre: s.cancion, artista: s.artista, prioridad: sem?.sin_prioridad ? null : s.prioridad,
        datos: [
          ['Semana', `${s.vids_sem} de ${meta} videos`],
          ['Mes', `${s.vids_mes} videos`],
          ['Views', views != null ? fmt(views) + delta(dViews) : '<span style="color:#A19890">sin reporte todavía</span>'],
        ],
        falta: Math.max(0, meta - s.vids_sem),
        texto: analizarCancion({ vidsSem: s.vids_sem, meta, vidsMes: s.vids_mes, views, dViews, tieneAyer: ayer['cancion:' + s.cancion_id] != null, posts: m?.disponible ? (m.plataformas.tiktok?.posts || []) : [] }),
        views, dViews,
      }
    })

  const sb = { inicio, canciones, vidsMes, vidsSem, maxMes: MAX_MES_SB, totalSemana: TOTAL_SEMANA }
  return { fecha, campanas, sb, intro: introDelDia(campanas, sb) }
}

// ───── Análisis en palabras (para leer rápido desde el teléfono) ─────
const lista = nombres => nombres.length <= 1 ? (nombres[0] || '') : nombres.length <= 4
  ? nombres.slice(0, -1).join(', ') + ' y ' + nombres.at(-1)
  : nombres.slice(0, 3).join(', ') + ` y ${nombres.length - 3} más`

// Un video "se fue viral" si tiene 100K+ views y al menos 3 veces el promedio de los otros, o 500K+ views
function buscarViral(posts) {
  const ord = [...posts].filter(p => p.views).sort((a, b) => b.views - a.views)
  if (!ord.length) return null
  const top = ord[0]
  const resto = ord.slice(1)
  const promResto = resto.length ? resto.reduce((a, p) => a + p.views, 0) / resto.length : 0
  if (top.views >= 500000 || (top.views >= 100000 && (!resto.length || top.views >= 3 * promResto))) return top
  return null
}
const quien = p => p?.handle ? '@' + p.handle : 'un video'

function analizarCampana(d) {
  const frases = []
  const viral = buscarViral(d.posts)
  if (d.tipo === 'Playlisting') {
    return { html: esc(`Tiene ${d.playlists} playlist${d.playlists === 1 ? '' : 's'} cargada${d.playlists === 1 ? '' : 's'}.`), viral: null }
  }
  // Cómo va
  if (d.views == null) {
    frases.push(d.sinLeer ? 'No pude leer su reporte de Tokchart hoy, así que no tengo las views.' : 'Todavía no tiene reporte de Tokchart, así que no hay views para mostrar.')
  } else if (d.tipo === 'Clipping' && d.meta) {
    const pct = Math.round(d.views / d.meta * 100)
    if (pct >= 100) frases.push(`¡Ya cumplimos la meta! Va en <b>${fmt(d.views)} views</b>, el ${pct}% de los ${fmt(d.meta)} prometidos 🎉`)
    else {
      frases.push(`Va en <b>${fmt(d.views)} views</b>, el ${pct}% de la meta de ${fmt(d.meta)}${d.dViews > 0 ? ` (+${fmt(d.dViews)} desde ayer)` : ''}.`)
      if (d.dViews > 0) {
        const dias = Math.ceil((d.meta - d.views) / d.dViews)
        frases.push(dias <= 60 ? `A este ritmo llegaría a la meta en unos ${dias} día${dias === 1 ? '' : 's'}.` : 'A este ritmo todavía le falta harto para la meta.')
      } else if (d.tieneAyer) frases.push('Ayer no sumó views, ojo con el ritmo.')
    }
  } else {
    const creciendo = d.dViews > 0 && d.views - d.dViews > 0 && d.dViews / (d.views - d.dViews) >= 0.2
    if (creciendo) frases.push(`Viene creciendo fuerte: suma <b>${fmt(d.views)} views</b> (+${fmt(d.dViews)} desde ayer).`)
    else if (d.dViews > 0) frases.push(`Va bien, suma <b>${fmt(d.views)} views</b> (+${fmt(d.dViews)} desde ayer).`)
    else if (d.tieneAyer) frases.push(`Lleva <b>${fmt(d.views)} views</b>; desde ayer casi no se movió.`)
    else frases.push(`Lleva <b>${fmt(d.views)} views</b> en total.`)
  }
  // Lo más destacado
  if (viral) frases.push(`¡Tuvimos un video que se fue viral! ${esc(quien(viral))} ya va en <b>${fmt(viral.views)} views</b> 🔥`)
  else if (d.posts.length >= 2) {
    const top = [...d.posts].sort((a, b) => (b.views || 0) - (a.views || 0))[0]
    if (top?.views) frases.push(`El que mejor va es ${esc(quien(top))} con ${fmt(top.views)} views.`)
  }
  // Qué falta
  if (d.tipo !== 'Clipping' && d.tipo !== 'Nano Blast' && d.total > 0) {
    if (d.pendientes.length) frases.push(`Falta que suban su contenido: <b>${esc(lista(d.pendientes))}</b>.`)
    else if (d.publicados === d.total) frases.push('Todas las creadoras ya publicaron ✓')
  }
  if (d.tipo === 'Nano Blast' && d.contenidos) frases.push(`Lleva ${fmt(d.contenidos)} contenidos publicados.`)
  if (d.pctUsado != null && d.pctUsado > 100) frases.push(`Ojo: el presupuesto ya se pasó (${d.pctUsado}%).`)
  else if (d.pctUsado != null && d.pctUsado >= 90 && d.tipo !== 'Clipping' && d.tipo !== 'Nano Blast') frases.push(`El presupuesto está casi completo (${d.pctUsado}%).`)
  return { html: frases.join(' '), viral }
}

function analizarCancion(d) {
  const frases = []
  if (d.meta > 0 && d.vidsSem >= d.meta) frases.push(`¡Ya cumplió la meta de la semana! Lleva <b>${d.vidsSem} videos</b>.`)
  else if (d.meta > 0) frases.push(`Lleva <b>${d.vidsSem} de ${d.meta} videos</b> esta semana; faltan ${d.meta - d.vidsSem}.`)
  else frases.push(`Lleva ${d.vidsSem} videos esta semana.`)
  if (d.views != null) frases.push(`Suma ${fmt(d.views)} views${d.dViews > 0 ? ` (+${fmt(d.dViews)} desde ayer)` : ''}.`)
  const viral = buscarViral(d.posts)
  if (viral) frases.push(`¡Un video se fue viral! ${esc(quien(viral))} va en <b>${fmt(viral.views)} views</b> 🔥`)
  else if (d.posts.length >= 2) {
    const top = [...d.posts].sort((a, b) => (b.views || 0) - (a.views || 0))[0]
    if (top?.views) frases.push(`El mejor video es de ${esc(quien(top))} con ${fmt(top.views)} views.`)
  }
  return { html: frases.join(' '), viral }
}

function introDelDia(campanas, sb) {
  const frases = []
  const conViews = campanas.filter(c => c.views != null)
  const total = conViews.reduce((a, c) => a + c.views, 0)
  const dTotal = conViews.reduce((a, c) => a + (c.dViews > 0 ? c.dViews : 0), 0)
  if (!campanas.length) frases.push('Hoy no hay campañas activas.')
  else frases.push(`Hoy tienes <b>${campanas.length} campaña${campanas.length === 1 ? '' : 's'} activa${campanas.length === 1 ? '' : 's'}</b>${conViews.length ? ` que suman <b>${fmt(total)} views</b>${dTotal > 0 ? ` (+${fmt(dTotal)} desde ayer)` : ''}` : ''}.`)
  const virales = [...campanas.filter(c => c.viral).map(c => c.nombre), ...sb.canciones.filter(s => s.texto.viral).map(s => s.nombre)]
  if (virales.length) frases.push(`🔥 Hay ${virales.length === 1 ? 'un video viral' : virales.length + ' videos virales'} en ${esc(lista(virales))}.`)
  const mejor = [...conViews].filter(c => c.dViews > 0).sort((a, b) => b.dViews - a.dViews)[0]
  if (mejor) frases.push(`La que más creció fue <b>${esc(mejor.nombre)}</b> (+${fmt(mejor.dViews)}).`)
  const conPendientes = campanas.filter(c => c.pendientes > 0)
  if (conPendientes.length) {
    const n = conPendientes.reduce((a, c) => a + c.pendientes, 0)
    frases.push(`Para hoy: faltan <b>${n} creador${n === 1 ? '' : 'es'}</b> por publicar en ${conPendientes.length} campaña${conPendientes.length === 1 ? '' : 's'}.`)
  }
  if (sb.canciones.length) {
    const atrasadas = sb.canciones.filter(s => s.falta > 0).length
    frases.push(`En Social Boost van <b>${sb.vidsSem} de ${sb.totalSemana} videos</b> de la semana${atrasadas ? ` y ${atrasadas} canci${atrasadas === 1 ? 'ón' : 'ones'} todavía no llega${atrasadas === 1 ? '' : 'n'} a su meta` : ', todas con su meta cumplida ✓'}.`)
  }
  return frases.join(' ')
}

// ───── Mail ─────
function fechaLarga(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
}

function htmlResumen(r, appUrl) {
  const parrafo = (titulo, sub, texto) => `
    <tr><td style="padding:0 0 12px">
      <div style="font-size:15px;font-weight:600;color:#0E0F12">${esc(titulo)}<span style="font-size:12px;font-weight:400;color:#A19890"> · ${esc(sub)}</span></div>
      <div style="font-size:14.5px;line-height:1.55;color:#3A3330;margin-top:3px">${texto}</div>
    </td></tr>`
  const tarjeta = (titulo, sub, datos, extra = '') => `
    <tr><td style="padding:0 0 10px">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #EFE8DF;border-radius:14px">
        <tr><td style="padding:14px 16px 6px">
          <div style="font-size:15px;font-weight:600;color:#0E0F12">${titulo}</div>
          <div style="font-size:12px;color:#A19890;margin-top:2px">${sub}</div>
        </td></tr>
        <tr><td style="padding:6px 16px 12px">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            ${datos.map(([l, v]) => `<td valign="top" style="padding:4px 8px 4px 0;width:${Math.floor(100 / datos.length)}%">
              <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#A19890">${l}</div>
              <div style="font-size:14px;font-weight:600;color:#0E0F12;margin-top:2px">${v}</div></td>`).join('')}
          </tr></table>
          ${extra}
        </td></tr>
      </table>
    </td></tr>`

  const campanas = r.campanas.length
    ? r.campanas.map(c => tarjeta(esc(c.nombre), esc([c.cliente, c.tipo].filter(Boolean).join(' · ')), c.datos,
        c.alertas.length ? `<div style="font-size:12px;color:#8A2E0C;margin-top:6px">⚑ ${c.alertas.map(esc).join(' · ')}</div>` : '')).join('')
    : `<tr><td style="padding:14px 0;color:#A19890;font-size:13px">No hay campañas activas.</td></tr>`

  const sb = r.sb.canciones.length
    ? r.sb.canciones.map(s => tarjeta(`${s.prioridad ? `<span style="font-size:10px;color:#fff;background:#C4501A;border-radius:5px;padding:1px 6px;margin-right:6px">P${s.prioridad}</span>` : ''}${esc(s.nombre)}`,
        esc(s.artista || ''), s.datos,
        s.falta ? `<div style="font-size:12px;color:#8A2E0C;margin-top:6px">Faltan ${s.falta} videos para la meta de la semana</div>` : `<div style="font-size:12px;color:#2E7D32;margin-top:6px">Meta de la semana cumplida ✓</div>`)).join('')
    : `<tr><td style="padding:14px 0;color:#A19890;font-size:13px">Todavía no hay canciones cargadas esta semana.</td></tr>`

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:0;background:#FAF7F2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF7F2"><tr><td align="center" style="padding:24px 12px">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
      <tr><td style="padding:0 0 18px">
        <img src="${appUrl}/logo-kolinset-dark.png" alt="KOLINSET" height="20" style="display:block;height:20px;border:0">
        <div style="font-size:22px;font-weight:700;color:#0E0F12;margin-top:14px;letter-spacing:-.02em">Resumen del día</div>
        <div style="font-size:13px;color:#A19890;margin-top:2px">${fechaLarga(r.fecha).replace(/^./, c => c.toUpperCase())}</div>
      </td></tr>

      <tr><td style="padding:0 0 18px">
        <div style="background:#0E0F12;border-radius:16px;padding:18px 18px;color:#F4E6D6;font-size:15px;line-height:1.55">
          <div style="font-size:13px;color:#E58A3E;font-weight:600;margin-bottom:6px">Buenos días ☀️</div>
          ${r.intro}
        </div>
      </td></tr>

      <tr><td style="padding:6px 0 10px;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#C4501A">Cómo van las campañas</td></tr>
      ${r.campanas.length ? r.campanas.map(c => parrafo(c.nombre, [c.cliente, c.tipo].filter(Boolean).join(' · '), c.texto.html)).join('') : `<tr><td style="padding:0 0 10px;color:#A19890;font-size:13px">No hay campañas activas.</td></tr>`}

      ${r.sb.canciones.length ? `<tr><td style="padding:14px 0 10px;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#C4501A">Social Boost</td></tr>
      ${r.sb.canciones.map(s => parrafo(s.nombre, s.artista || '', s.texto.html)).join('')}` : ''}

      <tr><td style="padding:22px 0 8px"><div style="border-top:1px solid #E8DFD4"></div></td></tr>
      <tr><td style="padding:6px 0 10px;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#A19890">El detalle · campañas activas (${r.campanas.length})</td></tr>
      ${campanas}

      <tr><td style="padding:16px 0 10px;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#A19890">El detalle · Social Boost de la semana</td></tr>
      <tr><td style="padding:0 0 10px;font-size:13px;color:#625A54">${r.sb.vidsSem} de ${r.sb.totalSemana} videos esta semana · ${r.sb.vidsMes} de ${r.sb.maxMes} en el mes</td></tr>
      ${sb}

      <tr><td style="padding:18px 0 0;font-size:12px;color:#A19890;text-align:center">
        <a href="${appUrl}" style="color:#C4501A;text-decoration:none;font-weight:600">Abrir Roster →</a><br><br>
        Resumen automático de Roster · Kolinset
      </td></tr>
    </table>
  </td></tr></table></body></html>`
}

async function enviarMail(html, fecha) {
  const para = (process.env.RESUMEN_PARA || '').split(',').map(s => s.trim()).filter(Boolean)
  if (!process.env.RESEND_API_KEY) throw new Error('Falta configurar RESEND_API_KEY en Vercel.')
  if (!para.length) throw new Error('Falta configurar RESUMEN_PARA (a quién se envía) en Vercel.')
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.RESUMEN_DE || 'Roster Kolinset <onboarding@resend.dev>',
      to: para,
      subject: `Resumen del día · ${fechaLarga(fecha)}`,
      html,
    }),
    signal: AbortSignal.timeout(15000),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.message || `Resend respondió ${r.status}`)
  return { enviadoA: para, id: j.id }
}

async function esAdmin(req) {
  const h = req.headers.authorization || ''
  if (!h.startsWith('Bearer ')) return false
  const { data, error } = await supabaseAuth.auth.getUser(h.slice(7))
  return !error && !!data?.user
}

export default async function handler(req, res) {
  const auth = req.headers.authorization || ''
  const esCron = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
  const preview = req.query?.preview === '1'
  const enviarAhora = req.query?.enviar === '1'
  if (!esCron && !(await esAdmin(req))) return res.status(401).json({ error: 'No autorizado' })

  try {
    const appUrl = `https://${req.headers['x-forwarded-host'] || req.headers.host}`
    const resumen = await armarResumen()
    const html = htmlResumen(resumen, appUrl)
    if (preview && !esCron) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      return res.status(200).send(html)
    }
    if (!esCron && !enviarAhora) return res.status(400).json({ error: 'Usá ?preview=1 para verlo o ?enviar=1 para enviarlo' })
    const r = await enviarMail(html, resumen.fecha)
    return res.status(200).json({ ok: true, ...r, campanas: resumen.campanas.length, canciones: resumen.sb.canciones.length })
  } catch (e) {
    console.error('resumen-diario error:', e.message)
    return res.status(500).json({ error: e.message })
  }
}

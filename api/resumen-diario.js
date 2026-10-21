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
    SELECT campaign_id, costo, tipo_facturacion, video_link_tt, video_link_ig FROM campaign_influencers WHERE campaign_id = ANY($1::uuid[])`, [ids])).rows : []
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
    return { nombre: c.nombre, cliente: c.cliente, tipo: c.tipo, datos, alertas }
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
      }
    })

  return { fecha, campanas, sb: { inicio, canciones, vidsMes, vidsSem, maxMes: MAX_MES_SB, totalSemana: TOTAL_SEMANA } }
}

// ───── Mail ─────
function fechaLarga(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
}

function htmlResumen(r, appUrl) {
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

      <tr><td style="padding:6px 0 10px;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#C4501A">Campañas activas · ${r.campanas.length}</td></tr>
      ${campanas}

      <tr><td style="padding:16px 0 10px;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#C4501A">Social Boost · esta semana</td></tr>
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

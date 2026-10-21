import pg from 'pg'
import { sesionValida } from './_sesion.js'

// Datos del Dashboard en UN solo pedido y con las cuentas ya hechas en la base
// (antes se bajaban todas las campañas e influencers para sumar en el navegador).

const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, max: 1 })

// Costo final con recargo: boleta (retención 15,25%) o factura (IVA 19%)
const COSTO_FINAL = `CASE ci.tipo_facturacion WHEN 'honorarios' THEN round(ci.costo / (1 - 0.1525)) WHEN 'factura_iva' THEN round(ci.costo * 1.19) ELSE ci.costo END`

export default async function handler(req, res) {
  if (!(await sesionValida(req))) return res.status(401).json({ error: 'Sesión inválida o expirada. Iniciá sesión de nuevo.' })
  try {
    const q = (text, params) => pool.query(text, params).then(r => r.rows)
    const [infs, top, camps, campsMes, pagos] = await Promise.all([
      q(`SELECT count(*)::int AS total, count(*) FILTER (WHERE estado = 'Activo')::int AS activos, coalesce(sum(tt_seguidores), 0)::bigint AS seg_tt FROM influencers`),
      q(`SELECT id, nombre, ig_seguidores, tt_seguidores FROM influencers ORDER BY tt_seguidores DESC NULLS LAST LIMIT 8`),
      q(`SELECT count(*)::int AS total, coalesce(sum(budget), 0)::bigint AS budget FROM campaigns`),
      q(`SELECT c.id, c.nombre, c.cliente, c.estado, c.budget, c.moneda, coalesce(sum(${COSTO_FINAL}), 0)::bigint AS usado
         FROM campaigns c LEFT JOIN campaign_influencers ci ON ci.campaign_id = c.id
         WHERE date_trunc('month', c.created_at AT TIME ZONE 'America/Santiago') = date_trunc('month', now() AT TIME ZONE 'America/Santiago')
         GROUP BY c.id ORDER BY c.created_at DESC`),
      q(`SELECT count(DISTINCT ci.influencer_id)::int AS influencers, coalesce(sum(${COSTO_FINAL}), 0)::bigint AS total
         FROM campaign_influencers ci JOIN campaigns c ON c.id = ci.campaign_id
         WHERE ci.estado_pago != 'Pagado' AND ci.costo > 0 AND c.estado IN ('Activa', 'Cerrada')`),
    ])
    return res.status(200).json({
      totalInfluencers: infs[0].total, activos: infs[0].activos, totalSegTT: Number(infs[0].seg_tt),
      topInfs: top,
      totalCampanas: camps[0].total, budgetTotal: Number(camps[0].budget),
      campsMes: campsMes.map(c => ({ ...c, usado: Number(c.usado) })),
      countPendientes: pagos[0].influencers, totalPendiente: Number(pagos[0].total),
    })
  } catch (e) {
    console.error('dashboard error:', e.message)
    return res.status(500).json({ error: e.message })
  }
}

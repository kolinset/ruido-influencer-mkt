import { useState } from 'react'
import sql from '../lib/db'
import Modal from './Modal'

const ESTADOS_PAGO = ['Pendiente', 'Boleta recibida', 'Pagado']

const ESTADO_PAGO_COLORS = {
  Pendiente:         { bg: '#F1EFE8', color: '#5F5E5A' },
  'Boleta recibida': { bg: '#FAEEDA', color: '#633806' },
  Pagado:            { bg: '#EAF3DE', color: '#27500A' },
}

const AV_COLORS = [
  { bg: '#F4D3AE', color: '#8A2E0C' },
  { bg: '#F6DCC4', color: '#3A1608' },
  { bg: '#F9C99A', color: '#8A2E0C' },
  { bg: '#EFD9C8', color: '#C4501A' },
  { bg: '#F2C3A0', color: '#3A1608' },
  { bg: '#FBE6CF', color: '#C4501A' },
  { bg: '#E9C6A8', color: '#3A1608' },
  { bg: '#F7D9B8', color: '#8A2E0C' },
]

// ─── Constantes centralizadas ───
const RETENCION_HONORARIOS = 0.1525
const IVA = 0.19

function calcCosto(base, tipo) {
  const b = Number(base) || 0
  if (tipo === 'honorarios')  return Math.round(b / (1 - RETENCION_HONORARIOS))
  if (tipo === 'factura_iva') return Math.round(b * (1 + IVA))
  return b
}

function facturacionLabel(tipo) {
  if (tipo === 'honorarios')  return 'Boleta'
  if (tipo === 'factura_iva') return 'Factura IVA'
  return null
}

function fmtMoney(n, moneda) {
  n = Math.round(Number(n))
  if (moneda === 'USD') return '$' + n.toLocaleString('en-US')
  return '$' + n.toLocaleString('es-CL')
}

function Avatar({ nombre, index, size = 30 }) {
  const c = AV_COLORS[index % AV_COLORS.length]
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: c.bg, color: c.color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 500, flexShrink: 0,
      border: '0.5px solid rgba(0,0,0,0.06)',
    }}>{nombre?.[0]?.toUpperCase()}</div>
  )
}

export default function Pagos({ camp, onUpdate }) {
  const [editModal, setEditModal] = useState(false)
  const [editInf, setEditInf] = useState(null)
  const [editForm, setEditForm] = useState({ estado_pago: 'Pendiente', link_boleta: '' })
  const [saving, setSaving] = useState(false)

  const moneda = camp.moneda || 'CLP'
  const influencers = camp.influencers || []

  // Totales usando costo final (con recargos)
  const totalCosto = influencers.reduce((s, i) => s + calcCosto(i.costo, i.tipo_facturacion), 0)
  const totalPagado = influencers
    .filter(i => i.estado_pago === 'Pagado')
    .reduce((s, i) => s + calcCosto(i.costo, i.tipo_facturacion), 0)
  const totalPendiente = totalCosto - totalPagado
  const countPagado = influencers.filter(i => i.estado_pago === 'Pagado').length
  const countBoleta = influencers.filter(i => i.estado_pago === 'Boleta recibida').length
  const countPendiente = influencers.filter(i => !i.estado_pago || i.estado_pago === 'Pendiente').length

  function openEdit(inf) {
    setEditInf(inf)
    setEditForm({
      estado_pago: inf.estado_pago || 'Pendiente',
      link_boleta: inf.link_boleta || '',
    })
    setEditModal(true)
  }

  async function savePago() {
    setSaving(true)
    try {
      await sql`
        UPDATE campaign_influencers SET
          estado_pago = ${editForm.estado_pago},
          link_boleta = ${editForm.link_boleta}
        WHERE id = ${editInf.ci_id}
      `
      setEditModal(false)
      onUpdate()
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  return (
    <div>
      {/* Resumen de pagos */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
        background: '#F7F7F5', borderRadius: 12, padding: '14px 16px', marginBottom: 20,
        border: '0.5px solid #E5E5E2',
      }}>
        <div>
          <div style={{ fontSize: 10.5, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>Total a pagar</div>
          <div style={{ fontSize: 20, fontWeight: 500 }}>{fmtMoney(totalCosto, moneda)}</div>
          <div style={{ fontSize: 11, color: '#AAA', marginTop: 2 }}>{influencers.length} influencers</div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>Pagado</div>
          <div style={{ fontSize: 20, fontWeight: 500, color: '#3B6D11' }}>{fmtMoney(totalPagado, moneda)}</div>
          <div style={{ fontSize: 11, color: '#AAA', marginTop: 2 }}>{countPagado} influencers</div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>Pendiente</div>
          <div style={{ fontSize: 20, fontWeight: 500, color: '#A32D2D' }}>{fmtMoney(totalPendiente, moneda)}</div>
          <div style={{ fontSize: 11, color: '#AAA', marginTop: 2 }}>{countPendiente + countBoleta} influencers</div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>Boletas recibidas</div>
          <div style={{ fontSize: 20, fontWeight: 500, color: '#633806' }}>{countBoleta}</div>
          <div style={{ fontSize: 11, color: '#AAA', marginTop: 2 }}>por procesar</div>
        </div>
      </div>

      {/* Barra de progreso */}
      <div style={{ marginBottom: 20 }}>
        {(() => {
          const pct = totalCosto > 0 ? Math.round((totalPagado / totalCosto) * 100) : 0
          return (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: '#888' }}>
                <span>{pct}% pagado</span>
                <span>{fmtMoney(totalPagado, moneda)} / {fmtMoney(totalCosto, moneda)}</span>
              </div>
              <div style={{ height: 6, background: '#E5E5E2', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: pct + '%', background: '#639922', borderRadius: 3, transition: 'width .3s' }} />
              </div>
            </div>
          )
        })()}
      </div>

      {/* Tabla */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {influencers.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#AAA', fontSize: 13 }}>
            No hay influencers en esta campaña.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ background: '#F7F7F5', borderBottom: '0.5px solid #E5E5E2' }}>
                  <th className="th" style={{ width: 200 }}>Influencer</th>
                  <th className="th" style={{ width: 130 }}>Costo</th>
                  <th className="th" style={{ width: 100 }}>Tipo</th>
                  <th className="th" style={{ width: 140 }}>Estado pago</th>
                  <th className="th" style={{ width: 120 }}>Boleta</th>
                  <th className="th" style={{ width: 70 }}></th>
                </tr>
              </thead>
              <tbody>
                {influencers.map((inf, i) => {
                  const estadoPago = inf.estado_pago || 'Pendiente'
                  const ec = ESTADO_PAGO_COLORS[estadoPago] || ESTADO_PAGO_COLORS['Pendiente']
                  const costoFinal = calcCosto(inf.costo, inf.tipo_facturacion)
                  const tipoLabel = facturacionLabel(inf.tipo_facturacion)
                  return (
                    <tr key={inf.ci_id} style={{ borderBottom: '0.5px solid #F0F0EE' }}>
                      <td className="td">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <Avatar nombre={inf.nombre} index={i} />
                          <div>
                            <div style={{ fontWeight: 500, fontSize: 13 }}>{inf.nombre}</div>
                            <div style={{ fontSize: 11, color: '#AAA' }}>{inf.tt_usuario || inf.ig_usuario}</div>
                          </div>
                        </div>
                      </td>
                      <td className="td">
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{fmtMoney(costoFinal, moneda)}</div>
                        {tipoLabel && (
                          <div style={{ fontSize: 10.5, color: '#AAA', marginTop: 1 }}>base {fmtMoney(inf.costo, moneda)}</div>
                        )}
                      </td>
                      <td className="td">
                        {tipoLabel
                          ? <span style={{ fontSize: 11, background: '#F7F7F5', border: '0.5px solid #E5E5E2', padding: '2px 8px', borderRadius: 20, color: '#555' }}>{tipoLabel}</span>
                          : <span style={{ fontSize: 11, color: '#CCC' }}>—</span>
                        }
                      </td>
                      <td className="td">
                        <span style={{ background: ec.bg, color: ec.color, padding: '3px 10px', borderRadius: 20, fontSize: 11 }}>
                          {estadoPago}
                        </span>
                      </td>
                      <td className="td">
                        {inf.link_boleta ? (
                          <a href={inf.link_boleta} target="_blank" rel="noopener noreferrer"
                            style={{ color: '#C4501A', fontSize: 12.5, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
                            onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                            onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                          >Ver boleta ↗</a>
                        ) : (
                          <span style={{ color: '#CCC', fontSize: 12 }}>—</span>
                        )}
                      </td>
                      <td className="td">
                        <button className="btn-icon" onClick={() => openEdit(inf)} title="Editar pago">✎</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal editar pago */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title={`Pago — ${editInf?.nombre}`}>
        {editInf && (
          <div style={{ background: '#F7F7F5', border: '0.5px solid #E5E5E2', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
            {editInf.tipo_facturacion && editInf.tipo_facturacion !== 'sin_recargo' ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#888', marginBottom: 3 }}>
                  <span>Costo base</span><span>{fmtMoney(editInf.costo, moneda)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#888', marginBottom: 3 }}>
                  <span>{editInf.tipo_facturacion === 'honorarios' ? `Retención (${(RETENCION_HONORARIOS * 100).toFixed(2)}%)` : `IVA (${(IVA * 100).toFixed(0)}%)`}</span>
                  <span>+{fmtMoney(calcCosto(editInf.costo, editInf.tipo_facturacion) - Number(editInf.costo), moneda)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: '#1A1A1A', borderTop: '0.5px solid #E5E5E2', paddingTop: 6, marginTop: 2 }}>
                  <span>Total a pagar</span><span>{fmtMoney(calcCosto(editInf.costo, editInf.tipo_facturacion), moneda)}</span>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>
                <span>Total a pagar</span><span>{fmtMoney(editInf.costo, moneda)}</span>
              </div>
            )}
          </div>
        )}
        <div className="fg">
          <label className="label">Estado de pago</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {ESTADOS_PAGO.map(e => {
              const isActive = editForm.estado_pago === e
              const c = ESTADO_PAGO_COLORS[e]
              return (
                <div key={e} onClick={() => setEditForm(f => ({ ...f, estado_pago: e }))}
                  style={{
                    padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
                    fontSize: 12.5, userSelect: 'none', transition: 'all .12s',
                    background: isActive ? c.bg : '#F7F7F5',
                    color: isActive ? c.color : '#888',
                    border: `0.5px solid ${isActive ? c.color + '55' : '#E5E5E2'}`,
                    fontWeight: isActive ? 500 : 400,
                  }}
                >
                  {isActive ? '✓ ' : ''}{e}
                </div>
              )
            })}
          </div>
        </div>
        <div className="fg">
          <label className="label">Link de boleta (Google Drive, Dropbox, etc.)</label>
          <input className="input" value={editForm.link_boleta}
            onChange={e => setEditForm(f => ({ ...f, link_boleta: e.target.value }))}
            placeholder="https://drive.google.com/..." />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button className="btn-ghost" onClick={() => setEditModal(false)}>Cancelar</button>
          <button className="btn-red" onClick={savePago} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

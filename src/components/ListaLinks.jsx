// Lista de videos (solo lectura) para la propuesta y el portal del cliente: Clipping y Nano Blast.
export default function ListaLinks({ links, isMobile }) {
  if (!links?.length) return null
  const copiar = () => {
    const lista = links.map(l => l.url || l.link_original)
    navigator.clipboard.writeText(lista.join('\n')).then(() => alert(`${lista.length} links copiados`)).catch(() => prompt('Copiá:', lista.join('\n')))
  }
  return (
    <div style={{ background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: isMobile ? '12px 14px' : '14px 18px', borderBottom: '0.5px solid #F0F0EE' }}>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>Videos publicados <span style={{ color: '#AAA', fontWeight: 400 }}>· {links.length}</span></div>
        <button className="btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={copiar}>Copiar links</button>
      </div>
      <div style={{ maxHeight: 520, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {links.map((l, i) => (
              <tr key={i} style={{ borderBottom: i < links.length - 1 ? '0.5px solid #F0F0EE' : 'none' }}>
                <td style={{ padding: isMobile ? '10px 14px' : '11px 18px', width: 48, fontSize: 12, color: '#AAA' }}>{i + 1}</td>
                <td style={{ padding: isMobile ? '10px 8px' : '11px 8px', fontSize: 13, fontWeight: 500 }}>{l.handle ? '@' + l.handle : '—'}</td>
                <td style={{ padding: isMobile ? '10px 14px' : '11px 18px', textAlign: 'right' }}>
                  <a href={l.url || l.link_original} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#C4501A', textDecoration: 'none', fontWeight: 500 }}>Ver video ↗</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Logo de Kolinset (PNG sin fondo en /public). `dark` = versión oscura para fondos claros.
export default function Logo({ height = 18, dark = false, style }) {
  return (
    <img
      src={dark ? '/logo-kolinset-dark.png' : '/logo-kolinset-white.png'}
      alt="Kolinset"
      style={{ height, width: 'auto', display: 'block', ...style }}
    />
  )
}

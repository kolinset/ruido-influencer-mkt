// Actualiza los seguidores del Roster con los que trae Tokchart en los reportes de campañas y de Social Boost.
// TikTok e Instagram no dejan leer los perfiles directo, pero cada reporte de Tokchart trae los seguidores
// de cada creador que subió un video (se toma el dato más reciente de cada usuario).

// Usuario limpio ("@Sofia", "sofia", "https://www.tiktok.com/@sofia?lang=es" → "sofia")
export function usuarioDe(usuario, link, red) {
  const deLink = l => {
    const m = String(l || '').match(red === 'tiktok' ? /tiktok\.com\/@([^/?#\s]+)/i : /instagram\.com\/([^/?#\s]+)/i)
    return m && !['reel', 'reels', 'p', 'tv', 'stories'].includes(m[1].toLowerCase()) ? m[1] : ''
  }
  const u = String(usuario || '').trim()
  const limpio = (/^https?:\/\//i.test(u) ? deLink(u) : u).replace(/^@+/, '').trim().toLowerCase()
  return limpio || deLink(link).replace(/^@+/, '').toLowerCase()
}

// Cambios a guardar. `datos`: [{ plataforma, handle, followers, fetched_at }] (el más reciente por usuario).
// Solo se cambia si la diferencia es mayor a 1% (Tokchart redondea: "209K"), para no pisar un número exacto.
export function calcularCambios(influencers, datos) {
  const por = { tiktok: {}, instagram: {} }
  for (const d of datos) if (por[d.plataforma] && d.handle) por[d.plataforma][String(d.handle).toLowerCase()] = d
  const cambios = [], sinDatos = []
  for (const inf of influencers) {
    const c = { id: inf.id, nombre: inf.nombre }
    let encontrado = false, tieneUsuario = false
    for (const [red, campo, usuario, link] of [['tiktok', 'tt_seguidores', inf.tt_usuario, inf.tt_link], ['instagram', 'ig_seguidores', inf.ig_usuario, inf.ig_link]]) {
      const u = usuarioDe(usuario, link, red)
      if (!u) continue
      tieneUsuario = true
      const d = por[red][u]
      if (!d) continue
      encontrado = true
      const antes = Number(inf[campo]) || 0
      const ahora = Number(d.followers)
      if (ahora > 0 && (!antes || Math.abs(ahora - antes) / antes > 0.01)) c[campo] = { antes, ahora, fecha: d.fetched_at }
    }
    if (c.tt_seguidores || c.ig_seguidores) cambios.push(c)
    else if (tieneUsuario && !encontrado) sinDatos.push(inf.nombre)
  }
  return { cambios, sinDatos }
}

import { useEffect, useState } from 'react'

// La pantalla abierta vive en la dirección de la página (ej: /campanas/<id>/brief).
// Así funcionan atrás y adelante del navegador (también el gesto del mousepad)
// y al refrescar se queda en la misma pantalla.
export function navegar(ruta, { reemplazar = false, subir = true } = {}) {
  if (ruta === window.location.pathname) return
  window.history[reemplazar ? 'replaceState' : 'pushState'](null, '', ruta)
  window.dispatchEvent(new PopStateEvent('popstate')) // avisa a toda la app del cambio
  if (subir) window.scrollTo(0, 0)
}

// Devuelve la dirección actual en partes: /campanas/abc/brief → ['campanas', 'abc', 'brief']
export function useRuta() {
  const [ruta, setRuta] = useState(window.location.pathname)
  useEffect(() => {
    const alCambiar = () => setRuta(window.location.pathname)
    window.addEventListener('popstate', alCambiar)
    return () => window.removeEventListener('popstate', alCambiar)
  }, [])
  return ruta.split('/').filter(Boolean)
}

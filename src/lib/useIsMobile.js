import { useEffect, useState } from 'react'

// true cuando la pantalla es de celular (menos de 720px de ancho)
export default function useIsMobile() {
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 720 : false)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 720)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return isMobile
}

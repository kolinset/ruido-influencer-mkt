// Pruebas del conector de agentes contra un Postgres real en memoria (PGlite),
// con las tablas de ROSTER que usa el conector y el parche propuestas_agentes.sql.
import { describe, it, expect, beforeEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { responder } from './mcp.js'
import { resolverPropuesta } from './_propuestas.js'

const ESQUEMA = `
CREATE TABLE clients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nombre text, slug text, color text, logo_url text);
CREATE TABLE services (id serial PRIMARY KEY, nombre text, descripcion text, utilizable_pct numeric, activo boolean DEFAULT true);
CREATE TABLE categorias_influencer (id serial PRIMARY KEY, nombre text, activo boolean DEFAULT true);
CREATE TABLE campaigns (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nombre text, cliente text, client_id uuid, budget integer, budget_total integer, moneda text, brief text,
  plataforma text, share_token text, artista text, cancion text, fecha_inicio date, fecha_termino date, reporte_url_tt text, reporte_url_ig text, tipo text,
  contenidos_count integer DEFAULT 0, views_logradas bigint DEFAULT 0, views_min bigint DEFAULT 0, views_max bigint DEFAULT 0, service_id integer, utilizable_pct numeric,
  solicitado_por text, es_legacy boolean DEFAULT false, estado text DEFAULT 'Activa', created_at timestamptz DEFAULT now());
CREATE TABLE influencers (id serial PRIMARY KEY, nombre text, ig_usuario text, ig_seguidores integer, ig_link text, tt_usuario text, tt_seguidores integer, tt_link text,
  tipos_contenido text[], estado text DEFAULT 'Activo', notas text, avatar_url text);
CREATE TABLE campaign_influencers (id serial PRIMARY KEY, campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE, influencer_id integer REFERENCES influencers(id),
  costo integer DEFAULT 0, piezas integer DEFAULT 1, estado text, notas text, video_link_tt text DEFAULT '', video_link_ig text DEFAULT '', boostcode text, estado_pago text,
  link_boleta text, tipo_facturacion text DEFAULT 'sin_recargo', created_at timestamptz DEFAULT now());
CREATE TABLE posts (id serial PRIMARY KEY, campaign_id uuid, influencer_id integer, plataforma text, url text, fecha_publicacion date, descripcion text);
CREATE TABLE campaign_metrics (campaign_id uuid, plataforma text, views bigint, likes bigint, comments bigint, saves bigint, shares bigint, engagement numeric, fetched_at timestamptz);
` + readFileSync(new URL('../supabase/campaign_links.sql', import.meta.url), 'utf8')
  + readFileSync(new URL('../supabase/propuestas_agentes.sql', import.meta.url), 'utf8')

const HOY = '2026-11-03'
const CL = '11111111-1111-1111-1111-111111111111'
const C_IMKT = '22222222-2222-2222-2222-222222222222', C_CLIP = '33333333-3333-3333-3333-333333333333', C_NANO = '44444444-4444-4444-4444-444444444444'
let db
const expand = async u => u === 'https://vt.tiktok.com/ABC/' ? 'https://www.tiktok.com/@clipper1/video/111?is_from_webapp=1' : null

beforeEach(async () => {
  db = new PGlite()
  await db.exec(ESQUEMA)
  await db.exec(`
    INSERT INTO clients (id, nombre) VALUES ('${CL}', 'Sello Andes');
    INSERT INTO services (nombre, utilizable_pct) VALUES ('Influencer MKT', 65), ('Clipping', 70), ('Nano Blast', 60), ('Playlisting', 50);
    INSERT INTO categorias_influencer (nombre) VALUES ('Música urbana'), ('Humor');
    INSERT INTO influencers (nombre, tt_usuario, tt_seguidores, ig_usuario, ig_seguidores, tipos_contenido, estado) VALUES
      ('Cami', 'cami', 400000, 'cami.ig', 50000, '{Música urbana}', 'Activo'),
      ('Benja', 'benja', 90000, 'benja.ig', 20000, '{Humor,Música urbana}', 'Activo'),
      ('Fer', 'fer', 250000, NULL, 0, '{Humor}', 'Activo'),
      ('Inactivo', 'inac', 999999, NULL, 0, '{Música urbana}', 'Inactivo');
    INSERT INTO campaigns (id, nombre, client_id, budget, moneda, tipo, estado, utilizable_pct, fecha_inicio) VALUES
      ('${C_IMKT}', '[Influencer MKT] "Dúo Marea" - "Faros"', '${CL}', 2000000, 'CLP', 'Influencer MKT', 'Activa', 65, '2026-10-20'),
      ('${C_CLIP}', '[Clipping] "Dúo Marea" - "Faros"', '${CL}', 1000000, 'CLP', 'Clipping', 'Activa', 70, '2026-10-01'),
      ('${C_NANO}', '[Nano Blast] "Kira" - "Luna"', '${CL}', 1000000, 'CLP', 'Nano Blast', 'Activa', 60, '2026-10-25');
    UPDATE campaigns SET views_logradas = 1200000, views_min = 1000000, views_max = 3000000 WHERE id = '${C_CLIP}';
    INSERT INTO campaign_influencers (campaign_id, influencer_id, costo, estado, video_link_tt, tipo_facturacion) VALUES
      ('${C_IMKT}', 1, 300000, 'Publicado', 'https://www.tiktok.com/@cami/video/1', 'honorarios'),
      ('${C_IMKT}', 2, 100000, 'Brief enviado', '', 'sin_recargo');
  `)
})

const llamar = async (name, args = {}) => (await responder({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, { db, agente: 'influencers', hoy: HOY, expand })).result
const ok = async (name, args) => { const r = await llamar(name, args); if (r.isError) throw new Error(r.content[0].text); return r.structuredContent }
const pendientes = async () => (await db.query(`SELECT * FROM propuestas_agentes WHERE estado = 'pendiente' ORDER BY created_at`)).rows
const aprobar = async (id, si = true) => resolverPropuesta(db, { id, aprobar: si, email: 'lucas@kolinset.com', hoy: HOY })

describe('protocolo', () => {
  it('initialize y tools/list', async () => {
    const i = await responder({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, {})
    expect(i.result.serverInfo.name).toBe('kolinset-roster')
    const l = await responder({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, {})
    expect(l.result.tools.some(t => /borrar|eliminar|delete|sql/i.test(t.name))).toBe(false)
  })
})

describe('lectura', () => {
  it('ver_campana calcula budget utilizable, usado (con retención) y restante', async () => {
    const r = await ok('ver_campana', { campana_id: C_IMKT })
    expect(r.budget_detalle.utilizable).toBe(1300000)
    expect(r.budget_detalle.usado_en_influencers).toBe(Math.round(300000 / (1 - 0.1525)) + 100000)
    expect(r.influencers).toHaveLength(2)
  })
  it('avance_campanas: quién falta en Influencer MKT y Clipping listo para finalizar', async () => {
    const r = await ok('avance_campanas')
    const imkt = r.avance.find(a => a.id === C_IMKT)
    expect(imkt.publicados).toBe(1)
    expect(imkt.faltan_por_publicar[0]).toMatch(/Benja/)
    expect(imkt.listo_para_finalizar).toBe(false)
    expect(r.listas_para_finalizar).toEqual(['[Clipping] "Dúo Marea" - "Faros"'])
  })
  it('buscar_influencers: categoría, seguidores, excluye inactivos y los que ya están', async () => {
    const r = await ok('buscar_influencers', { categoria: 'urbana', excluir_campana_id: C_IMKT })
    expect(r.influencers.map(i => i.nombre)).toEqual([])
    const r2 = await ok('buscar_influencers', { categoria: 'humor', seguidores_min: 100000 })
    expect(r2.influencers.map(i => i.nombre)).toEqual(['Fer'])
    const r3 = await ok('buscar_influencers', { categoria: 'urbana' })
    expect(r3.influencers.map(i => i.nombre)).toEqual(['Cami', 'Benja'])
    expect(r3.influencers[0]).toMatchObject({ campanas_previas: 1, costo_promedio: 300000 })
    const r4 = await ok('buscar_influencers', { categoria: 'trap' })
    expect(r4.categorias_disponibles).toContain('Humor')
  })
  it('listar_campanas filtra por tipo y abiertas', async () => {
    expect((await ok('listar_campanas', { tipo: 'Clipping', estado: 'Abiertas' })).cantidad).toBe(1)
  })
})

describe('crear campaña: propone, y se crea solo al aprobar', () => {
  it('Clipping con precio y meta por defecto', async () => {
    const r = await ok('proponer_crear_campana', { tipo: 'Clipping', artista: 'Kira', cancion: 'Sol', cliente_id: CL, solicitado_por: 'Ana', fecha_inicio: '2026-12-01', motivo: 'WhatsApp 3/11' })
    expect(r.estado).toBe('pendiente')
    expect((await db.query(`SELECT count(*)::int n FROM campaigns`)).rows[0].n).toBe(3)
    const a = await aprobar(r.propuesta_id)
    expect(a.ok).toBe(true)
    const c = (await db.query(`SELECT * FROM campaigns WHERE id = $1`, [a.campaign_id])).rows[0]
    expect(c).toMatchObject({ nombre: '[Clipping] "Kira" - "Sol"', budget: 1000000, budget_total: 1000000, tipo: 'Clipping', plataforma: 'TikTok', estado: 'Programada', solicitado_por: 'Ana', cliente: 'Sello Andes' })
    expect(Number(c.views_min)).toBe(1000000); expect(Number(c.views_max)).toBe(3000000); expect(Number(c.utilizable_pct)).toBe(70)
    expect(c.share_token).toMatch(/^[0-9a-f-]{36}$/)
  })
  it('Playlisting toma el budget de la tabla y deja la meta en el brief', async () => {
    const r = await ok('proponer_crear_campana', { tipo: 'Playlisting', artista: 'Kira', cancion: 'Sol', cliente_id: CL, streams: 100000, motivo: 'mail' })
    const a = await aprobar(r.propuesta_id)
    const c = (await db.query(`SELECT * FROM campaigns WHERE id = $1`, [a.campaign_id])).rows[0]
    expect(c.budget).toBe(1000000); expect(c.estado).toBe('Activa'); expect(c.brief).toMatch(/100\.000 streams/)
  })
  it('valida y no duplica', async () => {
    expect((await llamar('proponer_crear_campana', { tipo: 'Influencer MKT', artista: 'Dúo Marea', cancion: 'Faros', cliente_id: CL, budget: 1, motivo: 'x' })).isError).toBe(true)
    expect((await llamar('proponer_crear_campana', { tipo: 'Influencer MKT', artista: 'A', cancion: 'B', cliente_id: CL, motivo: 'x' })).isError).toBe(true) // sin budget
    expect((await llamar('proponer_crear_campana', { tipo: 'Playlisting', artista: 'A', cancion: 'B', cliente_id: CL, streams: 75000, motivo: 'x' })).isError).toBe(true)
    await ok('proponer_crear_campana', { tipo: 'Nano Blast', artista: 'A', cancion: 'B', cliente_id: CL, motivo: 'x' })
    expect((await llamar('proponer_crear_campana', { tipo: 'Nano Blast', artista: 'A', cancion: 'B', cliente_id: CL, motivo: 'x' })).isError).toBe(true)
  })
  it('rechazar no crea nada', async () => {
    const r = await ok('proponer_crear_campana', { tipo: 'Nano Blast', artista: 'A', cancion: 'B', cliente_id: CL, motivo: 'x' })
    await aprobar(r.propuesta_id, false)
    expect((await db.query(`SELECT count(*)::int n FROM campaigns`)).rows[0].n).toBe(3)
    expect((await aprobar(r.propuesta_id)).ok).toBe(false) // ya resuelta
  })
})

describe('influencers', () => {
  it('lista: omite repetidos/inactivos y agrega como Contactado al aprobar', async () => {
    const r = await ok('proponer_lista_influencers', { campana_id: C_IMKT, influencers: [{ influencer_id: '1' }, { influencer_id: '3', piezas: 2, nota: 'propuesta A' }, { influencer_id: '4' }], motivo: 'brief Faros' })
    expect(r.omitidos.ya_en_la_campana).toEqual(['Cami'])
    expect(r.omitidos.inactivos).toEqual(['Inactivo'])
    await aprobar(r.propuesta_id)
    const fer = (await db.query(`SELECT * FROM campaign_influencers WHERE campaign_id = $1 AND influencer_id = 3`, [C_IMKT])).rows[0]
    expect(fer).toMatchObject({ estado: 'Contactado', costo: 0, piezas: 2, notas: 'propuesta A', estado_pago: 'Pendiente' })
  })
  it('actualizar: convierte link móvil, guarda costo/estado y crea el post al aprobar', async () => {
    const r = await ok('proponer_actualizar_influencer', { campana_id: C_IMKT, influencer_id: '2', estado: 'Publicado', costo: 120000, video_link_tt: 'https://vt.tiktok.com/ABC/', motivo: 'Benja mandó el link por WhatsApp' })
    expect(r.detalle.join(' ')).toMatch(/@clipper1\/video\/111/)
    const a = await aprobar(r.propuesta_id)
    expect(a.sync).toEqual(['tiktok'])
    const ci = (await db.query(`SELECT * FROM campaign_influencers WHERE campaign_id = $1 AND influencer_id = 2`, [C_IMKT])).rows[0]
    expect(ci).toMatchObject({ estado: 'Publicado', costo: 120000 })
    const post = (await db.query(`SELECT * FROM posts WHERE campaign_id = $1 AND influencer_id = 2`, [C_IMKT])).rows[0]
    expect(post).toMatchObject({ plataforma: 'TikTok' })
    expect(post.url).toMatch(/video\/111/)
  })
  it('sin cambios → error', async () => {
    expect((await llamar('proponer_actualizar_influencer', { campana_id: C_IMKT, influencer_id: '1', estado: 'Publicado', motivo: 'x' })).isError).toBe(true)
  })
})

describe('links de Clipping / Nano Blast', () => {
  const texto = `Hola! aquí van:
https://www.tiktok.com/@nano1/video/900?is_from_webapp=1
https://vt.tiktok.com/ABC/
https://vt.tiktok.com/ROTO/
https://www.instagram.com/reel/xyz/
https://www.tiktok.com/@nano1/video/900?is_from_webapp=1`

  it('saca los links del texto, convierte, descarta repetidos y los carga al aprobar', async () => {
    const r = await ok('proponer_agregar_links', { campana_id: C_NANO, texto, motivo: 'WhatsApp proveedora' })
    expect(r.detalle[0]).toMatch(/^3 links nuevos/)
    expect(r.detalle.join(' ')).toMatch(/1 no se pudieron convertir/)
    expect(r.detalle.join(' ')).toMatch(/1 no eran de TikTok/)
    await aprobar(r.propuesta_id)
    const ls = (await db.query(`SELECT * FROM campaign_links WHERE campaign_id = $1 ORDER BY posicion`, [C_NANO])).rows
    expect(ls.map(l => l.video_id)).toEqual(['900', '111', ''])
    expect(ls[1].handle).toBe('clipper1')
    expect((await db.query(`SELECT contenidos_count FROM campaigns WHERE id = $1`, [C_NANO])).rows[0].contenidos_count).toBe(3)
    // la segunda vez, nada nuevo
    expect((await llamar('proponer_agregar_links', { campana_id: C_NANO, texto, motivo: 'x' })).isError).toBe(true)
  })
  it('no aplica a Influencer MKT', async () => {
    expect((await llamar('proponer_agregar_links', { campana_id: C_IMKT, texto, motivo: 'x' })).isError).toBe(true)
  })
})

describe('estado', () => {
  it('finalizar Clipping al aprobar, sin duplicar propuestas', async () => {
    const r = await ok('proponer_cambiar_estado', { campana_id: C_CLIP, estado: 'Cerrada', motivo: 'Llegó a 1,2M views' })
    expect((await llamar('proponer_cambiar_estado', { campana_id: C_CLIP, estado: 'Cerrada', motivo: 'x' })).isError).toBe(true)
    await aprobar(r.propuesta_id)
    expect((await db.query(`SELECT estado FROM campaigns WHERE id = $1`, [C_CLIP])).rows[0].estado).toBe('Cerrada')
    expect((await llamar('proponer_actualizar_influencer', { campana_id: C_CLIP, influencer_id: '1', estado: 'Publicado', motivo: 'x' })).isError).toBe(true)
    const p = (await db.query(`SELECT estado, resuelta_por FROM propuestas_agentes WHERE id = $1`, [r.propuesta_id])).rows[0]
    expect(p).toMatchObject({ estado: 'aprobada', resuelta_por: 'lucas@kolinset.com' })
  })
  it('si aplicar falla, no queda nada a medias', async () => {
    const r = await ok('proponer_crear_campana', { tipo: 'Nano Blast', artista: 'X', cancion: 'Y', cliente_id: CL, motivo: 'x' })
    await db.query(`INSERT INTO campaigns (nombre) VALUES ('[Nano Blast] "X" - "Y"')`) // alguien la creó a mano mientras tanto
    await expect(aprobar(r.propuesta_id)).rejects.toThrow(/Ya existe/)
    expect((await pendientes()).map(p => p.id)).toContain(r.propuesta_id)
  })
})

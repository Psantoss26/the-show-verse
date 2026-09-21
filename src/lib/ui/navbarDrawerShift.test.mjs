import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

// El bloque derecho del navbar se aparta del drawer con una variable CSS que
// viaja por TRES archivos sin ninguna importación entre ellos: el provider la
// publica en <html>, el navbar publica su tope y globals.css las combina. Un
// renombrado en cualquiera de ellos desactivaría el desplazamiento en silencio
// -- sin error de compilación, sin test rojo y sin nada visible hasta abrir una
// ficha--, así que el contrato se comprueba aquí.
const INSET_VAR = '--sv-detail-drawer-inset'
const MAX_VAR = '--sv-navbar-right-shift-max'

const read = (relative) =>
  readFile(new URL(relative, import.meta.url), 'utf8')

test('el provider publica el ancho del drawer en <html>', async () => {
  const provider = await read('../../components/dashboard/DetailModalProvider.jsx')

  assert.match(provider, new RegExp(`DRAWER_INSET_VAR = "${INSET_VAR}"`))
  assert.match(provider, /document\.documentElement/)
  // Se publica también SUPERPUESTO: el panel tapa el borde derecho en los dos
  // modos, no solo acoplado.
  assert.match(
    provider,
    /publishDrawerInset\(width\);\s*\n\s*if \(docked && contentRef\.current\)/
  )
  // Y se retira al cerrar, o la barra se quedaría apartada sin motivo.
  assert.match(provider, /publishDrawerInset\(null\)/)
})

test('el navbar publica el hueco libre como tope', async () => {
  const navbar = await read('../../components/Navbar.jsx')

  assert.match(navbar, new RegExp(`"${MAX_VAR}"`))
  assert.match(navbar, /className="sv-navbar-right-shift /)
})

test('la regla combina las dos variables y acota el recorrido', async () => {
  const css = await read('../../app/globals.css')
  const rule = css.slice(css.indexOf('.sv-navbar-right-shift {'))

  assert.ok(rule.startsWith('.sv-navbar-right-shift {'), 'falta la regla')
  const body = rule.slice(0, rule.indexOf('}'))

  // `min(...)` es lo que impide que el bloque se monte sobre las secciones
  // cuando el panel es más ancho que el carril central.
  assert.match(body, /min\(/)
  assert.ok(body.includes(`var(${INSET_VAR}, 0px)`), 'falta el ancho del drawer')
  assert.ok(body.includes(`var(${MAX_VAR}, 0px)`), 'falta el tope')
  // Con `transform`, no con padding/margin: si cambiara, el ancho medido del
  // bloque dependería del propio desplazamiento y el tope se realimentaría.
  assert.match(body, /transform:\s*translate3d/)
})

test('el arrastre del tirador desactiva la transición', async () => {
  const [modal, css] = await Promise.all([
    read('../../components/dashboard/DetailModal.jsx'),
    read('../../app/globals.css')
  ])

  // Sin esto el bloque iría ~320ms por detrás del tirador.
  assert.match(modal, /dataset\.svDrawerResizing = ""/)
  assert.match(modal, /delete document\.documentElement\.dataset\.svDrawerResizing/)
  assert.match(
    css,
    /:root\[data-sv-drawer-resizing\] \.sv-navbar-right-shift \{\s*transition: none;/
  )
})

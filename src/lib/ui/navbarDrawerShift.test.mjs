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
  // modos, no solo acoplado. La publicación va ANTES de la salida que atiende
  // únicamente al modo acoplado, que es lo que garantiza que ocurra siempre.
  const body = provider.slice(provider.indexOf("const updateDrawerWidth"));
  const publish = body.indexOf("publishDrawerInset(width);");
  const dockedOnly = body.indexOf("if (!docked || !contentRef.current) return;");
  assert.ok(publish > -1, "el ancho ya no se publica");
  assert.ok(dockedOnly > -1, "no se encontró la salida del modo acoplado");
  assert.ok(
    publish < dockedOnly,
    "superpuesto dejaría de publicar el ancho y el navbar no se apartaría",
  )
  // Y se retira al cerrar, o la barra se quedaría apartada sin motivo.
  assert.match(provider, /publishDrawerInset\(null\)/)
})

test('el navbar publica el hueco libre como tope', async () => {
  const navbar = await read('../../components/Navbar.jsx')

  assert.match(navbar, new RegExp(`"${MAX_VAR}"`))
  // En <html>, no en el header: la ficha de teléfono acoplada del drawer
  // también lo lee para no moverse tanto como para tapar esos botones, y
  // cuelga de otra rama del árbol.
  assert.match(navbar, /document\.documentElement\.style\.setProperty\(\s*\n\s*"--sv-navbar-right-shift-max"/)
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

test("en tablet la barra INFERIOR también se aparta del drawer", async () => {
  const [navbar, css] = await Promise.all([
    read("../../components/Navbar.jsx"),
    read("../../app/globals.css"),
  ])

  assert.match(navbar, /className=\{`sv-navbar-bottom-shift desktop:hidden fixed/)

  const rule = css.slice(css.indexOf(".sv-navbar-bottom-shift {"))
  const body = rule.slice(0, rule.indexOf("}"))

  // Se mueve con `left`, no con otra `transform`: la que ya tiene le sirve para
  // centrarse Y para esconderse al hacer scroll, y una segunda la pisaría.
  assert.match(body, /left: calc\(var\(--sv-bottom-space\) \/ 2\);/)
  assert.doesNotMatch(body, /transform:/)

  // Y se estrecha: en una tablet de 768px con el panel a la mitad, la barra de
  // 28rem no cabe en los 384px que quedan por mucho que se desplace.
  assert.match(body, /width: min\(calc\(var\(--sv-bottom-space\) - 2rem\), 28rem\);/)

  // Solo desde 768px: por debajo no hay drawer —en móvil la ficha se abre como
  // página— y la barra conserva su tamaño de siempre.
  assert.ok(
    css.lastIndexOf("@media (min-width: 768px)", css.indexOf(".sv-navbar-bottom-shift {")) > -1,
    "la regla tiene que quedar dentro del breakpoint de tablet",
  )
})

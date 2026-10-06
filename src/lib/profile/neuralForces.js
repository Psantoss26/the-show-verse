// Fuerzas propias de la simulación de la vista neuronal (d3-force), sin
// dependencias: las usa el worker y se prueban en Node.

// Gravedad hacia el centro de la simulación (forceX/forceY del worker).
export const NEURAL_GRAVITY = 0.06;

/**
 * Proporción (alto/ancho) para repartir la red en una pantalla vertical, o 1
 * en horizontal. Por tramos de 0,25 y con tope: la disposición se guarda por
 * proporción y no debe recalcularse por unos píxeles. `chrome`: lo que no es
 * red visible (cabecera y menú arriba; pie y barra flotante abajo).
 */
export function neuralLayoutAspect(width, height, chrome = 300) {
  if (!(width > 0) || !(height > 0)) return 1;
  const aspect = (height - chrome) / width;
  return aspect < 1.15 ? 1 : Math.min(2, Math.round(aspect * 4) / 4);
}

/**
 * Fuerza de FORMA: lleva la red hacia una proporción alto/ancho `target` (el
 * móvil, en vertical) sin tocarla si es 1.
 *
 * Por qué así y no con más o menos gravedad en cada eje: cuánto se estira la
 * red con una gravedad dada depende de su densidad (una red de géneros y sagas
 * se alarga el doble que una con siete agrupaciones mezcladas, atada por
 * miles de enlaces). Esta fuerza MIDE la forma en cada paso y ajusta su
 * intensidad hasta llegar a la proporción, sea cual sea la red:
 *   - mide con la desviación media (no la típica): los pocos nodos sueltos
 *     de la periferia no cuentan más que el resto;
 *   - estira sobre todo apretando a lo ancho. A lo alto solo afloja la
 *     gravedad, sin llegar a anularla: empujar hacia fuera mandaba esos nodos
 *     sueltos lejísimos y obligaba a alejar la cámara.
 * Como las demás fuerzas, escala con `alpha`: se apaga al asentarse.
 */
export function forceAspect(target = 1) {
  let nodes = [];
  let gain = 0;
  const force = (alpha) => {
    if (!(target > 1) || !nodes.length) return;
    let mx = 0;
    let my = 0;
    for (const node of nodes) {
      mx += node.x;
      my += node.y;
    }
    mx /= nodes.length;
    my /= nodes.length;
    let spreadX = 0;
    let spreadY = 0;
    for (const node of nodes) {
      spreadX += Math.abs(node.x - mx);
      spreadY += Math.abs(node.y - my);
    }
    const ratio = spreadY / Math.max(1e-6, spreadX);
    gain = Math.max(0, Math.min(0.4, gain + 0.02 * Math.log(target / ratio)));
    const kx = gain * alpha;
    const ky = Math.min(gain, NEURAL_GRAVITY - 0.01) * alpha;
    for (const node of nodes) {
      node.vx -= (node.x - mx) * kx;
      node.vy += (node.y - my) * ky;
    }
  };
  force.initialize = (initial) => {
    nodes = initial;
    gain = 0;
  };
  return force;
}

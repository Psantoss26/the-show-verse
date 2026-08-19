// Rango de años de la TRAYECTORIA de una persona (ActorDetails).
//
// EL PROBLEMA QUE RESUELVE: los créditos de TV se fechan con el estreno de la
// SERIE (`first_air_date`), no con el episodio en el que la persona sale — es lo
// único que trae `combined_credits`. Las galas y los programas diarios son en
// TMDb una sola serie con décadas de emisión, así que UNA aparición suelta
// arrastraba el inicio de la trayectoria hasta el estreno del programa:
//
//   Zendaya (n. 1996)            -> 1944, por "Golden Globe Awards" (1 episodio)
//   Millie Bobby Brown (n. 2004) -> 1949, por "The Emmy Awards"     (1 episodio)
//   Ncuti Gatwa (n. 1992)        -> 1953, por "The Oscars"          (1 episodio)
//
// De los 20 actores más populares de TMDb, 7 empezaban su trayectoria antes de
// haber nacido. Los culpables se repetían: Today, Golden Globe Awards, The
// Oscars, LIVE with Kelly and Mark, Casualty.
//
// LA REGLA: un crédito anterior al nacimiento no puede ser trabajo de esa
// persona, así que no cuenta para el rango. Es deliberadamente conservadora:
//   - No arregla el caso en que la aparición real fue MUCHO después del estreno
//     pero aún posterior al nacimiento (ahí haría falta la fecha del episodio,
//     que exige una petición por serie).
//   - Sin fecha de nacimiento no se descarta nada: no hay con qué comparar, y
//     inventarse un mínimo sería peor que enseñar el dato tal cual.
//   - Si TODOS los créditos fuesen anteriores al nacimiento (datos rotos), se
//     devuelve el rango sin filtrar antes que no mostrar nada.
// El año del nacimiento SÍ cuenta: hay bebés acreditados en el año en que nacen.

const yearFromDate = (value) => {
  if (!value) return null;
  const year = String(value).slice(0, 4);
  return /^\d{4}$/.test(year) ? Number(year) : null;
};

export function careerRange(credits, birthday) {
  const years = (Array.isArray(credits) ? credits : [])
    .map((credit) => Number(credit?.year))
    .filter((year) => Number.isFinite(year) && year > 0);

  if (!years.length) return null;

  const birthYear = yearFromDate(birthday);
  const posteriores = birthYear
    ? years.filter((year) => year >= birthYear)
    : years;
  const usables = posteriores.length ? posteriores : years;

  return { start: Math.min(...usables), end: Math.max(...usables) };
}

export function formatCareerRange(range) {
  if (!range) return "—";
  return range.start === range.end
    ? String(range.start)
    : `${range.start} - ${range.end}`;
}

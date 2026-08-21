/**
 * Comparte una petición IMDb en curso entre varios consumidores del mismo
 * título. Es importante durante el doble montaje de React: el segundo efecto
 * debe esperar la petición iniciada por el primero, no descartarla.
 */
export function createImdbRatingRequestCoordinator() {
  const inFlightByKey = new Map()

  return function requestRatings(items, fetchRatings) {
    const uniqueItems = []
    const seen = new Set()

    for (const item of Array.isArray(items) ? items : []) {
      if (!item?.key || seen.has(item.key)) continue
      seen.add(item.key)
      uniqueItems.push(item)
    }

    const toRequest = uniqueItems.filter((item) => !inFlightByKey.has(item.key))

    if (toRequest.length) {
      const request = Promise.resolve().then(() => fetchRatings(toRequest))
      toRequest.forEach((item) => inFlightByKey.set(item.key, request))

      request.then(
        () => toRequest.forEach((item) => {
          if (inFlightByKey.get(item.key) === request) inFlightByKey.delete(item.key)
        }),
        () => toRequest.forEach((item) => {
          if (inFlightByKey.get(item.key) === request) inFlightByKey.delete(item.key)
        }),
      )
    }

    return Promise.all([
      ...new Set(uniqueItems.map((item) => inFlightByKey.get(item.key)).filter(Boolean)),
    ])
  }
}

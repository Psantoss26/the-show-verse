export async function fetchImdbRatingByImdb(imdbId, init = {}) {
  if (!imdbId) return null;

  try {
    const res = await fetch(
      `/api/imdb/ratings?i=${encodeURIComponent(imdbId)}`,
      {
        cache: "force-cache",
        ...init,
      },
    );
    if (!res.ok) return null;

    const json = await res.json();
    const rating = Number(json?.rating);
    const votes = Number(json?.votes);

    if (!Number.isFinite(rating) || rating <= 0) return null;

    return {
      id: String(json?.id || imdbId),
      rating,
      votes: Number.isFinite(votes) && votes > 0 ? votes : null,
      source: json?.source || "imdb-dataset",
    };
  } catch {
    return null;
  }
}

export async function fetchImdbRatingsByIds(imdbIds, init = {}) {
  const ids = [
    ...new Set(
      (Array.isArray(imdbIds) ? imdbIds : [imdbIds])
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    ),
  ];

  if (!ids.length) return {};

  try {
    const res = await fetch(
      `/api/imdb/ratings?ids=${encodeURIComponent(ids.join(","))}`,
      {
        cache: "force-cache",
        ...init,
      },
    );
    if (!res.ok) return {};

    const json = await res.json();
    return json?.items && typeof json.items === "object" ? json.items : {};
  } catch {
    return {};
  }
}

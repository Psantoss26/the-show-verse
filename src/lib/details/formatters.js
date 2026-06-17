// src/lib/details/formatters.js

export const formatShortNumber = (num) => {
    if (!num) return null
    const n = Number(num)
    if (isNaN(n)) return null
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
    return n.toString()
}

export const slugifyForSeriesGraph = (name) => {
    if (!name) return ''
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '')
}

export const formatDateEs = (iso) => {
    if (!iso) return null
    try {
        return new Date(iso).toLocaleDateString('es-ES', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        })
    } catch {
        return iso
    }
}

export const formatVoteCount = (v) => {
    const n =
        typeof v === 'number'
            ? v
            : Number(String(v || '').replace(/,/g, '').trim())

    if (!Number.isFinite(n) || n <= 0) return null

    return new Intl.NumberFormat('es-ES', {
        notation: 'compact',
        maximumFractionDigits: 1
    }).format(n)
}

export function formatCountShort(input) {
    if (input == null) return null

    let n = input
    // Acepta "2,5M" no, pero acepta strings de OMDb tipo "2,498,190"
    if (typeof n === 'string') {
        const digits = n.replace(/[^\d]/g, '')
        n = digits ? Number(digits) : NaN
    }

    if (!Number.isFinite(n) || n <= 0) return null

    const fmt1 = (x) => x.toFixed(1).replace(/\.0$/, '').replace('.', ',')

    if (n >= 1_000_000) {
        const v = n / 1_000_000
        return `${v >= 10 ? Math.round(v) : fmt1(v)}M`
    }
    if (n >= 1_000) {
        const v = n / 1_000
        return `${v >= 10 ? Math.round(v) : fmt1(v)}K`
    }
    return String(n)
}

export const stripHtml = (s) => String(s || '').replace(/<[^>]*>?/gm, '').trim()

export const formatDateTimeEs = (iso) => {
    if (!iso) return ''
    try {
        return new Date(iso).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })
    } catch {
        return iso
    }
}

export const mixedCount = (a, b) => {
    const A = Number(a || 0)
    const B = Number(b || 0)
    if (A > 0 && B > 0) return `${A}+${B}`
    if (A > 0) return A
    if (B > 0) return B
    return null
}

export const sumCount = (...vals) => vals.reduce((acc, v) => acc + (Number(v || 0) || 0), 0)

const GENRE_TRANSLATIONS = {
  "action": "Acción",
  "accion": "Acción",
  "adventure": "Aventura",
  "aventura": "Aventura",
  "animation": "Animación",
  "animacion": "Animación",
  "comedy": "Comedia",
  "comedia": "Comedia",
  "crime": "Crimen",
  "crimen": "Crimen",
  "documentary": "Documental",
  "documental": "Documental",
  "drama": "Drama",
  "family": "Familiar",
  "familiar": "Familiar",
  "familia": "Familiar",
  "fantasy": "Fantasía",
  "fantasia": "Fantasía",
  "history": "Historia",
  "historia": "Historia",
  "horror": "Terror",
  "terror": "Terror",
  "music": "Música",
  "musica": "Música",
  "mystery": "Misterio",
  "misterio": "Misterio",
  "romance": "Romance",
  "science fiction": "Ciencia ficción",
  "ciencia ficción": "Ciencia ficción",
  "ciencia ficcion": "Ciencia ficción",
  "sci-fi": "Ciencia ficción",
  "tv movie": "Película de TV",
  "película de tv": "Película de TV",
  "pelicula de tv": "Película de TV",
  "thriller": "Suspense",
  "suspense": "Suspense",
  "war": "Bélica",
  "belica": "Bélica",
  "western": "Western",
  
  // TV specific and variations
  "action & adventure": "Acción y aventura",
  "action and adventure": "Acción y aventura",
  "acción y aventura": "Acción y aventura",
  "accion y aventura": "Acción y aventura",
  "kids": "Infantil",
  "infantil": "Infantil",
  "news": "Noticias",
  "noticias": "Noticias",
  "reality": "Reality",
  "sci-fi & fantasy": "Ciencia ficción y fantasía",
  "sci-fi and fantasy": "Ciencia ficción y fantasía",
  "science fiction & fantasy": "Ciencia ficción y fantasía",
  "science fiction and fantasy": "Ciencia ficción y fantasía",
  "ciencia ficción y fantasía": "Ciencia ficción y fantasía",
  "ciencia ficcion y fantasia": "Ciencia ficción y fantasía",
  "soap": "Telenovela",
  "telenovela": "Telenovela",
  "talk": "Talk show",
  "talk show": "Talk show",
  "war & politics": "Bélica y política",
  "war and politics": "Bélica y política",
  "guerra y política": "Bélica y política",
  "guerra y politica": "Bélica y política",
  "bélica y política": "Bélica y política",
  "belica y politica": "Bélica y política"
};

export function translateGenre(name) {
  if (!name || typeof name !== 'string') return name;
  const clean = name.trim().toLowerCase().replace(/\s+/g, ' ');
  
  if (GENRE_TRANSLATIONS[clean] !== undefined) {
    return GENRE_TRANSLATIONS[clean];
  }
  
  // Try mapping by replacing '&' with 'and' or vice versa, or removing accents
  const cleanNorm = clean
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace('&', 'and')
    .replace(/\s+/g, ' ')
    .trim();
    
  if (GENRE_TRANSLATIONS[cleanNorm] !== undefined) {
    return GENRE_TRANSLATIONS[cleanNorm];
  }

  // Also replace 'and' with '&'
  const cleanAmp = clean
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\band\b/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

  if (GENRE_TRANSLATIONS[cleanAmp] !== undefined) {
    return GENRE_TRANSLATIONS[cleanAmp];
  }

  return name;
}

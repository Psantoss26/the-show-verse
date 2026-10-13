'use client'

import { useState } from 'react'
import { Users } from 'lucide-react'
import SectionSheet, { SectionSheetEmpty } from '@/components/details/sectionSheet/SectionSheet'
import { PersonRow } from '@/components/details/sectionSheet/SectionSheetRows'

const plural = (count, one, many) => `${Number(count).toLocaleString('es-ES')} ${count === 1 ? one : many}`

const matches = (query, ...values) => {
    if (!query) return true
    const needle = query.toLocaleLowerCase('es-ES')
    return values.some((value) => String(value || '').toLocaleLowerCase('es-ES').includes(needle))
}

/**
 * Reparto destacado de una colección en la vista lateral de las secciones de
 * la ficha (details/sectionSheet): lista de arriba abajo con buscador. Cada
 * fila dice en cuántas películas de la saga sale; el `title` las detalla.
 */
export default function CollectionCastModal({ open, onClose, cast, collectionName }) {
    const [query, setQuery] = useState('')
    const items = Array.isArray(cast) ? cast : []
    const filtered = items.filter((actor) => matches(
        query,
        actor.name,
        actor.character,
        ...(actor.appearances || []).flatMap((item) => [item.title, item.character]),
    ))

    const close = () => {
        setQuery('')
        onClose?.()
    }

    return (
        <SectionSheet
            open={open}
            onClose={close}
            title="Reparto destacado"
            icon={Users}
            subtitle={[collectionName || 'Colección', plural(items.length, 'persona', 'personas')].join(' · ')}
            search={items.length ? { value: query, onChange: setQuery, placeholder: 'Buscar nombre, personaje o película…' } : null}
        >
            {filtered.length ? (
                <ul className="space-y-2">
                    {filtered.map((actor) => {
                        const appearances = actor.appearances || []
                        return (
                            <li key={actor.id}>
                                <PersonRow
                                    person={actor}
                                    role={actor.character}
                                    badge={appearances.length ? plural(appearances.length, 'película', 'películas') : null}
                                    title={appearances
                                        .map((item) => `${item.title}${item.year ? ` (${item.year})` : ''}${item.character ? ` — ${item.character}` : ''}`)
                                        .join('\n')}
                                    onNavigate={close}
                                />
                            </li>
                        )
                    })}
                </ul>
            ) : (
                <SectionSheetEmpty>
                    {query ? 'Nadie coincide con la búsqueda.' : 'No hay reparto disponible para esta colección.'}
                </SectionSheetEmpty>
            )}
        </SectionSheet>
    )
}

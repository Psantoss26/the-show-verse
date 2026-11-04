// Recalcula de una vez el `item_count` de las listas de la comunidad: los
// títulos guardados en community_list_items, no el total de Trakt que guardaba
// la importación (copia como mucho 150 por lista: «1466 títulos» con 154).
// Las listas nuevas y las que se abren ya se corrigen solas (community/store.js);
// esto arregla de golpe las tarjetas de /lists, sus totales y el orden.
//
// Uso (con la base que toque; ver load-env.js):
//   npm run community:sync-item-counts            # simulación
//   npm run community:sync-item-counts -- --apply # lo aplica

import { sql } from 'drizzle-orm';

import { closeDb, db } from '../db/client.js';

const apply = process.argv.includes('--apply');

const rows = await db.execute(sql`
  select l.id, l.name, l.item_count as stored, count(i.id)::int as real
    from community_lists l
    left join community_list_items i on i.list_id = l.id
   group by l.id
  having l.item_count <> count(i.id)
   order by l.item_count - count(i.id) desc
`);

console.log(`Listas con un recuento que no cuadra: ${rows.length}`);
for (const row of rows.slice(0, 20)) {
  console.log(`  - ${row.name}: ${row.stored} → ${row.real}`);
}
if (rows.length > 20) console.log(`  … y ${rows.length - 20} más`);

if (apply && rows.length) {
  await db.execute(sql`
    update community_lists l
       set item_count = (select count(*)::int from community_list_items i where i.list_id = l.id)
     where l.item_count <> (select count(*)::int from community_list_items i where i.list_id = l.id)
  `);
  console.log('Aplicado.');
} else if (!apply) {
  console.log('Simulación: añade --apply para guardar los cambios.');
}

await closeDb();

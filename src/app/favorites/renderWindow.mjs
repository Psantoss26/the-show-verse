// Keep the full counts for headings, but only mount groups containing cards
// in the current batch. Count occurrences, not unique media IDs.
export function windowFavoriteGroups(groups, limit) {
  if (!groups) return null;
  let remaining = limit;
  const visible = [];
  for (const group of groups) {
    if (remaining <= 0) break;
    if (group.subgroups?.length) {
      const subgroups = [];
      for (const subgroup of group.subgroups) {
        if (remaining <= 0) break;
        const items = subgroup.items.slice(0, remaining);
        remaining -= items.length;
        if (items.length) subgroups.push({ ...subgroup, count: subgroup.items.length, items });
      }
      if (subgroups.length) visible.push({ ...group, count: group.items.length, subgroups });
    } else {
      const items = group.items.slice(0, remaining);
      remaining -= items.length;
      if (items.length) visible.push({ ...group, count: group.items.length, items });
    }
  }
  return visible;
}

export function favoriteGroupRenderEnd(groups, key) {
  let end = 0;
  for (const group of groups || []) {
    end += group.subgroups?.length
      ? group.subgroups.reduce((sum, subgroup) => sum + subgroup.items.length, 0)
      : group.items.length;
    if (group.key === key) return end;
  }
  return 0;
}

/**
 * Strips Supabase-generated columns before re-inserting a copied row.
 * We omit `id` (let the DB generate a new one) and the timestamp columns
 * (auto-set on insert) so the caller only needs to override the FK fields.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function stripMeta({ id, created_at, updated_at, ...rest }: Record<string, unknown>) {
  return rest
}

/**
 * Maps old row IDs to new row IDs by matching on `order_index`.
 * Used after a batch re-insert where the new IDs are unknown but the
 * insertion order matches the original — so `order_index` is a stable key.
 */
export function mapByOrderIndex(
  oldRows: Array<{ id: string; order_index: number }>,
  newRows: Array<{ id: string; order_index: number }>
): Map<string, string> {
  const oldByOrder = new Map(oldRows.map(r => [r.order_index, r.id]))
  const result = new Map<string, string>()
  for (const n of newRows) {
    const oldId = oldByOrder.get(n.order_index)
    if (oldId) result.set(oldId, n.id)
  }
  return result
}

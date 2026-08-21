/**
 * Each node has exactly one visible connector per side (left = incoming,
 * right = outgoing), per the app's design. Underneath each visible dot, a
 * second same-position handle of the *opposite* type is stacked (see
 * CraftNode) so a connection can legitimately attach to either side
 * regardless of which type initiated the drag — without that, forcing an
 * edge's source/target to match drag order (see App.tsx's onConnect)
 * would make the edge visually jump to the node's *other* side instead of
 * staying put where the user actually dragged from/to.
 *
 * Every handle gets an explicit, unique id. React Flow needs this: once a
 * node has more than one handle of the same type, leaving one of them
 * without an id makes it ambiguous which one an edge with no
 * sourceHandle/targetHandle actually resolves to (it's not guaranteed to
 * be "the one with no id" — this was the cause of edges snapping to the
 * wrong side after the stacked handles were introduced). Edges saved
 * before any of this existed have no sourceHandle/targetHandle at all;
 * migrateHandleId maps that old "no id" case to the correct explicit id.
 */
export const LEFT_TARGET_ID = 'target-left'
export const LEFT_SOURCE_ID = 'source-left'
export const RIGHT_SOURCE_ID = 'source-right'
export const RIGHT_TARGET_ID = 'target-right'

/** Migrates a possibly-legacy handle id (null/undefined, from an edge
 * saved before every handle had an explicit id) to the correct explicit
 * one — the primary handle of the given type is the one that used to be
 * implicit. Explicit ids pass through unchanged. */
export function migrateHandleId(
  handleId: string | null | undefined,
  handleType: 'source' | 'target',
): string {
  if (handleId) return handleId
  return handleType === 'source' ? RIGHT_SOURCE_ID : LEFT_TARGET_ID
}

/** Given the id/type of a handle a connection is currently attached to at
 * one node, returns the id of the *other*-type handle at that same visual
 * position (left or right) on the same node — i.e. the id to use instead
 * when that node's role in the edge gets flipped from target to source or
 * vice versa. */
export function oppositeTypeHandleId(
  handleId: string | null | undefined,
  handleType: 'source' | 'target',
): string {
  const migrated = migrateHandleId(handleId, handleType)
  if (migrated === LEFT_TARGET_ID) return LEFT_SOURCE_ID
  if (migrated === LEFT_SOURCE_ID) return LEFT_TARGET_ID
  if (migrated === RIGHT_SOURCE_ID) return RIGHT_TARGET_ID
  return RIGHT_SOURCE_ID
}

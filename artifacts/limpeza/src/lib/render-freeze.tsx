import React, { memo, useCallback, useEffect, useRef } from "react"

/**
 * Returns a callback with a permanently stable identity that always invokes
 * the latest closure. Prevents unnecessary re-renders in `React.memo` children
 * and prevents stale closures inside `<FrozenSlot>`.
 */
export function useStableCallback<T extends (...args: any[]) => any>(fn: T): T {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    ref.current = fn
  })
  return useCallback(((...args: any[]) => ref.current(...args)) as T, [])
}

/**
 * Leaf memoized wrapper that skips reconciling `node` when the exact same
 * `ReactNode` reference is passed (proven pattern from `pms-calendar.tsx`).
 */
export const MemoizedSlot = memo(function MemoizedSlot({ node }: { node: React.ReactNode }) {
  return <>{node}</>
})

export function shallowDepsEqual(
  a: readonly unknown[] | undefined,
  b: readonly unknown[] | undefined
): boolean {
  if (a === b) return true
  if (!a || !b || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false
  }
  return true
}

export interface FrozenSlotProps {
  /**
   * When `true`, skips calling `render()` and bails out of reconciling the
   * background JSX subtree across parent keystroke re-renders as long as
   * `deps` remain `Object.is`-equal.
   * When `false`, always renders normally on every parent render.
   */
  freeze: boolean
  /**
   * Dependencies that should refresh the subtree even while `freeze` is `true`
   * (e.g. background polling updates, active tab, or stacked modal save state).
   */
  deps?: readonly unknown[]
  render: () => React.ReactNode
}

export const FrozenSlot = memo(
  function FrozenSlot({ render }: FrozenSlotProps) {
    return <>{render()}</>
  },
  (prev, next) => {
    if (!prev.freeze || !next.freeze) return false
    return shallowDepsEqual(prev.deps, next.deps)
  }
)

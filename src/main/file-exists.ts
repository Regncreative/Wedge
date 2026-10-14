import { access } from 'fs/promises'

/** How long a single check may take before the path is treated as unreachable. */
const CHECK_TIMEOUT_MS = 1500

/** Concurrent checks for the same path share one fs probe. */
const inflight = new Map<string, Promise<boolean>>()

function probe(filePath: string): Promise<boolean> {
  let pending = inflight.get(filePath)
  if (!pending) {
    pending = access(filePath)
      .then(
        () => true,
        () => false
      )
      .finally(() => inflight.delete(filePath))
    inflight.set(filePath, pending)
  }
  return pending
}

/**
 * Non-blocking existence check. A disconnected network share can stall a
 * synchronous fs call for many seconds and freeze the whole main process,
 * so this resolves `null` ("unknown") once the timeout passes instead.
 */
export async function checkPath(filePath: string): Promise<boolean | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), CHECK_TIMEOUT_MS)
  })
  try {
    return await Promise.race([probe(filePath), timeout])
  } finally {
    clearTimeout(timer)
  }
}

/** True only when the path was confirmed reachable. */
export async function isReachable(filePath: string): Promise<boolean> {
  return (await checkPath(filePath)) === true
}

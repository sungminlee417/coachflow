// Tiny pub-sub for "is at least one Modal open right now". The Toast
// container subscribes so it can move out of the way (toast sits near the
// bottom by default, but so does the mobile-sheet style modal — they
// collide when a toast fires while a confirm dialog is open).
//
// A counter (not a boolean) because ConfirmDialog renders a Modal, and a
// page can have a Modal-inside-a-Modal sequence during transitions.

let openCount = 0
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach(l => l())
}

export function pushModal() {
  openCount += 1
  emit()
}

export function popModal() {
  openCount = Math.max(0, openCount - 1)
  emit()
}

export function getOpenModalCount() {
  return openCount
}

export function subscribeModalStack(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

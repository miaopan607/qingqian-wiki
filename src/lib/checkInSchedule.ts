import type {
  CheckInDayWindow,
  CheckInEvent,
  CheckInRefreshChange,
  CheckInWindow,
} from '../types/entities'

const DAY_MS = 86400000
function boundary(event: CheckInEvent, day: number, minute: number): number {
  return Date.parse(`${event.startsOn}T00:00:00+08:00`) + day * DAY_MS + minute * 60000
}

export function getCheckInDayWindows(
  event: CheckInEvent,
  initialRefreshMinute: number,
  changes: CheckInRefreshChange[]
): CheckInDayWindow[] {
  const boundaries = Array.from({ length: event.days + 1 }, (_, day) => {
    const latest =
      event.fixedRefreshMinute === null
        ? changes.reduce<CheckInRefreshChange | null>(
            (current, change) =>
              change.fromDayIndex <= day && (!current || change.id > current.id) ? change : current,
            null
          )
        : null
    const minute = event.fixedRefreshMinute ?? latest?.refreshMinute ?? initialRefreshMinute
    return { at: new Date(boundary(event, day, minute)).toISOString(), minute }
  })
  return boundaries.slice(0, event.days).map((item, dayIndex) => ({
    dayIndex,
    startsAt: item.at,
    endsAt: boundaries[dayIndex + 1].at,
    refreshMinute: item.minute,
  }))
}

export function getCheckInWindow(now: Date, windows: CheckInDayWindow[]): CheckInWindow {
  if (!windows.length)
    return { phase: 'upcoming', dayIndex: null, dayStartsAt: null, nextTransitionAt: null }
  if (now.getTime() < Date.parse(windows[0].startsAt))
    return {
      phase: 'upcoming',
      dayIndex: null,
      dayStartsAt: null,
      nextTransitionAt: windows[0].startsAt,
    }
  const day = windows.find(
    (item) => now.getTime() >= Date.parse(item.startsAt) && now.getTime() < Date.parse(item.endsAt)
  )
  return day
    ? {
        phase: 'active',
        dayIndex: day.dayIndex,
        dayStartsAt: day.startsAt,
        nextTransitionAt: day.endsAt,
      }
    : { phase: 'ended', dayIndex: null, dayStartsAt: null, nextTransitionAt: null }
}

export function getGlobalCheckInWindow(event: CheckInEvent, now: Date): CheckInWindow {
  const phase =
    now.getTime() < Date.parse(event.startsAt)
      ? 'upcoming'
      : now.getTime() >= Date.parse(event.endsAt)
        ? 'ended'
        : 'active'
  return {
    phase,
    dayIndex: null,
    dayStartsAt: null,
    nextTransitionAt:
      phase === 'upcoming' ? event.startsAt : phase === 'active' ? event.endsAt : null,
  }
}

export function getNextCheckInRefreshChange(
  event: CheckInEvent,
  initialRefreshMinute: number,
  changes: CheckInRefreshChange[],
  now: Date,
  refreshMinute: number
): { fromDayIndex: number; effectiveAt: string } | null {
  if (event.fixedRefreshMinute !== null) return null
  const windows = getCheckInDayWindows(event, initialRefreshMinute, changes)
  const window = getCheckInWindow(now, windows)
  if (window.phase === 'ended') return null
  const first = window.phase === 'upcoming' ? 0 : window.dayIndex! + 1
  for (let k = first; k <= event.days; k++) {
    const at = boundary(event, k, refreshMinute)
    if (at > now.getTime() && (k === 0 || at > Date.parse(windows[k - 1].startsAt))) {
      return { fromDayIndex: k, effectiveAt: new Date(at).toISOString() }
    }
  }
  return null
}

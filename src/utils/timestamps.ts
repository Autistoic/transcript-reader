import type { TranscriptSegment } from '../types'

const EDITOR_TIME = /^(\d+):(\d{2}):(\d{2})$/

export function parseEditorTime(value: string): number | null {
  const match = EDITOR_TIME.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  if (!Number.isSafeInteger(hours) || minutes > 59 || seconds > 59) return null
  return ((hours * 60 + minutes) * 60 + seconds) * 1000
}

export function isValidRange(start: string, end: string): boolean {
  const from = parseEditorTime(start)
  const to = parseEditorTime(end)
  return from !== null && to !== null && to > from
}

export function parseSourceTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const match = /^(\d+):(\d{2}):(\d{2})(?:[,.](\d{1,3}))?$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  if (!Number.isSafeInteger(hours) || minutes > 59 || seconds > 59) return null
  const fraction = match[4] ? Number(match[4].padEnd(3, '0')) : 0
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + fraction
}

export function formatSourceTime(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600).toString().padStart(2, '0')
  const m = Math.floor((total % 3600) / 60).toString().padStart(2, '0')
  const s = (total % 60).toString().padStart(2, '0')
  return `${h}:${m}:${s}`
}

export function findOverlappingSegments(
  segments: TranscriptSegment[],
  startMs: number,
  endMs: number,
): TranscriptSegment[] {
  return segments.filter((segment) => segment.startMs < endMs && segment.endMs > startMs)
}

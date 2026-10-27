import type { Annotation } from '../types'
import { isValidRange } from './timestamps'

export type AnnotationReadResult = {
  annotations: Annotation[]
  warning?: string
}

function storageKey(filename: string): string {
  return `whisper-annotations:${filename}`
}

function isAnnotation(value: unknown): value is Annotation {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<Annotation>
  return typeof item.id === 'string' && item.id.length > 0
    && typeof item.title === 'string' && item.title.trim().length > 0
    && typeof item.startTime === 'string' && typeof item.endTime === 'string'
    && isValidRange(item.startTime, item.endTime)
    && typeof item.interpretation === 'string' && item.interpretation.trim().length > 0
}

export function readAnnotations(filename: string): AnnotationReadResult {
  let saved: string | null
  try {
    saved = window.localStorage.getItem(storageKey(filename))
  } catch {
    return {
      annotations: [],
      warning: 'Browser storage is unavailable. Annotations will stay available for this session only.',
    }
  }
  if (saved === null) return { annotations: [] }

  let parsed: unknown
  try {
    parsed = JSON.parse(saved)
  } catch {
    return { annotations: [], warning: 'Saved annotations for this transcript are invalid and were left unchanged.' }
  }
  if (!Array.isArray(parsed) || !parsed.every(isAnnotation)) {
    return { annotations: [], warning: 'Saved annotations for this transcript are invalid and were left unchanged.' }
  }

  const ids = new Set<string>()
  for (const item of parsed) {
    if (ids.has(item.id)) {
      return { annotations: [], warning: 'Saved annotations for this transcript are invalid and were left unchanged.' }
    }
    ids.add(item.id)
  }

  return {
    annotations: parsed.map(({ id, title, startTime, endTime, interpretation }) => ({ id, title, startTime, endTime, interpretation })),
  }
}

export function writeAnnotations(filename: string, annotations: Annotation[]): boolean {
  try {
    const stored = annotations.map(({ id, title, startTime, endTime, interpretation }) => ({
      id,
      title,
      startTime,
      endTime,
      interpretation,
    }))
    window.localStorage.setItem(storageKey(filename), JSON.stringify(stored))
    return true
  } catch {
    return false
  }
}

import type { Transcript, TranscriptSegment } from '../types'
import { formatSourceTime, parseSourceTimestamp } from './timestamps'

const transcriptModules = import.meta.glob('../data/transcripts/*.json', {
  eager: false,
  import: 'default',
})

export const transcriptFiles = Object.keys(transcriptModules)
  .sort((a, b) => a.localeCompare(b))
  .map((path) => ({ path, filename: path.split('/').pop() ?? path }))

type RawSegment = {
  timestamps?: { from?: unknown; to?: unknown }
  offsets?: { from?: unknown; to?: unknown }
  text?: unknown
}

function getTime(offset: unknown, timestamp: unknown): number | null {
  if (typeof offset === 'number' && Number.isFinite(offset) && offset >= 0) return offset
  return parseSourceTimestamp(timestamp)
}

export function parseTranscript(raw: unknown, filename: string): Transcript {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { transcription?: unknown }).transcription)) {
    throw new Error('This file does not contain a valid “transcription” array.')
  }
  const source = raw as { transcription: unknown[]; language?: unknown }
  const segments: TranscriptSegment[] = []
  let skipped = 0
  source.transcription.forEach((item, sourceIndex) => {
    if (!item || typeof item !== 'object') { skipped += 1; return }
    const part = item as RawSegment
    const startMs = getTime(part.offsets?.from, part.timestamps?.from)
    const endMs = getTime(part.offsets?.to, part.timestamps?.to)
    if (startMs === null || endMs === null || endMs <= startMs || typeof part.text !== 'string') {
      skipped += 1
      return
    }
    segments.push({
      startMs,
      endMs,
      startLabel: formatSourceTime(startMs),
      endLabel: formatSourceTime(endMs),
      text: part.text,
      sourceIndex,
    })
  })
  return {
    filename,
    language: typeof source.language === 'string' ? source.language : undefined,
    segments,
    skipped,
  }
}

export async function loadTranscript(path: string, filename: string): Promise<Transcript> {
  const loader = transcriptModules[path]
  if (!loader) throw new Error('This transcript is no longer available. Rebuild the application and try again.')
  return parseTranscript(await loader(), filename)
}

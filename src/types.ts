export type TranscriptSegment = {
  startMs: number
  endMs: number
  startLabel: string
  endLabel: string
  text: string
  sourceIndex: number
}

export type Transcript = {
  filename: string
  language?: string
  segments: TranscriptSegment[]
  skipped: number
}

export type Annotation = {
  id: string
  title: string
  startTime: string
  endTime: string
  interpretation: string
}

export type Draft = Omit<Annotation, 'id'>

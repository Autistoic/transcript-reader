import { useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { AlertCircle, Check, ChevronDown, ChevronLeft, ChevronRight, Clipboard, FileText, GripVertical, Menu, PanelLeftClose, PanelLeftOpen, Plus, Search, Trash2, X } from 'lucide-react'
import type { Annotation, Draft, Transcript } from './types'
import { readAnnotations, writeAnnotations } from './utils/annotationStorage'
import { findOverlappingSegments, isValidRange, parseEditorTime } from './utils/timestamps'
import { loadTranscript, transcriptFiles } from './utils/transcripts'

type Panel = 'annotations' | 'editor' | 'transcript'
const emptyDraft: Draft = { title: '', startTime: '00:00:00', endTime: '00:00:00', interpretation: '' }

function App() {
  const [selectedPath, setSelectedPath] = useState('')
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [annotationCache, setAnnotationCache] = useState<Record<string, Annotation[]>>({})
  const [storageWarning, setStorageWarning] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [matches, setMatches] = useState<Transcript['segments']>([])
  const [searchedKey, setSearchedKey] = useState('')
  const [searchText, setSearchText] = useState('')
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [panel, setPanel] = useState<Panel>('editor')
  const [showTimestamps, setShowTimestamps] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [annotationShare, setAnnotationShare] = useState(0.55)
  const [interfaceScale, setInterfaceScale] = useState(1)
  const resizeStart = useRef<{ pointerX: number; editorWidth: number; totalWidth: number } | null>(null)
  const editorColumn = useRef<HTMLElement>(null)
  const transcriptColumn = useRef<HTMLElement>(null)

  const file = transcriptFiles.find((item) => item.path === selectedPath)
  const visibleFiles = useMemo(() => transcriptFiles.filter((item) => item.filename.toLowerCase().includes(searchText.trim().toLowerCase())), [searchText])
  const currentKey = `${draft.startTime}|${draft.endTime}`
  const isOutdated = searchedKey !== '' && searchedKey !== currentKey
  const hasSearch = searchedKey === currentKey && !isOutdated
  const dirty = activeId
    ? annotations.some((a) => a.id === activeId && (a.title !== draft.title || a.startTime !== draft.startTime || a.endTime !== draft.endTime || a.interpretation !== draft.interpretation))
    : Boolean(draft.title || draft.startTime || draft.endTime || draft.interpretation)

  function beginColumnResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (!editorColumn.current || !transcriptColumn.current) return
    event.preventDefault()
    resizeStart.current = {
      pointerX: event.clientX,
      editorWidth: editorColumn.current.getBoundingClientRect().width,
      totalWidth: editorColumn.current.getBoundingClientRect().width + transcriptColumn.current.getBoundingClientRect().width,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveColumnResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (!resizeStart.current) return
    const { pointerX, editorWidth, totalWidth } = resizeStart.current
    const minShare = Math.max(0.32, Math.min(0.5, 300 / totalWidth))
    const maxShare = Math.min(0.68, Math.max(0.5, 1 - 300 / totalWidth))
    const nextShare = Math.min(maxShare, Math.max(minShare, (editorWidth + event.clientX - pointerX) / totalWidth))
    setAnnotationShare(nextShare)
  }

  function endColumnResize() {
    resizeStart.current = null
  }

  function resizeWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const step = event.shiftKey ? 0.05 : 0.02
    const totalWidth = (editorColumn.current?.getBoundingClientRect().width ?? 0) + (transcriptColumn.current?.getBoundingClientRect().width ?? 0)
    const minShare = totalWidth ? Math.max(0.32, Math.min(0.5, 300 / totalWidth)) : 0.32
    const maxShare = totalWidth ? Math.min(0.68, Math.max(0.5, 1 - 300 / totalWidth)) : 0.68
    setAnnotationShare((share) => Math.min(maxShare, Math.max(minShare, share + (event.key === 'ArrowRight' ? step : -step))))
  }

  function commitAnnotations(next: Annotation[]) {
    setAnnotations(next)
    if (!transcript) return
    setAnnotationCache((cache) => ({ ...cache, [transcript.filename]: next }))
    if (writeAnnotations(transcript.filename, next)) setStorageWarning('')
    else setStorageWarning('Browser storage is unavailable. Annotations will stay available for this session only.')
  }

  function clearEditor() {
    setActiveId(null); setDraft(emptyDraft); setMatches([]); setSearchedKey(''); setError(''); setNotice('');
  }

  async function chooseTranscript(path: string, filename: string) {
    if (path === selectedPath || loading) { setSelectorOpen(false); return }
    if (annotations.length && !window.confirm('Switch transcripts? This transcript’s annotations will stay separate and be available when you return.')) return
    setLoading(true); setError(''); setNotice(''); setSelectorOpen(false); setSearchText('')
    setTranscript(null); setSelectedPath(''); setAnnotations([]); clearEditor()
    try {
      const loaded = await loadTranscript(path, filename)
      setTranscript(loaded); setSelectedPath(path)
      const saved = readAnnotations(filename)
      const restored = annotationCache[filename] ?? saved.annotations
      setAnnotations(restored)
      setAnnotationCache((cache) => ({ ...cache, [filename]: restored }))
      setStorageWarning(saved.warning ?? '')
      setNotice(`${filename} is ready to review.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load this transcript.')
    } finally { setLoading(false) }
  }

  function findTranscript() {
    setError(''); setNotice('')
    if (!transcript) { setError('Select a transcript before searching.'); return }
    if (!isValidRange(draft.startTime, draft.endTime)) {
      setError('Enter valid times as HH:MM:SS and make sure the end is later than the start.'); return
    }
    const start = parseEditorTime(draft.startTime)!
    const end = parseEditorTime(draft.endTime)!
    setMatches(findOverlappingSegments(transcript.segments, start, end))
    setSearchedKey(currentKey)
    setPanel('transcript')
  }

  function saveAnnotation() {
    setError(''); setNotice('')
    if (!draft.title.trim()) { setError('Add a title for this annotation.'); setPanel('editor'); return }
    if (!draft.interpretation.trim()) { setError('Add an interpretation or personal note.'); setPanel('editor'); return }
    if (!isValidRange(draft.startTime, draft.endTime)) { setError('Enter valid times as HH:MM:SS and make sure the end is later than the start.'); setPanel('editor'); return }
    if (!hasSearch) { setError('Find the transcript for this time range before saving.'); setPanel('transcript'); return }
    if (activeId) {
      commitAnnotations(annotations.map((item) => item.id === activeId ? { ...draft, id: activeId } : item))
      setNotice('Annotation updated.')
    } else {
      const created = { ...draft, id: crypto.randomUUID() }
      commitAnnotations([...annotations, created]); setActiveId(created.id); setNotice('Annotation saved.')
    }
  }

  function selectAnnotation(annotation: Annotation) {
    if (dirty && !window.confirm('Discard your unsaved changes and open this annotation?')) return
    setActiveId(annotation.id)
    setDraft({ title: annotation.title, startTime: annotation.startTime, endTime: annotation.endTime, interpretation: annotation.interpretation })
    const start = parseEditorTime(annotation.startTime)!, end = parseEditorTime(annotation.endTime)!
    setMatches(transcript ? findOverlappingSegments(transcript.segments, start, end) : [])
    setSearchedKey(`${annotation.startTime}|${annotation.endTime}`)
    setError(''); setNotice(''); setPanel('editor')
  }

  function deleteAnnotation(id: string) {
    const deletingActive = id === activeId
    commitAnnotations(annotations.filter((item) => item.id !== id))
    if (deletingActive) clearEditor()
    setNotice('Annotation deleted.')
  }

  function updateDraft(field: keyof Draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
    if (field === 'startTime' || field === 'endTime') setNotice('')
  }

  async function copyExcerpt() {
    if (!matches.length) return
    try { await navigator.clipboard.writeText(matches.map((item) => item.text).join('\n')); setNotice('Transcript excerpt copied.') }
    catch { setError('Clipboard access is unavailable in this browser.') }
  }

  return (
    <main className="app-shell" style={{ zoom: interfaceScale, width: '100%', maxWidth: interfaceScale > 1 ? 'none' : '1600px' } as CSSProperties}>
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><FileText size={17} /></div><span>fieldnotes<span className="brand-dot">.</span></span><span className="brand-divider" /><span className="topbar-title">Annotation workspace</span>{transcript && <span className="topbar-file"><FileText size={13} />{transcript.filename}<span className="meta-dot" />{transcript.segments.length} segments</span>}</div>
        <div className="topbar-right"><div className="size-controls" role="group" aria-label="Interface size"><span className="size-label">SIZE</span><button onClick={() => setInterfaceScale((size) => Math.max(1, Math.round((size - 0.1) * 10) / 10))} disabled={interfaceScale <= 1} aria-label="Decrease interface size">A−</button><span className="size-value">{Math.round(interfaceScale * 100)}%</span><button onClick={() => setInterfaceScale((size) => Math.min(1.4, Math.round((size + 0.1) * 10) / 10))} disabled={interfaceScale >= 1.4} aria-label="Increase interface size">A+</button></div><span className="session-indicator"><span />Session only</span><span className="avatar">R</span></div>
      </header>

      <div className="mobile-tabs" role="tablist" aria-label="Workspace panels">
        {(['annotations', 'editor', 'transcript'] as Panel[]).map((item) => <button key={item} className={panel === item ? 'active' : ''} onClick={() => setPanel(item)}>{item === 'annotations' ? 'Annotations' : item === 'editor' ? 'Editor' : 'Transcript'}{item === 'annotations' && annotations.length > 0 && <span className="tab-count">{annotations.length}</span>}</button>)}
      </div>

      <section className={`workspace-grid resizable-grid ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`} style={{ '--annotation-column': `${annotationShare}fr`, '--context-column': `${1 - annotationShare}fr` } as CSSProperties}>
        <aside className={`panel sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${panel === 'annotations' ? 'mobile-visible' : ''}`}>
          <div className="panel-heading"><div className="sidebar-heading-copy"><span className="step-label">01 / SOURCE</span><h2>Transcript</h2></div><button className="sidebar-collapse-toggle" onClick={() => setSidebarCollapsed((collapsed) => !collapsed)} aria-label={sidebarCollapsed ? 'Expand source and annotations panel' : 'Collapse source and annotations panel'} title={sidebarCollapsed ? 'Expand panel' : 'Collapse panel'}>{sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button></div>
          <div className="source-picker-wrap">
            <button className={`source-picker ${selectorOpen ? 'focused' : ''}`} onClick={() => setSelectorOpen((open) => !open)} aria-expanded={selectorOpen}>
              <span className="source-file-icon"><FileText size={15} /></span><span className="source-label"><strong>{file?.filename ?? 'Choose a transcript'}</strong><small>{file ? 'JSON transcript' : 'Select from project files'}</small></span><ChevronDown size={16} className="muted-icon" />
            </button>
            {selectorOpen && <div className="source-menu"><label className="search-box"><Search size={15} /><input autoFocus placeholder="Search transcripts…" value={searchText} onChange={(event) => setSearchText(event.target.value)} /></label><div className="source-options">{visibleFiles.length ? visibleFiles.map((item) => <button key={item.path} onClick={() => void chooseTranscript(item.path, item.filename)}><FileText size={14} /><span>{item.filename}</span>{item.path === selectedPath && <Check size={14} className="check-icon" />}</button>) : <div className="source-empty">{transcriptFiles.length ? 'No files match your search.' : 'No transcript JSON files found in src/data/transcripts.'}</div>}</div></div>}
          </div>
          <div className="source-facts"><div><span className="fact-label">SEGMENTS</span><span>{transcript ? transcript.segments.length : '—'}</span></div><div><span className="fact-label">LANGUAGE</span><span>{transcript?.language ?? '—'}</span></div></div>
          {transcript?.skipped ? <div className="warning-note"><AlertCircle size={14} />{transcript.skipped} segment{transcript.skipped === 1 ? '' : 's'} skipped due to missing or invalid timing.</div> : null}
          <div className="section-separator" />
          <div className="annotation-heading"><div><span className="step-label">02 / NOTES</span><h2>Annotations <span className="count-badge">{annotations.length}</span></h2></div><button className="icon-button add-button" title="New annotation" aria-label="New annotation" onClick={() => { if (dirty && !window.confirm('Discard your unsaved changes and start a new annotation?')) return; clearEditor(); setPanel('editor') }}><Plus size={17} /></button></div>
          <div className="annotation-list">
            {annotations.length === 0 ? <div className="empty-annotations"><div className="empty-icon"><Menu size={17} /></div><strong>No annotations yet</strong><p>Mark a moment in the transcript and add your interpretation.</p><button className="text-action" onClick={() => { clearEditor(); setPanel('editor') }}><Plus size={14} /> Create your first annotation</button></div> : annotations.map((annotation) => <article key={annotation.id} className={`annotation-card ${activeId === annotation.id ? 'selected' : ''}`}>
              <button className="annotation-main" onClick={() => selectAnnotation(annotation)}><span className="annotation-card-title">{annotation.title || 'Untitled annotation'}</span><span className="annotation-time">{annotation.startTime} <span>→</span> {annotation.endTime}</span><span className="annotation-preview">{annotation.interpretation}</span></button><button aria-label={`Delete ${annotation.title}`} className="delete-button" onClick={() => deleteAnnotation(annotation.id)}><Trash2 size={14} /></button>
            </article>)}
          </div>
          <div className={`sidebar-footnote ${storageWarning ? 'storage-warning' : ''}`} role={storageWarning ? 'status' : undefined}><span className="tiny-lock">{storageWarning ? '!' : '◉'}</span>{storageWarning || 'Annotations are saved in this browser'}</div>
        </aside>

        <section ref={editorColumn} className={`panel editor-panel ${panel === 'editor' ? 'mobile-visible' : ''}`}>
          <div className="panel-heading editor-titlebar"><div><span className="step-label">03 / ANNOTATE</span><h2>{activeId ? 'Edit annotation' : 'New annotation'}</h2></div>{activeId && <button className="quiet-button" onClick={clearEditor}><X size={14} /> Close</button>}</div>
          <div className="editor-content">
            <div className="form-field"><label htmlFor="annotation-title">Title <span className="required">*</span></label><input id="annotation-title" type="text" placeholder="Give this moment a name" value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} /></div>
            <div className="time-field-group"><div className="form-field"><label htmlFor="start-time">Start time <span className="required">*</span></label><div className="input-with-suffix"><input id="start-time" type="text" inputMode="numeric" placeholder="00:00:00" maxLength={16} value={draft.startTime} onChange={(event) => updateDraft('startTime', event.target.value)} /><span>HH:MM:SS</span></div></div><div className="time-arrow"><ChevronRight size={16} /></div><div className="form-field"><label htmlFor="end-time">End time <span className="required">*</span></label><div className="input-with-suffix"><input id="end-time" type="text" inputMode="numeric" placeholder="00:00:00" maxLength={16} value={draft.endTime} onChange={(event) => updateDraft('endTime', event.target.value)} /><span>HH:MM:SS</span></div></div></div>
            <p className="field-hint">Use 24-hour time. Hours can go beyond 23.</p>
            <div className="form-field interpretation-field"><label htmlFor="interpretation">Interpretation <span className="required">*</span></label><textarea id="interpretation" placeholder="What stands out in this moment? Add context, a thought, or a question…" value={draft.interpretation} onChange={(event) => updateDraft('interpretation', event.target.value)} /><div className="textarea-foot"><span>Personal notes stay in this session</span><span>{draft.interpretation.length}</span></div></div>
            {error && <div className="feedback error-feedback"><AlertCircle size={15} />{error}</div>}{notice && <div className="feedback success-feedback"><Check size={15} />{notice}</div>}
            <div className="editor-actions"><button className="button secondary" onClick={() => { if (dirty && !window.confirm('Discard your unsaved changes?')) return; clearEditor() }}>Cancel</button><button className="button find-button" onClick={findTranscript}><Search size={15} /> Find transcript</button><button className="button primary" onClick={saveAnnotation}>{activeId ? 'Update annotation' : 'Save annotation'}<ChevronRight size={15} /></button></div>
            {dirty && <div className="unsaved-note"><span className="unsaved-dot" /> Unsaved changes</div>}
          </div>
          <div className="editor-bottom"><span>TRANSCRIPT ANNOTATION</span><span>SESSION WORKSPACE <span className="bottom-dot">●</span></span></div>
        </section>

        <div className="column-resizer" role="separator" aria-orientation="vertical" aria-label="Resize annotation and transcript columns" aria-valuemin={32} aria-valuemax={68} aria-valuenow={Math.round(annotationShare * 100)} aria-valuetext={`Annotation column ${Math.round(annotationShare * 100)} percent`} tabIndex={0} onPointerDown={beginColumnResize} onPointerMove={moveColumnResize} onPointerUp={endColumnResize} onPointerCancel={endColumnResize} onKeyDown={resizeWithKeyboard}><GripVertical size={17} aria-hidden="true" /></div>

        <section ref={transcriptColumn} className={`panel transcript-panel ${panel === 'transcript' ? 'mobile-visible' : ''}`}>
          <div className="transcript-header"><div><span className="step-label">04 / CONTEXT</span><h2>Matching transcript</h2></div>{hasSearch && <div className="transcript-actions"><button className="timestamp-toggle" onClick={() => setShowTimestamps((visible) => !visible)} aria-pressed={showTimestamps}>{showTimestamps ? 'Hide timestamps' : 'Show timestamps'}</button><button className="copy-button" onClick={() => void copyExcerpt()} disabled={!matches.length}><Clipboard size={14} /> Copy excerpt</button></div>}</div>
          {hasSearch ? <div className="results-summary"><span className="result-count">{matches.length} <span>{matches.length === 1 ? 'segment' : 'segments'}</span></span><span className="summary-divider" /><span className="range-label">{draft.startTime} <ChevronRight size={12} /> {draft.endTime}</span></div> : <div className="results-summary awaiting"><span className="summary-dot" />{isOutdated ? 'Time range changed' : 'Awaiting a time range'}<span className="summary-divider" /><span className="range-label">Search to see context</span></div>}
          <div className="transcript-scroll">
            {!transcript ? <div className="transcript-empty"><div className="empty-icon large"><FileText size={19} /></div><strong>Select a transcript</strong><p>Choose a project transcript to begin reviewing and annotating its spoken moments.</p><button className="button secondary" onClick={() => { setPanel('annotations'); setSelectorOpen(true) }}>Browse transcripts <ChevronRight size={14} /></button></div>
              : !hasSearch ? <div className="transcript-empty"><div className={`empty-icon large ${isOutdated ? 'amber-icon' : ''}`}>{isOutdated ? <AlertCircle size={18} /> : <Search size={18} />}</div><strong>{isOutdated ? 'Results need a refresh' : 'Find a moment in the transcript'}</strong><p>{isOutdated ? 'Your time range changed. Find the transcript again to update the excerpt before saving.' : 'Enter a start and end time in the editor, then find the matching segments here.'}</p><button className="button find-button" onClick={findTranscript}><Search size={14} /> Find transcript</button></div>
              : matches.length === 0 ? <div className="transcript-empty"><div className="empty-icon large"><Search size={18} /></div><strong>No segments in this range</strong><p>There are no transcript segments overlapping {draft.startTime} to {draft.endTime}. Try adjusting the time range.</p></div>
              : showTimestamps ? <div className="segment-list">{matches.map((segment) => <article className="segment" key={segment.sourceIndex}><div className="segment-time"><span className="play-marker">▸</span>{segment.startLabel}<span className="time-separator">—</span>{segment.endLabel}</div><p>{segment.text}</p></article>)}</div>
              : <p className="transcript-prose">{matches.map((segment) => segment.text).join(' ')}</p>}
          </div>
          <div className="transcript-footer"><span>{transcript ? transcript.filename : 'NO SOURCE SELECTED'}</span><span>{hasSearch ? `SHOWING ${matches.length} OF ${transcript?.segments.length ?? 0}` : 'ORIGINAL TRANSCRIPT TEXT'}</span></div>
        </section>
      </section>
      <footer className="page-footer"><span>FIELDNOTES <span className="footer-dot">●</span> TRANSCRIPT TOOLS</span><span>Built for careful listening</span></footer>
      <button className="mobile-next" onClick={() => setPanel(panel === 'annotations' ? 'editor' : panel === 'editor' ? 'transcript' : 'annotations')} aria-label="Next panel"><ChevronLeft size={15} /> {panel === 'annotations' ? 'Editor' : panel === 'editor' ? 'Transcript' : 'Annotations'} <ChevronRight size={15} /></button>
    </main>
  )
}

export default App

import { useState, useRef, useMemo } from 'preact/hooks'
import { parseMdSections, parseTxtSections, parseHtmlSections, checkConformance, extractClauses, STRUCTURES } from '../conformance'

// Convert pdfjs page text items to a line-structured string.
// Groups items by Y coordinate (transform[5]) so that distinct drawn lines become
// separate \n-separated lines, instead of one flat space-joined blob.
// Without this, parseTxtSections sees headings like "1 Scope2 Normative references"
// as a single malformed clause and returns no structure.
function pdfPageToText(items) {
  const Y_TOL = 2 // points — items within this tolerance share a line
  const textItems = items.filter(item => 'str' in item && item.str)
  if (!textItems.length) return ''

  // Group by approximate Y position
  const lines = [] // { y: number, items: { x: number, str: string }[] }
  for (const item of textItems) {
    const y = item.transform[5]
    const x = item.transform[4]
    let line = lines.find(l => Math.abs(l.y - y) <= Y_TOL)
    if (!line) { line = { y, items: [] }; lines.push(line) }
    line.items.push({ x, str: item.str })
  }

  // Sort lines top-to-bottom (PDF Y origin is bottom-left → descending Y = top first)
  lines.sort((a, b) => b.y - a.y)

  return lines.map(line => {
    line.items.sort((a, b) => a.x - b.x) // left-to-right
    let text = ''
    for (const { str } of line.items) {
      if (!text) { text = str; continue }
      const needsSpace = text[text.length - 1] !== ' ' && str[0] !== ' '
      text += (needsSpace ? ' ' : '') + str
    }
    return text
  }).filter(t => t.trim()).join('\n')
}

// Format a reset_at ISO string into human-readable UTC / Beijing / countdown strings
function formatResetTime(resetAt) {
  if (!resetAt) return null
  const reset = new Date(resetAt)
  const diffMs = reset.getTime() - Date.now()
  const h = Math.max(0, Math.floor(diffMs / 3600000))
  const m = Math.max(0, Math.floor((diffMs % 3600000) / 60000))
  const utcDate = reset.toISOString().slice(0, 10)  // YYYY-MM-DD
  // At 00:00 UTC, Beijing (UTC+8) is 08:00 the same calendar day
  const bjDate = new Date(reset.getTime() + 8 * 3600000).toISOString().slice(0, 10)
  return { utcDate, bjDate, countdown: `~${h}h ${m}m` }
}

const STANDARD_OPTIONS = [
  { label: 'GB/T 1.1-2020 (Chinese national standard)', key: 'gbt11' },
  { label: 'ISO/IEC Directives Part 2 (International standard)', key: 'isoiec' },
]

export default function Review({ navigate }) {
  const [structKey, setStructKey] = useState('gbt11')
  const [report, setReport] = useState(null)
  const [fileName, setFileName] = useState('')
  const [parseNote, setParseNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [contentReview, setContentReview] = useState(false)
  const [llmReview, setLlmReview] = useState(null)  // {model, reviews} | {error}
  const [llmLoading, setLlmLoading] = useState(false)
  const inputRef = useRef(null)

  async function processFile(file) {
    setLoading(true)
    setReport(null)
    setLlmReview(null)
    setError('')
    setFileName(file.name)

    try {
      const struct = STRUCTURES[structKey]
      const name = file.name.toLowerCase()
      let sections = []
      let note = ''
      let fileContent = null
      let fileFormat = null

      if (name.endsWith('.md')) {
        const text = await file.text()
        fileContent = text
        fileFormat = 'md'
        sections = parseMdSections(text)
        note = 'Parsed heading lines (# ..., ## ..., etc.)'
      } else if (name.endsWith('.txt')) {
        const text = await file.text()
        fileContent = text
        fileFormat = 'txt'
        sections = parseTxtSections(text)
        note = 'Parsed numbered section lines (e.g. 1 Scope, 2 Normative References)'
      } else if (name.endsWith('.docx')) {
        const mammoth = await import('mammoth')
        const buf = await file.arrayBuffer()
        const result = await mammoth.convertToHtml({ arrayBuffer: buf })
        fileContent = result.value
        fileFormat = 'html'
        sections = parseHtmlSections(result.value)
        note = 'Extracted paragraphs with Heading 1–6 styles from .docx'
        if (sections.length === 0) {
          setError('Could not extract headings from .docx. Ensure paragraph styles are set to Heading 1–6, or save as .md/.txt.')
          setLoading(false)
          return
        }
      } else if (name.endsWith('.pdf')) {
        const pdfjs = await import('pdfjs-dist')
        // Point pdfjs at the matching worker on unpkg (Cloudflare CDN).
        // Avoids bundling 2.2 MB inline; CF Puppeteer fetches it fast over CF network.
        const ver = pdfjs.version || '6.0.227'
        pdfjs.GlobalWorkerOptions.workerSrc =
          `https://unpkg.com/pdfjs-dist@${ver}/build/pdf.worker.mjs`
        const buf = await file.arrayBuffer()
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise
        const pageTexts = []
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const tc = await page.getTextContent()
          pageTexts.push(pdfPageToText(tc.items))
        }
        const fullText = pageTexts.join('\n')
        // Scanned/image PDF guard — no text layer means extracted text is empty or tiny
        if (fullText.trim().length < 200) {
          setError(
            'PDF 无文本层，无法提取文本。请先 OCR 或转换为可复制文本的 PDF / .docx / .txt 后再上传。\n' +
            'This PDF has no text layer. Please OCR it or convert to a text-based PDF / .docx / .txt before uploading.'
          )
          setLoading(false)
          return
        }
        fileContent = fullText
        fileFormat = 'txt'
        sections = parseTxtSections(fullText)
        note = 'Extracted text layer from PDF, parsed as numbered sections'
      } else if (name.endsWith('.doc')) {
        setError(
          '.doc（旧版 Word 格式）暂不支持，请在 Word 中另存为 .docx 后重新上传。\n' +
          'Legacy .doc format is not supported — please re-save as .docx in Word and upload again.'
        )
        setLoading(false)
        return
      } else {
        setError('Unsupported file type. Please upload .docx, .pdf, .md, or .txt.')
        setLoading(false)
        return
      }

      if (sections.length === 0) {
        setError('No headings or numbered sections found. For Markdown use # Heading syntax; for plain text use numbered sections like 1 Scope.')
        setLoading(false)
        return
      }

      setParseNote(note)
      const structural = checkConformance(sections, struct)
      setReport(structural)
      setLoading(false)

      // LLM content review (non-blocking, runs after structural)
      if (contentReview && fileContent) {
        setLlmLoading(true)
        try {
          const clauses = extractClauses(fileContent, fileFormat)
          if (clauses.length === 0) {
            setLlmReview({ noClausesExtracted: true })
            setLlmLoading(false)
            return
          }
          const resp = await fetch('/api/review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ standard: structKey, clauses, structural }),
          })
          if (resp.ok) {
            setLlmReview(await resp.json())
          } else {
            const err = await resp.json().catch(() => ({}))
            setLlmReview({
              error: err.error || `HTTP ${resp.status}`,
              reset_at: err.reset_at,
              retry_after_seconds: err.retry_after_seconds,
            })
          }
        } catch (e) {
          setLlmReview({ error: e.message })
        }
        setLlmLoading(false)
      }
      return
    } catch (e) {
      setError(`Error processing file: ${e.message}`)
    }
    setLoading(false)
  }

  function onFileChange(e) {
    const file = e.target.files[0]
    if (file) processFile(file)
  }

  function onDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  return (
    <div class="subpage">
      <div class="sub-back">
        <button class="btn btn-secondary btn-back" onClick={() => navigate('landing')}>← Back to home</button>
      </div>

      <div class="sub-hero">
        <div class="sub-hero-eyebrow">VISIONOX &middot; 标准化工具 &middot; REVIEW</div>
        <h1 class="sub-hero-title">Upload Draft for Review</h1>
        <p class="sub-hero-sub">Structural conformance check — GB/T 1.1-2020 or ISO/IEC Directives Part 2</p>
      </div>

      <div class="sub-body">
        <div style="margin-bottom:20px">
          <label class="field-label" for="std-select">Check against / 对照标准</label>
          <select
            id="std-select"
            class="field-select"
            value={structKey}
            onChange={e => { setStructKey(e.target.value); setReport(null) }}
          >
            {STANDARD_OPTIONS.map(o => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>

        <div style="margin-bottom:20px;display:flex;align-items:center;gap:10px">
          <input
            id="content-review-toggle"
            type="checkbox"
            checked={contentReview}
            onChange={e => setContentReview(e.target.checked)}
            style="width:16px;height:16px;cursor:pointer"
          />
          <label for="content-review-toggle" style="cursor:pointer;font-size:14px;color:var(--vx-text)">
            Content Review (LLM) — per-clause AI analysis after structural check
          </label>
        </div>

        <label class="field-label">Upload your draft / 上传草稿</label>
        <div
          class={`upload-zone${dragOver ? ' drag-over' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".docx,.pdf,.md,.txt"
            style="display:none"
            onChange={onFileChange}
          />
          {loading ? (
            <><div class="upload-zone-icon"><span class="spinner" style="border-color:rgba(36,63,147,.3);border-top-color:#243f93" /></div>
            <div class="upload-zone-label">Analysing…</div></>
          ) : (
            <>
              <div class="upload-zone-icon">📂</div>
              <div class="upload-zone-label">Click to upload or drag & drop</div>
              <div class="upload-zone-sub">Supported: .docx · .pdf · .md · .txt — Note: .doc → re-save as .docx first</div>
            </>
          )}
        </div>

        {error && (
          <div class="result-banner result-fail" style="margin-top:16px">{error}</div>
        )}

        {report && !loading && (
          <ReportView report={report} fileName={fileName} parseNote={parseNote} />
        )}

        {/* LLM content review results */}
        {contentReview && report && !loading && (
          <div style="margin-top:24px">
            <div class="section-title" style="margin-bottom:12px">🤖 Content Review (LLM)</div>
            {llmLoading && (
              <div style="display:flex;align-items:center;gap:10px;color:var(--vx-muted);font-size:14px">
                <span class="spinner" style="border-color:rgba(36,63,147,.3);border-top-color:#243f93;width:16px;height:16px;flex-shrink:0" />
                Analysing clause content with AI…
              </div>
            )}
            {!llmLoading && llmReview?.noClausesExtracted && (
              <div class="result-banner result-warn" style="font-size:13px">
                ⚠️ 无法从该文档提取条款正文（可能是 Word 自动编号，标题未含显式编号）——结构检查结果仍有效。 / Could not extract clause bodies (Word auto-numbering?) — structural results above are still valid.
              </div>
            )}
            {!llmLoading && llmReview && !llmReview.noClausesExtracted && (() => {
              const limitError = (llmReview.error === 'quota_exceeded' || llmReview.error === 'rate_limited')
                ? llmReview.error : null
              // Only count reviews that actually completed — entries with error_code are failed attempts
              const successfulReviews = (llmReview.reviews || []).filter(r => !r.error_code)
              const hasSuccessful = successfulReviews.length > 0
              return (
                <>
                  {limitError === 'quota_exceeded' && (() => {
                    const t = formatResetTime(llmReview.reset_at)
                    const resetDesc = t
                      ? `${t.utcDate} 00:00 UTC（北京时间 ${t.bjDate} 08:00，约 ${t.countdown} 后）`
                      : '次日 00:00 UTC'
                    const resetDescEn = t
                      ? `${t.utcDate} 00:00 UTC / ${t.bjDate} 08:00 Beijing (in ${t.countdown})`
                      : 'next day 00:00 UTC'
                    return (
                      <div class="result-banner result-warn" style="font-size:13px">
                        ⚠️ AI 内容评审今日额度已用尽（Workers AI 免费额度 10,000 Neurons/天）。将于 <strong>{resetDesc}</strong> 恢复。结构检查结果仍然有效。<br />
                        AI content review daily quota reached (Workers AI free tier: 10,000 Neurons/day). Resets at <strong>{resetDescEn}</strong>. Structural results above are still valid.
                      </div>
                    )
                  })()}
                  {limitError === 'rate_limited' && (
                    <div class="result-banner result-warn" style="font-size:13px">
                      ⚠️ AI 评审请求过于频繁，请约 1 分钟后重试。结构检查仍有效。<br />
                      AI review rate limit reached — please retry in ~1 minute. Structural results above are still valid.
                    </div>
                  )}
                  {llmReview.error && !limitError && (
                    <div class="result-banner result-warn" style="font-size:13px">
                      ⚠️ Content review unavailable — {llmReview.error}. Structural results above are still valid.
                    </div>
                  )}
                  {/* True partial: limit hit mid-review AND some clauses succeeded — show reason + results */}
                  {limitError && hasSuccessful && (
                    <div class="result-banner result-warn" style="font-size:13px;margin-top:8px">
                      {limitError === 'quota_exceeded'
                        ? '⚠️ 余下条款因今日 AI 额度用尽未评（次日 00:00 UTC 恢复）。以下为已评条款结果。/ Remaining clauses not reviewed — daily quota exhausted. Results below are for reviewed clauses only.'
                        : '⚠️ 余下条款因 AI 限流未评，请约 1 分钟后重试整个文档。以下为已评条款结果。/ Remaining clauses not reviewed — rate limit hit. Retry in ~1 min. Results below are for reviewed clauses only.'
                      }
                    </div>
                  )}
                  {/* Only render results when there are genuinely completed clause reviews */}
                  {hasSuccessful && (
                    <LlmReviewView llmReview={{ ...llmReview, reviews: successfulReviews }} />
                  )}
                </>
              )
            })()}
          </div>
        )}
      </div>
    </div>
  )
}

function ReportView({ report, fileName, parseNote }) {
  return (
    <div style="margin-top:24px">
      <div class={`result-banner ${report.passed ? 'result-pass' : 'result-fail'}`}>
        {report.passed
          ? `✅ Structural conformance PASS — ${fileName} matches the required element order.`
          : `❌ Structural conformance FAIL — ${report.missing_required.length + report.order_violations.length} issue(s) found in ${fileName}.`
        }
      </div>

      <div class="metrics">
        <div class="metric-card">
          <div class="metric-value">{report.total_sections}</div>
          <div class="metric-label">Sections found</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">{report.required_count}</div>
          <div class="metric-label">Required elements</div>
        </div>
        <div class="metric-card">
          <div class="metric-value" style={report.missing_required.length > 0 ? 'color:#c0392b' : ''}>
            {report.missing_required.length}
          </div>
          <div class="metric-label">Missing required</div>
        </div>
        <div class="metric-card">
          <div class="metric-value" style={report.order_violations.length > 0 ? 'color:#e67e22' : ''}>
            {report.order_violations.length}
          </div>
          <div class="metric-label">Order violations</div>
        </div>
      </div>

      <p class="file-caption">File: <strong>{fileName}</strong> · {parseNote}</p>

      {report.missing_required.length > 0 && (
        <>
          <div class="section-title">❌ Missing Required Elements</div>
          <p style="font-size:12px;color:var(--vx-muted);margin-bottom:10px">
            These elements are required by the standard but were not found in the uploaded document.
          </p>
          <ul class="issue-list">
            {report.missing_required.map(item => (
              <li key={item.id} class="issue-item">
                <strong>{item.name_en} / {item.name_zh}</strong>
                {item.clause_number && <> (Clause {item.clause_number})</>}
                <span class="issue-badge badge-required">
                  {item.requirement.includes('shell') ? 'Required shell' : 'Required'}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {report.order_violations.length > 0 && (
        <>
          <div class="section-title">⚠️ Element Order Violations</div>
          <p style="font-size:12px;color:var(--vx-muted);margin-bottom:10px">
            These elements appear out of the required order.
          </p>
          <ul class="issue-list">
            {report.order_violations.map((v, i) => (
              <li key={i} class="issue-item">
                <strong>{v.element} / {v.name_zh}</strong> — found at position {v.found_at + 1},
                should appear after position {v.expected_after + 1}.
                Heading: <code>{v.heading}</code>
              </li>
            ))}
          </ul>
        </>
      )}

      {report.found_elements.length > 0 && (
        <details style="margin-top:20px">
          <summary>✅ Matched elements ({report.found_elements.length})</summary>
          <ul class="found-list" style="margin-top:8px">
            {report.found_elements.map((f, i) => (
              <li key={i} class="found-item">
                ✅ <strong>{f.element}</strong>{f.name_zh && ` / ${f.name_zh}`}
                {f.clause_number && ` Cl.${f.clause_number}`}
                &nbsp;— <em>{f.heading}</em> (pos {f.position + 1})
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

const SEVERITY_STYLE = {
  '高': { background: '#fde8e8', color: '#c0392b', label: '高' },
  '中': { background: '#fef3cd', color: '#856404', label: '中' },
  '低': { background: '#e8f4fd', color: '#1a6fa0', label: '低' },
}

function LlmReviewView({ llmReview }) {
  const { model, reviews } = llmReview
  const totalIssues = reviews.reduce((n, r) => n + (r.issues?.length || 0), 0)
  const clausesWithIssues = reviews.filter(r => r.issues?.length > 0)

  return (
    <div>
      <p style="font-size:12px;color:var(--vx-muted);margin-bottom:14px">
        Model: <code>{model}</code> · {reviews.length} clause(s) reviewed · {totalIssues} issue(s) found
      </p>

      {totalIssues === 0 && (
        <div class="result-banner result-pass" style="font-size:14px">
          ✅ No content issues found in reviewed clauses.
        </div>
      )}

      {clausesWithIssues.map(r => (
        <div key={r.clause_id} style="margin-bottom:20px;border:1px solid var(--vx-border);border-radius:8px;overflow:hidden">
          <div style="background:var(--vx-surface);padding:10px 14px;font-size:13px;font-weight:600;border-bottom:1px solid var(--vx-border)">
            Clause {r.clause_id} — {r.title}
            <span style="margin-left:8px;font-weight:400;color:var(--vx-muted)">({r.issues.length} issue{r.issues.length !== 1 ? 's' : ''})</span>
          </div>
          <ul style="list-style:none;margin:0;padding:0">
            {r.issues.map((issue, i) => {
              const sev = SEVERITY_STYLE[issue.severity] || SEVERITY_STYLE['低']
              return (
                <li key={i} style="padding:10px 14px;border-bottom:1px solid var(--vx-border);font-size:13px">
                  <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:4px">
                    <span style={`background:${sev.background};color:${sev.color};padding:1px 7px;border-radius:4px;font-size:11px;font-weight:700;flex-shrink:0`}>
                      {sev.label}
                    </span>
                    <span style="background:var(--vx-surface);color:var(--vx-muted);padding:1px 7px;border-radius:4px;font-size:11px;flex-shrink:0">
                      {issue.rule}
                    </span>
                    <span>{issue.problem}</span>
                  </div>
                  {issue.suggestion && (
                    <div style="margin-left:76px;color:var(--vx-muted);font-size:12px">
                      💡 {issue.suggestion}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      {reviews.filter(r => r.error).map(r => (
        <div key={r.clause_id} style="font-size:12px;color:var(--vx-muted);margin-bottom:4px">
          ⚠️ Clause {r.clause_id}: {r.error}
        </div>
      ))}
    </div>
  )
}

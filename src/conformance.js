// conformance.js — port of app.py _parse_*_sections / _match_element / _check_conformance
//                  + clause body extraction for LLM content review
// Logic must stay in parity with the Python implementation (DC3 gate).

import gbt11 from '../data/gbt11_structure.json'
import isoiec from '../data/isoiec_directives_structure.json'

export const STRUCTURES = { gbt11, isoiec }

// Mirror of app.py _ELEMENT_KW
const ELEMENT_KW = {
  cover:                 ['cover', 'title page', '封面'],
  contents:              ['table of contents', 'contents', '目次'],
  foreword:              ['foreword', '前言'],
  introduction:          ['introduction', '引言'],
  scope:                 ['scope', '范围'],
  normative_references:  ['normative references', 'normative reference', '规范性引用'],
  terms_and_definitions: ['terms and definitions', 'terms, definitions', '术语和定义', '术语'],
  symbols_abbreviations: ['symbols', 'abbreviations', '符号', '缩略语'],
  technical_clauses:     ['requirements', 'test method', '技术要求', '性能'],
  normative_annexes:     ['annex', 'normative annex', '规范性附录'],
  informative_annexes:   ['annex', 'informative annex', '资料性附录'],
  bibliography:          ['bibliography', 'references', '参考文献'],
  index:                 ['index', '索引'],
}

export function parseMdSections(content) {
  const sections = []
  for (const line of content.split('\n')) {
    const m = line.trimEnd().match(/^(#{1,6})\s+(.+)/)
    if (m) {
      const level = m[1].length
      const text = m[2].trim()
      const cn = text.match(/^(\d+(?:\.\d+)*)\s+(.*)/)
      sections.push({
        level,
        text,
        clause_number: cn ? cn[1] : null,
        name: cn ? cn[2].trim() : text,
      })
    }
  }
  return sections
}

// TOC entry suffix (used inside confirmed CONTENTS blocks):
// dot-leaders OR 3+ spaces, page number 1-4 digits.
const TOC_ENTRY_SUFFIX = /(?:\.{2,}|\s{3,})\s*\d{1,4}\s*$/

// Standalone line (or with a paragraph-number prefix like "1 CONTENTS") that starts a TOC block.
// The optional (?:\d+\s+)? handles CDV/draft PDFs that prefix every paragraph with a sequential integer.
const TOC_BLOCK_HEADING = /^(?:\d+\s+)?(?:table\s+of\s+contents|contents|目次|目录)\s*$/i

// Strip a 2+-digit paragraph-number prefix (IEC CDV / tracked-changes format) when the inner
// content looks like a real section heading. Returns the inner content if stripped, else the
// original line. Handles: "114 1 Scope…" → "1 Scope…", "39 FOREWORD" → "FOREWORD".
// Does NOT strip when the inner content is plain body text ("82 This document was drafted…").
function _stripParaNum(line) {
  const pm = line.match(/^(\d{2,})\s+(.+)$/)
  if (!pm) return line
  const inner = pm[2]
  if (/^\d+(?:\.\d+)*(?:\.\s*\d+)*\s+./.test(inner) ||    // numbered clause (incl. spaced "6. 2 .1")
      /^(?:Annex|附录)\s*[A-Z]/i.test(inner) ||             // annex heading
      /^(?:Foreword|Introduction|Bibliography|前言|引言|参考文献)\b/i.test(inner)) { // structural keyword
    return inner
  }
  return line
}

export function parseTxtSections(content) {
  const sections = []
  let inToc = false

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    if (TOC_BLOCK_HEADING.test(line)) { inToc = true; continue }

    if (inToc) {
      // Exit TOC when we see a real body heading (no suffix match) after stripping any para-num prefix.
      // TOC_ENTRY_SUFFIX covers both dot-leader and space-padded page number patterns.
      const inner = _stripParaNum(line)
      const isBodyHeading =
        !TOC_ENTRY_SUFFIX.test(inner) && (
          /^(\d+(?:\.\d+)*\.?)\s+/.test(inner) ||
          /^(Foreword|Introduction|Bibliography|前言|引言|参考文献)$/i.test(inner) ||
          /^((?:Annex|附录)\s*[A-Z])(?:[\s（(].*)?$/i.test(inner)
        )
      if (isBodyHeading) { inToc = false } else { continue }
    }

    const procLine = _stripParaNum(line)

    // Primary: numbered clause (1 Scope, 5.1 Requirements, etc.)
    const m = procLine.match(/^(\d+(?:\.\d+)*\.?)\s+(.+)/)
    if (m && m[2].length > 1) {
      // Skip TOC entries even without a CONTENTS heading: dot leaders OR space-padded page number.
      if (TOC_ENTRY_SUFFIX.test(procLine)) continue
      const cn = m[1].replace(/\.$/, '')
      const name = m[2].trim()
      if (/^(CONTENTS|目次|目录|Table of Contents)$/i.test(name)) continue
      // Skip large bare integers — unstripped CDV paragraph numbers; real clauses rarely exceed 30.
      const firstNum = parseInt(cn.split('.')[0])
      if (firstNum > 30 && !cn.includes('.')) continue
      const level = cn.split('.').length
      sections.push({ level, text: `${cn} ${name}`, clause_number: cn, name })
      continue
    }
    // Conservative: annex headings
    const am = procLine.match(/^((?:Annex|附录)\s*[A-Z])(?:[\s（(].*)?$/i)
    if (am) {
      const cn = am[1].replace(/\s+/, ' ')
      sections.push({ level: 1, text: procLine, clause_number: cn, name: procLine })
      continue
    }
    // Conservative: GB/T structural keyword headings
    if (/^(Foreword|Introduction|Bibliography|前言|引言|参考文献)$/i.test(procLine)) {
      sections.push({ level: 1, text: procLine, clause_number: null, name: procLine })
    }
  }
  return sections
}

// Parses mammoth HTML output (h1-h6 → sections)
export function parseHtmlSections(html) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const sections = []
  for (const el of doc.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    const level = parseInt(el.tagName[1])
    const text = el.textContent.trim()
    if (!text) continue
    const cn = text.match(/^(\d+(?:\.\d+)*)\s+(.*)/)
    sections.push({
      level,
      text,
      clause_number: cn ? cn[1] : null,
      name: cn ? cn[2].trim() : text,
    })
  }
  return sections
}

function matchElement(el, sections) {
  const eid = el.id || ''
  const clause = el.clause_number
  if (clause && clause !== 'varies' && clause !== 'Annex A, B, ...' && clause !== 'Annex X, Y, ...') {
    for (let i = 0; i < sections.length; i++) {
      if (sections[i].clause_number === String(clause)) return i
    }
  }
  const keywords = ELEMENT_KW[eid] || []
  for (let i = 0; i < sections.length; i++) {
    const textLow = sections[i].text.toLowerCase()
    if (keywords.some(kw => textLow.includes(kw.toLowerCase()))) return i
  }
  return null
}

export function checkConformance(sections, struct) {
  const elements = struct.elements
  const required = elements.filter(e =>
    e.required === 'required' || e.required === 'required_shell_conditional_content'
  )
  const missing = []
  const found = []
  let lastIdx = -1
  const orderViolations = []

  for (const el of elements) {
    const idx = matchElement(el, sections)
    const isReq = el.required === 'required' || el.required === 'required_shell_conditional_content'
    if (idx === null) {
      if (isReq) {
        missing.push({
          id: el.id,
          name_en: el.name_en,
          name_zh: el.name_zh,
          clause_number: el.clause_number,
          requirement: el.required,
        })
      }
    } else {
      found.push({
        element: el.name_en,
        name_zh: el.name_zh,
        clause_number: el.clause_number,
        heading: sections[idx].text,
        position: idx,
      })
      if (idx < lastIdx) {
        orderViolations.push({
          element: el.name_en,
          name_zh: el.name_zh,
          found_at: idx,
          expected_after: lastIdx,
          heading: sections[idx].text,
        })
      } else {
        lastIdx = idx
      }
    }
  }

  return {
    total_sections: sections.length,
    required_count: required.length,
    missing_required: missing,
    order_violations: orderViolations,
    found_elements: found,
    passed: missing.length === 0 && orderViolations.length === 0,
  }
}

// ── Clause body extraction (for LLM content review) ────────────────────────
// Returns [{clause_id, title, body, excerpt, section_type}] for numbered clauses.
// Skips purely structural sections (cover, toc, foreword, bibliography).

function inferSectionType(clauseId, title) {
  const t = title.toLowerCase()
  if (t.includes('scope') || t.includes('范围')) return 'scope'
  if (t.includes('normative ref') || t.includes('规范性引用')) return 'normative_references'
  if (t.includes('terms') || t.includes('术语')) return 'terms_definitions'
  if (t.includes('symbol') || t.includes('abbrev') || t.includes('符号') || t.includes('缩略')) return 'symbols'
  // Handle "附录 A（规范性）…" and "Annex A (normative)…" — check for normative/informative marker
  if (t.includes('(normative)') || t.includes('规范性附录') || (t.includes('规范性') && t.includes('附录'))) return 'normative_annex'
  if (t.includes('(informative)') || t.includes('资料性附录') || (t.includes('资料性') && t.includes('附录'))) return 'informative_annex'
  if (t.includes('annex') || t.includes('附录')) return 'annex'
  return 'requirements'
}

const SKIP_SECTION_TYPES = new Set(['normative_references', 'symbols'])

export function extractClauses(content, format) {
  if (format === 'md') return _extractClausesMd(content)
  if (format === 'txt') return _extractClausesTxt(content)
  if (format === 'html') return _extractClausesHtml(content)
  return []
}

function _excerptBody(body) {
  return body.replace(/\s+/g, ' ').trim().slice(0, 200)
}

function _extractClausesMd(content) {
  const lines = content.split('\n')
  const clauses = []
  let current = null
  const levelCtrs = [0, 0, 0, 0, 0, 0]

  for (const line of lines) {
    const hm = line.trimEnd().match(/^(#{1,6})\s+(.+)/)
    if (hm) {
      const level = hm[1].length
      const text = hm[2].trim()
      const cn = text.match(/^(\d+(?:\.\d+)*)\s+(.+)/)
      if (current) {
        current.body = current._lines.join('\n').trim()
        current.excerpt = _excerptBody(current.body)
        delete current._lines
        if (current.body && !SKIP_SECTION_TYPES.has(current.section_type)) {
          clauses.push(current)
        }
      }
      let clauseId, title
      if (cn) {
        clauseId = cn[1]
        title = cn[2].trim()
      } else {
        // No inline number (e.g. Word auto-numbered export): synthesize from level counter
        levelCtrs[level - 1]++
        levelCtrs.fill(0, level)
        clauseId = levelCtrs.slice(0, level).join('.')
        title = text
      }
      current = {
        clause_id: clauseId,
        title,
        section_type: inferSectionType(clauseId, title),
        _lines: [],
      }
    } else if (current) {
      current._lines.push(line)
    }
  }

  // Flush last
  if (current) {
    current.body = current._lines.join('\n').trim()
    current.excerpt = _excerptBody(current.body)
    delete current._lines
    if (current.body && !SKIP_SECTION_TYPES.has(current.section_type)) {
      clauses.push(current)
    }
  }
  return clauses
}

function _extractClausesTxt(content) {
  const lines = content.split('\n')
  const clauses = []
  let current = null

  function _flush() {
    if (!current) return
    current.body = current._lines.join('\n').trim()
    current.excerpt = _excerptBody(current.body)
    delete current._lines
    if (current.body && !SKIP_SECTION_TYPES.has(current.section_type)) {
      clauses.push(current)
    }
    current = null
  }

  let inTocTxt = false
  for (const line of lines) {
    const rawLine = line.trim()

    // TOC block detection (same heuristic as parseTxtSections)
    if (TOC_BLOCK_HEADING.test(rawLine)) { inTocTxt = true; continue }
    if (inTocTxt) {
      const inner = _stripParaNum(rawLine)
      const isBody = !TOC_ENTRY_SUFFIX.test(inner) && (
        /^(\d+(?:\.\d+)*\.?)\s+/.test(inner) ||
        /^((?:Annex|附录)\s*[A-Z])(?:[\s（(].*)?$/i.test(inner)
      )
      if (isBody) { inTocTxt = false } else { continue }
    }

    // Strip paragraph-number prefix (CDV/draft PDFs with line numbers)
    const procLine = _stripParaNum(rawLine)

    // Primary: numbered clause
    const hm = procLine.match(/^(\d+(?:\.\d+)*\.?)\s+(.+)/)
    if (hm && hm[2].length > 1) {
      if (TOC_ENTRY_SUFFIX.test(procLine)) continue // TOC entry (dot leaders OR space-padded page number)
      const clauseId = hm[1].replace(/\.$/, '')
      const titleStr = hm[2].trim()
      if (/^(CONTENTS|目次|目录|Table of Contents)$/i.test(titleStr)) continue
      const firstNum = parseInt(clauseId.split('.')[0])
      if (firstNum > 30 && !clauseId.includes('.')) continue
      _flush()
      const title = hm[2].trim()
      current = { clause_id: clauseId, title, section_type: inferSectionType(clauseId, title), _lines: [] }
      continue
    }
    // Annex headings
    const am = procLine.match(/^((?:Annex|附录)\s*[A-Z])(?:[\s（(].*)?$/i)
    if (am) {
      _flush()
      const clauseId = am[1].replace(/\s+/, ' ')
      current = { clause_id: clauseId, title: procLine, section_type: inferSectionType(clauseId, procLine), _lines: [] }
      continue
    }
    if (current) current._lines.push(line)
  }
  _flush()
  return clauses
}

function _extractClausesHtml(html) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const nodes = doc.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li')
  const clauses = []
  let current = null
  const levelCtrs = [0, 0, 0, 0, 0, 0]

  for (const el of nodes) {
    const tag = el.tagName.toLowerCase()
    if (['h1','h2','h3','h4','h5','h6'].includes(tag)) {
      const text = el.textContent.trim()
      if (!text) continue
      const level = parseInt(tag[1])
      const cn = text.match(/^(\d+(?:\.\d+)*)\s+(.+)/)
      if (current) {
        current.body = current._parts.join(' ').trim()
        current.excerpt = _excerptBody(current.body)
        delete current._parts
        if (current.body && !SKIP_SECTION_TYPES.has(current.section_type)) {
          clauses.push(current)
        }
      }
      // Use inline number when present; synthesize from level counter for Word auto-numbered docs
      let clauseId, title
      if (cn) {
        clauseId = cn[1]
        title = cn[2].trim()
      } else {
        levelCtrs[level - 1]++
        levelCtrs.fill(0, level)
        clauseId = levelCtrs.slice(0, level).join('.')
        title = text
      }
      current = {
        clause_id: clauseId,
        title,
        section_type: inferSectionType(clauseId, title),
        _parts: [],
      }
    } else if (current && (tag === 'p' || tag === 'li')) {
      const t = el.textContent.trim()
      if (t) current._parts.push(t)
    }
  }

  if (current) {
    current.body = (current._parts || []).join(' ').trim()
    current.excerpt = _excerptBody(current.body)
    delete current._parts
    if (current.body && !SKIP_SECTION_TYPES.has(current.section_type)) {
      clauses.push(current)
    }
  }
  return clauses
}

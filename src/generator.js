/**
 * Standard document generator — JS port of generator.py
 * Supports GB/T 1.1-2020 (gbt11) and ISO/IEC Directives Part 2 (isoiec2).
 * Produces Markdown from structured form data; generateDocx produces a .docx Blob.
 */

import gbt11Structure from '../data/gbt11_structure.json'
import isoiecStructure from '../data/isoiec_directives_structure.json'

export const STRUCTURES = {
  gbt11: gbt11Structure,
  isoiec2: isoiecStructure,
}

export function loadStructure(template) {
  return STRUCTURES[template] || STRUCTURES.gbt11
}

export function generateMarkdown(formData, template = 'gbt11') {
  if (template === 'isoiec2') return _genIso(formData)
  return _genGbt(formData)
}

// ─── GB/T 1.1-2020 ───────────────────────────────────────────────────────────

function _genGbt(formData) {
  const lines = []
  const d = formData

  // COVER
  const stdNum = d.standard_number || 'GB/T XXXXX-YYYY'
  const titleZh = d.title_zh || '[Standard Title in Chinese]'
  const titleEn = d.title_en || '[Standard Title in English]'
  const ics = d.ics_code || 'XX.XXX'
  const ccs = d.ccs_code || 'X XX'
  const issueDate = d.issue_date || _today()
  const implDate = d.implementation_date || _today()

  lines.push(
    `# ${stdNum}`, '',
    `**ICS ${ics}  CCS ${ccs}**`, '',
    '---', '',
    `# ${titleZh}`, '',
    `*${titleEn}*`, '',
    '---', '',
    `**Issue date:** ${issueDate}`, '',
    `**Implementation date:** ${implDate}`, '',
    '**Issued by:** State Administration for Market Regulation / National Standardization Administration',
    '', '---', '',
  )

  // TABLE OF CONTENTS
  if (d.include_contents) {
    lines.push('## Contents', '', '*[Table of contents auto-generated from headings]*', '', '---', '')
  }

  // FOREWORD
  lines.push(
    '## Foreword', '',
    'This document has been drafted in accordance with the rules given in ' +
    'GB/T 1.1-2020 *Directives for standardization -- Part 1: Rules for the ' +
    'structure and drafting of standardizing documents*.', '',
  )

  const relIntl = (d.relationship_international || '').trim()
  if (relIntl) lines.push(relIntl, '')

  const prevVersion = (d.previous_version_info || '').trim()
  if (prevVersion) {
    lines.push('This document supersedes the following:', '', `- ${prevVersion}`, '')
  } else {
    lines.push('This document is published for the first time.', '')
  }

  lines.push(
    `This document was proposed by ${d.proposing_organization || '[Proposing organization]'}.`, '',
    `This document is under the jurisdiction of ${d.technical_committee || '[Technical committee name and number]'}.`, '',
    `The drafting organization(s) of this document: ${d.drafting_organizations || '[Drafting organization(s)]'}.`, '',
    `The chief drafters of this document: ${d.lead_drafters || '[Lead drafter names]'}.`, '',
  )
  if ((d.participating_drafters || '').trim()) {
    lines.push(`The participating drafters of this document: ${d.participating_drafters}.`, '')
  }
  lines.push('---', '')

  // INTRODUCTION (optional)
  if (d.include_introduction) {
    const introBg = (d.introduction_background || '').trim()
    const introP = (d.introduction_purpose || '').trim()
    const patent = (d.patent_statement || '').trim()
    lines.push('## Introduction', '')
    if (introBg) lines.push(introBg, '')
    if (introP) lines.push(introP, '')
    if (patent) lines.push('**Patent statement:**', '', patent, '')
    if (!introBg && !introP) {
      lines.push('[Introduction text: provide background, purpose, and context for this standard.]', '')
    }
    lines.push('---', '')
  }

  // CLAUSE 1: SCOPE
  const scopeText = (d.scope_text || '').trim()
  lines.push(
    '## 1  Scope', '',
    scopeText || 'This document specifies the requirements for [subject matter].\n\nThis document is applicable to [applicability statement].',
    '', '---', '',
  )

  // CLAUSE 2: NORMATIVE REFERENCES
  const normRefs = (d.normative_references || '').trim()
  lines.push('## 2  Normative references', '')
  if (normRefs) {
    lines.push(
      'The following documents are referred to in the text in such a way that ' +
      'some or all of their content constitutes requirements of this document. ' +
      'For dated references, only the edition cited applies. For undated references, ' +
      'the latest edition of the referenced document (including any amendments) applies.', '',
    )
    for (const ref of normRefs.split('\n')) {
      const r = ref.trim()
      if (r) lines.push(`- ${r}`, '')
    }
  } else {
    lines.push('This document has no normative references.', '')
  }
  lines.push('---', '')

  // CLAUSE 3: TERMS AND DEFINITIONS
  const termsIntro = (d.terms_intro_ref || '').trim()
  const termsList = (d.terms_list || '').trim()
  lines.push('## 3  Terms and definitions', '')
  if (termsIntro && termsList) {
    lines.push(`For the purposes of this document, the terms and definitions given in ${termsIntro} and the following apply.`, '')
  } else if (termsIntro) {
    lines.push(`For the purposes of this document, the terms and definitions given in ${termsIntro} apply.`, '')
  } else if (termsList) {
    lines.push('For the purposes of this document, the following terms and definitions apply.', '')
  } else {
    lines.push('For the purposes of this document, there are no terms and definitions that need to be defined.', '')
  }
  if (termsList) {
    let termNum = 1
    for (const block of termsList.split(/\n\n+/)) {
      const bl = block.trim()
      if (!bl) continue
      const bLines = bl.split('\n')
      const name = (bLines[0] || '').trim()
      const def = (bLines[1] || '[definition]').trim()
      const en = bLines[2] ? bLines[2].trim() : ''
      lines.push(`**3.${termNum}  ${name}**`, '')
      if (en) lines.push(`*${en}*`, '')
      lines.push(def, '')
      termNum++
    }
  }
  lines.push('---', '')

  // CLAUSE 4: SYMBOLS AND ABBREVIATIONS (optional)
  const symbols = (d.symbols_abbreviations || '').trim()
  let clauseOffset = 4
  if (d.include_symbols || symbols) {
    lines.push(`## ${clauseOffset}  Symbols and abbreviations`, '')
    if (symbols) {
      for (const sym of symbols.split('\n')) {
        const s = sym.trim()
        if (s) lines.push(`- ${s}`, '')
      }
    } else {
      lines.push('[List symbols and abbreviations used in this document, each with its definition.]', '')
    }
    lines.push('---', '')
    clauseOffset = 5
  }

  lines.push(..._genTechClauses(d, clauseOffset))
  lines.push(..._genAnnexes(d))
  lines.push(..._genBibliography(d, false))

  return lines.join('\n')
}

// ─── ISO/IEC Directives Part 2 ────────────────────────────────────────────────

function _genIso(formData) {
  const lines = []
  const d = formData

  // TITLE PAGE
  const stdNum = d.standard_number || 'ISO/IEC XXXXX:YYYY'
  const titleEn = d.title_en || '[Standard Title in English]'
  const ics = d.ics_code || 'XX.XXX'
  const issueDate = d.issue_date || _today()
  const implDate = d.implementation_date || _today()

  lines.push(
    `# ${stdNum}`, '',
    `**ICS ${ics}**`, '',
    '---', '',
    `# ${titleEn}`, '',
    '---', '',
    `**Issue date:** ${issueDate}`, '',
    `**Implementation date:** ${implDate}`, '',
    '**Issued by:** International Organization for Standardization (ISO) / ' +
    'International Electrotechnical Commission (IEC)',
    '', '---', '',
  )

  // TABLE OF CONTENTS
  if (d.include_contents) {
    lines.push('## Contents', '', '*[Table of contents auto-generated from headings]*', '', '---', '')
  }

  // FOREWORD
  const proposingOrg = d.proposing_organization || '[ISO/IEC Technical Committee]'
  const tc = d.technical_committee || '[TC/SC name and number]'
  const relIntl = (d.relationship_international || '').trim()
  const prevVersion = (d.previous_version_info || '').trim()

  lines.push('## Foreword', '', `This document has been prepared by ${proposingOrg} (${tc}).`, '')

  if (relIntl) lines.push(relIntl, '')

  if (prevVersion) {
    lines.push('This document cancels and replaces the following:', '', `- ${prevVersion}`, '')
  } else {
    lines.push('This document is published for the first time.', '')
  }

  lines.push(
    'The procedures used to develop this document and those intended for its further ' +
    'maintenance are described in the ISO/IEC Directives, Part 1. In particular, the ' +
    'different approval criteria needed for the different types of ISO/IEC documents ' +
    'should be noted. This document was drafted in accordance with the editorial rules ' +
    'of the ISO/IEC Directives, Part 2 (see www.iso.org/directives or ' +
    'www.iec.ch/members_experts/refdocs).', '',
    'ISO and IEC draw attention to the possibility that the implementation of this ' +
    'document may involve the use of a patent. ISO and IEC take no position concerning ' +
    'the evidence, validity, or applicability of any claimed patent rights in respect ' +
    'thereof. As of the date of publication of this document, ISO and/or IEC had not ' +
    'received notice of a patent. However, implementers are cautioned that this may not ' +
    'represent the latest information, which may be obtained from the patent database ' +
    'available at www.iso.org/patents and http://patents.iec.ch.', '',
    `The drafting organization(s) of this document: ${d.drafting_organizations || '[Drafting organization(s)]'}.`, '',
    `The chief drafters of this document: ${d.lead_drafters || '[Lead drafter names]'}.`, '',
  )
  if ((d.participating_drafters || '').trim()) {
    lines.push(`The participating drafters of this document: ${d.participating_drafters}.`, '')
  }
  lines.push('---', '')

  // INTRODUCTION (optional)
  if (d.include_introduction) {
    const introBg = (d.introduction_background || '').trim()
    const introP = (d.introduction_purpose || '').trim()
    const patent = (d.patent_statement || '').trim()
    lines.push('## Introduction', '')
    if (introBg) lines.push(introBg, '')
    if (introP) lines.push(introP, '')
    if (patent) lines.push('**Patent statement:**', '', patent, '')
    if (!introBg && !introP) {
      lines.push('[Introduction text: provide background, purpose, and context for this standard.]', '')
    }
    lines.push('---', '')
  }

  // CLAUSE 1: SCOPE
  const scopeText = (d.scope_text || '').trim()
  lines.push(
    '## 1  Scope', '',
    scopeText || 'This document specifies the requirements for [subject matter].\n\nThis document is applicable to [applicability statement].',
    '', '---', '',
  )

  // CLAUSE 2: NORMATIVE REFERENCES
  const normRefs = (d.normative_references || '').trim()
  lines.push('## 2  Normative references', '')
  if (normRefs) {
    lines.push(
      'The following documents are referred to in the text in such a way that ' +
      'some or all of their content constitutes requirements of this document. ' +
      'For dated references, only the edition cited applies. For undated references, ' +
      'the latest edition of the referenced document (including any amendments) applies.', '',
    )
    for (const ref of normRefs.split('\n')) {
      const r = ref.trim()
      if (r) lines.push(`- ${r}`, '')
    }
  } else {
    lines.push('There are no normative references in this document.', '')
  }
  lines.push('---', '')

  // CLAUSE 3: TERMS AND DEFINITIONS
  const termsIntro = (d.terms_intro_ref || '').trim()
  const termsList = (d.terms_list || '').trim()
  lines.push('## 3  Terms and definitions', '')
  if (termsIntro && termsList) {
    lines.push(`For the purposes of this document, the terms and definitions given in ${termsIntro} and the following apply.`, '')
  } else if (termsIntro) {
    lines.push(`For the purposes of this document, the terms and definitions given in ${termsIntro} apply.`, '')
  } else if (termsList) {
    lines.push('For the purposes of this document, the following terms and definitions apply.', '')
  } else {
    lines.push('No terms and definitions are listed in this document.', '')
  }
  if (termsList) {
    let termNum = 1
    for (const block of termsList.split(/\n\n+/)) {
      const bl = block.trim()
      if (!bl) continue
      const bLines = bl.split('\n')
      const name = (bLines[0] || '').trim()
      const def = (bLines[1] || '[definition]').trim()
      lines.push(`**3.${termNum}  ${name}**`, '', def, '')
      termNum++
    }
  }
  lines.push('---', '')

  // SYMBOLS AND ABBREVIATED TERMS (optional)
  const symbols = (d.symbols_abbreviations || '').trim()
  let clauseOffset = 4
  if (d.include_symbols || symbols) {
    lines.push(`## ${clauseOffset}  Symbols, units and abbreviated terms`, '')
    if (symbols) {
      for (const sym of symbols.split('\n')) {
        const s = sym.trim()
        if (s) lines.push(`- ${s}`, '')
      }
    } else {
      lines.push('[List symbols, units, and abbreviations used in this document.]', '')
    }
    lines.push('---', '')
    clauseOffset = 5
  }

  lines.push(..._genTechClauses(d, clauseOffset))
  lines.push(..._genAnnexes(d))
  lines.push(..._genBibliography(d, true))

  return lines.join('\n')
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

function _genTechClauses(d, clauseOffset) {
  const lines = []
  const techClauses = d.technical_clauses || []
  if (techClauses.length === 0) {
    lines.push(
      `## ${clauseOffset}  General requirements`, '',
      '[State the main technical requirements of this standard. Use \'shall\' for mandatory requirements.]',
      '', '---', '',
      `## ${clauseOffset + 1}  Specific requirements`, '',
      '[Detail specific technical requirements by category or topic.]',
      '', '---', '',
    )
    return lines
  }
  for (let i = 0; i < techClauses.length; i++) {
    const cn = clauseOffset + i
    const ct = techClauses[i].title || `[Technical Clause ${cn}]`
    const cc = (techClauses[i].content || '').trim()
    lines.push(
      `## ${cn}  ${ct}`, '',
      cc || '[Clause content. Use \'shall\' for requirements, \'should\' for recommendations.]',
      '', '---', '',
    )
  }
  return lines
}

function _genAnnexes(d) {
  const lines = []
  const annexes = d.annexes || []
  for (let i = 0; i < annexes.length; i++) {
    const letter = String.fromCharCode(65 + i)
    const type = annexes[i].type || 'normative'
    const title = annexes[i].title || `[Annex ${letter} title]`
    const content = (annexes[i].content || '').trim()
    lines.push(
      `## Annex ${letter}`,
      `(${type})`, '',
      `### ${title}`, '',
      content || `[Content of annex ${letter}. This is a ${type} annex.]`,
      '', '---', '',
    )
  }
  return lines
}

function _genBibliography(d, required = false) {
  const lines = []
  const bib = (d.bibliography || '').trim()
  if (bib || required) {
    lines.push('## Bibliography', '')
    let refNum = 1
    for (const bibLine of (bib || '').split('\n')) {
      const b = bibLine.trim()
      if (b) {
        lines.push(`[${refNum}] ${b}`, '')
        refNum++
      }
    }
    if (!bib) lines.push('[1] [Add bibliographic references here.]', '')
    lines.push('---', '')
  }
  return lines
}

function _today() {
  return new Date().toISOString().split('T')[0]
}

// ─── DOCX export ─────────────────────────────────────────────────────────────

export async function generateDocx(formData, template = 'gbt11') {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import('docx')
  const md = generateMarkdown(formData, template)
  const children = []

  for (const line of md.split('\n')) {
    const l = line.trim()
    if (!l) continue
    if (l.startsWith('# ')) {
      children.push(new Paragraph({ text: l.slice(2), heading: HeadingLevel.TITLE }))
    } else if (l.startsWith('## ')) {
      children.push(new Paragraph({ text: l.slice(3), heading: HeadingLevel.HEADING_1 }))
    } else if (l.startsWith('### ')) {
      children.push(new Paragraph({ text: l.slice(4), heading: HeadingLevel.HEADING_2 }))
    } else if (l.startsWith('**') && l.endsWith('**')) {
      children.push(new Paragraph({ children: [new TextRun({ text: l.slice(2, -2), bold: true })] }))
    } else if (l.startsWith('*') && l.endsWith('*')) {
      children.push(new Paragraph({ children: [new TextRun({ text: l.slice(1, -1), italics: true })] }))
    } else if (l.startsWith('- ')) {
      children.push(new Paragraph({ text: l.slice(2), bullet: { level: 0 } }))
    } else if (l === '---') {
      children.push(new Paragraph({ text: '' }))
    } else {
      children.push(new Paragraph({ text: l }))
    }
  }

  const doc = new Document({ sections: [{ children }] })
  return Packer.toBlob(doc)
}

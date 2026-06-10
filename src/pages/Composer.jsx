import { useState, useCallback } from 'preact/hooks'
import { loadStructure, generateMarkdown, generateDocx } from '../generator'

const TEMPLATE_OPTIONS = [
  { label: 'GB/T 1.1-2020 (Chinese national standard)', key: 'gbt11' },
  { label: 'ISO/IEC Directives Part 2 (International standard)', key: 'isoiec2' },
]

const BIAOZHUN_CENGJI = [
  '', '国际标准 (IEC/ISO)', '国军标 (GJB)', '国家标准 (GB/T, GB)',
  '行业标准 (SJ/T, YD/T, HJ...)', '地方标准 (DB...)', '团体标准 (T/...)', '企业标准 (Q/...)',
]
const STATUS_OPTIONS = ['', '立项', '立项通过', '征求意见', '报批', '公开', '发布']
const GONGSI_OPTIONS = [
  '', '维信诺主导 (Visionox-group lead)', '维信诺参与 (Visionox-group participant)',
  '其他厂商主导 (Other vendor lead)', '高校/院所主导 (Academia lead)',
]
const GUIKOU_OPTIONS = [
  '', 'IEC TC110', 'IEC TC547', '全国信标委 (SAC/TC 28)', '总装备部',
  '苏州市光电产业商会', '中关村半导体照明联盟', '中国电子视像行业协会 (CVIA)',
  '中国电子材料行业协会', 'Other (specify below)',
]

function Field({ label, children }) {
  return (
    <div class="cp-field">
      <label class="field-label">{label}</label>
      {children}
    </div>
  )
}

function Input({ value, onChange, placeholder, ...rest }) {
  return (
    <input
      class="cp-input"
      type="text"
      value={value}
      onInput={e => onChange(e.target.value)}
      placeholder={placeholder || ''}
      {...rest}
    />
  )
}

function Textarea({ value, onChange, placeholder, rows = 4 }) {
  return (
    <textarea
      class="cp-textarea"
      value={value}
      onInput={e => onChange(e.target.value)}
      placeholder={placeholder || ''}
      rows={rows}
    />
  )
}

function Select({ value, onChange, options }) {
  return (
    <select class="field-select" value={value} onChange={e => onChange(e.target.value)}>
      {options.map(o => (
        <option key={typeof o === 'string' ? o : o.key} value={typeof o === 'string' ? o : o.key}>
          {typeof o === 'string' ? o : o.label}
        </option>
      ))}
    </select>
  )
}

function SectionCard({ title, badge, badgeCls, clauseNum, desc }) {
  return (
    <div class="cp-section">
      <div class="cp-section-head">
        <div class="cp-section-titles">
          <span class="cp-section-title">{title}</span>
        </div>
        <div class="cp-section-meta">
          {clauseNum && <span class="cp-clause">Clause {clauseNum}</span>}
          {badge && <span class={`cp-badge ${badgeCls}`}>{badge}</span>}
        </div>
      </div>
      {desc && <p class="cp-section-desc">{desc}</p>}
    </div>
  )
}

function SectionDiv() {
  return <div class="cp-divider" />
}

const BADGE_MAP = {
  required: ['Required', 'badge-req'],
  required_shell_conditional_content: ['Required shell', 'badge-shell'],
  optional: ['Optional', 'badge-opt'],
}

function elementBadge(el) {
  return BADGE_MAP[el.required] || BADGE_MAP.optional
}

export default function Composer({ navigate }) {
  const [template, setTemplate] = useState('gbt11')
  const isIso = template === 'isoiec2'
  const struct = loadStructure(template)
  const elemMap = Object.fromEntries(struct.elements.map(e => [e.id, e]))

  function section(id) {
    const el = elemMap[id]
    if (!el) return null
    const [badge, badgeCls] = elementBadge(el)
    return (
      <SectionCard
        title={`${el.name_zh} / ${el.name_en}`}
        badge={badge}
        badgeCls={badgeCls}
        clauseNum={el.clause_number}
        desc={el.description}
      />
    )
  }

  // Cover fields
  const [stdNum, setStdNum] = useState('')
  const [titleZh, setTitleZh] = useState('')
  const [titleEn, setTitleEn] = useState('')
  const [icsCode, setIcsCode] = useState('')
  const [ccsCode, setCcsCode] = useState('')
  const [issueDate, setIssueDate] = useState('')
  const [implDate, setImplDate] = useState('')

  // Contents
  const [includeContents, setIncludeContents] = useState(true)

  // Foreword
  const [proposingOrg, setProposingOrg] = useState('')
  const [tc, setTc] = useState('')
  const [draftingOrgs, setDraftingOrgs] = useState('')
  const [leadDrafters, setLeadDrafters] = useState('')
  const [participatingDrafters, setParticipatingDrafters] = useState('')
  const [relIntl, setRelIntl] = useState('')
  const [prevVersion, setPrevVersion] = useState('')

  // Introduction
  const [includeIntro, setIncludeIntro] = useState(false)
  const [introBg, setIntroBg] = useState('')
  const [introP, setIntroP] = useState('')
  const [patentStmt, setPatentStmt] = useState('')

  // Scope
  const [scopeText, setScopeText] = useState('')

  // Norm refs
  const [normRefs, setNormRefs] = useState('')

  // Terms
  const [termsIntroRef, setTermsIntroRef] = useState('')
  const [termsList, setTermsList] = useState('')

  // Symbols
  const [includeSymbols, setIncludeSymbols] = useState(false)
  const [symbolsAbbr, setSymbolsAbbr] = useState('')

  // Tech clauses
  const [techClauses, setTechClauses] = useState([
    { title: 'General requirements / 通用要求', content: '' },
    { title: 'Performance requirements / 性能要求', content: '' },
  ])

  // Annexes
  const [annexes, setAnnexes] = useState([])

  // Bibliography
  const [bibliography, setBibliography] = useState('')

  // Portfolio dims
  const [dimLixiang, setDimLixiang] = useState('')
  const [dimCengji, setDimCengji] = useState('')
  const [dimStatus, setDimStatus] = useState('')
  const [dimGongsi, setDimGongsi] = useState('')
  const [dimGuikou, setDimGuikou] = useState('')
  const [dimGuikouCustom, setDimGuikouCustom] = useState('')

  // Output state
  const [mdOutput, setMdOutput] = useState('')
  const [genMsg, setGenMsg] = useState('')
  const [docxLoading, setDocxLoading] = useState(false)

  const techClauseStart = includeSymbols ? 5 : 4

  function buildFormData() {
    const dimGuikouFinal = dimGuikou === 'Other (specify below)' && dimGuikouCustom
      ? dimGuikouCustom
      : dimGuikou
    return {
      standard_number: stdNum || (isIso ? 'ISO/IEC XXXXX:YYYY' : 'GB/T XXXXX-YYYY'),
      title_zh: titleZh,
      title_en: titleEn,
      ics_code: icsCode,
      ccs_code: ccsCode,
      issue_date: issueDate,
      implementation_date: implDate,
      include_contents: includeContents,
      proposing_organization: proposingOrg,
      technical_committee: tc,
      drafting_organizations: draftingOrgs,
      lead_drafters: leadDrafters,
      participating_drafters: participatingDrafters,
      relationship_international: relIntl,
      previous_version_info: prevVersion,
      include_introduction: includeIntro,
      introduction_background: introBg,
      introduction_purpose: introP,
      patent_statement: patentStmt,
      scope_text: scopeText,
      normative_references: normRefs,
      terms_intro_ref: termsIntroRef,
      terms_list: termsList,
      include_symbols: includeSymbols,
      symbols_abbreviations: symbolsAbbr,
      technical_clauses: techClauses,
      annexes,
      bibliography,
      portfolio_dim_lixiang_nian: dimLixiang,
      portfolio_dim_biaozhun_cengji: dimCengji,
      portfolio_dim_biaozhun_zhuangtai: dimStatus,
      portfolio_dim_gongsi_juesei: dimGongsi,
      portfolio_dim_guikou_zuzhi: dimGuikouFinal,
    }
  }

  function handleGenMd() {
    const md = generateMarkdown(buildFormData(), template)
    setMdOutput(md)
    setGenMsg('Markdown generated — copy or download below.')
  }

  function downloadMd() {
    const md = generateMarkdown(buildFormData(), template)
    const slug = (stdNum || 'standard').replace(/[/\\ ]+/g, '_')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }))
    a.download = `${slug}_draft.md`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function handleGenDocx() {
    setDocxLoading(true)
    try {
      const blob = await generateDocx(buildFormData(), template)
      const slug = (stdNum || 'standard').replace(/[/\\ ]+/g, '_')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${slug}_draft.docx`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (err) {
      alert('DOCX generation failed: ' + err.message)
    } finally {
      setDocxLoading(false)
    }
  }

  function updateTechClause(i, key, val) {
    setTechClauses(prev => prev.map((c, idx) => idx === i ? { ...c, [key]: val } : c))
  }
  function removeTechClause(i) {
    setTechClauses(prev => prev.filter((_, idx) => idx !== i))
  }
  function addTechClause() {
    setTechClauses(prev => [...prev, { title: '', content: '' }])
  }

  function updateAnnex(i, key, val) {
    setAnnexes(prev => prev.map((a, idx) => idx === i ? { ...a, [key]: val } : a))
  }
  function removeAnnex(i) {
    setAnnexes(prev => prev.filter((_, idx) => idx !== i))
  }
  function addAnnex() {
    setAnnexes(prev => [...prev, { title: '', type: 'informative', content: '' }])
  }

  return (
    <div class="subpage">
      <div class="sub-back">
        <button class="btn btn-secondary btn-back" onClick={() => navigate('landing')}>← Back to home</button>
      </div>
      <div class="sub-hero">
        <div class="sub-hero-eyebrow">VISIONOX · 标准化工具 · COMPOSER</div>
        <h1 class="sub-hero-title">Standard Document Composer</h1>
        <p class="sub-hero-sub">Fill in sections below to generate a compliant standard scaffold</p>
      </div>

      <div class="sub-body">

        {/* Template selector */}
        <Field label="Document Template / 文件模板">
          <Select
            value={template}
            onChange={t => setTemplate(t)}
            options={TEMPLATE_OPTIONS}
          />
        </Field>

        <SectionDiv />

        {/* Portfolio metadata (collapsible) */}
        <details class="cp-details">
          <summary>Portfolio Metadata / 标准组合维度 (5-dimension classification)</summary>
          <div class="cp-details-body">
            <p class="cp-detail-note">
              Tag this standard with the 5 portfolio dimensions from the Visionox standards work list.
              These fields are for portfolio analysis — they do not appear in the generated document body.
            </p>
            <div class="cp-cols2">
              <Field label="D1: 立项年代 / Filing Year">
                <Input value={dimLixiang} onChange={setDimLixiang} placeholder="e.g. 2024" />
              </Field>
              <Field label="D3: 标准层级 / Standard Level">
                <Select value={dimCengji} onChange={setDimCengji} options={BIAOZHUN_CENGJI} />
              </Field>
            </div>
            <Field label="D4: 标准状态 / Standard Status">
              <Select value={dimStatus} onChange={setDimStatus} options={STATUS_OPTIONS} />
            </Field>
            <div class="cp-cols2">
              <Field label="D2: 公司角色 / Company Role">
                <Select value={dimGongsi} onChange={setDimGongsi} options={GONGSI_OPTIONS} />
              </Field>
              <Field label="D5: 归口组织 / Oversight Organization">
                <Select value={dimGuikou} onChange={setDimGuikou} options={GUIKOU_OPTIONS} />
              </Field>
            </div>
            {dimGuikou === 'Other (specify below)' && (
              <Field label="D5 custom">
                <Input value={dimGuikouCustom} onChange={setDimGuikouCustom} placeholder="e.g. SAC/TC 297" />
              </Field>
            )}
          </div>
        </details>

        <SectionDiv />

        {/* SECTION 1: COVER */}
        {section('cover')}
        <div class="cp-cols2">
          <div>
            <Field label="Standard Number / 标准编号">
              <Input
                value={stdNum}
                onChange={setStdNum}
                placeholder={isIso ? 'e.g. ISO 12345:2025 or IEC 62341-6-1:2025' : 'e.g. GB/T 12345-2025'}
              />
            </Field>
            {!isIso && (
              <Field label="Chinese Title / 中文标题">
                <Input
                  value={titleZh}
                  onChange={setTitleZh}
                  placeholder="e.g. 汽车用有机发光显示器件 第1部分：通用规范"
                />
              </Field>
            )}
            <Field label="ICS Code">
              <Input value={icsCode} onChange={setIcsCode} placeholder="e.g. 31.260" />
            </Field>
          </div>
          <div>
            <Field label={isIso ? 'Title (English, primary) / 英文标题' : 'Title (English) / 英文标题'}>
              <Input
                value={titleEn}
                onChange={setTitleEn}
                placeholder="e.g. Organic light-emitting display for automobiles -- Part 1: General specification"
              />
            </Field>
            <Field label="Issue Date / 发布日期">
              <input class="cp-input" type="date" value={issueDate} onInput={e => setIssueDate(e.target.value)} />
            </Field>
            <Field label="Implementation Date / 实施日期">
              <input class="cp-input" type="date" value={implDate} onInput={e => setImplDate(e.target.value)} />
            </Field>
            {!isIso && (
              <Field label="CCS Code">
                <Input value={ccsCode} onChange={setCcsCode} placeholder="e.g. L 46" />
              </Field>
            )}
          </div>
        </div>

        <SectionDiv />

        {/* SECTION 2: TABLE OF CONTENTS */}
        {section('contents')}
        <label class="cp-checkbox">
          <input type="checkbox" checked={includeContents} onChange={e => setIncludeContents(e.target.checked)} />
          Include Table of Contents
        </label>

        <SectionDiv />

        {/* SECTION 3: FOREWORD */}
        {section('foreword')}
        <div class="cp-cols2">
          <div>
            <Field label="Proposing Organization / 提出机构">
              <Input value={proposingOrg} onChange={setProposingOrg} placeholder="e.g. China Electronics Standardization Institute" />
            </Field>
            <Field label="Technical Committee / 技术委员会">
              <Input value={tc} onChange={setTc} placeholder="e.g. SAC/TC 297 National Technical Committee on Display Technology" />
            </Field>
            <Field label="Drafting Organization(s) / 起草单位">
              <Textarea value={draftingOrgs} onChange={setDraftingOrgs} placeholder="One per line" rows={3} />
            </Field>
          </div>
          <div>
            <Field label="Lead Drafter(s) / 主要起草人">
              <Textarea value={leadDrafters} onChange={setLeadDrafters} placeholder="One per line" rows={3} />
            </Field>
            <Field label="Participating Drafter(s) / 参与起草人 (optional)">
              <Textarea value={participatingDrafters} onChange={setParticipatingDrafters} placeholder="One per line" rows={3} />
            </Field>
            <Field label="Relationship to International Standard (optional)">
              <Textarea value={relIntl} onChange={setRelIntl} placeholder="e.g. This document is identical to ISO XXXXX:20XX" rows={3} />
            </Field>
          </div>
        </div>
        <Field label="Previous Version Info / 历次版本 (leave blank if first issue)">
          <Input value={prevVersion} onChange={setPrevVersion} placeholder="e.g. GB/T 12345-2018" />
        </Field>

        <SectionDiv />

        {/* SECTION 4: INTRODUCTION */}
        {section('introduction')}
        <label class="cp-checkbox">
          <input type="checkbox" checked={includeIntro} onChange={e => setIncludeIntro(e.target.checked)} />
          Include Introduction / 包含引言
        </label>
        {includeIntro && (
          <div class="cp-indent">
            <Field label="Background / 背景">
              <Textarea value={introBg} onChange={setIntroBg} placeholder="Why was this standard developed? What problem does it solve?" rows={4} />
            </Field>
            <Field label="Purpose / 目的">
              <Textarea value={introP} onChange={setIntroP} placeholder="What is the intended use and benefit of this standard?" rows={3} />
            </Field>
            <Field label="Patent Statement / 专利声明 (if applicable)">
              <Textarea value={patentStmt} onChange={setPatentStmt} placeholder="e.g. 'The issuer of this document draws attention to the fact that ...'" rows={3} />
            </Field>
          </div>
        )}

        <SectionDiv />

        {/* CLAUSE 1: SCOPE */}
        {section('scope')}
        <Field label="Scope Text / 范围内容">
          <Textarea
            value={scopeText}
            onChange={setScopeText}
            placeholder={'This document specifies the [requirements/test methods/classification] for [subject].\n\nThis document is applicable to [applicability]. It does not apply to [exclusions if any].'}
            rows={5}
          />
        </Field>

        <SectionDiv />

        {/* CLAUSE 2: NORMATIVE REFERENCES */}
        {section('normative_references')}
        <Field label="Normative References / 规范性引用文件 (one per line, leave blank if none)">
          <Textarea
            value={normRefs}
            onChange={setNormRefs}
            placeholder={'GB/T 321-2005  Preferred numbers -- Series of preferred numbers\nGB/T 7714-2015  Information and documentation -- Rules for bibliographic references'}
            rows={4}
          />
        </Field>

        <SectionDiv />

        {/* CLAUSE 3: TERMS AND DEFINITIONS */}
        {section('terms_and_definitions')}
        <Field label="Terms defined in another standard (optional) / 术语来源标准">
          <Input value={termsIntroRef} onChange={setTermsIntroRef} placeholder="e.g. GB/T 2900.1-2008 -- if blank, list individual terms below" />
        </Field>
        <Field label="Terms to define / 术语定义列表">
          <Textarea
            value={termsList}
            onChange={setTermsList}
            placeholder={'Separate each term with a blank line. Format per term:\nTerm name in Chinese\nDefinition text\nEnglish equivalent (optional)'}
            rows={6}
          />
        </Field>

        <SectionDiv />

        {/* CLAUSE 4: SYMBOLS (optional) */}
        {section('symbols_abbreviations')}
        <label class="cp-checkbox">
          <input type="checkbox" checked={includeSymbols} onChange={e => setIncludeSymbols(e.target.checked)} />
          Include Symbols and Abbreviations clause
        </label>
        {includeSymbols && (
          <div class="cp-indent">
            <Field label="Symbols and Abbreviations / 符号和缩略语 (one per line: SYMBOL -- definition)">
              <Textarea
                value={symbolsAbbr}
                onChange={setSymbolsAbbr}
                placeholder={'OLED -- Organic Light-Emitting Diode\nEL -- Electroluminescence'}
                rows={4}
              />
            </Field>
          </div>
        )}

        <SectionDiv />

        {/* TECHNICAL CLAUSES */}
        {section('technical_clauses')}
        <p class="cp-info">Use 'shall' for requirements, 'should' for recommendations, 'may' for permissions.</p>
        <div class="cp-clause-list">
          {techClauses.map((clause, i) => (
            <div key={i} class="cp-clause-item">
              <div class="cp-clause-row">
                <Field label={`Clause ${techClauseStart + i} title`}>
                  <Input value={clause.title} onChange={v => updateTechClause(i, 'title', v)} placeholder="Clause title" />
                </Field>
                <button class="cp-remove-btn" onClick={() => removeTechClause(i)} title="Remove clause">✕</button>
              </div>
              <Field label={`Clause ${techClauseStart + i} content`}>
                <Textarea
                  value={clause.content}
                  onChange={v => updateTechClause(i, 'content', v)}
                  placeholder="Enter requirements, test methods, etc. Use 'shall' for mandatory requirements."
                  rows={4}
                />
              </Field>
            </div>
          ))}
        </div>
        <button class="btn btn-secondary cp-add-btn" onClick={addTechClause}>+ Add clause</button>

        <SectionDiv />

        {/* ANNEXES */}
        <div class="cp-section-head">
          <span class="cp-section-title">Annexes / 附录</span>
        </div>
        <p class="cp-info">Normative annexes (规范性附录) are part of the standard. Informative annexes (资料性附录) provide supplementary information only.</p>
        <div class="cp-clause-list">
          {annexes.map((annex, i) => {
            const letter = String.fromCharCode(65 + i)
            return (
              <div key={i} class="cp-clause-item">
                <div class="cp-annex-row">
                  <Field label={`Annex ${letter} type`}>
                    <select class="field-select" value={annex.type} onChange={e => updateAnnex(i, 'type', e.target.value)}>
                      <option value="normative">normative</option>
                      <option value="informative">informative</option>
                    </select>
                  </Field>
                  <Field label={`Annex ${letter} title`}>
                    <Input value={annex.title} onChange={v => updateAnnex(i, 'title', v)} placeholder="Annex title" />
                  </Field>
                  <button class="cp-remove-btn" onClick={() => removeAnnex(i)} title="Remove annex">✕</button>
                </div>
                <Field label={`Annex ${letter} content`}>
                  <Textarea value={annex.content} onChange={v => updateAnnex(i, 'content', v)} rows={4} />
                </Field>
              </div>
            )
          })}
        </div>
        <button class="btn btn-secondary cp-add-btn" onClick={addAnnex}>+ Add annex</button>

        <SectionDiv />

        {/* BIBLIOGRAPHY */}
        {section('bibliography')}
        <Field label={isIso ? 'Bibliography entries / 参考文献 (one per line, required)' : 'Bibliography entries / 参考文献 (one per line, optional)'}>
          <Textarea
            value={bibliography}
            onChange={setBibliography}
            placeholder={'ISO 12233:2023  Photography -- Electronic still picture imaging -- Resolution and spatial frequency responses\nIEC 62341-1-1:2009  Organic light emitting diode (OLED) displays -- Part 1-1: Terminology'}
            rows={4}
          />
        </Field>

        <SectionDiv />

        {/* GENERATE */}
        <div class="cp-generate">
          <h2 class="cp-gen-title">Generate Document / 生成文件</h2>
          <div class="cp-gen-btns">
            <button class="btn btn-primary cp-gen-btn" onClick={handleGenMd}>
              Export .md (Markdown)
            </button>
            <button class="btn btn-secondary cp-gen-btn" onClick={downloadMd}>
              Download .md
            </button>
            <button class="btn btn-secondary cp-gen-btn" onClick={handleGenDocx} disabled={docxLoading}>
              {docxLoading ? 'Generating…' : 'Download .docx'}
            </button>
          </div>
          {genMsg && <p class="cp-gen-msg">{genMsg}</p>}
          {mdOutput && (
            <div class="cp-md-preview">
              <details>
                <summary>View raw Markdown source</summary>
                <pre class="cp-md-src">{mdOutput}</pre>
              </details>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

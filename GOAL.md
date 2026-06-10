# Visionox Standards Tool — Original Goal / Requirements

> Source: Roger, 2026-06-01 (Discord thread 1510836104406892658). This is the canonical north-star for the "Visionox Webtool" priority. The current deployed tool is a partial slice (a document-scaffold generator); the full goal has two larger pillars below.

## Original goal (verbatim intent)

针对不同属地，对标准清单中的需求，对清单快速分类、收集数据；并对标准文本做编写规则检查。

### Pillar A — Standards-list classification + data collection (per territory / 属地)
Rapidly classify a standards list and produce **counts + lists** along these dimensions:
1. 发布年 — publication year
2. 立项年代 — filing / initiation year
3. 公司类别 — company category
4. 主导公司 — leading company
5. 参与公司 — participating companies

### Pillar B — Standard-text drafting-rule checking (编写规则检查 / "检查文件")
Check an existing standard document's text against drafting rules:
1. IEC 国际标准编写规则检查 — international (IEC) drafting-rules checker
2. 国标 + 行标编写规则检查 — national (GB) + industry standard drafting-rules checker

## Current state vs goal (measured 2026-06-01)

- **Pillar A — foundation partly built, NOT the analysis feature.** `data/dimension_mapping.json` (Paw+Rex 2026-06-01) maps 5 dims to the real spreadsheet `20260105维信诺标准工作清单（外部门）.xlsx` (83 rows, DingTalk-DRM, transcribed from screenshots). BUT:
  - The **mapped 5 dims diverge from Roger's original 5**: mapped = 立项年代 / 公司类别·角色(主导+参与合并) / 标准层级 / 标准状态 / 归口组织. Original = 发布年 / 立项年 / 公司类别 / 主导 / 参与. Differences: 发布年 not separate; 主导 vs 参与 merged; 标准层级+状态 added; **属地 (territory) not a dimension at all**. → NEEDS Roger's confirmation of the canonical dimension set.
  - The deployed tool only **tags a single standard** with these dims; it does **not aggregate counts + lists** over the spreadsheet. → analysis/aggregation feature unbuilt.
- **Pillar B — inverse of what exists.** Deployed tool **generates** compliant scaffolds (GB/T 1.1-2020; ISO/IEC Directives Part 2 generation template in progress = Javus job 3879). That is a *generator*. Pillar B wants a *checker* (ingest existing standard text → flag drafting-rule violations per IEC / GB / industry rules). → checker mode unbuilt.

## How in-flight work fits
- **Job 3879** (add ISO/IEC Directives Part 2 generation template) is on the *generator* line — still useful (encodes IEC structure), but is NOT the IEC *checker* pillar B.1 asks for.

## Open decisions (await Roger)
1. Priority/sequence: build Pillar B checker first, Pillar A list-aggregation first, or both (which order)?
2. Canonical dimension set: Roger's original 5 (incl. 发布年 separate, 主导/参与 split) vs the mapped 5? Add 属地 as a dimension?

export default function Landing({ navigate }) {
  return (
    <div class="landing">
      <div class="vx-hero-mark">
        <svg width="72" height="72" viewBox="0 0 120 120" role="img" aria-label="Visionox Standards Tool">
          <defs>
            <filter id="vxGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="2.2" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <g filter="url(#vxGlow)">
            <rect x="35" y="62" width="12" height="26" rx="6" fill="#ff4d5e" />
            <rect x="54" y="48" width="12" height="40" rx="6" fill="#1fd47e" />
            <rect x="73" y="32" width="12" height="56" rx="6" fill="#3d8bff" />
          </g>
          <rect x="32" y="92" width="56" height="4" rx="2" fill="#ffffff" opacity="0.9" />
        </svg>
      </div>
      <div class="vx-hero-eyebrow">VISIONOX &middot; 标准化工具</div>
      <h1 class="vx-hero-title">Standards Tool</h1>
      <p class="vx-hero-sub">GB/T 1.1-2020 &middot; ISO/IEC Directives</p>

      <div class="vx-tiles">
        <div class="vx-tile">
          <div class="vx-tile-icon">📤</div>
          <div class="vx-tile-title">Upload draft for review</div>
          <p class="vx-tile-desc">
            Upload a .docx, .md, or .txt draft. Checks structural conformance against
            GB/T&nbsp;1.1-2020 or ISO/IEC Directives Part&nbsp;2 — missing required clauses,
            ordering violations, and mis-numbered sections.
          </p>
          <button
            class="btn btn-primary-light"
            onClick={() => navigate('review')}
          >
            Open Upload Review →
          </button>
        </div>

        <div class="vx-tile">
          <div class="vx-tile-icon">🔧</div>
          <div class="vx-tile-title">Composer generator</div>
          <p class="vx-tile-desc">
            Fill in your standard metadata and clauses, then export a structurally compliant
            scaffold as Markdown or Word (.docx), following GB/T&nbsp;1.1-2020 or ISO/IEC
            Directives Part&nbsp;2 element order.
          </p>
          <button
            class="btn btn-ghost-light"
            onClick={() => navigate('composer')}
          >
            Open Composer →
          </button>
        </div>
      </div>
    </div>
  )
}

import { KIND, fmtDate, fmtEth, short } from '../lib/chain'

export function SealBadge({ opened }) {
  return opened ? <span className="badge danger">개봉됨</span> : <span className="badge ok">봉인 유지</span>
}

export function BottleArt({ bottle, size = 64 }) {
  const hue = (bottle.id * 47) % 40
  return (
    <svg className="bottle-art" width={size * 0.55} height={size} viewBox="0 0 55 100" aria-hidden="true">
      <rect x="21" y="2" width="13" height="14" rx="2" fill={bottle.opened ? '#9b9b9b' : '#7a1f1f'} />
      <path d="M22 16h11v12c0 4 12 8 12 18v46c0 4-3 6-6 6H16c-3 0-6-2-6-6V46c0-10 12-14 12-18z" fill={`hsl(${25 + hue} 70% 32%)`} />
      <rect x="12" y="52" width="31" height="26" rx="2" fill="#f3e9d2" />
      <text x="27.5" y="66" textAnchor="middle" fontSize="8" fontWeight="700" fill="#3b2412">{bottle.ageYears}</text>
      <text x="27.5" y="74" textAnchor="middle" fontSize="4.5" fill="#3b2412">YEARS</text>
      {bottle.opened && <path d="M18 8l19 6" stroke="#c0392b" strokeWidth="2.5" />}
    </svg>
  )
}

export function BottleSummary({ bottle, nameOf, children }) {
  return (
    <div className="bottle-summary">
      <BottleArt bottle={bottle} size={72} />
      <div className="bottle-summary-body">
        <div className="bottle-title">
          <span className="bottle-id">#{bottle.id}</span> {bottle.name}
        </div>
        <div className="bottle-meta">
          {bottle.distillery} · {bottle.vintage} 증류 · {bottle.ageYears}년 · {bottle.caskType}
        </div>
        <div className="bottle-meta">
          일련번호 <code>{bottle.serial}</code> · 소유자 <b>{nameOf(bottle.owner)}</b>
          {bottle.custodian !== '0x0000000000000000000000000000000000000000' && (
            <> · 보관 <b>{nameOf(bottle.custodian)}</b></>
          )}
        </div>
        <div className="bottle-tags">
          <SealBadge opened={bottle.opened} />
          {bottle.forSale && <span className="badge sale">판매 중 {fmtEth(bottle.price)}</span>}
          {bottle.pendingCustodian !== '0x0000000000000000000000000000000000000000' && (
            <span className="badge muted">입고 대기: {nameOf(bottle.pendingCustodian)}</span>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}

function describe(r, nameOf) {
  switch (KIND[r.kind].key) {
    case 'Registered':
      return `NFC 봉인 태그 부착 후 출고 · ${nameOf(r.actor)} · 일련번호 ${r.note}`
    case 'Consigned':
      return `${nameOf(r.actor)} → ${nameOf(r.counterparty)} 보관 위탁 요청`
    case 'CheckIn':
      return `${nameOf(r.actor)} 입고 · 위치: ${r.note}`
    case 'Environment':
      return `${r.temperature.toFixed(1)}°C · 습도 ${r.humidity}%${r.note ? ` · ${r.note}` : ''}`
    case 'CheckOut':
      return `${nameOf(r.counterparty)}에서 출고${r.note ? ` · ${r.note}` : ''}`
    case 'Listed':
      return `${fmtEth(r.amount)} · 판매자 ${nameOf(r.actor)}`
    case 'Unlisted':
      return `판매자 ${nameOf(r.actor)}`
    case 'Sold':
      return `${nameOf(r.actor)} → ${nameOf(r.counterparty)} · ${fmtEth(r.amount)} 결제와 동시에 소유권 이전`
    case 'Transferred':
      return `${nameOf(r.actor)} → ${nameOf(r.counterparty)} 소유권 양도`
    case 'Opened':
      return `NFC 태그가 서명한 '개봉됨' 증거가 기록됨 (제출: ${nameOf(r.actor)})`
    default:
      return ''
  }
}

export function Timeline({ history, nameOf, collapseEnv = true }) {
  // 환경 기록은 연속되면 묶어서 보여준다
  const rows = []
  for (const r of history) {
    const prev = rows[rows.length - 1]
    if (collapseEnv && KIND[r.kind].key === 'Environment' && prev?.env) {
      prev.items.push(r)
    } else if (collapseEnv && KIND[r.kind].key === 'Environment') {
      rows.push({ env: true, items: [r] })
    } else {
      rows.push({ env: false, items: [r] })
    }
  }
  return (
    <ol className="timeline">
      {rows.map((row, i) => {
        const r = row.items[0]
        const k = KIND[r.kind]
        if (row.env && row.items.length > 1) {
          const temps = row.items.map((x) => x.temperature)
          const hums = row.items.map((x) => x.humidity)
          const last = row.items[row.items.length - 1]
          return (
            <li key={i} className={`tl ${k.tone}`}>
              <div className="tl-dot">{k.icon}</div>
              <div className="tl-body">
                <div className="tl-head">
                  <b>보관 환경 기록 {row.items.length}건</b>
                  <span className="tl-date">
                    {fmtDate(r.timestamp)} ~ {fmtDate(last.timestamp)}
                  </span>
                </div>
                <div className="tl-text">
                  온도 {Math.min(...temps).toFixed(1)}–{Math.max(...temps).toFixed(1)}°C · 습도 {Math.min(...hums)}–{Math.max(...hums)}% · 기록자 {nameOf(r.actor)}
                </div>
              </div>
            </li>
          )
        }
        return (
          <li key={i} className={`tl ${k.tone}`}>
            <div className="tl-dot">{k.icon}</div>
            <div className="tl-body">
              <div className="tl-head">
                <b>{k.label}</b>
                <span className="tl-date">{fmtDate(r.timestamp, true)}</span>
              </div>
              <div className="tl-text">{describe(r, nameOf)}</div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function EnvChart({ history }) {
  const env = history.filter((r) => KIND[r.kind].key === 'Environment')
  if (env.length < 2) return null
  const W = 520
  const H = 140
  const P = { l: 34, r: 34, t: 12, b: 22 }
  const t0 = env[0].timestamp
  const t1 = env[env.length - 1].timestamp
  const x = (t) => P.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - P.l - P.r)
  const yT = (v) => P.t + (1 - (v - 5) / 20) * (H - P.t - P.b) // 5–25°C
  const yH = (v) => P.t + (1 - (v - 40) / 40) * (H - P.t - P.b) // 40–80%
  const line = (f, key) => env.map((r, i) => `${i ? 'L' : 'M'}${x(r.timestamp).toFixed(1)},${f(r[key]).toFixed(1)}`).join(' ')
  return (
    <figure className="env-chart">
      <figcaption>
        보관 환경 추이 <span className="legend t">온도 (°C)</span> <span className="legend h">습도 (%)</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="보관 온도와 습도 추이">
        <rect x={P.l} y={yT(18)} width={W - P.l - P.r} height={yT(10) - yT(18)} className="band" />
        {[10, 15, 20].map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={yT(v)} y2={yT(v)} className="grid" />
            <text x={P.l - 6} y={yT(v) + 3} textAnchor="end" className="axis t">{v}°</text>
          </g>
        ))}
        {[50, 60, 70].map((v) => (
          <text key={v} x={W - P.r + 6} y={yH(v) + 3} className="axis h">{v}%</text>
        ))}
        <path d={line(yT, 'temperature')} className="ln t" />
        <path d={line(yH, 'humidity')} className="ln h" />
        {env.map((r, i) => (
          <circle key={i} cx={x(r.timestamp)} cy={yT(r.temperature)} r="2.5" className="pt t">
            <title>{`${fmtDate(r.timestamp)} · ${r.temperature}°C · ${r.humidity}%`}</title>
          </circle>
        ))}
        <text x={P.l} y={H - 4} className="axis">{fmtDate(t0)}</text>
        <text x={W - P.r} y={H - 4} textAnchor="end" className="axis">{fmtDate(t1)}</text>
      </svg>
      <div className="hint">음영 = 권장 보관 온도 10–18°C</div>
    </figure>
  )
}

export function Addr({ a }) {
  return <code title={a}>{short(a)}</code>
}

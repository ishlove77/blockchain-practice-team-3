import { useState } from 'react'
import { BottleSummary } from '../components/Bottle'
import { IS_DEMO_ACCOUNTS } from '../lib/chain'

const same = (a, b) => a?.toLowerCase() === b?.toLowerCase()

export default function Warehouse({ account, me, bottles, nameOf, send, busy }) {
  if (me.role !== 2) {
    return (
      <div className="page">
        <h2>보관창고</h2>
        <div className="banner">
          현재 계정({account.label})은 보관창고로 등록되어 있지 않습니다.{' '}
          {IS_DEMO_ACCOUNTS ? (
            <>
              상단에서 <b>에든버러 보세창고</b>로 바꾸세요.
            </>
          ) : (
            <>관리자가 [참여자] 탭에서 이 주소를 보관창고로 지정해야 합니다.</>
          )}
        </div>
      </div>
    )
  }
  const pending = bottles.filter((b) => same(b.pendingCustodian, account.address))
  const stored = bottles.filter((b) => same(b.custodian, account.address))

  return (
    <div className="page">
      <h2>보관창고 · {me.name}</h2>
      <p className="lead">입고·출고와 보관 환경(온도·습도)을 기록합니다. 소유자가 위탁한 병만 입고할 수 있고, 보관 중인 병만 환경을 기록할 수 있습니다.</p>

      <h3>입고 대기 ({pending.length})</h3>
      {pending.length === 0 && <p className="empty">위탁 요청된 병이 없습니다. 소유자 계정의 [거래] 탭에서 "위탁"을 누르면 여기에 나타납니다.</p>}
      <div className="list">
        {pending.map((b) => (
          <CheckIn key={b.id} b={b} nameOf={nameOf} send={send} busy={busy} />
        ))}
      </div>

      <h3>보관 중 ({stored.length})</h3>
      {stored.length === 0 && <p className="empty">보관 중인 병이 없습니다.</p>}
      <div className="list">
        {stored.map((b) => (
          <Stored key={b.id} b={b} nameOf={nameOf} send={send} busy={busy} />
        ))}
      </div>
    </div>
  )
}

function CheckIn({ b, nameOf, send, busy }) {
  const [loc, setLoc] = useState('본드 볼트 C-01')
  return (
    <div className="card">
      <BottleSummary bottle={b} nameOf={nameOf}>
        <div className="row">
          <input value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="보관 위치" />
          <button className="primary" disabled={busy || !loc} onClick={() => send(`#${b.id} 입고`, (c) => c.checkIn(b.id, loc))}>
            ⬇️ 입고
          </button>
        </div>
      </BottleSummary>
    </div>
  )
}

function Stored({ b, nameOf, send, busy }) {
  const [temp, setTemp] = useState('14.5')
  const [hum, setHum] = useState('65')
  const [note, setNote] = useState('정기 점검')
  const valid = temp !== '' && hum !== '' && !Number.isNaN(Number(temp)) && Number(hum) >= 0 && Number(hum) <= 100
  return (
    <div className="card">
      <BottleSummary bottle={b} nameOf={nameOf}>
        <div className="actions-grid">
          <div className="action wide">
            <label>보관 환경 기록</label>
            <div className="row">
              <input value={temp} onChange={(e) => setTemp(e.target.value)} inputMode="decimal" style={{ width: 80 }} aria-label="온도" />
              <span>°C</span>
              <input value={hum} onChange={(e) => setHum(e.target.value)} inputMode="numeric" style={{ width: 70 }} aria-label="습도" />
              <span>%</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모" />
              <button
                disabled={busy || !valid}
                onClick={() =>
                  send(`#${b.id} 환경 기록`, (c) => c.logEnvironment(b.id, Math.round(Number(temp) * 10), Number(hum), note))
                }
              >
                🌡️ 기록
              </button>
            </div>
          </div>
          <div className="action">
            <label>출고</label>
            <button disabled={busy} onClick={() => send(`#${b.id} 출고`, (c) => c.checkOut(b.id, '창고 출고'))}>
              ⬆️ 소유자에게 출고
            </button>
          </div>
        </div>
      </BottleSummary>
    </div>
  )
}

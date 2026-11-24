import { useEffect, useState } from 'react'
import { loadHistory, readContract, normalizeBottle, explainError, fmtDate, short } from '../lib/chain'
import { listTags } from '../lib/tags'
import { READERS, tapWith } from '../lib/nfc'
import { BottleSummary, Timeline, EnvChart } from '../components/Bottle'

function useTags() {
  const [tags, setTags] = useState(listTags)
  useEffect(() => {
    const on = () => setTags(listTags())
    window.addEventListener('tags-changed', on)
    return () => window.removeEventListener('tags-changed', on)
  }, [])
  return tags
}

export default function Verify({ nameOf, send, busy, bottles, arg, nfcLanding }) {
  const tags = useTags()
  const [selected, setSelected] = useState(() => (arg?.startsWith('0x') ? arg : tags[0]?.address ?? ''))
  const [result, setResult] = useState(null)
  const [tapping, setTapping] = useState(false)
  const [lookupId, setLookupId] = useState('')
  const [readerId, setReaderId] = useState('simulator')

  useEffect(() => {
    if (arg?.startsWith('0x')) setSelected(arg)
    else if (/^\d+$/.test(arg ?? '')) doLookup(Number(arg))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arg])

  async function doTap() {
    const tag = tags.find((t) => t.address === selected)
    if (readerId === 'simulator' && !tag) return
    setTapping(true)
    setResult(null)
    try {
      const reader = READERS.find((r) => r.id === readerId)
      const resp = await tapWith(reader, { target: tag?.address })
      let authentic = false
      let bottle = null
      let history = []
      try {
        authentic = await readContract.verifyTagSignature(resp.bottleId, resp.digest, resp.signature)
        bottle = normalizeBottle(await readContract.getBottle(resp.bottleId))
        history = await loadHistory(resp.bottleId)
      } catch (e) {
        if (!/UnknownBottle/.test(String(e?.revert?.name ?? e))) throw e
      }
      setResult({ mode: 'tap', resp, authentic, bottle, history })
    } catch (e) {
      setResult({ mode: 'error', message: explainError(e) })
    } finally {
      setTapping(false)
    }
  }

  async function doLookup(id) {
    setResult(null)
    try {
      const bottle = normalizeBottle(await readContract.getBottle(id))
      const history = await loadHistory(id)
      setResult({ mode: 'lookup', bottle, history })
    } catch (e) {
      setResult({ mode: 'error', message: explainError(e) })
    }
  }

  async function submitOpened() {
    const { resp } = result
    const r = await send('개봉 기록 제출', (c) => c.reportOpened(resp.bottleId, resp.openedSignature))
    if (r) {
      const bottle = normalizeBottle(await readContract.getBottle(resp.bottleId))
      const history = await loadHistory(resp.bottleId)
      setResult({ ...result, bottle, history })
    }
  }

  return (
    <div className="page">
      {nfcLanding && (
        <section className="nfc-landing">
          <div className="nfc-landing-icon">📱</div>
          <div>
            <b>NFC 태그에서 열린 병 #{arg}</b>
            <div className="hint">출고부터 지금까지 블록체인에 기록된 이력입니다.</div>
          </div>
          <a className="btn" href="#/verify">
            다른 병 확인
          </a>
        </section>
      )}
      {!nfcLanding && (
      <>
      <section className="hero">
        <div>
          <h1>탭 한 번으로, 출고부터 지금까지.</h1>
          <p>
            병에 붙은 NFC 봉인 태그에 휴대폰을 대면, 태그가 무작위 질문(challenge)에 서명해 돌려줍니다. 서명이 블록체인에
            등록된 태그 공개키와 맞으면 진짜 태그이고, 이력과 봉인 상태는 체인에서 읽어옵니다.
          </p>
        </div>
        <div className="phone">
          <div className={`phone-screen ${tapping ? 'pulse' : ''}`}>
            <div className="nfc-ring">{tapping ? '읽는 중…' : 'NFC'}</div>
            <select value={readerId} onChange={(e) => setReaderId(e.target.value)} aria-label="리더">
              {READERS.map((r) => (
                <option key={r.id} value={r.id} disabled={!r.available()}>
                  리더: {r.label}
                </option>
              ))}
            </select>
            <select value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="탭할 병" disabled={readerId !== 'simulator'}>
              {tags.map((t) => (
                <option key={t.address} value={t.address}>
                  {t.label} (#{t.bottleId})
                </option>
              ))}
            </select>
            <button className="primary" onClick={doTap} disabled={tapping || (readerId === 'simulator' && !selected)}>
              📱 병에 탭하기
            </button>
            <a className="hint" href="#/tags">태그 상태 바꾸기 (개봉 · 복제) →</a>
          </div>
        </div>
      </section>

      <section className="lookup">
        <span>또는 병 ID로 이력만 조회 (태그 서명 검증 없음):</span>
        <div className="row">
          {bottles.map((b) => (
            <button key={b.id} className="chip" onClick={() => doLookup(b.id)}>
              #{b.id}
            </button>
          ))}
          <input
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
            placeholder="ID"
            inputMode="numeric"
            style={{ width: 70 }}
          />
          <button onClick={() => lookupId && doLookup(Number(lookupId))}>조회</button>
        </div>
      </section>
      </>
      )}

      {result?.mode === 'error' && <div className="banner danger">{result.message}</div>}
      {result && result.mode !== 'error' && (
        <Result result={result} nameOf={nameOf} onSubmitOpened={submitOpened} busy={busy} nfcLanding={nfcLanding} />
      )}
    </div>
  )
}

function Verdict({ result, nfcLanding }) {
  const { mode, resp, authentic, bottle } = result
  if (mode === 'lookup' && nfcLanding) {
    const b = result.bottle
    return (
      <div className={`verdict ${b.opened ? 'warn' : 'good'}`}>
        <div className="verdict-title">{b.opened ? '⚠ 개봉 기록이 있는 병입니다' : '✓ 등록된 병 · 봉인 유지'}</div>
        <div>
          {b.opened
            ? `${fmtDate(b.openedAt, true)}에 봉인이 해제되었습니다. 내용물은 보증할 수 없습니다.`
            : `${b.distillery}에서 ${fmtDate(b.registeredAt)}에 출고된 뒤 개봉 기록이 없습니다.`}
        </div>
      </div>
    )
  }
  if (mode === 'lookup') {
    return (
      <div className="verdict neutral">
        <div className="verdict-title">이력 조회</div>
        <div>태그 서명 없이 ID로 조회했습니다. 실물이 이 병인지 확인하려면 태그를 탭해야 합니다.</div>
      </div>
    )
  }
  if (!bottle) {
    return (
      <div className="verdict bad">
        <div className="verdict-title">✕ 등록되지 않은 병</div>
        <div>태그가 주장한 병 ID #{resp.bottleId}는 블록체인에 없습니다.</div>
      </div>
    )
  }
  if (!authentic) {
    return (
      <div className="verdict bad">
        <div className="verdict-title">✕ 위조 태그 — 진품으로 확인할 수 없습니다</div>
        <div>
          태그는 병 #{resp.bottleId}라고 주장하지만, 서명이 이 병에 등록된 태그({short(bottle.tag)})의 것이 아닙니다. 병
          ID는 복제할 수 있어도 칩의 서명키는 복제할 수 없습니다.
        </div>
      </div>
    )
  }
  if (resp.opened || bottle.opened) {
    return (
      <div className="verdict warn">
        <div className="verdict-title">⚠ 진짜 병이지만 개봉되었습니다</div>
        <div>
          {bottle.opened
            ? `${fmtDate(bottle.openedAt, true)}에 봉인이 해제된 기록이 있습니다.`
            : '태그의 봉인 루프가 끊어져 있습니다. 아직 체인에는 기록되지 않았습니다.'}{' '}
          병·라벨·캡이 진품이어도 내용물은 보증할 수 없습니다 (공병 리필 위험).
        </div>
      </div>
    )
  }
  return (
    <div className="verdict good">
      <div className="verdict-title">✓ 등록된 진품 태그 · 봉인 유지</div>
      <div>
        태그 서명이 블록체인에 등록된 공개키와 일치하고, 출고 이후 한 번도 열리지 않았습니다. 아래 이력은 위·변조할 수
        없는 온체인 기록입니다.
      </div>
    </div>
  )
}

function Result({ result, nameOf, onSubmitOpened, busy, nfcLanding }) {
  const { bottle, history, resp } = result
  const needsReport = result.mode === 'tap' && result.authentic && resp.opened && bottle && !bottle.opened
  const owners = history.filter((r) => [0, 7, 8].includes(r.kind)).length
  const storageDays = (() => {
    let days = 0
    let inAt = null
    for (const r of history) {
      if (r.kind === 2) inAt = r.timestamp
      if (r.kind === 4 && inAt) {
        days += (r.timestamp - inAt) / 86400
        inAt = null
      }
    }
    if (inAt) days += (Date.now() / 1000 - inAt) / 86400
    return Math.round(days)
  })()

  return (
    <section className="result">
      <Verdict result={result} nfcLanding={nfcLanding} />
      {needsReport && (
        <div className="banner warn">
          태그가 '개봉됨' 서명을 제공했습니다. 누구나 이 서명을 제출해 개봉 사실을 영구히 기록할 수 있습니다.{' '}
          <button className="primary" disabled={busy} onClick={onSubmitOpened}>
            개봉 기록 블록체인에 제출
          </button>
        </div>
      )}
      {result.mode === 'tap' && (
        <details className="proof">
          <summary>탭 응답 원문 (칩 → 휴대폰)</summary>
          <pre>{JSON.stringify(resp, null, 2)}</pre>
        </details>
      )}
      {result.mode === 'tap' && !result.authentic && bottle && (
        <p className="hint">
          위조 태그에는 이력을 보여주지 않습니다. 태그가 사칭한 병 #{bottle.id}의 정식 이력은{' '}
          <a href={`#/verify/${bottle.id}`}>ID 조회</a>로 볼 수 있습니다.
        </p>
      )}
      {bottle && (result.mode !== 'tap' || result.authentic) && (
        <>
          <div className="card">
            <BottleSummary bottle={bottle} nameOf={nameOf} />
            <div className="stats">
              <div>
                <b>{history.length}</b>
                <span>온체인 기록</span>
              </div>
              <div>
                <b>{owners}</b>
                <span>거쳐 간 소유자</span>
              </div>
              <div>
                <b>{storageDays}일</b>
                <span>전문 창고 보관</span>
              </div>
              <div>
                <b>{fmtDate(bottle.registeredAt)}</b>
                <span>증류소 출고</span>
              </div>
            </div>
          </div>
          <div className="grid-2">
            <div className="card">
              <h3>이력 타임라인</h3>
              <Timeline history={history} nameOf={nameOf} />
            </div>
            <div className="card">
              <h3>보관 환경</h3>
              <EnvChart history={history} />
              {history.every((r) => r.kind !== 3) && <p className="hint">창고 보관 환경 기록이 없습니다.</p>}
            </div>
          </div>
        </>
      )}
    </section>
  )
}

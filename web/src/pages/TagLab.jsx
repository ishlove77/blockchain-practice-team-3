import { useEffect, useState } from 'react'
import { short } from '../lib/chain'
import { breakSeal, cloneTag, listTags, resetTags } from '../lib/tags'

export default function TagLab({ bottles }) {
  const [tags, setTags] = useState(listTags)
  useEffect(() => {
    const on = () => setTags(listTags())
    window.addEventListener('tags-changed', on)
    return () => window.removeEventListener('tags-changed', on)
  }, [])

  return (
    <div className="page">
      <h2>NFC 태그 시뮬레이터</h2>
      <p className="lead">
        실물 NFC 칩 대신 이 브라우저에 보관되는 가상 태그입니다. 각 칩은 <b>병 ID</b>, 밖으로 꺼낼 수 없는 <b>서명키</b>,
        <b> 봉인 루프 상태</b>만 가집니다. 캡을 열면 루프가 끊어져 되돌릴 수 없고, 위조범은 ID는 베낄 수 있어도 서명키는 베낄 수
        없습니다.
      </p>
      <div className="tag-grid">
        {tags.map((t) => {
          const bottle = bottles.find((b) => b.id === t.bottleId)
          return (
            <div key={t.address} className={`tag-card ${t.counterfeit ? 'fake' : ''} ${t.opened ? 'opened' : ''}`}>
              <div className="tag-chip">
                <span>NFC</span>
                <i className={t.opened ? 'loop broken' : 'loop'} />
              </div>
              <div className="tag-label">{t.label}</div>
              <dl>
                <dt>병 ID</dt>
                <dd>#{t.bottleId}</dd>
                <dt>칩 공개키</dt>
                <dd>
                  <code>{short(t.address)}</code>
                </dd>
                <dt>봉인 루프</dt>
                <dd>{t.opened ? '끊어짐 (개봉됨)' : '연결됨'}</dd>
                <dt>체인 기록</dt>
                <dd>{bottle ? (bottle.opened ? '개봉됨' : '봉인') : '—'}</dd>
              </dl>
              <div className="tag-actions">
                <a className="btn primary" href={`#/verify/${t.address}`}>
                  📱 탭하기
                </a>
                {!t.opened && (
                  <button onClick={() => breakSeal(t.address)} title="봉인 루프를 끊습니다. 되돌릴 수 없습니다.">
                    🍾 캡 개봉
                  </button>
                )}
                {!t.counterfeit && (
                  <button onClick={() => cloneTag(t)} title="병 ID만 베낀 위조 칩을 만듭니다">
                    🧪 ID 복제
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="card scenarios">
        <h3>데모 시나리오</h3>
        <ol>
          <li>
            <b>정상 진품</b>: "진품 · Highland Crown 30"을 탭 → 서명 일치 + 봉인 유지 + 2년 넘는 창고 보관·2회 거래 이력.
          </li>
          <li>
            <b>칩 복제</b>: "위조 · #1 ID 복제 태그"를 탭 → 병 ID는 같지만 서명이 등록된 공개키와 달라 위조로 판정.
          </li>
          <li>
            <b>진품 공병 리필</b>: 진품 태그에서 "캡 개봉" 후 탭 → 진짜 병이지만 개봉됨. 태그가 준 서명으로 누구나 개봉 사실을
            체인에 제출할 수 있고, 이후엔 영구히 "개봉됨"으로 조회됨.
          </li>
          <li>
            <b>이미 개봉된 병</b>: "개봉됨 · Islay Mist 25" → 2025년 개봉 기록이 이미 체인에 있음.
          </li>
        </ol>
        <button className="ghost" onClick={() => resetTags()}>
          태그 상태 초기화 (체인 기록은 그대로)
        </button>
      </div>
    </div>
  )
}

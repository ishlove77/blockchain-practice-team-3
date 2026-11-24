import { useState } from 'react'
import { ethers } from 'ethers'
import { fmtEth } from '../lib/chain'
import { BottleSummary } from '../components/Bottle'

const ZERO = ethers.ZeroAddress
const same = (a, b) => a?.toLowerCase() === b?.toLowerCase()

export default function Market({ account, bottles, participants, people, nameOf, send, busy }) {
  const mine = bottles.filter((b) => same(b.owner, account.address))
  const forSale = bottles.filter((b) => b.forSale && !same(b.owner, account.address))
  const warehouses = Object.entries(participants)
    .filter(([, p]) => p.role === 2)
    .map(([address]) => ({ address: ethers.getAddress(address) }))

  return (
    <div className="page">
      <h2>마켓</h2>
      <p className="lead">구매 버튼을 누르면 스마트 컨트랙트가 대금 지급과 소유권 이전을 한 트랜잭션에서 처리하고 이력에 남깁니다.</p>
      {forSale.length === 0 && <p className="empty">다른 사람이 판매 중인 병이 없습니다.</p>}
      <div className="list">
        {forSale.map((b) => (
          <div className="card" key={b.id}>
            <BottleSummary bottle={b} nameOf={nameOf}>
              <div className="actions">
                <a className="btn" href={`#/verify/${b.id}`}>
                  이력 보기
                </a>
                <button className="primary" disabled={busy} onClick={() => send(`#${b.id} 구매`, (c) => c.buy(b.id, { value: b.price }))}>
                  {fmtEth(b.price)}에 구매
                </button>
              </div>
            </BottleSummary>
          </div>
        ))}
      </div>

      <h2>내 컬렉션 · {account.label}</h2>
      {mine.length === 0 && <p className="empty">소유한 병이 없습니다. 위 마켓에서 구매하거나 다른 계정으로 바꿔 보세요.</p>}
      <div className="list">
        {mine.map((b) => (
          <MyBottle key={b.id} b={b} nameOf={nameOf} send={send} busy={busy} warehouses={warehouses} account={account} people={people} />
        ))}
      </div>
    </div>
  )
}

function MyBottle({ b, nameOf, send, busy, warehouses, account, people }) {
  const [price, setPrice] = useState('')
  const [wh, setWh] = useState(warehouses[0]?.address ?? '')
  const [to, setTo] = useState('')
  const others = people.filter((a) => !same(a.address, account.address))
  const toValid = ethers.isAddress(to) && !same(to, account.address)
  const inStorage = b.custodian !== ZERO

  return (
    <div className="card">
      <BottleSummary bottle={b} nameOf={nameOf}>
        <div className="actions-grid">
          <div className="action">
            <label>판매</label>
            {b.forSale ? (
              <button disabled={busy} onClick={() => send(`#${b.id} 판매 취소`, (c) => c.unlist(b.id))}>
                판매 취소
              </button>
            ) : (
              <div className="row">
                <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="가격 (ETH)" inputMode="decimal" />
                <button
                  disabled={busy || !(Number(price) > 0)}
                  onClick={() => send(`#${b.id} 판매 등록`, (c) => c.list(b.id, ethers.parseEther(price)))}
                >
                  등록
                </button>
              </div>
            )}
            {b.opened && <small className="warn-text">개봉된 병은 판매 시 이력에 그대로 표시됩니다.</small>}
          </div>

          <div className="action">
            <label>보관</label>
            {inStorage ? (
              <button disabled={busy} onClick={() => send(`#${b.id} 출고 요청`, (c) => c.checkOut(b.id, '소유자 반출 요청'))}>
                {nameOf(b.custodian)}에서 출고
              </button>
            ) : (
              <div className="row">
                <select value={wh} onChange={(e) => setWh(e.target.value)}>
                  {warehouses.map((w) => (
                    <option key={w.address} value={w.address}>
                      {nameOf(w.address)}
                    </option>
                  ))}
                </select>
                <button disabled={busy || !wh} onClick={() => send(`#${b.id} 보관 위탁`, (c) => c.consign(b.id, wh))}>
                  위탁
                </button>
              </div>
            )}
          </div>

          <div className="action">
            <label>양도</label>
            <div className="row">
              <input
                list={`people-${b.id}`}
                value={to}
                onChange={(e) => setTo(e.target.value.trim())}
                placeholder="받는 사람 주소 0x…"
                aria-label="받는 사람"
              />
              <datalist id={`people-${b.id}`}>
                {others.map((a) => (
                  <option key={a.address} value={a.address}>
                    {a.label}
                  </option>
                ))}
              </datalist>
              <button disabled={busy || !toValid} onClick={() => send(`#${b.id} 양도`, (c) => c.transfer(b.id, to))}>
                양도
              </button>
            </div>
          </div>
        </div>
      </BottleSummary>
    </div>
  )
}

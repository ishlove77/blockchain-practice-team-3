import { useState } from 'react'
import { ethers } from 'ethers'
import { ROLE } from '../lib/chain'
import { Addr } from '../components/Bottle'

const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase()

export default function Admin({ account, admin, participants, people, nameOf, send, busy }) {
  const isAdmin = same(account?.address, admin)
  const [addr, setAddr] = useState('')
  const [role, setRole] = useState('1')
  const [name, setName] = useState('')

  const rows = people
    .map((p) => ({ ...p, part: participants[p.address.toLowerCase()] ?? { role: 0, name: '' } }))
    .sort((a, b) => (same(b.address, admin) ? 1 : 0) - (same(a.address, admin) ? 1 : 0) || b.part.role - a.part.role)

  return (
    <div className="page">
      <h2>참여자</h2>
      <p className="lead">증류소와 보관창고는 관리자가 등록한 계정만 기록을 남길 수 있습니다. 거래(구매·양도)는 누구나 가능합니다.</p>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>이름</th>
              <th>주소</th>
              <th>온체인 역할</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.address}>
                <td>
                  {nameOf(r.address)}
                  {same(r.address, admin) && <span className="badge muted">admin</span>}
                </td>
                <td>
                  <Addr a={r.address} />
                </td>
                <td>{ROLE[r.part.role]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>역할 지정</h3>
      {!isAdmin && <div className="banner">관리자 계정으로 연결해야 역할을 지정할 수 있습니다.</div>}
      <form
        className="card form"
        onSubmit={(e) => {
          e.preventDefault()
          send('역할 지정', (c) => c.setParticipant(addr, Number(role), name))
        }}
      >
        <div className="field wide">
          <label>주소</label>
          <input list="admin-people" value={addr} onChange={(e) => setAddr(e.target.value.trim())} placeholder="0x…" />
          <datalist id="admin-people">
            {people.map((p) => (
              <option key={p.address} value={p.address}>
                {p.label}
              </option>
            ))}
          </datalist>
        </div>
        <div className="field">
          <label>역할</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="0">일반 (권한 회수)</option>
            <option value="1">증류소</option>
            <option value="2">보관창고</option>
          </select>
        </div>
        <div className="field">
          <label>이름</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="표시 이름" />
        </div>
        <div className="field wide">
          <button className="primary" disabled={busy || !isAdmin || !ethers.isAddress(addr)}>
            저장
          </button>
        </div>
      </form>
    </div>
  )
}

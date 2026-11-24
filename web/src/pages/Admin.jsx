import { useState } from 'react'
import { deployment, ROLE } from '../lib/chain'
import { Addr } from '../components/Bottle'

export default function Admin({ account, participants, send, busy }) {
  const isAdmin = account.address === deployment.accounts[0].address
  const [addr, setAddr] = useState(deployment.accounts[6]?.address ?? '')
  const [role, setRole] = useState('1')
  const [name, setName] = useState('')

  return (
    <div className="page">
      <h2>참여자</h2>
      <p className="lead">증류소와 보관창고는 관리자가 등록한 계정만 기록을 남길 수 있습니다. 거래(구매·양도)는 누구나 가능합니다.</p>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>계정</th>
              <th>주소</th>
              <th>온체인 역할</th>
              <th>등록 이름</th>
            </tr>
          </thead>
          <tbody>
            {deployment.accounts.map((a, i) => {
              const p = participants[a.address.toLowerCase()] ?? { role: 0, name: '' }
              return (
                <tr key={a.address}>
                  <td>
                    {a.label}
                    {i === 0 && <span className="badge muted">admin</span>}
                  </td>
                  <td>
                    <Addr a={a.address} />
                  </td>
                  <td>{ROLE[p.role]}</td>
                  <td>{p.name || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <h3>역할 지정</h3>
      {!isAdmin && <div className="banner">관리자 계정(플랫폼 관리자)으로 바꿔야 역할을 지정할 수 있습니다.</div>}
      <form
        className="card form"
        onSubmit={(e) => {
          e.preventDefault()
          send('역할 지정', (c) => c.setParticipant(addr, Number(role), name))
        }}
      >
        <div className="field wide">
          <label>계정</label>
          <select value={addr} onChange={(e) => setAddr(e.target.value)}>
            {deployment.accounts.map((a) => (
              <option key={a.address} value={a.address}>
                {a.label} ({a.address})
              </option>
            ))}
          </select>
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
          <button className="primary" disabled={busy || !isAdmin}>
            저장
          </button>
        </div>
      </form>
    </div>
  )
}

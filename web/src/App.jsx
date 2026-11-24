import { useCallback, useEffect, useMemo, useState } from 'react'
import { ethers } from 'ethers'
import { deployment, loadAll, provider, contractFor, explainError, ROLE, short } from './lib/chain'
import Verify from './pages/Verify'
import Distillery from './pages/Distillery'
import Warehouse from './pages/Warehouse'
import Market from './pages/Market'
import TagLab from './pages/TagLab'
import Admin from './pages/Admin'

const TABS = [
  { id: 'verify', label: '구매자 탭', hint: '이력·봉인 확인' },
  { id: 'market', label: '거래', hint: '내 컬렉션 · 마켓' },
  { id: 'distillery', label: '증류소 출고', hint: '병 등록' },
  { id: 'warehouse', label: '보관창고', hint: '입출고 · 환경' },
  { id: 'tags', label: 'NFC 태그 시뮬레이터', hint: '개봉 · 복제' },
  { id: 'admin', label: '참여자', hint: '역할 관리' },
]

function parseHash() {
  const [, tab, arg] = window.location.hash.split('/')
  return { tab: TABS.some((t) => t.id === tab) ? tab : 'verify', arg }
}

export default function App() {
  const [route, setRoute] = useState(parseHash)
  const [accountIdx, setAccountIdx] = useState(() => {
    try {
      return Number(localStorage.getItem('whisky.account') ?? 5)
    } catch {
      return 5
    }
  })
  const [state, setState] = useState({ bottles: [], participants: {} })
  const [balance, setBalance] = useState(null)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [busy, setBusy] = useState(false)

  const account = deployment.accounts[accountIdx] ?? deployment.accounts[0]

  const refresh = useCallback(async () => {
    try {
      const [s, bal] = await Promise.all([loadAll(), provider.getBalance(account.address)])
      setState(s)
      setBalance(bal)
      setError(null)
    } catch (e) {
      setError(explainError(e))
    }
  }, [account.address])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 5000)
    return () => clearInterval(t)
  }, [refresh])

  useEffect(() => {
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const selectAccount = (i) => {
    setAccountIdx(i)
    try {
      localStorage.setItem('whisky.account', String(i))
    } catch {
      /* ignore */
    }
  }

  const nameOf = useCallback(
    (addr) => {
      if (!addr || addr === ethers.ZeroAddress) return '—'
      const p = state.participants[addr.toLowerCase()]
      if (p?.name) return p.name
      const a = deployment.accounts.find((x) => x.address.toLowerCase() === addr.toLowerCase())
      return a ? a.label : short(addr)
    },
    [state.participants],
  )

  /** 트랜잭션 실행 공통 처리 */
  const send = useCallback(
    async (label, fn) => {
      setBusy(true)
      try {
        const c = contractFor(account)
        const tx = await fn(c)
        const receipt = await tx.wait()
        setToast({ ok: true, text: `${label} 완료 · 블록 #${receipt.blockNumber}`, hash: receipt.hash })
        await refresh()
        return receipt
      } catch (e) {
        setToast({ ok: false, text: `${label} 실패: ${explainError(e)}` })
        return null
      } finally {
        setBusy(false)
      }
    },
    [account, refresh],
  )

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  const me = useMemo(
    () => state.participants[account.address.toLowerCase()] ?? { role: 0, name: '' },
    [state.participants, account.address],
  )
  const ctx = useMemo(
    () => ({ account, me, ...state, nameOf, send, busy, refresh, arg: route.arg }),
    [account, me, state, nameOf, send, busy, refresh, route.arg],
  )

  const go = (tab) => {
    window.location.hash = `#/${tab}`
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand" onClick={() => go('verify')}>
          <span className="brand-mark">◆</span>
          <div>
            <div className="brand-name">Sealed Provenance</div>
            <div className="brand-sub">열지 않아도 증명되는 한 병</div>
          </div>
        </div>
        <div className="account">
          <label htmlFor="acct">현재 계정</label>
          <select id="acct" value={accountIdx} onChange={(e) => selectAccount(Number(e.target.value))}>
            {deployment.accounts.map((a, i) => (
              <option key={a.address} value={i}>
                {a.label} ({ROLE[state.participants[a.address.toLowerCase()]?.role ?? 0]})
              </option>
            ))}
          </select>
          <div className="account-meta">
            <code>{short(account.address)}</code>
            {balance != null && <span>{Number(ethers.formatEther(balance)).toFixed(3)} ETH</span>}
          </div>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <a key={t.id} href={`#/${t.id}`} className={route.tab === t.id ? 'active' : ''}>
            <span>{t.label}</span>
            <small>{t.hint}</small>
          </a>
        ))}
      </nav>

      {error && (
        <div className="banner danger">
          체인 연결 오류: {error} — <code>./run.sh</code>로 anvil과 배포를 먼저 실행하세요.
        </div>
      )}

      <main>
        {route.tab === 'verify' && <Verify {...ctx} />}
        {route.tab === 'market' && <Market {...ctx} />}
        {route.tab === 'distillery' && <Distillery {...ctx} />}
        {route.tab === 'warehouse' && <Warehouse {...ctx} />}
        {route.tab === 'tags' && <TagLab {...ctx} />}
        {route.tab === 'admin' && <Admin {...ctx} />}
      </main>

      <footer className="foot">
        컨트랙트 <code>{deployment.address}</code> · chainId {deployment.chainId} · 로컬 데모 (NFC는 웹 시뮬레이터로 대체)
      </footer>

      {toast && (
        <div className={`toast ${toast.ok ? 'ok' : 'bad'}`} onClick={() => setToast(null)}>
          {toast.text}
          {toast.hash && <code>{short(toast.hash)}</code>}
        </div>
      )}
    </div>
  )
}

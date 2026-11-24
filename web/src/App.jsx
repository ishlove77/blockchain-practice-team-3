import { useCallback, useEffect, useMemo, useState } from 'react'
import { ethers } from 'ethers'
import {
  deployment,
  IS_DEMO_ACCOUNTS,
  NETWORK,
  loadAll,
  provider,
  contractFor,
  connectWallet,
  explainError,
  explorerTx,
  explorerAddr,
  ROLE,
  short,
} from './lib/chain'
import Verify from './pages/Verify'
import Distillery from './pages/Distillery'
import Warehouse from './pages/Warehouse'
import Market from './pages/Market'
import TagLab from './pages/TagLab'
import Admin from './pages/Admin'

const TABS = [
  { id: 'verify', label: '구매자 탭', hint: '이력·봉인 확인', needsWallet: false },
  { id: 'market', label: '거래', hint: '내 컬렉션 · 마켓', needsWallet: true },
  { id: 'distillery', label: '증류소 출고', hint: '병 등록', needsWallet: true },
  { id: 'warehouse', label: '보관창고', hint: '입출고 · 환경', needsWallet: true },
  { id: 'tags', label: 'NFC 태그 시뮬레이터', hint: '개봉 · 복제', needsWallet: false },
  { id: 'admin', label: '참여자', hint: '역할 관리', needsWallet: false },
]

function parseHash() {
  const [, tab, arg] = window.location.hash.split('/')
  return { tab: TABS.some((t) => t.id === tab) ? tab : 'verify', arg }
}

const store = {
  get: (k, d) => {
    try {
      return localStorage.getItem(k) ?? d
    } catch {
      return d
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* ignore */
    }
  },
}

export default function App() {
  const [route, setRoute] = useState(parseHash)
  // 로컬 데모: 공개 테스트 계정 중 선택 / 공개 네트워크: 연결한 지갑
  const [accountIdx, setAccountIdx] = useState(() => Number(store.get('whisky.account', 5)))
  const [wallet, setWallet] = useState(null)
  const [state, setState] = useState({ bottles: [], participants: {}, admin: null })
  const [loaded, setLoaded] = useState(false)
  const [balance, setBalance] = useState(null)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [busy, setBusy] = useState(false)

  const account = IS_DEMO_ACCOUNTS ? (deployment.accounts[accountIdx] ?? deployment.accounts[0]) : wallet

  const refresh = useCallback(async () => {
    try {
      const [s, bal] = await Promise.all([loadAll(), account ? provider.getBalance(account.address) : null])
      setState(s)
      setBalance(bal)
      setError(null)
      setLoaded(true)
    } catch (e) {
      setError(explainError(e))
    }
  }, [account])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, IS_DEMO_ACCOUNTS ? 5000 : 15000)
    return () => clearInterval(t)
  }, [refresh])

  useEffect(() => {
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // 지갑 계정 변경 감지
  useEffect(() => {
    if (IS_DEMO_ACCOUNTS || !window.ethereum?.on) return
    const onAccounts = (accs) => setWallet(accs?.[0] ? { address: ethers.getAddress(accs[0]), label: '내 지갑' } : null)
    window.ethereum.on('accountsChanged', onAccounts)
    // 이미 연결 허용된 지갑이면 조용히 복원
    window.ethereum.request({ method: 'eth_accounts' }).then(onAccounts).catch(() => {})
    return () => window.ethereum.removeListener?.('accountsChanged', onAccounts)
  }, [])

  const doConnect = async () => {
    try {
      setWallet(await connectWallet())
    } catch (e) {
      setToast({ ok: false, text: `지갑 연결 실패: ${explainError(e)}` })
    }
  }

  const selectAccount = (i) => {
    setAccountIdx(i)
    store.set('whisky.account', String(i))
  }

  const nameOf = useCallback(
    (addr) => {
      if (!addr || addr === ethers.ZeroAddress) return '—'
      const p = state.participants[addr.toLowerCase()]
      if (p?.name) return p.name
      const a = [...deployment.accounts, ...(deployment.directory ?? [])].find(
        (x) => x.address.toLowerCase() === addr.toLowerCase(),
      )
      if (a) return a.label
      if (account && addr.toLowerCase() === account.address.toLowerCase()) return `나 (${short(addr)})`
      return short(addr)
    },
    [state.participants, account],
  )

  /** 이름을 아는 주소 목록 (양도 대상, 역할 지정 등에 사용) */
  const people = useMemo(() => {
    const m = new Map()
    for (const a of [...deployment.accounts, ...(deployment.directory ?? [])]) m.set(a.address.toLowerCase(), a.address)
    for (const a of Object.keys(state.participants)) if (!m.has(a)) m.set(a, ethers.getAddress(a))
    for (const b of state.bottles) if (!m.has(b.owner.toLowerCase())) m.set(b.owner.toLowerCase(), b.owner)
    return [...m.values()].map((address) => ({ address, label: nameOf(address) }))
  }, [state.participants, state.bottles, nameOf])

  /** 트랜잭션 실행 공통 처리 */
  const send = useCallback(
    async (label, fn) => {
      if (!account) {
        setToast({ ok: false, text: '먼저 지갑을 연결하세요.' })
        return null
      }
      setBusy(true)
      try {
        const c = await contractFor(account)
        const tx = await fn(c)
        setToast({ ok: true, pending: true, text: `${label} 전송됨 · 블록 포함 대기 중…`, hash: tx.hash })
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
    if (!toast || toast.pending) return
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast])

  const me = useMemo(
    () => (account && state.participants[account.address.toLowerCase()]) || { role: 0, name: '' },
    [state.participants, account],
  )
  const ctx = useMemo(
    () => ({ account, me, ...state, people, nameOf, send, busy, refresh, arg: route.arg, loaded }),
    [account, me, state, people, nameOf, send, busy, refresh, route.arg, loaded],
  )

  const tab = TABS.find((t) => t.id === route.tab)
  const nfcLanding = route.tab === 'verify' && /^\d+$/.test(route.arg ?? '')

  return (
    <div className="app">
      <header className="top">
        <a className="brand" href="#/verify">
          <span className="brand-mark">◆</span>
          <div>
            <div className="brand-name">Sealed Provenance</div>
            <div className="brand-sub">열지 않아도 증명되는 한 병</div>
          </div>
        </a>
        {IS_DEMO_ACCOUNTS ? (
          <div className="account">
            <label htmlFor="acct">현재 계정 (로컬 데모)</label>
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
        ) : (
          <div className="account">
            <label>{deployment.networkName ?? NETWORK}</label>
            {account ? (
              <div className="account-meta big">
                <span className="dot" /> <b>{me.name || '지갑 연결됨'}</b>
                <code>{short(account.address)}</code>
                {balance != null && <span>{Number(ethers.formatEther(balance)).toFixed(4)} ETH</span>}
              </div>
            ) : (
              <button onClick={doConnect}>🦊 지갑 연결</button>
            )}
          </div>
        )}
      </header>

      {!nfcLanding && (
        <nav className="tabs">
          {TABS.map((t) => (
            <a key={t.id} href={`#/${t.id}`} className={route.tab === t.id ? 'active' : ''}>
              <span>{t.label}</span>
              <small>{t.hint}</small>
            </a>
          ))}
        </nav>
      )}

      {error && (
        <div className="banner danger">
          체인 연결 오류: {error}
          {IS_DEMO_ACCOUNTS && (
            <>
              {' '}— <code>./run.sh</code>로 anvil과 배포를 먼저 실행하세요.
            </>
          )}
        </div>
      )}

      <main>
        {tab.needsWallet && !account ? (
          <div className="page">
            <div className="banner">
              이 화면은 블록체인에 기록을 남기므로 지갑 서명이 필요합니다. 오른쪽 위 <b>지갑 연결</b>을 누르세요. (이력 조회는
              지갑 없이 <a href="#/verify">구매자 탭</a>에서 가능합니다.)
            </div>
          </div>
        ) : (
          <>
            {route.tab === 'verify' && <Verify {...ctx} nfcLanding={nfcLanding} />}
            {route.tab === 'market' && <Market {...ctx} />}
            {route.tab === 'distillery' && <Distillery {...ctx} />}
            {route.tab === 'warehouse' && <Warehouse {...ctx} />}
            {route.tab === 'tags' && <TagLab {...ctx} />}
            {route.tab === 'admin' && <Admin {...ctx} />}
          </>
        )}
      </main>

      <footer className="foot">
        컨트랙트{' '}
        {explorerAddr(deployment.address) ? (
          <a href={explorerAddr(deployment.address)} target="_blank" rel="noreferrer">
            <code>{deployment.address}</code>
          </a>
        ) : (
          <code>{deployment.address}</code>
        )}{' '}
        · {deployment.networkName ?? `chainId ${deployment.chainId}`}
        {IS_DEMO_ACCOUNTS && ' · 로컬 데모'} · NFC 서명 칩은 웹 시뮬레이터로 대체
      </footer>

      {toast && (
        <div className={`toast ${toast.ok ? 'ok' : 'bad'}`} onClick={() => setToast(null)}>
          {toast.text}
          {toast.hash &&
            (explorerTx(toast.hash) ? (
              <a href={explorerTx(toast.hash)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                <code>{short(toast.hash)} ↗</code>
              </a>
            ) : (
              <code>{short(toast.hash)}</code>
            ))}
        </div>
      )}
    </div>
  )
}

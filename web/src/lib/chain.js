import { ethers } from 'ethers'

// VITE_NETWORK=local(기본) → ./run.sh 가 만든 src/deployment.json (데모 계정 포함)
// VITE_NETWORK=sepolia     → 커밋된 src/deployments/sepolia.json (MetaMask 사용, 계정 없음)
export const NETWORK = import.meta.env.VITE_NETWORK ?? 'local'
const localFiles = import.meta.glob('../deployment.json', { eager: true, import: 'default' })
const publicFiles = import.meta.glob('../deployments/*.json', { eager: true, import: 'default' })
export const deployment =
  NETWORK === 'local' ? Object.values(localFiles)[0] : publicFiles[`../deployments/${NETWORK}.json`]
if (!deployment) {
  throw new Error(
    NETWORK === 'local'
      ? 'src/deployment.json 이 없습니다. ./run.sh 로 로컬 체인과 배포를 먼저 실행하세요.'
      : `src/deployments/${NETWORK}.json 이 없습니다. scripts/deploy-sepolia.mjs 로 배포하세요.`,
  )
}
deployment.accounts ??= []
/** 로컬 데모: 공개 테스트 키로 계정 전환. 공개 네트워크: 브라우저 지갑(MetaMask)으로 서명 */
export const IS_DEMO_ACCOUNTS = deployment.accounts.length > 0
export const RPC_URL = import.meta.env.VITE_RPC_URL ?? deployment.rpcUrl
export const explorerTx = (h) => (deployment.explorer ? `${deployment.explorer}/tx/${h}` : null)
export const explorerAddr = (a) => (deployment.explorer ? `${deployment.explorer}/address/${a}` : null)

export const provider = new ethers.JsonRpcProvider(RPC_URL, deployment.chainId, {
  cacheTimeout: -1,
  staticNetwork: true,
})
export const readContract = new ethers.Contract(deployment.address, deployment.abi, provider)
export const iface = new ethers.Interface(deployment.abi)

export const ROLE = { 0: '일반', 1: '증류소', 2: '보관창고' }

export const KIND = [
  { key: 'Registered', label: '증류소 출고', icon: '🏭', tone: 'brand' },
  { key: 'Consigned', label: '보관 위탁', icon: '📦', tone: 'muted' },
  { key: 'CheckIn', label: '창고 입고', icon: '⬇️', tone: 'store' },
  { key: 'Environment', label: '보관 환경 기록', icon: '🌡️', tone: 'muted' },
  { key: 'CheckOut', label: '창고 출고', icon: '⬆️', tone: 'store' },
  { key: 'Listed', label: '판매 등록', icon: '🏷️', tone: 'muted' },
  { key: 'Unlisted', label: '판매 취소', icon: '✖️', tone: 'muted' },
  { key: 'Sold', label: '판매 확정 · 소유권 이전', icon: '🤝', tone: 'trade' },
  { key: 'Transferred', label: '양도', icon: '🎁', tone: 'trade' },
  { key: 'Opened', label: '봉인 해제 (개봉)', icon: '⚠️', tone: 'danger' },
]

/** 서명자: 데모 계정이면 개인키 지갑, 아니면 브라우저 지갑 */
export async function signerFor(account) {
  if (account.privateKey) return new ethers.Wallet(account.privateKey, provider)
  if (!window.ethereum) throw new Error('브라우저 지갑(MetaMask)이 없습니다.')
  await ensureChain()
  return new ethers.BrowserProvider(window.ethereum).getSigner(account.address)
}

export async function contractFor(account) {
  return new ethers.Contract(deployment.address, deployment.abi, await signerFor(account))
}

// ── 브라우저 지갑 (공개 네트워크용) ──
export const hasInjectedWallet = () => typeof window !== 'undefined' && !!window.ethereum

export async function ensureChain() {
  const hex = '0x' + deployment.chainId.toString(16)
  const current = await window.ethereum.request({ method: 'eth_chainId' })
  if (current?.toLowerCase() === hex) return
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] })
  } catch (e) {
    if (e?.code !== 4902) throw e
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: hex,
        chainName: deployment.networkName ?? NETWORK,
        rpcUrls: [deployment.rpcUrl],
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        blockExplorerUrls: deployment.explorer ? [deployment.explorer] : [],
      }],
    })
  }
}

export async function connectWallet() {
  if (!hasInjectedWallet()) throw new Error('MetaMask가 설치된 브라우저(또는 MetaMask 앱 브라우저)에서 열어 주세요.')
  const [address] = await window.ethereum.request({ method: 'eth_requestAccounts' })
  await ensureChain()
  return { address: ethers.getAddress(address), label: '내 지갑' }
}

export const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')
export const fmtEth = (wei) => `${Number(ethers.formatEther(wei)).toLocaleString('ko-KR', { maximumFractionDigits: 4 })} ETH`
export const fmtDate = (sec, withTime = false) => {
  const d = new Date(Number(sec) * 1000)
  return withTime
    ? d.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export function normalizeBottle(b) {
  return {
    id: Number(b.id),
    name: b.name,
    distillery: b.distillery,
    vintage: Number(b.vintage),
    ageYears: Number(b.ageYears),
    caskType: b.caskType,
    serial: b.serial,
    tag: b.tag,
    owner: b.owner,
    custodian: b.custodian,
    pendingCustodian: b.pendingCustodian,
    opened: b.opened,
    forSale: b.forSale,
    price: b.price,
    registeredAt: Number(b.registeredAt),
    openedAt: Number(b.openedAt),
  }
}

export function normalizeRecord(r) {
  return {
    kind: Number(r.kind),
    actor: r.actor,
    counterparty: r.counterparty,
    timestamp: Number(r.timestamp),
    temperature: Number(r.temperatureX10) / 10,
    humidity: Number(r.humidity),
    amount: r.amount,
    note: r.note,
  }
}

export async function loadAll() {
  const count = Number(await readContract.bottleCount())
  const ids = Array.from({ length: count }, (_, i) => i + 1)
  const bottles = await Promise.all(ids.map((id) => readContract.getBottle(id).then(normalizeBottle)))
  const participants = {}
  const addrs = new Set([...deployment.accounts, ...(deployment.directory ?? [])].map((a) => a.address.toLowerCase()))
  if (!IS_DEMO_ACCOUNTS) {
    // 공개 네트워크: 역할 지정 이벤트로 참여자 목록을 만든다
    try {
      const logs = await readContract.queryFilter(readContract.filters.ParticipantSet(), deployment.deployBlock ?? 0)
      for (const l of logs) addrs.add(l.args.account.toLowerCase())
    } catch {
      /* 일부 RPC는 범위 조회를 제한 — directory 로 대체 */
    }
  }
  await Promise.all(
    [...addrs].map(async (a) => {
      const p = await readContract.participants(a)
      participants[a] = { role: Number(p.role), name: p.name }
    }),
  )
  const admin = await readContract.admin()
  return { bottles, participants, admin }
}

export async function loadHistory(id) {
  return (await readContract.getHistory(id)).map(normalizeRecord)
}

const ERROR_KO = {
  NotAdmin: '관리자만 할 수 있습니다.',
  NotDistillery: '등록된 증류소 계정만 병을 출고할 수 있습니다.',
  NotWarehouse: '등록된 보관창고가 아닙니다.',
  NotOwner: '이 병의 소유자가 아닙니다.',
  NotCustodian: '이 병을 보관 중인 창고가 아닙니다.',
  UnknownBottle: '존재하지 않는 병 ID입니다.',
  TagAlreadyUsed: '이미 다른 병에 등록된 NFC 태그입니다.',
  InvalidTag: '유효하지 않은 태그입니다.',
  AlreadyOpened: '이미 개봉 기록이 있는 병입니다.',
  BadSignature: '태그 서명이 일치하지 않습니다.',
  NotForSale: '판매 중인 병이 아닙니다.',
  WrongPrice: '가격이 올바르지 않습니다.',
  InStorage: '이미 창고에 보관 중입니다.',
  NotConsignedToYou: '이 창고에 위탁된 병이 아닙니다.',
  InvalidAddress: '유효하지 않은 주소입니다.',
  TransferFailed: '대금 송금에 실패했습니다.',
}

export function explainError(e) {
  const data = e?.data ?? e?.info?.error?.data ?? e?.error?.data
  if (data) {
    try {
      const parsed = iface.parseError(data)
      if (parsed) return ERROR_KO[parsed.name] ?? parsed.name
    } catch {
      /* fallthrough */
    }
  }
  if (e?.revert?.name) return ERROR_KO[e.revert.name] ?? e.revert.name
  if (e?.code === 'INSUFFICIENT_FUNDS') return '잔액이 부족합니다.'
  if (e?.code === 'ECONNREFUSED' || /fetch|network/i.test(e?.message ?? '')) return '체인(anvil)에 연결할 수 없습니다.'
  return e?.shortMessage ?? e?.message ?? String(e)
}

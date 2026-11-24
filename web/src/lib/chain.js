import { ethers } from 'ethers'
import deployment from '../deployment.json'

export { deployment }
export const provider = new ethers.JsonRpcProvider(deployment.rpcUrl, undefined, { cacheTimeout: -1 })
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

export function signerFor(account) {
  return new ethers.Wallet(account.privateKey, provider)
}

export function contractFor(account) {
  return new ethers.Contract(deployment.address, deployment.abi, signerFor(account))
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
  await Promise.all(
    deployment.accounts.map(async (a) => {
      const p = await readContract.participants(a.address)
      participants[a.address.toLowerCase()] = { role: Number(p.role), name: p.name }
    }),
  )
  return { bottles, participants }
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

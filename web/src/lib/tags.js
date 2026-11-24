// NFC 봉인 태그 시뮬레이터.
// 실제 칩 대신 브라우저 localStorage에 "물리 태그"를 둔다. 칩이 가진 것은 딱 세 가지:
//   1) 병 ID  2) 외부로 꺼낼 수 없는 서명키  3) 봉인 루프 상태(캡을 열면 끊어져 '개봉됨'으로 고정)
// 이력은 칩이 아니라 블록체인에 있다.
import { ethers } from 'ethers'
import { deployment } from './chain'

const KEY = `whisky.tags.${deployment.address.toLowerCase()}.${deployment.deployedAt}`

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* storage unavailable */
  }
  return deployment.demoTags ?? []
}

function write(tags) {
  try {
    localStorage.setItem(KEY, JSON.stringify(tags))
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event('tags-changed'))
}

export const listTags = () => read()

export function addTag(tag) {
  write([...read().filter((t) => t.address !== tag.address), tag])
}

export function updateTag(address, patch) {
  write(read().map((t) => (t.address === address ? { ...t, ...patch } : t)))
}

export function resetTags() {
  write(deployment.demoTags ?? [])
}

/** 공장에서 새 칩을 꺼낸다: 서명키 생성 (공개키 주소만 체인에 등록됨) */
export function newChip() {
  const w = ethers.Wallet.createRandom()
  return { address: w.address, privateKey: w.privateKey }
}

/** 위조범이 병 ID를 복제한 칩을 만든다. 서명키는 복제할 수 없으므로 새 키를 쓸 수밖에 없다. */
export function cloneTag(tag) {
  const chip = newChip()
  const t = {
    label: `위조 · #${tag.bottleId} ID 복제 태그`,
    bottleId: tag.bottleId,
    ...chip,
    opened: false,
    counterfeit: true,
  }
  addTag(t)
  return t
}

/** 캡 개봉: 봉인 루프가 끊어진다. 되돌릴 수 없다. */
export function breakSeal(address) {
  updateTag(address, { opened: true })
}

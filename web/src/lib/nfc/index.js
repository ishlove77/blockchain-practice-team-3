// ─────────────────────────────────────────────────────────────────────────────
// NFC 태그 리더 추상화
//
// 웹 화면(구매자 탭)은 이 인터페이스만 사용한다. 지금은 시뮬레이터 리더만 있고,
// 실물 NFC를 붙일 때는 같은 모양의 리더를 하나 더 만들어 READERS에 추가하면 된다.
//
// TagReader = {
//   id: string, label: string,
//   available(): boolean                          // 이 브라우저/기기에서 쓸 수 있는지
//   tap({ challenge, target? }): Promise<TapResponse>
// }
//
// TapResponse = {
//   bottleId: number,          // 칩에 기록된 병 ID
//   opened: boolean,           // 봉인 루프 상태
//   challenge: 0x…32bytes,     // 휴대폰이 보낸 무작위 값 (재전송 방지)
//   digest: 0x…32bytes,        // tapDigest(bottleId, opened, challenge)
//   signature: 0x…65bytes,     // 칩 키로 EIP-191 personal_sign(digest)
//   openedSignature: 0x… | null// 개봉된 칩이면 openedDigest(bottleId)에 대한 서명 (체인 제출용)
// }
//
// 서명 규칙(digest)은 컨트랙트 WhiskyProvenance.sol 과 맞춰져 있으며 아래 함수로 계산한다.
// 칩 키는 secp256k1 이므로 Ethereum 서명을 지원하는 NFC 칩(예: Arx HaLo 계열)을 그대로 쓸 수 있다.
// 실물 연동 가이드는 docs/NFC.md 참고.
// ─────────────────────────────────────────────────────────────────────────────
import { ethers } from 'ethers'
import { simulatorReader } from './simulator'
import { webNfcReader } from './webnfc'

export const READERS = [simulatorReader, webNfcReader]

export const newChallenge = () => ethers.hexlify(ethers.randomBytes(32))

export { tapDigest, openedDigest } from './digest'

/** 리더로 탭하고, 응답 형식을 검사해서 돌려준다 */
export async function tapWith(reader, opts = {}) {
  const challenge = opts.challenge ?? newChallenge()
  const resp = await reader.tap({ ...opts, challenge })
  if (resp.challenge !== challenge) throw new Error('칩 응답의 challenge가 요청과 다릅니다 (재전송 의심)')
  return resp
}

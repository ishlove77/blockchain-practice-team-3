// 시뮬레이터 리더: 브라우저에 저장된 가상 칩(lib/tags.js)이 서명한다.
import { ethers } from 'ethers'
import { listTags } from '../tags'
import { openedDigest, tapDigest } from './digest'

export const simulatorReader = {
  id: 'simulator',
  label: '웹 시뮬레이터',
  available: () => true,
  /** target = 탭할 가상 칩의 주소 */
  async tap({ challenge, target }) {
    const tag = listTags().find((t) => t.address === target)
    if (!tag) throw new Error('선택한 가상 태그가 없습니다')
    await new Promise((r) => setTimeout(r, 650)) // NFC 통신 연출
    const chip = new ethers.Wallet(tag.privateKey)
    const digest = tapDigest(tag.bottleId, tag.opened, challenge)
    return {
      bottleId: tag.bottleId,
      opened: tag.opened,
      challenge,
      digest,
      signature: await chip.signMessage(ethers.getBytes(digest)),
      openedSignature: tag.opened ? await chip.signMessage(ethers.getBytes(openedDigest(tag.bottleId))) : null,
    }
  },
}

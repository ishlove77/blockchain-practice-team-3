// 컨트랙트(WhiskyProvenance.sol)와 동일한 메시지 규칙. 칩은 이 digest에 EIP-191 서명을 한다.
import { ethers } from 'ethers'
import { deployment } from '../chain'

/** reportOpened() 가 검증하는 '개봉됨' 메시지: keccak256(abi.encodePacked("WHISKY_SEAL_OPENED", chainid, contract, id)) */
export const openedDigest = (bottleId) =>
  ethers.solidityPackedKeccak256(
    ['string', 'uint256', 'address', 'uint256'],
    ['WHISKY_SEAL_OPENED', deployment.chainId, deployment.address, bottleId],
  )

/** 탭 응답 메시지 — verifyTagSignature() 로 검증 */
export const tapDigest = (bottleId, opened, challenge) =>
  ethers.solidityPackedKeccak256(
    ['string', 'uint256', 'address', 'uint256', 'bool', 'bytes32'],
    ['WHISKY_TAP', deployment.chainId, deployment.address, bottleId, opened, challenge],
  )

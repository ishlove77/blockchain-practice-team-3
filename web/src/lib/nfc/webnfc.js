// 실물 NFC 리더 자리 (아직 미구현).
//
// 연동 시 할 일:
//   1) 칩에서 병 ID와 봉인 상태를 읽는다 (NDEF 레코드 또는 칩 전용 명령).
//   2) 칩에 challenge 대신 tapDigest(bottleId, opened, challenge)를 보내 secp256k1 서명을 받는다.
//      - Arx HaLo 같은 Ethereum 서명 칩이면 libhalo 의 execHaloCmdWeb({ name: 'sign', digest, keyNo: 1 })
//   3) 개봉된 칩이면 openedDigest(bottleId)에도 서명을 받아 openedSignature 로 돌려준다.
//   4) 칩의 공개키 주소를 증류소 출고 화면에서 registerBottle(tag=주소)로 등록한다.
// 반환 형식은 ./index.js 의 TapResponse 를 따른다.
export const webNfcReader = {
  id: 'webnfc',
  label: '실물 NFC (준비 중)',
  available: () => false, // 구현 후: typeof window !== 'undefined' && 'NDEFReader' in window
  async tap() {
    throw new Error('실물 NFC 리더는 아직 연결되지 않았습니다. docs/NFC.md 참고')
  },
}

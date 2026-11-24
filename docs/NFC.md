# 실물 NFC 연동 가이드

지금은 `web/src/lib/nfc/simulator.js`가 브라우저에 저장된 가상 칩으로 서명합니다.
실물 칩을 붙일 때 **컨트랙트와 화면은 바꿀 필요가 없도록** 리더 인터페이스를 분리해 두었습니다.

## 칩이 해야 하는 일

| 요구 | 이유 |
|---|---|
| secp256k1 키를 칩 안에서 생성, 비공개키 추출 불가 | 칩 복제 방지. 공개키 주소가 체인의 `bottle.tag` |
| 임의 32바이트 digest에 EIP-191 서명 | `verifyTagSignature`, `reportOpened`가 `ecrecover`로 검증 |
| 봉인 루프(tamper loop) 상태를 읽을 수 있음 | 캡을 열면 끊어져 '개봉됨' |

Ethereum 서명을 지원하는 NFC 칩(예: Arx HaLo 계열, `libhalo`)이면 키·서명 요구는 그대로 맞습니다.
봉인 루프는 tamper-evident 태그(예: NTAG 424 DNA TT)처럼 별도 칩이 필요할 수 있으며, 이 경우 루프 상태를 서명 메시지의 `opened` 값으로 넣어주면 됩니다.

## 서명 규칙 (컨트랙트와 동일)

```
tapDigest    = keccak256(abi.encodePacked("WHISKY_TAP", chainId, contract, bottleId, opened, challenge))
openedDigest = keccak256(abi.encodePacked("WHISKY_SEAL_OPENED", chainId, contract, bottleId))
signature    = personal_sign(digest)   // "\x19Ethereum Signed Message:\n32" + digest
```

구현: `web/src/lib/nfc/digest.js`, `contracts/src/WhiskyProvenance.sol`

## 붙이는 순서

1. `web/src/lib/nfc/webnfc.js`의 `tap({ challenge })`를 구현해 `TapResponse`를 반환
   (`bottleId`, `opened`, `challenge`, `digest`, `signature`, `openedSignature`) — 형식은 `lib/nfc/index.js` 주석 참고
2. `available()`이 기기에서 NFC 사용 가능 여부를 반환하도록 수정 (Web NFC는 Android Chrome + HTTPS)
3. 증류소 출고 화면(`pages/Distillery.jsx`)에서 `newChip()` 대신 실물 칩의 공개키 주소를 읽어 `registerBottle({ tag })`에 넣기
4. 병 ID를 칩에 기록 (NDEF 레코드 등) — 또는 체인의 `bottleOfTag(tagAddress)`로 역조회해도 됨

구매자 탭 화면은 리더 선택 드롭다운에서 `실물 NFC`를 고르면 같은 검증 로직을 그대로 탑니다.

## 배포 시 참고

- 실물 기기에서 쓰려면 웹을 HTTPS로 서비스하고, 컨트랙트를 테스트넷(Sepolia 등)에 배포해 `deployment.json`의 `rpcUrl/address/chainId`를 바꿔야 합니다.
- `deployment.json`의 `accounts`(데모용 개인키)는 로컬 anvil 전용입니다. 공개 네트워크에서는 MetaMask 등 지갑 서명으로 바꿔야 합니다 (`lib/chain.js`의 `signerFor`).

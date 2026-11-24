# CLAUDE.md

고가 위스키 NFC 봉인 태그 × 블록체인 이력 dApp (블록체인 실전응용 팀3). 자세한 설명은 README.md, 특히 "AI 에이전트로 작업할 때" 섹션.

- 구조: `contracts/` Foundry(Solidity) · `web/` Vite+React+ethers v6 · `docs/NFC.md` 실물 NFC 연동
- 검증: `cd contracts && forge test` / `cd web && npm run build && npx oxlint src` / `./run.sh` 로 로컬 실행
- 라이브: https://whisky-provenance-ten.vercel.app (Sepolia `0xd90B9De899FD4BaA52C3fBE989a5bB444f54E8A0`), `main` push → Vercel 자동 배포

규칙
- 서명 digest 규칙은 `WhiskyProvenance.sol` · `web/src/lib/nfc/digest.js` · `docs/NFC.md` 세 곳을 함께 수정
- `RecordKind`/에러를 바꾸면 `web/src/lib/chain.js`의 `KIND`, `ERROR_KO`도 맞출 것
- NFC 접근은 `web/src/lib/nfc/` 리더 인터페이스로만
- `.env`, `.demo-wallets.*.json`, `web/src/deployment.json` 은 커밋 금지. `sepolia.json`에 지갑 개인키가 들어가면 안 됨
- 컨트랙트 ABI 변경 시 Sepolia 재배포(`cd web && npm run deploy:sepolia`) 후 새 `sepolia.json` 커밋 필요 — 지갑 ETH를 쓰므로 실행 전 사용자 확인
- UI 문구는 한국어

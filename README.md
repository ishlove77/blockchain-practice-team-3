# 열지 않아도 증명되는 한 병 — Sealed Provenance

> NFC × 블록체인으로 기록하는 고가 위스키의 거래·보관 이력 (블록체인 실전응용 팀3)

검수의 기준을 **내용물**에서 **이력**으로 옮깁니다.
병에 붙은 NFC 봉인 태그에는 *병 ID와 서명키만* 들어가고, 출고 → 보관 → 거래 → 개봉까지의 모든 이력은 스마트 컨트랙트에 쌓입니다.

**라이브:** https://whisky-provenance-ten.vercel.app (Sepolia 컨트랙트 [`0xd90B…4E8A0`](https://sepolia.etherscan.io/address/0xd90B9De899FD4BaA52C3fBE989a5bB444f54E8A0)) · NFC 태그 URL 예: `https://whisky-provenance-ten.vercel.app/#/verify/1`

> 현재 버전은 **NFC 하드웨어 없이** 웹 시뮬레이터로 태그를 대신합니다. 실물 NFC는 같은 인터페이스로 나중에 끼울 수 있게 분리해 두었습니다 → [docs/NFC.md](docs/NFC.md)

## 기능 (발표 자료 03 · 해결 기준)

| 단계 | 화면 | 컨트랙트 |
|---|---|---|
| **증류소 출고** — NFC 봉인 태그 부착 + 병 ID 등록 | `증류소 출고` | `registerBottle` (태그 공개키 주소 등록, 증류소가 첫 소유자) |
| **보관** — 창고 입출고와 보관 환경 기록 | `보관창고`, `거래 › 위탁` | `consign` → `checkIn` → `logEnvironment` → `checkOut` |
| **거래** — 판매 확정 시 소유권 이전 자동 기록 | `거래` | `list` / `buy` (대금 지급 + 소유권 이전이 한 트랜잭션) / `transfer` |
| **구매자 탭** — 출고부터 지금까지의 이력과 봉인 상태 확인 | `구매자 탭` | `verifyTagSignature`, `getBottle`, `getHistory` |
| **봉인 해제** — 캡을 열면 태그가 '개봉됨'을 증명 | `NFC 태그 시뮬레이터` | `reportOpened` (태그 서명 검증, 누구나 제출 가능) |
| 참여자 관리 | `참여자` | `setParticipant` (증류소/보관창고 역할) |

### 구매자 탭이 판정하는 것

1. 휴대폰이 무작위 `challenge`를 보내고, 태그가 `(병 ID, 봉인 상태, challenge)`에 서명 → 재전송 불가
2. 서명을 복원한 주소가 체인에 등록된 태그 주소와 같은가? → 다르면 **위조 태그** (ID는 복제돼도 키는 복제 불가)
3. 태그 봉인 루프가 끊어졌거나 체인에 개봉 기록이 있는가? → **진짜 병이지만 개봉됨** (공병 리필 위험)
4. 모두 통과 → **진품 · 봉인 유지** + 온체인 이력 타임라인, 보관 환경(온·습도) 그래프

## 구조

```
contracts/   Foundry — src/WhiskyProvenance.sol, test/ (12 tests)
web/         Vite + React + ethers v6
  scripts/deploy.mjs   배포 + 데모 이력 시드 → src/deployment.json
  src/lib/chain.js     컨트랙트 연결, 포맷, 에러 메시지
  src/lib/nfc/         ★ 태그 리더 인터페이스 (simulator / webnfc 자리)
  src/lib/tags.js      가상 NFC 칩 저장소 (브라우저 localStorage)
  src/pages/           구매자 탭 · 거래 · 증류소 · 보관창고 · 태그 시뮬레이터 · 참여자
docs/NFC.md  실물 NFC 연동 가이드
run.sh       anvil → 빌드 → 배포 → 웹 서버 한 번에
```

## 실행

필요: [Foundry](https://getfoundry.sh), Node.js 20+

```bash
./run.sh
# → http://localhost:5173
```

`run.sh`는 로컬 체인(anvil)을 2024-01-01 시각으로 띄우고, 컨트랙트를 배포한 뒤 2024~2026년에 걸친 데모 이력(병 4개)을 채웁니다.
상단 **현재 계정**에서 증류소 / 보관창고 / 수집가 계정을 바꿔가며 써 보세요 (anvil 공개 테스트 키라 지갑 설치 불필요).

컨트랙트 테스트만:

```bash
cd contracts && forge test
```

## 공개 배포 (Sepolia + Vercel) — NFC 태그를 찍으면 사이트가 열리게

1. **컨트랙트 배포** — 저장소 루트에 `.env` 생성 (git에 올라가지 않음):
   ```
   PRIVATE_KEY=0x...   # Sepolia ETH가 있는 지갑. 이 지갑이 관리자 + 증류소가 됨
   ```
   ```bash
   cd contracts && forge build && cd ../web && npm run deploy:sepolia
   ```
   → `web/src/deployments/sepolia.json` 생성 (주소·ABI·데모 태그, 개인키 없음) → **커밋 & push**
   데모용 창고·수집가 지갑 키는 `.demo-wallets.sepolia.json`(gitignore)에 저장 — MetaMask로 가져와 쓸 수 있음
2. **Vercel** — 프로젝트 `whisky-provenance`가 이 repo에 연결돼 있어 `main`에 push하면 자동 배포됩니다 (최초 설정: vercel.com → Add New → Project → Import)
   (`vercel.json`이 `web/`을 Sepolia 모드로 빌드하도록 설정돼 있어 추가 설정 불필요)
3. **NFC 태그** — NTAG213/215 스티커에 *NFC Tools* 앱으로 URL 레코드 기록:
   ```
   https://<프로젝트>.vercel.app/#/verify/1
   ```
   폰(아이폰 XS+ / 안드로이드)으로 찍으면 앱 없이 그 병의 이력 페이지가 열립니다.

공개 모드 동작: 이력 조회·태그 시뮬레이터는 지갑 없이 누구나, 기록(등록·입출고·구매)은 MetaMask 서명.
로컬 개발에서 공개 모드 확인: `npm run dev:sepolia`.

> 고정 URL 스티커는 복사될 수 있어 "이 병이 등록돼 있다"까지만 보여줍니다. 복제 방지는 서명 칩 연동 단계 → [docs/NFC.md](docs/NFC.md)

## 데모 시나리오

| 탭할 태그 | 결과 |
|---|---|
| 진품 · Highland Crown 30 | ✓ 진품 · 봉인 유지, 977일 창고 보관 · 2회 거래 이력 |
| 위조 · #1 ID 복제 태그 | ✕ 위조 태그 (서명 불일치) |
| 개봉됨 · Islay Mist 25 | ⚠ 2025-12-24 개봉 기록 |
| 진품 태그에서 `캡 개봉` 후 탭 | ⚠ 개봉 감지 → "개봉 기록 제출" 버튼으로 체인에 영구 기록 |

## 데모 계정 (anvil 기본 mnemonic)

| # | 계정 | 역할 |
|---|---|---|
| 0 | 플랫폼 관리자 | admin |
| 1 | 하이랜드 크라운 증류소 | 증류소 |
| 2 | 아일라 미스트 증류소 | 증류소 |
| 3 | 에든버러 보세창고 | 보관창고 |
| 4–6 | 수집가 김서준 · 이하은 · 경매 바이어 박도윤 | 일반 |

> 증류소·제품명은 모두 가상의 이름입니다.

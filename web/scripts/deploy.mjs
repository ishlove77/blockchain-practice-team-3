// 로컬 anvil 체인에 WhiskyProvenance를 배포하고 데모 이력을 채운 뒤
// web/src/deployment.json 을 생성한다.
//
//   node scripts/deploy.mjs            # 배포 + 데모 데이터
//   node scripts/deploy.mjs --no-seed  # 배포 + 참여자 등록만
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ethers } from 'ethers'

const here = dirname(fileURLToPath(import.meta.url))
const RPC = process.env.RPC_URL ?? 'http://127.0.0.1:8545'
const SEED = !process.argv.includes('--no-seed')

const artifact = JSON.parse(
  readFileSync(resolve(here, '../../contracts/out/WhiskyProvenance.sol/WhiskyProvenance.json'), 'utf8'),
)

// anvil 기본 mnemonic 계정 (공개된 테스트 키 — 로컬 데모 전용)
const MNEMONIC = 'test test test test test test test test test test test junk'
const ACCOUNTS = [
  { label: '플랫폼 관리자', kind: 'admin' },
  { label: '하이랜드 크라운 증류소', kind: 'distillery' },
  { label: '아일라 미스트 증류소', kind: 'distillery' },
  { label: '에든버러 보세창고', kind: 'warehouse' },
  { label: '수집가 김서준', kind: 'collector' },
  { label: '수집가 이하은', kind: 'collector' },
  { label: '경매 바이어 박도윤', kind: 'collector' },
].map((a, i) => {
  const w = ethers.HDNodeWallet.fromPhrase(MNEMONIC, undefined, `m/44'/60'/0'/0/${i}`)
  return { ...a, address: w.address, privateKey: w.privateKey }
})

const provider = new ethers.JsonRpcProvider(RPC)
const signer = (i) => new ethers.NonceManager(new ethers.Wallet(ACCOUNTS[i].privateKey, provider))
const signers = ACCOUNTS.map((_, i) => signer(i))

const ts = (s) => Math.floor(new Date(s).getTime() / 1000)
async function at(date, fn) {
  if (SEED) await provider.send('evm_setNextBlockTimestamp', [ts(date)])
  const tx = await fn()
  return tx.wait()
}

// 태그 키: 데모 병은 결정적 키를 써서 재배포해도 같은 태그가 나오게 한다
const tagWallet = (label) => new ethers.Wallet(ethers.id(`whisky-demo-tag:${label}`))

async function main() {
  const { chainId } = await provider.getNetwork()
  console.log(`RPC ${RPC} (chainId ${chainId})`)

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode.object, signers[0])
  if (SEED) await provider.send('evm_setNextBlockTimestamp', [ts('2024-01-02T09:00:00Z')])
  const deployed = await factory.deploy()
  await deployed.waitForDeployment()
  const address = await deployed.getAddress()
  console.log('WhiskyProvenance →', address)

  const as = (i) => new ethers.Contract(address, artifact.abi, signers[i])
  const ROLE = { distillery: 1, warehouse: 2 }

  for (const [i, a] of ACCOUNTS.entries()) {
    if (ROLE[a.kind]) {
      await at(`2024-01-02T10:0${i}:00Z`, () => as(0).setParticipant(a.address, ROLE[a.kind], a.label))
    }
  }

  const demoTags = []
  if (SEED) {
    const [, HC, IM, WH, KIM, LEE, PARK] = [0, 1, 2, 3, 4, 5, 6]
    const W = ACCOUNTS[WH].address
    const eth = ethers.parseEther
    const steps = [] // [날짜, () => tx] — 시간순으로 정렬해 실행 (블록 타임스탬프는 역행 불가)
    const on = (d, fn) => steps.push([d.length === 10 ? `${d}T03:00:00Z` : d, fn])
    const bottle = (id, b, tag) => ({ ...b, tag: tag.address })

    // ── 병 #1: 하이랜드 크라운 30년 — 창고 보관 중 두 번 거래, 봉인 유지 (정상 진품)
    const t1 = tagWallet('HC30-1994-0042')
    on('2024-03-14T02:00:00Z', () => as(HC).registerBottle(bottle(1, {
      name: 'Highland Crown 30 Year Old', distillery: '하이랜드 크라운 증류소', vintage: 1994, ageYears: 30,
      caskType: 'Oloroso Sherry Butt', serial: 'HC30-1994-0042' }, t1)))
    on('2024-03-20T08:00:00Z', () => as(HC).consign(1, W))
    on('2024-03-22T05:30:00Z', () => as(WH).checkIn(1, '본드 볼트 B-12 (온습도 제어 구역)'))
    for (const [d, t, h] of [
      ['2024-06-01', 142, 66], ['2024-09-01', 151, 64], ['2024-12-01', 128, 68],
      ['2025-03-01', 133, 67], ['2025-06-01', 147, 65], ['2025-09-01', 152, 63],
      ['2025-12-01', 126, 69], ['2026-03-01', 131, 67], ['2026-06-01', 145, 65], ['2026-09-01', 149, 64],
    ]) on(d, () => as(WH).logEnvironment(1, t, h, '정기 점검'))
    on('2025-01-10T11:00:00Z', () => as(HC).list(1, eth('4')))
    on('2025-01-18T13:20:00Z', () => as(KIM).buy(1, { value: eth('4') }))
    on('2026-04-02T09:00:00Z', () => as(KIM).list(1, eth('6.2')))
    on('2026-04-11T15:45:00Z', () => as(LEE).buy(1, { value: eth('6.2') }))
    demoTags.push({ label: '진품 · Highland Crown 30', bottleId: 1, address: t1.address, privateKey: t1.privateKey, opened: false })

    // ── 병 #2: 아일라 미스트 25년 — 판매·양도 후 개봉됨 (공병 리필 시나리오의 기준)
    const t2 = tagWallet('IM25-2000-0107')
    on('2024-05-08T02:00:00Z', () => as(IM).registerBottle(bottle(2, {
      name: 'Islay Mist 25 Year Old', distillery: '아일라 미스트 증류소', vintage: 2000, ageYears: 25,
      caskType: 'First-fill Bourbon Barrel', serial: 'IM25-2000-0107' }, t2)))
    on('2024-07-01T09:00:00Z', () => as(IM).list(2, eth('2.4')))
    on('2024-07-03T10:00:00Z', () => as(KIM).buy(2, { value: eth('2.4') }))
    on('2025-02-14T12:00:00Z', () => as(KIM).transfer(2, ACCOUNTS[PARK].address))
    on('2025-12-24T20:00:00Z', async () => {
      const sig = await t2.signMessage(ethers.getBytes(await as(PARK).openedDigest(2)))
      return as(PARK).reportOpened(2, sig)
    })
    demoTags.push({ label: '개봉됨 · Islay Mist 25', bottleId: 2, address: t2.address, privateKey: t2.privateKey, opened: true })

    // ── 병 #3: 아일라 미스트 21년 캐스크 스트렝스 — 창고 입출고 후 2차 시장 매물
    const t3 = tagWallet('IM21-2004-0311')
    on('2025-04-02T02:00:00Z', () => as(IM).registerBottle(bottle(3, {
      name: 'Islay Mist 21 Year Old Cask Strength', distillery: '아일라 미스트 증류소', vintage: 2004, ageYears: 21,
      caskType: 'Oloroso & Bourbon Marriage', serial: 'IM21-2004-0311' }, t3)))
    on('2025-04-20T02:00:00Z', () => as(IM).transfer(3, ACCOUNTS[LEE].address))
    on('2025-05-02T02:00:00Z', () => as(LEE).consign(3, W))
    on('2025-05-03T02:00:00Z', () => as(WH).checkIn(3, '본드 볼트 A-04'))
    on('2025-08-01', () => as(WH).logEnvironment(3, 155, 62, '정기 점검'))
    on('2025-11-01', () => as(WH).logEnvironment(3, 129, 68, '정기 점검'))
    on('2026-11-02', () => as(WH).checkOut(3, '소유자 요청 반출'))
    on('2026-11-15', () => as(LEE).list(3, eth('2.8')))
    demoTags.push({ label: '진품 · Islay Mist 21 CS', bottleId: 3, address: t3.address, privateKey: t3.privateKey, opened: false })

    // ── 병 #4: 하이랜드 크라운 18년 — 증류소 직판 중
    const t4 = tagWallet('HC18-2008-1180')
    on('2026-10-05T02:00:00Z', () => as(HC).registerBottle(bottle(4, {
      name: 'Highland Crown 18 Year Old', distillery: '하이랜드 크라운 증류소', vintage: 2008, ageYears: 18,
      caskType: 'European Oak', serial: 'HC18-2008-1180' }, t4)))
    on('2026-10-06T02:00:00Z', () => as(HC).list(4, eth('1.5')))
    demoTags.push({ label: '진품 · Highland Crown 18', bottleId: 4, address: t4.address, privateKey: t4.privateKey, opened: false })

    // ── 위조 태그: 병 #1의 ID를 복제했지만 서명키는 다르다 (칩 복제 시도)
    const fake = tagWallet('counterfeit-of-1')
    demoTags.push({ label: '위조 · #1 ID 복제 태그', bottleId: 1, address: fake.address, privateKey: fake.privateKey, opened: false, counterfeit: true })

    steps.sort((a, b) => a[0].localeCompare(b[0]))
    for (const [d, fn] of steps) await at(d, fn)

    // 데모 이력은 과거 날짜로 채웠으니, 이후 웹에서 보내는 트랜잭션은 현재 시각으로 찍히게 맞춘다
    await provider.send('evm_setNextBlockTimestamp', [Math.floor(Date.now() / 1000)])
    await provider.send('evm_mine', [])
  }

  const out = {
    chainId: Number(chainId),
    rpcUrl: RPC,
    address,
    abi: artifact.abi,
    accounts: ACCOUNTS,
    demoTags,
    deployedAt: new Date().toISOString(),
  }
  writeFileSync(resolve(here, '../src/deployment.json'), JSON.stringify(out, null, 2))
  console.log(`deployment.json 생성 (병 ${await as(0).bottleCount()}개)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

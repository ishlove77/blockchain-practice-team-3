// Sepolia 테스트넷에 WhiskyProvenance 배포 + 데모 이력 시드
// → web/src/deployments/sepolia.json (커밋 대상, 개인키 없음 — 데모 NFC 태그 키만 포함)
// → .demo-wallets.sepolia.json (gitignore — 데모용 창고·수집가 지갑 개인키)
//
// 준비: 저장소 루트의 .env 에
//   PRIVATE_KEY=0x...            (배포 + 관리자 + 증류소가 될 지갑, Sepolia ETH 필요)
//   SEPOLIA_RPC_URL=...          (선택, 기본 publicnode)
// 실행:  cd web && npm run deploy:sepolia          # 배포 + 데모 데이터
//        cd web && npm run deploy:sepolia -- --no-seed
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ethers } from 'ethers'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
if (existsSync(resolve(root, '.env'))) process.loadEnvFile(resolve(root, '.env'))

const PUBLIC_RPC = 'https://ethereum-sepolia-rpc.publicnode.com'
const RPC = process.env.SEPOLIA_RPC_URL || PUBLIC_RPC
const SEED = !process.argv.includes('--no-seed')
const FUND = ethers.parseEther(process.env.DEMO_FUND_ETH ?? '0.0012') // 데모 지갑 1개당 가스비

if (!process.env.PRIVATE_KEY) {
  console.error('저장소 루트 .env 에 PRIVATE_KEY=0x... 를 넣어 주세요.')
  process.exit(1)
}

const artifact = JSON.parse(
  readFileSync(resolve(root, 'contracts/out/WhiskyProvenance.sol/WhiskyProvenance.json'), 'utf8'),
)
const provider = new ethers.JsonRpcProvider(RPC, 11155111, { staticNetwork: true, cacheTimeout: -1 })
const pk = process.env.PRIVATE_KEY.startsWith('0x') ? process.env.PRIVATE_KEY : `0x${process.env.PRIVATE_KEY}`
const deployer = new ethers.NonceManager(new ethers.Wallet(pk, provider))
const eth = ethers.parseEther

async function step(label, fn) {
  process.stdout.write(`  · ${label} … `)
  const tx = await fn()
  const r = await tx.wait()
  console.log(`ok (block ${r.blockNumber})`)
  return r
}

async function main() {
  const me = await deployer.getAddress()
  const bal = await provider.getBalance(me)
  const fee = await provider.getFeeData()
  console.log(`배포 지갑 ${me}  잔고 ${ethers.formatEther(bal)} ETH  gasPrice ${ethers.formatUnits(fee.gasPrice ?? 0n, 'gwei')} gwei`)
  const need = SEED ? FUND * 3n + eth('0.001') : eth('0.0005')
  if (bal < need) throw new Error(`잔고 부족: 최소 ${ethers.formatEther(need)} ETH 필요 (Sepolia faucet에서 받아 주세요)`)

  console.log('▶ 컨트랙트 배포')
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode.object, deployer)
  const c = await factory.deploy()
  const receipt = await c.deploymentTransaction().wait()
  const address = await c.getAddress()
  console.log(`  WhiskyProvenance → ${address} (block ${receipt.blockNumber})`)

  const at = (signer) => new ethers.Contract(address, artifact.abi, signer)
  const admin = at(deployer)
  const directory = [{ address: me, label: '하이랜드 크라운 증류소' }]
  const demoTags = []

  await step('배포 지갑을 증류소로 등록', () => admin.setParticipant(me, 1, '하이랜드 크라운 증류소'))

  if (SEED) {
    console.log('▶ 데모 지갑 생성·충전 (창고 1, 수집가 2)')
    const mk = () => ethers.Wallet.createRandom().connect(provider)
    const wh = mk()
    const kim = mk()
    const lee = mk()
    writeFileSync(
      resolve(root, '.demo-wallets.sepolia.json'),
      JSON.stringify(
        { contract: address, wallets: [
          { label: '에든버러 보세창고', address: wh.address, privateKey: wh.privateKey },
          { label: '수집가 김서준', address: kim.address, privateKey: kim.privateKey },
          { label: '수집가 이하은', address: lee.address, privateKey: lee.privateKey },
        ] },
        null,
        2,
      ),
    )
    directory.push(
      { address: wh.address, label: '에든버러 보세창고' },
      { address: kim.address, label: '수집가 김서준' },
      { address: lee.address, label: '수집가 이하은' },
    )
    for (const [w, name] of [[wh, '창고'], [kim, '김서준'], [lee, '이하은']]) {
      await step(`${name}에게 ${ethers.formatEther(FUND)} ETH`, () => deployer.sendTransaction({ to: w.address, value: FUND }))
    }
    await step('창고 역할 지정', () => admin.setParticipant(wh.address, 2, '에든버러 보세창고'))

    const W = at(new ethers.NonceManager(wh))
    const K = at(new ethers.NonceManager(kim))
    const L = at(new ethers.NonceManager(lee))
    const tag = () => ethers.Wallet.createRandom()
    const reg = (b, t) => admin.registerBottle({ ...b, distillery: '하이랜드 크라운 증류소', tag: t.address })

    console.log('▶ 병 #1 Highland Crown 30 — 창고 보관 중 두 번 거래, 봉인 유지')
    const t1 = tag()
    await step('출고', () => reg({ name: 'Highland Crown 30 Year Old', vintage: 1994, ageYears: 30, caskType: 'Oloroso Sherry Butt', serial: 'HC30-1994-0042' }, t1))
    await step('보관 위탁', () => admin.consign(1, wh.address))
    await step('창고 입고', () => W.checkIn(1, '본드 볼트 B-12 (온습도 제어 구역)'))
    await step('환경 기록', () => W.logEnvironment(1, 142, 66, '입고 점검'))
    await step('판매 등록', () => admin.list(1, eth('0.0002')))
    await step('김서준 구매', () => K.buy(1, { value: eth('0.0002') }))
    await step('환경 기록', () => W.logEnvironment(1, 151, 64, '정기 점검'))
    await step('김서준 판매 등록', () => K.list(1, eth('0.0003')))
    await step('이하은 구매', () => L.buy(1, { value: eth('0.0003') }))
    await step('환경 기록', () => W.logEnvironment(1, 136, 67, '정기 점검'))
    demoTags.push({ label: '진품 · Highland Crown 30', bottleId: 1, address: t1.address, privateKey: t1.privateKey, opened: false })

    console.log('▶ 병 #2 Highland Crown 25 — 판매 후 개봉됨')
    const t2 = tag()
    await step('출고', () => reg({ name: 'Highland Crown 25 Year Old', vintage: 2000, ageYears: 25, caskType: 'First-fill Bourbon Barrel', serial: 'HC25-2000-0107' }, t2))
    await step('판매 등록', () => admin.list(2, eth('0.0001')))
    await step('김서준 구매', () => K.buy(2, { value: eth('0.0001') }))
    const sig = await t2.signMessage(ethers.getBytes(await admin.openedDigest(2)))
    await step('개봉 기록 (태그 서명)', () => K.reportOpened(2, sig))
    demoTags.push({ label: '개봉됨 · Highland Crown 25', bottleId: 2, address: t2.address, privateKey: t2.privateKey, opened: true })

    console.log('▶ 병 #3 Highland Crown 18 — 증류소 직판 중')
    const t3 = tag()
    await step('출고', () => reg({ name: 'Highland Crown 18 Year Old', vintage: 2008, ageYears: 18, caskType: 'European Oak', serial: 'HC18-2008-1180' }, t3))
    await step('판매 등록', () => admin.list(3, eth('0.0001')))
    demoTags.push({ label: '진품 · Highland Crown 18', bottleId: 3, address: t3.address, privateKey: t3.privateKey, opened: false })

    const fake = tag()
    demoTags.push({ label: '위조 · #1 ID 복제 태그', bottleId: 1, address: fake.address, privateKey: fake.privateKey, opened: false, counterfeit: true })
  }

  const out = {
    network: 'sepolia',
    networkName: 'Sepolia 테스트넷',
    chainId: 11155111,
    rpcUrl: PUBLIC_RPC, // 브라우저용 (CORS 허용 공개 RPC)
    explorer: 'https://sepolia.etherscan.io',
    address,
    deployBlock: receipt.blockNumber,
    abi: artifact.abi,
    directory,
    demoTags,
    deployedAt: new Date().toISOString(),
  }
  mkdirSync(resolve(here, '../src/deployments'), { recursive: true })
  writeFileSync(resolve(here, '../src/deployments/sepolia.json'), JSON.stringify(out, null, 2))
  console.log(`\n✓ web/src/deployments/sepolia.json 생성. 남은 잔고 ${ethers.formatEther(await provider.getBalance(me))} ETH`)
  console.log(`  https://sepolia.etherscan.io/address/${address}`)
}

main().catch((e) => {
  console.error('\n✗', e.shortMessage ?? e.message)
  process.exit(1)
})

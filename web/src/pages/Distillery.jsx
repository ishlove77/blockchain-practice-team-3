import { useState } from 'react'
import { iface, short } from '../lib/chain'
import { addTag, newChip } from '../lib/tags'
import { BottleSummary } from '../components/Bottle'

export default function Distillery({ account, me, bottles, nameOf, send, busy }) {
  const [form, setForm] = useState({
    name: '',
    vintage: '2001',
    ageYears: '25',
    caskType: 'Oloroso Sherry Butt',
    serial: '',
  })
  const [issued, setIssued] = useState(null)
  const mine = bottles.filter((b) => b.distillery === me.name || b.owner.toLowerCase() === account.address.toLowerCase())
  const registered = bottles.filter((b) => b.distillery === me.name)

  if (me.role !== 1) {
    return (
      <div className="page">
        <h2>증류소 출고</h2>
        <div className="banner">
          현재 계정({account.label})은 증류소가 아닙니다. 상단에서 <b>하이랜드 크라운 증류소</b> 또는 <b>아일라 미스트 증류소</b>로
          바꾸세요.
        </div>
        <Registered list={mine} nameOf={nameOf} />
      </div>
    )
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function register(e) {
    e.preventDefault()
    const chip = newChip() // 새 NFC 칩: 서명키는 칩 안에만, 공개키 주소만 체인에 등록
    const receipt = await send('병 등록', (c) =>
      c.registerBottle({
        name: form.name,
        distillery: me.name,
        vintage: Number(form.vintage),
        ageYears: Number(form.ageYears),
        caskType: form.caskType,
        serial: form.serial,
        tag: chip.address,
      }),
    )
    if (!receipt) return
    const ev = receipt.logs.map((l) => {
      try {
        return iface.parseLog(l)
      } catch {
        return null
      }
    }).find((l) => l?.name === 'BottleRegistered')
    const bottleId = Number(ev.args.id)
    addTag({ label: `진품 · ${form.name}`, bottleId, ...chip, opened: false })
    setIssued({ bottleId, tag: chip.address })
    setForm({ ...form, name: '', serial: '' })
  }

  return (
    <div className="page">
      <h2>증류소 출고 · {me.name}</h2>
      <p className="lead">
        병에 NFC 봉인 태그를 붙이고 병 ID를 블록체인에 등록합니다. 칩에는 <b>ID와 서명키만</b> 들어가고, 이후의 이력은 모두
        체인에 쌓입니다. 등록한 증류소가 첫 소유자가 됩니다.
      </p>
      <form className="card form" onSubmit={register}>
        <div className="field wide">
          <label>제품명</label>
          <input required value={form.name} onChange={set('name')} placeholder="예: Highland Crown 25 Year Old" />
        </div>
        <div className="field">
          <label>증류 연도</label>
          <input required type="number" min="1800" max="2100" value={form.vintage} onChange={set('vintage')} />
        </div>
        <div className="field">
          <label>숙성 연수</label>
          <input required type="number" min="0" max="200" value={form.ageYears} onChange={set('ageYears')} />
        </div>
        <div className="field wide">
          <label>캐스크</label>
          <input required value={form.caskType} onChange={set('caskType')} />
        </div>
        <div className="field wide">
          <label>병 일련번호</label>
          <input required value={form.serial} onChange={set('serial')} placeholder="예: HC25-2001-0001" />
        </div>
        <div className="field wide">
          <button className="primary" disabled={busy}>
            🏷️ NFC 태그 부착 + 블록체인 등록
          </button>
        </div>
      </form>

      {issued && (
        <div className="banner ok">
          병 #{issued.bottleId} 등록 완료. 태그 공개키 <code>{short(issued.tag)}</code>가 체인에 기록되었고, 칩은{' '}
          <a href="#/tags">NFC 태그 시뮬레이터</a>에 추가되었습니다. <a href={`#/verify/${issued.tag}`}>바로 탭해 보기 →</a>
        </div>
      )}

      <Registered list={registered} nameOf={nameOf} />
    </div>
  )
}

function Registered({ list, nameOf }) {
  if (!list.length) return null
  return (
    <>
      <h3>출고한 병</h3>
      <div className="list">
        {list.map((b) => (
          <div className="card" key={b.id}>
            <BottleSummary bottle={b} nameOf={nameOf}>
              <div className="actions">
                <a className="btn" href={`#/verify/${b.id}`}>
                  이력 보기
                </a>
                <a className="btn" href="#/market">
                  판매·보관 관리
                </a>
              </div>
            </BottleSummary>
          </div>
        ))}
      </div>
    </>
  )
}

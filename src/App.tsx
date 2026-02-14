import { ChangeEvent, useMemo, useState } from 'react'
import './App.css'

type Entry = {
  date: string
  amount: number
}

type ParsedRow = Entry & {
  usdRate?: number
  usdAmount?: number
  error?: string
}

const NBRB_API = 'https://api.nbrb.by/exrates/rates/USD?parammode=2'

function parseLines(text: string): Entry[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[;,\s]+/).filter(Boolean)
      const [dateRaw, amountRaw] = parts
      const date = dateRaw ?? ''
      const amount = parseFloat((amountRaw ?? '').replace(',', '.'))
      return { date, amount }
    })
    .filter(({ date, amount }) => date && Number.isFinite(amount))
}

async function fetchRate(date: string): Promise<number> {
  const url = `${NBRB_API}&ondate=${encodeURIComponent(date)}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`NBRB error ${res.status}`)
  }
  const data = await res.json()
  return data?.Cur_OfficialRate
}

function App() {
  const [rawInput, setRawInput] = useState('')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setRawInput(text)
  }

  const handleProcess = async () => {
    setError(null)
    const entries = parseLines(rawInput)
    if (!entries.length) {
      setRows([])
      setError('Нет корректных строк: формат "YYYY-MM-DD сумма" через пробел/запятую/точку с запятой')
      return
    }

    setLoading(true)
    try {
      const dates = Array.from(new Set(entries.map((e) => e.date)))
      const rateMap = new Map<string, number>()

      await Promise.all(
        dates.map(async (date) => {
          try {
            const rate = await fetchRate(date)
            rateMap.set(date, rate)
          } catch (err) {
            rateMap.set(date, NaN)
          }
        })
      )

      const withRates: ParsedRow[] = entries.map((e) => {
        const rate = rateMap.get(e.date)
        if (!rate || Number.isNaN(rate)) {
          return { ...e, error: 'Нет курса для даты' }
        }
        const usdAmount = e.amount / rate
        return { ...e, usdRate: rate, usdAmount }
      })

      setRows(withRates)
    } catch (err) {
      setError('Не удалось получить курсы НБРБ')
    } finally {
      setLoading(false)
    }
  }

  const totals = useMemo(() => {
    const valid = rows.filter((r) => r.usdAmount)
    const sumUsd = valid.reduce((acc, r) => acc + (r.usdAmount ?? 0), 0)
    return { count: valid.length, sumUsd }
  }, [rows])

  return (
    <main className="app">
      <header>
        <div>
          <p className="eyebrow">Конвертер НБРБ → USD</p>
          <h1>BYN → USD по курсам НБРБ</h1>
          <p className="lede">
            Вставьте список операций вида <code>YYYY-MM-DD сумма</code> или загрузите CSV/txt.
            После расчёта увидите конвертацию в доллары по официальному курсу на каждую дату.
          </p>
        </div>
      </header>

      <section className="input-panel">
        <div className="field">
          <label htmlFor="list">Список дат и сумм (BYN)</label>
          <textarea
            id="list"
            rows={8}
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder={`2024-12-01 150.50\n2024-12-05; 99,30`}
          />
          <small>Разделитель — пробел, запятая или точка с запятой. Формат даты: YYYY-MM-DD.</small>
        </div>

        <div className="controls">
          <label className="file-label">
            <input type="file" accept=".csv,.txt" onChange={handleFile} />
            Загрузить CSV/txt
          </label>
          <button onClick={handleProcess} disabled={loading}>
            {loading ? 'Считаю...' : 'Посчитать' }
          </button>
        </div>
        {error && <div className="error">{error}</div>}
      </section>

      <section className="results">
        <div className="summary">
          <div>
            <p className="eyebrow">Валидные операции</p>
            <strong>{totals.count}</strong>
          </div>
          <div>
            <p className="eyebrow">Итого USD</p>
            <strong>{totals.sumUsd.toFixed(2)}</strong>
          </div>
        </div>

        <div className="table" role="table" aria-label="Результаты конвертации">
          <div className="table-head" role="row">
            <div role="columnheader">Дата</div>
            <div role="columnheader">Сумма BYN</div>
            <div role="columnheader">Курс USD</div>
            <div role="columnheader">Сумма USD</div>
            <div role="columnheader">Статус</div>
          </div>
          {rows.map((row, idx) => (
            <div className="table-row" role="row" key={`${row.date}-${idx}`}>
              <div role="cell">{row.date}</div>
              <div role="cell">{row.amount.toFixed(2)}</div>
              <div role="cell">{row.usdRate ? row.usdRate.toFixed(4) : '—'}</div>
              <div role="cell">{row.usdAmount ? row.usdAmount.toFixed(2) : '—'}</div>
              <div role="cell" className={row.error ? 'status error' : 'status ok'}>
                {row.error ? row.error : 'OK'}
              </div>
            </div>
          ))}
          {!rows.length && <div className="table-empty">Нет данных. Введите строки и нажмите «Посчитать».</div>}
        </div>
      </section>
    </main>
  )
}

export default App

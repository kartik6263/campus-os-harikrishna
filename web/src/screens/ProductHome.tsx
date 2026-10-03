import { useState, type FormEvent } from 'react'
import { checkInstitute, demoUrl, instituteUrl } from '../lib/tenant'

const PRODUCT_NAME = 'Resolion Campus OS'

const PROBLEMS = {
  'not-found': 'No institute has that code. Check the code your institute gave you.',
  suspended: 'This institute’s account is suspended. Please contact its IT Cell.',
  provisioning: 'This institute is still being set up. Please try again in a few minutes.',
  unreachable: 'We could not reach the service. Check your connection and try again.',
} as const

const FEATURES = [
  { title: 'Its own site', body: 'Every institute gets its own portal under its own name. Its people sign in there, and only there.' },
  { title: 'Its own data', body: 'Each institute runs on its own database and server, never mixed with anyone else’s.' },
  { title: 'Everyone in one place', body: 'Students, parents, faculty, staff and the IT Cell, each with the tools their role needs.' },
  { title: 'Web and mobile', body: 'The same accounts work on the web and in the Campus OS app for Android.' },
]

/**
 * The product's own address. It belongs to no institute, so there is no
 * sign-in here: people find their institute and go to its site.
 */
export default function ProductHome() {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const slug = code.trim().toLowerCase()
    if (!slug) return
    setBusy(true)
    setError(null)
    const result = await checkInstitute(slug)
    if (result === 'ok') {
      window.location.href = instituteUrl(slug)
      return
    }
    setError(PROBLEMS[result])
    setBusy(false)
  }

  return (
    <div className="min-h-screen bg-[#EDEFF3] text-[#16264A] flex flex-col">
      <header className="bg-[#16264A] text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <span className="w-8 h-8 rounded bg-[#E0952A] flex items-center justify-center font-bold">R</span>
          <span className="font-semibold">{PRODUCT_NAME}</span>
        </div>
      </header>

      <main className="flex-1">
        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16 grid gap-10 md:grid-cols-2 md:items-center">
          <div>
            <h1 className="text-3xl sm:text-4xl font-semibold leading-tight">
              One campus system for schools, colleges and universities
            </h1>
            <p className="mt-4 text-[15px] text-[#5A6577] leading-relaxed">
              Admissions, attendance, examinations, fees, timetables and more, run by each institute on its own
              portal.
            </p>
          </div>

          <form onSubmit={submit} className="bg-white border border-[#D3D8E0] rounded p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Find your institute</h2>
            <p className="mt-1 text-[13px] text-[#5A6577]">
              Enter the institute code your school, college or university gave you, for example “sunrise”.
            </p>
            <label htmlFor="institute-code" className="block mt-5 text-[13px] font-medium">
              Institute code
            </label>
            <input
              id="institute-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="sunrise"
              className="mt-1 w-full border border-[#D3D8E0] rounded px-3 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#E0952A]"
            />
            {error && (
              <p role="alert" className="mt-3 text-[13px] text-[#B42318] bg-[#FEF3F2] border border-[#FECDCA] rounded px-3 py-2">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy || code.trim().length < 3}
              className="mt-4 w-full bg-[#E0952A] text-white font-medium rounded py-2.5 disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
            >
              {busy ? 'Checking…' : 'Go to my institute'}
            </button>
            <p className="mt-4 text-center text-[13px] text-[#5A6577]">
              Just looking?{' '}
              <a href={demoUrl()} className="text-[#E0952A] font-medium hover:underline">
                Try the demo
              </a>
            </p>
          </form>
        </section>

        <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-white border border-[#D3D8E0] rounded p-5">
              <h3 className="font-semibold text-[15px]">{f.title}</h3>
              <p className="mt-2 text-[13px] text-[#5A6577] leading-relaxed">{f.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-[#D3D8E0] bg-white px-4 py-3 text-[11px] text-[#5A6577] text-center">
        © {new Date().getFullYear()} {PRODUCT_NAME}
      </footer>
    </div>
  )
}

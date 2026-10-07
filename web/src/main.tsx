import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { forgetTenant, resolveTenant, type TenantOutcome } from './lib/tenant'

const MESSAGES: Record<Extract<TenantOutcome, { kind: 'problem' }>['reason'], { title: string; body: string }> = {
  'not-found': { title: 'Institute not found', body: 'There is no institute at this address. Check the link your institute gave you.' },
  suspended: { title: 'Account suspended', body: 'This institute’s account is suspended. Please contact your institute’s IT Cell.' },
  provisioning: { title: 'Being set up', body: 'This institute is still being set up. Please try again in a few minutes.' },
  unreachable: { title: 'Cannot connect', body: 'We could not reach the service. Check your connection and try again.' },
}

function TenantProblem({ outcome }: { outcome: Extract<TenantOutcome, { kind: 'problem' }> }) {
  const m = MESSAGES[outcome.reason]
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#EDEFF3', padding: 24, fontFamily: 'IBM Plex Sans, system-ui, sans-serif' }}>
      <div style={{ background: '#fff', border: '1px solid #D3D8E0', borderRadius: 4, padding: 24, maxWidth: 420 }}>
        <p style={{ fontSize: 12, color: '#5A6577', margin: 0 }}>Resolion Campus OS · {outcome.slug}</p>
        <h1 style={{ fontSize: 20, color: '#16264A', margin: '8px 0' }}>{m.title}</h1>
        <p style={{ fontSize: 14, color: '#5A6577', margin: 0 }}>{m.body}</p>
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <button onClick={() => location.reload()} style={{ padding: '8px 14px', background: '#E0952A', color: '#fff', border: 0, borderRadius: 4, cursor: 'pointer' }}>Try again</button>
          <button onClick={() => { forgetTenant(); location.href = location.pathname }} style={{ padding: '8px 14px', background: '#fff', color: '#16264A', border: '1px solid #D3D8E0', borderRadius: 4, cursor: 'pointer' }}>Leave</button>
        </div>
      </div>
    </div>
  )
}

// DigiLocker returns to this address even when the trip began in the mobile
// app; the state says so (dl.m.<app scheme>.…), and the code goes on to the app.
const dlState = new URLSearchParams(location.search).get('state') ?? ''
const toApp = /^dl\.m\.(campusos(?:-[a-z0-9]+)?)\./.exec(dlState)
if (toApp) {
  location.replace(`${toApp[1]}://digilocker${location.search}`)
  document.getElementById('root')!.innerHTML =
    '<p style="font-family:system-ui,sans-serif;text-align:center;margin-top:30vh;color:#16264A">Returning to the CampusOS app…<br><small style="color:#5A6577">If nothing happens, open the app on this phone; DigiLocker was reached from there.</small></p>'
}

// Which institute's backend to talk to is settled before anything else loads,
// so every module (and every cached value) belongs to the right institute.
if (!toApp) void (async () => {
  const outcome = await resolveTenant()
  const root = ReactDOM.createRoot(document.getElementById('root')!)
  if (outcome.kind === 'problem') {
    root.render(<TenantProblem outcome={outcome} />)
    return
  }
  if (outcome.kind === 'landing') {
    const { default: ProductHome } = await import('./screens/ProductHome')
    root.render(<ProductHome />)
    return
  }
  const { default: App } = await import('./App')
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})()

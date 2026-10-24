import { createRoot } from 'react-dom/client'

function SaveButton(): React.JSX.Element {
  return (
    <button className="btn primary" aria-label="Save changes">
      Save
    </button>
  )
}

function Toolbar(): React.JSX.Element {
  return (
    <div role="toolbar" className="toolbar">
      <SaveButton />
      <a href="/docs?access_token=abc#frag">Docs</a>
    </div>
  )
}

function App(): React.JSX.Element {
  return (
    <main>
      <h1>Element Grab fixture</h1>
      <Toolbar />
      <p id="para">Some paragraph text here.</p>
      <div style={{ height: 1600 }} />
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)

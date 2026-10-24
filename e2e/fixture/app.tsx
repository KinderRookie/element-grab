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
      <ul className="list">
        <li>First item</li>
        <li>Second item</li>
        <li>Third item</li>
      </ul>
      <span className="aB3dEfGh9iJkLm label">Hashy class</span>
      <div
        id="widget"
        className="chat-widget"
        style={{
          position: 'fixed',
          left: 16,
          bottom: 16,
          zIndex: 2147483647,
          padding: '10px 14px',
          background: '#111',
          color: '#fff',
          borderRadius: 12
        }}
      >
        Chat widget
      </div>
      <div style={{ height: 1600 }} />
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)

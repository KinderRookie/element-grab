// A made-up product landing page for the README screenshots (scripts in screenshots.spec.ts).
import { createRoot } from 'react-dom/client'

function SiteHeader(): React.JSX.Element {
  return (
    <header className="site-header">
      <div className="logo">
        <span className="logo-mark" />
        Tidewater
      </div>
      <nav className="nav">
        <a href="#product">Product</a>
        <a href="#roadmaps">Roadmaps</a>
        <a href="#customers">Customers</a>
        <a href="#pricing">Pricing</a>
      </nav>
      <button className="btn btn-ghost">Log in</button>
    </header>
  )
}

function CtaButton({ children, primary }: { children: string; primary?: boolean }): React.JSX.Element {
  return <button className={primary ? 'btn btn-primary' : 'btn btn-ghost'}>{children}</button>
}

function HeroHeading(): React.JSX.Element {
  return (
    <h1 className="hero-heading">
      Plan every release together, <span className="muted">from first idea to shipped.</span>
    </h1>
  )
}

const TASKS = [
  { title: 'Onboarding checklist', color: '#22c55e', tag: 'Shipped' },
  { title: 'Team billing', color: '#f59e0b', tag: 'In review' },
  { title: 'Calendar sync', color: '#6366f1', tag: 'Building' },
  { title: 'Mobile widgets', color: '#d4d4d8', tag: 'Planned' }
]

function ReleaseBoard(): React.JSX.Element {
  return (
    <div className="board" aria-label="Release board preview">
      <div className="board-title">Release 4.2 · 12 tasks</div>
      {TASKS.map((task) => (
        <div className="task" key={task.title}>
          <span className="dot" style={{ background: task.color }} />
          {task.title}
          <span className="tag">{task.tag}</span>
        </div>
      ))}
    </div>
  )
}

function Hero(): React.JSX.Element {
  return (
    <section className="hero">
      <div>
        <span className="eyebrow">New · Roadmap timelines</span>
        <HeroHeading />
        <p className="hero-copy">
          Tidewater keeps product, design and engineering on one shared plan, so everyone knows
          what ships next.
        </p>
        <div className="hero-actions">
          <CtaButton primary>Start free trial</CtaButton>
          <CtaButton>Book a demo</CtaButton>
        </div>
      </div>
      <ReleaseBoard />
    </section>
  )
}

const FEATURES = [
  { title: 'Shared roadmaps', body: 'One timeline for every team.', art: 'linear-gradient(135deg,#a5b4fc,#6366f1)' },
  { title: 'Release reviews', body: 'Sign off on what ships, in one place.', art: 'linear-gradient(135deg,#fde68a,#f59e0b)' },
  { title: 'Live status', body: 'Progress updates without the meetings.', art: 'linear-gradient(135deg,#bbf7d0,#22c55e)' }
]

function FeatureCard({ title, body, art }: (typeof FEATURES)[number]): React.JSX.Element {
  return (
    <article className="feature-card">
      <div className="feature-art" style={{ background: art }} />
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  )
}

function LandingPage(): React.JSX.Element {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <section className="features">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </section>
      </main>
    </>
  )
}

createRoot(document.getElementById('root')!).render(<LandingPage />)

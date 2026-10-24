// Tailwind v4 output needs two fixes before it works inside a shadow root:
//  1. rem units scale with the host page's <html> font-size (many sites use 62.5%), so the UI
//     would shrink or grow per site. Convert every rem to px against a 16px base.
//  2. Tailwind registers its --tw-* variables with @property and only ships plain fallbacks
//     behind an @supports gate for old browsers. @property is ignored in shadow roots, so
//     un-gate the fallbacks; :root rules also need :host to reach the shadow tree.
const remToPx = () => ({
  postcssPlugin: 'element-grab-rem-to-px',
  Declaration(decl) {
    if (decl.value.includes('rem')) {
      decl.value = decl.value.replace(/(-?\d*\.?\d+)rem\b/g, (_, n) => `${parseFloat(n) * 16}px`)
    }
  },
  AtRule: {
    media(rule) {
      rule.params = rule.params.replace(/(-?\d*\.?\d+)rem\b/g, (_, n) => `${parseFloat(n) * 16}px`)
    }
  }
})
remToPx.postcss = true

const shadowRootFixes = () => ({
  postcssPlugin: 'element-grab-shadow-root',
  AtRule: {
    supports(rule) {
      const parent = rule.parent
      if (parent?.type === 'atrule' && parent.name === 'layer' && parent.params === 'properties') {
        rule.replaceWith(rule.nodes)
      }
    }
  },
  Rule(rule) {
    if (rule.selector.includes(':root') && !rule.selector.includes(':host')) {
      rule.selector = rule.selector.replace(/:root/g, ':root, :host')
    }
  }
})
shadowRootFixes.postcss = true

module.exports = {
  plugins: [require('@tailwindcss/postcss')(), shadowRootFixes(), remToPx()]
}

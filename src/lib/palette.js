/**
 * Chart colour — computed, not chosen.
 *
 * Spending categories have no inherent order, so colouring them by size would
 * normally be double-encoding (the bar length already says "biggest"). The way
 * out is to treat the month's ranking as a real ordinal scale and commit to it:
 * the ramp position is assigned ONCE per page load, from the selected month's
 * totals, and every chart, legend and swatch on the page reads that same map.
 * Nothing repaints when you switch tabs or toggle the table.
 *
 * The ramp is Tailwind zinc 950→400, validated as an ordinal scale against a
 * white surface (monotone lightness, adjacent ΔL ≥ 0.06, single hue, light end
 * 2.56:1 vs surface). The lightest step sits under 3:1, so the relief rule
 * applies — every chart here ships visible amounts and a table view.
 */

export const RAMP = [
  "#09090b",
  "#18181b",
  "#27272a",
  "#3f3f46",
  "#52525b",
  "#71717a",
  "#a1a1aa",
]

// Already established for income everywhere else in the app. 3.77:1 on white.
export const INCOME = "#059669"

// Past the ramp everything folds into one grey rather than inventing a step.
export const OTHER = "#d4d4d8"

export const CHART = {
  surface: "#ffffff",
  grid: "hsl(240 5.9% 90%)",
  axis: "hsl(240 3.8% 46.1%)",
  cursor: "hsl(240 4.8% 95.9%)",
}

/**
 * Map categories to ramp steps in the order given — biggest spender first.
 * Income categories always take the emerald; they are not part of the ramp.
 */
export function assignColours(ordered, incomeCategories = []) {
  const income = new Set(incomeCategories)
  const colours = {}
  let step = 0

  for (const category of ordered) {
    if (income.has(category)) {
      colours[category] = INCOME
    } else {
      colours[category] = step < RAMP.length ? RAMP[step] : OTHER
      step += 1
    }
  }

  return colours
}

export function gbp(value, { sign = false } = {}) {
  const n = Number(value) || 0
  const body = `£${Math.abs(n).toFixed(2)}`
  if (!sign) return body
  return n < 0 ? `−${body}` : `+${body}`
}

/**
 * Axis ticks on round numbers. Recharts' automatic domain divides the data max
 * evenly, which lands on ticks like £55 / £110 / £165 — arithmetically correct
 * and unreadable. This snaps the step to a 1/2/2.5/5 × 10ⁿ series instead.
 */
export function niceTicks(max, count = 5) {
  if (!max || max <= 0) return [0]

  // A single target count leaves the axis stranded when the data sits just over a
  // step boundary — 205 wants a 50 step but rounds to 100, stretching the axis to
  // 300. Trying neighbouring counts and keeping the tightest fit avoids that.
  let best = null
  for (const target of [count, count + 1, count - 1]) {
    if (target < 3) continue

    const rough = max / (target - 1)
    const magnitude = 10 ** Math.floor(Math.log10(rough))
    const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? magnitude

    // Round the top UP past the data, never down — the last tick doubles as the axis
    // domain, so a top tick below the max would clip the tallest bar.
    const steps = Math.ceil(max / step)
    if (!best || steps * step < best.steps * best.step) best = { step, steps }
  }

  // Indexed rather than accumulated: repeatedly adding 2.5 drifts off round numbers
  return Array.from({ length: best.steps + 1 }, (_, i) => Math.round(i * best.step * 100) / 100)
}

/** Axis ticks round to whole pounds — they carry the values not directly labelled. */
export function gbpAxis(value) {
  const n = Number(value) || 0
  if (Math.abs(n) >= 1000) return `£${(n / 1000).toFixed(1)}k`
  return `£${Math.round(n)}`
}

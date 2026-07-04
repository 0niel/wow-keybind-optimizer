export function solveHungarianMax(
  scores: Float32Array,
  rows: number,
  cols: number,
  feasible: Uint8Array,
): Int32Array {
  const n = Math.max(rows, cols)
  const INF = 1e9
  const cost = new Float64Array(n * n)
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (r < rows && c < cols) {
        cost[r * n + c] = feasible[r * cols + c] === 1 ? -(scores[r * cols + c] ?? 0) : INF
      } else {
        cost[r * n + c] = 0
      }
    }
  }

  const u = new Float64Array(n + 1)
  const v = new Float64Array(n + 1)
  const p = new Int32Array(n + 1)
  const way = new Int32Array(n + 1)

  for (let i = 1; i <= n; i++) {
    p[0] = i
    let j0 = 0
    const minv = new Float64Array(n + 1).fill(Number.POSITIVE_INFINITY)
    const used = new Uint8Array(n + 1)
    do {
      used[j0] = 1
      const i0 = p[j0] ?? 0
      let delta = Number.POSITIVE_INFINITY
      let j1 = 0
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue
        const current = (cost[(i0 - 1) * n + (j - 1)] ?? 0) - (u[i0] ?? 0) - (v[j] ?? 0)
        if (current < (minv[j] ?? Number.POSITIVE_INFINITY)) {
          minv[j] = current
          way[j] = j0
        }
        if ((minv[j] ?? Number.POSITIVE_INFINITY) < delta) {
          delta = minv[j] ?? Number.POSITIVE_INFINITY
          j1 = j
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j] ?? 0] = (u[p[j] ?? 0] ?? 0) + delta
          v[j] = (v[j] ?? 0) - delta
        } else {
          minv[j] = (minv[j] ?? 0) - delta
        }
      }
      j0 = j1
    } while (p[j0] !== 0)
    do {
      const j1 = way[j0] ?? 0
      p[j0] = p[j1] ?? 0
      j0 = j1
    } while (j0 !== 0)
  }

  const assignment = new Int32Array(rows).fill(-1)
  for (let j = 1; j <= n; j++) {
    const i = p[j] ?? 0
    if (i >= 1 && i <= rows && j <= cols) {
      const r = i - 1
      const c = j - 1
      if (feasible[r * cols + c] === 1) assignment[r] = c
    }
  }
  return assignment
}

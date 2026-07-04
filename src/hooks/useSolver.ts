'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SolverRequest, SolverResponse, SolverSuccess } from '@/workers/solver.worker'

export interface SolverState {
  status: 'idle' | 'solving' | 'done' | 'error'
  outcome: SolverSuccess | null
  errorCode: string | null
  errorMessage: string | null
  elapsedMs: number | null
}

export function useSolver(): {
  state: SolverState
  solve: (request: Omit<SolverRequest, 'requestId'>) => void
} {
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const startedAtRef = useRef(0)
  const [state, setState] = useState<SolverState>({
    status: 'idle',
    outcome: null,
    errorCode: null,
    errorMessage: null,
    elapsedMs: null,
  })

  useEffect(() => {
    const worker = new Worker(new URL('../workers/solver.worker.ts', import.meta.url))
    worker.onmessage = (event: MessageEvent<SolverResponse>) => {
      const response = event.data
      if (response.requestId !== requestIdRef.current) return
      if (response.status === 'done') {
        setState({
          status: 'done',
          outcome: response,
          errorCode: null,
          errorMessage: null,
          elapsedMs: Math.round(performance.now() - startedAtRef.current),
        })
      } else {
        setState({
          status: 'error',
          outcome: null,
          errorCode: response.code,
          errorMessage: response.message,
          elapsedMs: null,
        })
      }
    }
    workerRef.current = worker
    return () => worker.terminate()
  }, [])

  const solve = useCallback((request: Omit<SolverRequest, 'requestId'>) => {
    const worker = workerRef.current
    if (!worker) return
    requestIdRef.current += 1
    startedAtRef.current = performance.now()
    setState((previous) => ({ ...previous, status: 'solving' }))
    worker.postMessage({ ...request, requestId: requestIdRef.current })
  }, [])

  return { state, solve }
}

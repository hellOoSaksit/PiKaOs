// Finding 1 of the E2b Task 7 review: setEnabled(true) was check-then-act on `this.pipe`, so two
// overlapping calls could both start a pipe and orphan whichever loses the assignment race — a
// listening pipe with a valid token that setEnabled(false) can never reach again.
//
// The race lives entirely in HOW GatewayService sequences its calls to startPipe(), not in the pipe
// implementation itself (real net.Server / named-pipe behaviour is already covered by
// gateway-pipe.test.ts). Faking startPipe() here keeps this test deterministic and lets it assert
// directly on "how many pipes were ever created, and is any of them still open" without depending on
// OS pipe/socket timing — a real racy pipe pair does not fail reliably or portably.
import { it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { fakePipes, startPipeMock } = vi.hoisted(() => {
  const fakePipes: Array<{ closed: boolean }> = []
  const startPipeMock = vi.fn(async () => {
    const record = { closed: false }
    fakePipes.push(record)
    return {
      connections: () => 0,
      close: async () => { record.closed = true },
    }
  })
  return { fakePipes, startPipeMock }
})

vi.mock('../src/main/gateway/pipe', () => ({ startPipe: startPipeMock }))

import { GatewayService } from '../src/main/gateway/ipc'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gwi-race-'))
  fakePipes.length = 0
  startPipeMock.mockClear()
})

const service = () => new GatewayService({
  userDataDir: dir,
  execPath: '/app/PiKaOs',
  toolClient: { list: async () => [], call: async () => ({ status: 200, result: null }) } as any,
  consent: async () => true,
  pairClient: async () => true,
  onStatus: () => {},
})

it('two concurrent setEnabled(true) calls start only one pipe, and setEnabled(false) leaves nothing listening', async () => {
  const s = service()

  // Deliberately not awaited between the two calls — this is the double-invoke / retry shape from
  // the review: both must observe the SAME in-flight (or already-settled) enable, not each start
  // their own pipe.
  const first = s.setEnabled(true)
  const second = s.setEnabled(true)
  const [r1, r2] = await Promise.all([first, second])

  expect(r1).toEqual({ enabled: true, connections: 0 })
  expect(r2).toEqual({ enabled: true, connections: 0 })
  // The crux of finding 1: on the old check-then-act code this fires twice (two pipes started, one
  // orphaned). Serializing through the queue must collapse it to exactly one.
  expect(startPipeMock).toHaveBeenCalledTimes(1)
  expect(fakePipes).toHaveLength(1)

  await s.setEnabled(false)

  // Nothing left listening: every pipe that was ever created (here, the single one) must be closed —
  // not just "whatever this.pipe happens to point at right now".
  expect(fakePipes.every(p => p.closed)).toBe(true)
  expect(s.status()).toEqual({ enabled: false, connections: 0 })
})

it('setEnabled(false) arriving while an enable is still in flight still closes the pipe, not left running', async () => {
  const s = service()

  const enabling = s.setEnabled(true)
  const disabling = s.setEnabled(false)   // queued immediately behind the in-flight enable
  await Promise.all([enabling, disabling])

  expect(startPipeMock).toHaveBeenCalledTimes(1)
  expect(fakePipes).toHaveLength(1)
  expect(fakePipes[0].closed).toBe(true)
  expect(s.status()).toEqual({ enabled: false, connections: 0 })
})

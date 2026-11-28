// @vitest-environment happy-dom
import { expect, it } from 'vitest'

import { worldControls } from '../src/world-controls.ts'

const key = (target: HTMLElement, type: string, code: string) =>
  target.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }))

it('turns while walking, stops on release, and leaves typing alone', () => {
  const canvas = document.createElement('canvas')
  const field = document.createElement('input')
  document.body.append(canvas, field)
  const controls = worldControls({ canvas, host: document.body })
  try {
    controls.resetView(0)
    key(canvas, 'keydown', 'KeyW')
    key(canvas, 'keydown', 'KeyQ')
    const left = controls.read(0.1)
    expect(left.yaw).toBeLessThan(0)
    expect(left.forward).toBe(1)
    key(canvas, 'keyup', 'KeyQ')
    expect(controls.read(0.1).yaw).toBe(left.yaw)
    key(canvas, 'keydown', 'KeyE')
    expect(controls.read(0.1).yaw).toBeCloseTo(0)
    key(canvas, 'keyup', 'KeyE')
    key(field, 'keydown', 'KeyE')
    expect(controls.read(0.1).yaw).toBeCloseTo(0)
  } finally {
    controls.dispose()
    canvas.remove()
    field.remove()
  }
})

const finger = (target: HTMLElement, type: string, id: number, x: number, y: number) =>
  target.dispatchEvent(
    new PointerEvent(type, { bubbles: true, pointerType: 'touch', pointerId: id, clientX: x, clientY: y })
  )

it('keeps each thumb in control until that contact ends', () => {
  const host = document.createElement('div')
  const canvas = document.createElement('canvas')
  host.append(canvas)
  document.body.append(host)
  Object.defineProperty(canvas, 'clientWidth', { value: 320 })
  const controls = worldControls({ canvas, host })
  canvas.setPointerCapture = () => {}
  try {
    controls.setWorkAvailable(true)
    controls.resetView(0)
    finger(canvas, 'pointerdown', 1, 35, 230)
    finger(canvas, 'pointermove', 1, 35, 180)
    finger(canvas, 'pointerdown', 2, 200, 120)
    finger(canvas, 'pointerdown', 3, 80, 220)
    finger(canvas, 'pointerdown', 4, 280, 110)
    finger(canvas, 'pointermove', 1, 35, 200)
    finger(canvas, 'pointermove', 2, 245, 120)
    expect(controls.read(0)).toMatchObject({ yaw: 0.18, forward: 30 / 46 })
    const work = host.querySelector('button')!
    work.setPointerCapture = () => {}
    finger(work, 'pointerdown', 5, 270, 240)
    finger(work, 'pointerdown', 6, 272, 240)
    finger(work, 'lostpointercapture', 6, 272, 240)
    expect(controls.read(0)).toMatchObject({ yaw: 0.18, forward: 30 / 46, working: true })
    finger(canvas, 'pointercancel', 1, 35, 200)
    expect(controls.read(0)).toMatchObject({ forward: 0, working: true })
    finger(work, 'pointercancel', 5, 270, 240)
    expect(controls.read(0).working).toBe(false)
    finger(canvas, 'lostpointercapture', 2, 245, 120)
    finger(canvas, 'pointermove', 2, 215, 120)
    expect(controls.read(0).yaw).toBe(0.18)
    work.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))
    expect(controls.read(0).working).toBe(true)
    work.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }))
    expect(controls.read(0).working).toBe(false)
    work.click()
    expect(controls.read(0).working).toBe(true)
    expect(controls.read(0).working).toBe(false)
  } finally {
    controls.dispose()
    host.remove()
  }
})

it('fires one targeted gust per press with Space, mouse or touch and preserves short taps', () => {
  const host = document.createElement('div')
  const canvas = document.createElement('canvas')
  host.append(canvas)
  document.body.append(host)
  const controls = worldControls({ canvas, host })
  const work = host.querySelector('button')!
  canvas.setPointerCapture = work.setPointerCapture = () => {}
  try {
    controls.setWorkAvailable(true)
    controls.setBlowerTargeted(true)
    expect(work.textContent).toBe('Send leaves')
    controls.setPileFocus(true, true)
    expect(work.textContent).toBe('Return pile')
    controls.setPileFocus(false, true)
    expect(work.textContent).toBe('Send leaves')
    key(canvas, 'keydown', 'Space')
    expect(controls.read(0).workPressed).toBe(true)
    canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', repeat: true, bubbles: true }))
    expect(controls.read(0)).toMatchObject({ workPressed: false, working: true })
    document.dispatchEvent(new Event('pointerlockchange'))
    canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', repeat: true, bubbles: true }))
    expect(controls.read(0).workPressed).toBe(false)
    key(canvas, 'keyup', 'Space')
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', { pointerType: 'mouse', button: 0, pointerId: 9, bubbles: true })
    )
    canvas.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, bubbles: true }))
    expect(controls.read(0)).toMatchObject({ workPressed: true, working: false })
    expect(controls.read(0).workPressed).toBe(false)
    finger(work, 'pointerdown', 1, 0, 0)
    expect(controls.read(0).workPressed).toBe(true)
    expect(controls.read(0).workPressed).toBe(false)
    finger(work, 'pointerup', 1, 0, 0)
    finger(work, 'pointerdown', 2, 0, 0)
    controls.setWorkAvailable(false)
    controls.setWorkAvailable(true)
    expect(controls.read(0).workPressed).toBe(false)
    controls.setBlowerTargeted(false)
    expect(work.textContent).toBe('Hold to work')
  } finally {
    controls.dispose()
    host.remove()
  }
})

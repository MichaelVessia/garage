import * as MutableHashSet from 'effect/MutableHashSet'
export function worldControls({ canvas, host }: { canvas: HTMLCanvasElement; host: HTMLElement }) {
  const listeners = new AbortController()
  const options = { signal: listeners.signal }
  const keys = MutableHashSet.empty<string>()
  canvas.tabIndex = 0
  canvas.style.touchAction = 'none'
  canvas.setAttribute(
    'aria-label',
    'Clover Lane. Use W A S D to walk, Q and E to turn, arrow keys to look, and Space to work. Double-click to capture the mouse. Drag to look. On a touch screen, drag on the left to walk and on the right to look.'
  )
  let stickX = 0,
    stickY = 0,
    yaw = 0.28,
    pitch = -0.25,
    mouseWork = false,
    keyboardWork = false,
    activateWork = false,
    workPressed = false
  type Pointer = { id: number; x: number; y: number }
  type ActivePointers = { stick?: Pointer; drag?: Pointer; work?: number }
  const pointers: ActivePointers = {}
  function clear() {
    MutableHashSet.clear(keys)
    delete pointers.stick
    delete pointers.drag
    stickX = 0
    stickY = 0
    mouseWork = false
    delete pointers.work
    keyboardWork = false
    activateWork = false
    workPressed = false
  }
  function turn(x: number, y: number) {
    yaw = (yaw + x) % (2 * Math.PI)
    pitch = Math.max(-1.24, Math.min(0.98, pitch - y))
  }
  const accepted = MutableHashSet.fromIterable([
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'KeyQ',
    'KeyE',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Space',
    'ShiftLeft',
    'ShiftRight',
  ])
  document.addEventListener(
    'keydown',
    (e) => {
      if (!host.inert && (e.target === canvas || e.target === document.body) && MutableHashSet.has(accepted, e.code)) {
        e.preventDefault()
        if (e.code === 'Space' && !e.repeat && touch.hidden === false && !MutableHashSet.has(keys, e.code)) {
          workPressed = true
        }
        MutableHashSet.add(keys, e.code)
      }
    },
    options
  )
  window.addEventListener(
    'keyup',
    (e) => {
      MutableHashSet.remove(keys, e.code)
    },
    options
  )
  window.addEventListener('blur', clear, options)
  document.addEventListener(
    'focusin',
    () => {
      if (host.inert) {
        clear()
      }
    },
    options
  )
  canvas.addEventListener('blur', clear, options)
  document.addEventListener('visibilitychange', clear, options)
  document.addEventListener('pointerlockchange', clear, options)
  canvas.addEventListener(
    'dblclick',
    () => {
      if (document.pointerLockElement === null) {
        void canvas.requestPointerLock?.()?.catch(() => {})
      }
    },
    options
  )
  canvas.addEventListener(
    'pointerdown',
    (e) => {
      canvas.focus({ preventScroll: true })
      if (document.pointerLockElement === null) {
        canvas.setPointerCapture(e.pointerId)
      }
      if (e.pointerType === 'touch' && e.clientX - canvas.getBoundingClientRect().left < canvas.clientWidth * 0.45) {
        pointers.stick ??= { id: e.pointerId, x: e.clientX, y: e.clientY }
      } else if (pointers.drag === undefined) {
        pointers.drag = { id: e.pointerId, x: e.clientX, y: e.clientY }
        mouseWork = e.pointerType !== 'touch' && e.button === 0
        workPressed ||= mouseWork && touch.hidden === false
      }
    },
    options
  )
  document.addEventListener(
    'pointermove',
    (e) => {
      if (host.inert) {
        return
      }
      if (document.pointerLockElement === canvas) {
        turn(e.movementX * 0.0024, e.movementY * 0.0024)
      } else if (pointers.stick?.id === e.pointerId) {
        stickX = Math.max(-1, Math.min(1, (e.clientX - pointers.stick.x) / 46))
        stickY = Math.max(-1, Math.min(1, (pointers.stick.y - e.clientY) / 46))
      } else if (pointers.drag?.id === e.pointerId) {
        turn((e.clientX - pointers.drag.x) * 0.004, (e.clientY - pointers.drag.y) * 0.004)
        pointers.drag = { id: e.pointerId, x: e.clientX, y: e.clientY }
      }
    },
    options
  )
  function release(e: PointerEvent) {
    if (pointers.work === e.pointerId) {
      delete pointers.work
    }
    if (pointers.stick?.id === e.pointerId) {
      delete pointers.stick
      stickX = 0
      stickY = 0
    }
    if (pointers.drag?.id === e.pointerId) {
      delete pointers.drag
      mouseWork = false
    }
  }
  document.addEventListener('pointerup', release, options)
  document.addEventListener('pointercancel', release, options)
  const touch = document.createElement('button')
  touch.type = 'button'
  touch.hidden = true
  touch.textContent = 'Hold to work'
  touch.className = 'work-control'
  const move = document.createElement('span')
  move.className = 'move-control'
  move.textContent = 'Move'
  move.setAttribute('aria-hidden', 'true')
  host.append(move, touch)
  touch.addEventListener(
    'pointerdown',
    (e) => {
      e.preventDefault()
      if (pointers.work === undefined) {
        touch.setPointerCapture(e.pointerId)
        pointers.work = e.pointerId
        workPressed ||= touch.hidden === false
      }
    },
    options
  )
  document.addEventListener('lostpointercapture', release, options)
  touch.addEventListener(
    'keydown',
    (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        workPressed ||= !keyboardWork && !e.repeat && touch.hidden === false
        keyboardWork = true
      }
    },
    options
  )
  touch.addEventListener(
    'keyup',
    (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        keyboardWork = false
      }
    },
    options
  )
  touch.addEventListener(
    'blur',
    () => {
      keyboardWork = false
    },
    options
  )
  touch.addEventListener(
    'click',
    (e) => {
      if (e.detail === 0) {
        activateWork = true
        workPressed ||= touch.hidden === false
      }
    },
    options
  )
  return {
    read(dt: number) {
      const right = MutableHashSet.has(keys, 'KeyE') || MutableHashSet.has(keys, 'ArrowRight')
      const left = MutableHashSet.has(keys, 'KeyQ') || MutableHashSet.has(keys, 'ArrowLeft')
      turn(
        (Number(right) - Number(left)) * dt * 1.85,
        (Number(MutableHashSet.has(keys, 'ArrowDown')) - Number(MutableHashSet.has(keys, 'ArrowUp'))) * dt * 1.35
      )
      const working =
        mouseWork || keyboardWork || activateWork || pointers.work !== undefined || MutableHashSet.has(keys, 'Space')
      const pressed = workPressed
      workPressed = false
      activateWork = false
      return {
        yaw,
        pitch,
        side: stickX + Number(MutableHashSet.has(keys, 'KeyD')) - Number(MutableHashSet.has(keys, 'KeyA')),
        forward: stickY + Number(MutableHashSet.has(keys, 'KeyW')) - Number(MutableHashSet.has(keys, 'KeyS')),
        fast: MutableHashSet.has(keys, 'ShiftLeft') || MutableHashSet.has(keys, 'ShiftRight'),
        working,
        workPressed: pressed,
      }
    },
    setBlowerTargeted(targeted: boolean) {
      workPressed = false
      touch.textContent = targeted ? 'Send leaves' : 'Hold to work'
    },
    setPileFocus(focused: boolean, targeted: boolean) {
      touch.textContent = focused ? 'Return pile' : targeted ? 'Send leaves' : 'Hold to work'
    },
    setWorkAvailable(enabled: boolean) {
      touch.hidden = !enabled
      if (!enabled) {
        workPressed = false
        delete pointers.work
        keyboardWork = false
        activateWork = false
      }
    },
    resetView(direction: number) {
      yaw = direction
      pitch = -0.25
    },
    clear,
    dispose() {
      clear()
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock()
      }
      listeners.abort()
      touch.remove()
      move.remove()
    },
  }
}

;(() => {
  'use strict'

  const body = document.body
  const canvas = document.getElementById('grid')
  const ctx = canvas.getContext('2d')
  const bloom = document.createElement('canvas')
  const bctx = bloom.getContext('2d')
  const disc = document.getElementById('disc')
  const discThrow = disc.querySelector('.disc-throw')
  const discWhirl = disc.querySelector('.disc-whirl')
  const logEl = document.getElementById('log')
  const bootText = document.getElementById('boot-text')
  const audioBtn = document.querySelector('[data-action="audio"]')
  const themeBtn = document.querySelector('[data-action="theme"]')
  const rideBtn = document.querySelector('[data-action="ride"]')
  const exitBtn = document.querySelector('[data-action="exit"]')
  const meter = document.getElementById('energy')
  const meterLabel = document.getElementById('meter-label')
  const overlay = document.getElementById('overlay')
  const ov = {
    kicker: document.getElementById('ov-kicker'),
    title: document.getElementById('ov-title'),
    sub: document.getElementById('ov-sub'),
    prompt: document.getElementById('ov-prompt'),
  }
  const $stat = (id) => document.getElementById('stat-' + id)
  const stats = {
    x: $stat('x'),
    z: $stat('z'),
    v: $stat('v'),
    programs: $stat('programs'),
    derez: $stat('derez'),
    side: $stat('side'),
    fps: $stat('fps'),
    round: $stat('round'),
    rivals: $stat('rivals'),
    score: $stat('score'),
    best: $stat('best'),
  }
  const reduceMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches

  const SPACING = 4 
  const NEAR = 0.5 
  const FAR = 220 
  const WALL = 1.1 
  const TRAIL_MAX = 70 
  const CYCLE_COUNT = 7
  const CRUISE = reduceMotion ? 4 : 12
  const ARENA_HALF = 72 
  const ARENA_WALL = 2.4
  const MIN_TURN = 0.8 
  const HALF_PI = Math.PI / 2
  const DIRS = [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ] 

  const THEMES = {
    user: {
      label: 'USER',
      grid: [39, 243, 255],
      allies: [
        [39, 243, 255],
        [170, 250, 255],
        [70, 150, 255],
      ],
      rival: [255, 150, 30],
    },
    system: {
      label: 'SYSTEM',
      grid: [255, 150, 30],
      allies: [
        [255, 150, 30],
        [255, 210, 140],
        [255, 80, 40],
      ],
      rival: [39, 243, 255],
    },
  }
  let themeKey = 'user'
  let theme = THEMES.user

  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`
  const rand = (a, b) => a + Math.random() * (b - a)
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
  const mod = (a, n) => ((a % n) + n) % n
  const snap = (v) => Math.round(v / SPACING) * SPACING
  const wrapAngle = (a) => mod(a + Math.PI, Math.PI * 2) - Math.PI
  const hex = () =>
    '0x' +
    ((Math.random() * 0xffff) | 0).toString(16).toUpperCase().padStart(4, '0')

  let W = 0,
    H = 0,
    dpr = 1,
    focalBase = 1,
    focal = 1,
    baseHorizon = 0,
    hz = 0
  let camX = 0,
    camZ = 0,
    camH = 2.6,
    camYaw = 0,
    sinY = 0,
    cosY = 1
  let roll = 0,
    rollKick = 0,
    speed = CRUISE,
    boost = 0,
    gridBoost = 1
  let skyPeriod = 1
  let stars = [],
    ridges = [],
    cities = []
  let mode = 'attract'

  bctx.filter = 'blur(3px)'
  const bloomOK = bctx.filter === 'blur(3px)'

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    W = window.innerWidth
    H = window.innerHeight
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    bloom.width = Math.max(1, Math.round(W / 4))
    bloom.height = Math.max(1, Math.round(H / 4))
    focalBase = focal = Math.max(H * 0.9, W * 0.55)
    baseHorizon = H * 0.5
    buildBackdrop()
  }

  const depthOf = (x, z) => (x - camX) * sinY + (z - camZ) * cosY

  function proj(x, y, z) {
    const dx = x - camX,
      dz = z - camZ
    const rz = dx * sinY + dz * cosY
    if (rz < NEAR * 0.99) return null
    const rx = dx * cosY - dz * sinY
    const s = focal / rz
    return [W / 2 + rx * s, hz + (camH - y) * s, s]
  }

  function clipDepth(x0, z0, x1, z1, dmin = NEAR) {
    const d0 = depthOf(x0, z0),
      d1 = depthOf(x1, z1)
    if (d0 < dmin && d1 < dmin) return null
    if (d0 < dmin) {
      const t = (dmin - d0) / (d1 - d0)
      x0 += (x1 - x0) * t
      z0 += (z1 - z0) * t
    } else if (d1 < dmin) {
      const t = (dmin - d1) / (d0 - d1)
      x1 += (x0 - x1) * t
      z1 += (z0 - z1) * t
    }
    return [x0, z0, x1, z1]
  }

  const fogAt = (x, z) => clamp(1 - depthOf(x, z) / FAR, 0, 1)
  const nearFade = (x, z, a, b) => clamp((depthOf(x, z) - a) / b, 0, 1)

  function buildBackdrop() {
    skyPeriod = Math.PI * 2 * focalBase

    stars = Array.from({ length: Math.round((skyPeriod * H) / 4500) }, () => ({
      x: Math.random(),
      y: Math.pow(Math.random(), 1.4),
      r: rand(0.4, 1.6),
      p: rand(0, 6.28),
      s: rand(0.6, 2.4),
    }))

    ridges = [0.07, 0.045].map((amp, layer) => {
      const pts = []
      for (let x = 0; x < skyPeriod; x += rand(20, 90))
        pts.push([x, Math.random()])
      pts.push([skyPeriod, pts[0][1]])
      return { amp, pts, layer }
    })

    const city = (angle, spread, scale) => {
      const towers = []
      for (let x = -spread; x < spread;) {
        const w = rand(0.008, 0.028) * W
        const centre = 1 - Math.abs(x / spread) * 0.8
        const h = (rand(0.02, 0.12) * centre + 0.01) * H * scale
        const windows = []
        for (let i = 0; i < 14; i++)
          if (Math.random() < 0.55)
            windows.push([Math.random(), Math.random()])
        towers.push({ x, w, h, windows, spire: Math.random() < 0.18 })
        x += w + rand(0.002, 0.01) * W
      }
      return { angle, towers }
    }
    cities = [city(0, W * 0.3, 1), city(Math.PI * 0.9, W * 0.18, 0.6)]
  }

  function drawSky(t, parallax) {
    const c = theme.grid
    const yawShift = -camYaw * focalBase

    const sky = ctx.createLinearGradient(0, hz - H, 0, hz)
    const mix = (k) =>
      `rgb(${(1 + c[0] * k) | 0},${(3 + c[1] * k) | 0},${(10 + c[2] * k) | 0})`
    sky.addColorStop(0, '#000104')
    sky.addColorStop(0.5, '#01030a')
    sky.addColorStop(0.85, mix(0.025))
    sky.addColorStop(1, mix(0.1))
    ctx.fillStyle = sky
    ctx.fillRect(-W * 0.5, hz - H * 1.5, W * 2, H * 1.5)

    const starShift = yawShift + parallax * 30
    for (const s of stars) {
      const x = mod(s.x * skyPeriod + starShift, skyPeriod)
      if (x > W + 2) continue
      const a = 0.25 + 0.6 * (0.5 + 0.5 * Math.sin(t * s.s + s.p))
      ctx.fillStyle = `rgba(220,245,255,${a * (0.35 + 0.65 * (1 - s.y))})`
      ctx.fillRect(x, s.y * (hz - 20), s.r, s.r)
    }

    ctx.save()
    ctx.translate(W / 2, hz)
    ctx.scale(1, 0.2)
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.75)
    g.addColorStop(0, rgba(c, 0.5 * gridBoost))
    g.addColorStop(0.3, rgba(c, 0.08))
    g.addColorStop(1, rgba(c, 0))
    ctx.fillStyle = g
    ctx.fillRect(-W, -W, W * 2, W * 2)
    ctx.restore()

    for (const r of ridges) {
      const base = mod(yawShift + parallax * (20 + r.layer * 30), skyPeriod)
      for (const off of [base - skyPeriod, base]) {
        if (off > W || off + skyPeriod < 0) continue
        ctx.beginPath()
        ctx.moveTo(off, hz)
        for (const [x, n] of r.pts)
          ctx.lineTo(x + off, hz - r.amp * H * (0.25 + 0.75 * n))
        ctx.lineTo(off + skyPeriod, hz)
        ctx.closePath()
        ctx.fillStyle = '#01030a'
        ctx.fill()
        ctx.strokeStyle = rgba(c, 0.18 + r.layer * 0.18)
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }

    ctx.lineWidth = 1
    for (const city of cities) {
      const cx =
        W / 2 +
        (mod(
          city.angle * focalBase + yawShift + parallax * 70 + skyPeriod / 2,
          skyPeriod,
        ) -
          skyPeriod / 2)
      if (cx < -W || cx > W * 2) continue
      for (const tw of city.towers) {
        const x = cx + tw.x,
          w = tw.w,
          h = tw.h
        if (x > W || x + w < 0) continue
        ctx.fillStyle = '#010309'
        ctx.fillRect(x, hz - h, w, h)
        ctx.strokeStyle = rgba(c, 0.55)
        ctx.beginPath()
        ctx.moveTo(x, hz)
        ctx.lineTo(x, hz - h)
        ctx.lineTo(x + w, hz - h)
        ctx.lineTo(x + w, hz)
        ctx.stroke()
        ctx.fillStyle = rgba(c, 0.45)
        for (const [fx, fy] of tw.windows)
          ctx.fillRect(
            x + 2 + fx * (w - 5),
            hz - h + 3 + fy * (h - 6),
            1.5,
            1.5,
          )
        if (tw.spire) {
          ctx.beginPath()
          ctx.moveTo(x + w / 2, hz - h)
          ctx.lineTo(x + w / 2, hz - h * 1.35)
          ctx.stroke()
          if (Math.sin(t * 3 + tw.x * 0.05) > 0) {
            ctx.fillStyle = rgba(theme.rival, 0.9)
            ctx.fillRect(x + w / 2 - 1.5, hz - h * 1.35 - 1.5, 3, 3)
          }
        }
      }
    }
  }

  function drawFloor() {
    const c = theme.grid

    const floor = ctx.createLinearGradient(0, hz, 0, H)
    floor.addColorStop(0, rgba(c, 0.14))
    floor.addColorStop(0.25, 'rgba(2,8,18,1)')
    floor.addColorStop(1, '#000')
    ctx.fillStyle = floor
    ctx.fillRect(-W * 0.5, hz, W * 2, H * 1.5)

    const dmin = Math.max(NEAR, (camH * focal) / (H + 80 - hz))
    const R = FAR * 1.05

    const grad = ctx.createLinearGradient(0, hz, 0, H)
    grad.addColorStop(0, rgba(c, 0))
    grad.addColorStop(0.06, rgba(c, 0.2 * gridBoost))
    grad.addColorStop(1, rgba(c, Math.min(1, 0.85 * gridBoost)))
    ctx.strokeStyle = grad

    const x0 = Math.floor((camX - R) / SPACING) * SPACING
    const z0 = Math.floor((camZ - R) / SPACING) * SPACING
    for (let pass = 0; pass < 2; pass++) {
      ctx.lineWidth = pass ? 2.2 : 1
      ctx.beginPath()
      for (let x = x0; x <= camX + R; x += SPACING) {
        if ((Math.round(x / SPACING) % 4 === 0) !== !!pass) continue
        const s = clipDepth(x, camZ - R, x, camZ + R, dmin)
        if (!s) continue
        const a = proj(s[0], 0, s[1]),
          b = proj(s[2], 0, s[3])
        ctx.moveTo(a[0], a[1])
        ctx.lineTo(b[0], b[1])
      }
      for (let z = z0; z <= camZ + R; z += SPACING) {
        if ((Math.round(z / SPACING) % 4 === 0) !== !!pass) continue
        const s = clipDepth(camX - R, z, camX + R, z, dmin)
        if (!s) continue
        const a = proj(s[0], 0, s[1]),
          b = proj(s[2], 0, s[3])
        ctx.moveTo(a[0], a[1])
        ctx.lineTo(b[0], b[1])
      }
      ctx.stroke()
    }
  }

  function drawWall(
    x0,
    z0,
    x1,
    z1,
    h,
    colour,
    alpha,
    near,
    tailStart = Infinity,
    opts = {},
  ) {
    const fillA = opts.fill ?? 0.2
    const len = Math.abs(x1 - x0) + Math.abs(z1 - z0)
    if (len < 1e-6) return
    const n = Math.max(1, Math.ceil(len / 6))
    for (let i = 0; i < n; i++) {
      const t0 = i / n,
        t1 = (i + 1) / n
      const s = clipDepth(
        x0 + (x1 - x0) * t0,
        z0 + (z1 - z0) * t0,
        x0 + (x1 - x0) * t1,
        z0 + (z1 - z0) * t1,
      )
      if (!s) continue
      const mx = (s[0] + s[2]) / 2,
        mz = (s[1] + s[3]) / 2
      const tail = clamp((tailStart + len * (t0 + t1) * 0.5) / 18, 0.15, 1)
      const k =
        fogAt(mx, mz) * nearFade(mx, mz, near[0], near[1]) * tail * alpha
      if (k < 0.01) continue
      const a0 = proj(s[0], 0, s[1]),
        a1 = proj(s[0], h, s[1])
      const b0 = proj(s[2], 0, s[3]),
        b1 = proj(s[2], h, s[3])

      ctx.fillStyle = rgba(colour, fillA * k)
      ctx.beginPath()
      ctx.moveTo(a0[0], a0[1])
      ctx.lineTo(a1[0], a1[1])
      ctx.lineTo(b1[0], b1[1])
      ctx.lineTo(b0[0], b0[1])
      ctx.closePath()
      ctx.fill()

      ctx.lineWidth = clamp(Math.min(a1[2], b1[2]) * 0.05, 1, 4)
      ctx.strokeStyle = rgba(colour, 0.95 * k)
      ctx.beginPath()
      ctx.moveTo(a1[0], a1[1])
      ctx.lineTo(b1[0], b1[1])
      ctx.stroke()
      ctx.lineWidth = 1
      ctx.strokeStyle = `rgba(255,255,255,${0.55 * k})`
      ctx.stroke()
      ctx.strokeStyle = rgba(colour, 0.4 * k)
      ctx.beginPath()
      ctx.moveTo(a0[0], a0[1])
      ctx.lineTo(b0[0], b0[1])
      ctx.stroke()
      if (opts.posts) {
        ctx.strokeStyle = rgba(colour, 0.7 * k)
        ctx.lineWidth = clamp(a0[2] * 0.03, 1, 3)
        ctx.beginPath()
        ctx.moveTo(a0[0], a0[1])
        ctx.lineTo(a1[0], a1[1])
        ctx.stroke()
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo((a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2)
        ctx.lineTo((b0[0] + b1[0]) / 2, (b0[1] + b1[1]) / 2)
        ctx.stroke()
      }
    }
  }

  const wallNear = () => (mode === 'play' ? [0.6, 3] : [2, 12])

  const pulses = []
  function newPulse(initial) {
    const d = initial ? rand(5, FAR) : rand(FAR * 0.6, FAR)
    const lat = rand(-60, 60)
    return {
      x: snap(camX + sinY * d + cosY * lat),
      z: camZ + cosY * d - sinY * lat,
      v: rand(18, 40),
      len: rand(4, 10),
    }
  }

  function updatePulses(dt) {
    for (let i = 0; i < pulses.length; i++) {
      const p = pulses[i]
      p.z -= p.v * dt
      const d = depthOf(p.x, p.z)
      if (d < -12 || d > FAR * 1.3 || Math.abs(p.x - camX) > FAR * 1.3)
        pulses[i] = newPulse(false)
    }
  }

  function drawPulses() {
    ctx.lineWidth = 2
    for (const p of pulses) {
      const s = clipDepth(p.x, p.z, p.x, p.z + p.len)
      if (!s) continue
      const a = proj(s[0], 0, s[1]),
        b = proj(s[2], 0, s[3])
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * fogAt(p.x, p.z)})`
      ctx.beginPath()
      ctx.moveTo(a[0], a[1])
      ctx.lineTo(b[0], b[1])
      ctx.stroke()
    }
  }

  let cycles = []
  let derezCount = 0
  let lastHitOwner = null

  const between = (v, a, b) =>
    v >= Math.min(a, b) - 1e-6 && v <= Math.max(a, b) + 1e-6

  function castDist(self, x, z, dir, maxD) {
    const [dx, dz] = DIRS[dir]
    let best = maxD
    lastHitOwner = null

    if (mode === 'play' && arena) {
      const edge =
        dx > 0
          ? arena.x + ARENA_HALF - x
          : dx < 0
            ? x - (arena.x - ARENA_HALF)
            : dz > 0
              ? arena.z + ARENA_HALF - z
              : z - (arena.z - ARENA_HALF)
      if (edge < best) {
        best = Math.max(0, edge)
        lastHitOwner = null
      }
    }

    for (const c of cycles) {
      if (c.dead) continue
      if (c !== self && c.dir === (dir + 2) % 4) {
        const along = dz !== 0 ? (c.z - z) * dz : (c.x - x) * dx
        const offLine = dz !== 0 ? Math.abs(c.x - x) : Math.abs(c.z - z)
        if (offLine < 0.5 && along > 0 && along / 2 < best) {
          best = along / 2
          lastHitOwner = c
        }
      }
      const pts = c.trail
      const n = pts.length
      const limit = c === self ? n - 2 : n
      for (let i = 0; i < limit; i++) {
        const p = pts[i]
        const qx = i + 1 < n ? pts[i + 1][0] : c.x
        const qz = i + 1 < n ? pts[i + 1][1] : c.z
        let t
        if (dz === 0) {
          if (p[0] !== qx) continue
          t = (p[0] - x) * dx
          if (t > 1e-6 && t < best && between(z, p[1], qz)) {
            best = t
            lastHitOwner = c
          }
        } else {
          if (p[1] !== qz) continue
          t = (p[1] - z) * dz
          if (t > 1e-6 && t < best && between(x, p[0], qx)) {
            best = t
            lastHitOwner = c
          }
        }
      }
    }
    return best
  }
  
  class Cycle {
    constructor(opts) {
      if (opts) {
        Object.assign(this, { rival: false, tone: 0, isPlayer: false }, opts)
        this.name = this.isPlayer ? 'YOU' : hex()
        this.recolour()
        this.reset()
      } else {
        this.spawnAttract(true)
      }
    }

    reset() {
      this.toNext = SPACING
      this.sinceTurn = MIN_TURN
      this.pending = []
      this.trail = [[this.x, this.z]]
      this.dead = false
      this.deadT = 0
    }

    spawnAttract(initial) {
      this.isPlayer = false
      this.rival = Math.random() < 0.3
      this.tone = (Math.random() * 3) | 0
      this.recolour()
      this.name = hex()
      this.x = snap(camX + rand(-56, 56))
      this.z = snap(camZ + (initial ? rand(20, 150) : rand(100, 180)))
      this.dir = Math.random() < 0.5 ? 0 : Math.random() < 0.5 ? 1 : 3
      this.baseSpeed = rand(18, 30)
      this.reset()
    }

    recolour() {
      this.colour = this.isPlayer
        ? theme.allies[0]
        : this.rival
          ? theme.rival
          : theme.allies[this.tone]
    }

    get speed() {
      return this.isPlayer
        ? this.baseSpeed * (1 + 0.6 * boostAmt)
        : this.baseSpeed
    }

    turnTo(dir) {
      const right = dir === (this.dir + 1) % 4
      this.trail.push([this.x, this.z])
      this.dir = dir
      this.sinceTurn = 0
      if (this.isPlayer) {
        rollKick += right ? -0.06 : 0.06
        sfxTurn()
      }
    }

    steer(rel) {
      const base = this.pending.length
        ? this.pending[this.pending.length - 1]
        : this.dir
      if (this.pending.length < 2)
        this.pending.push((base + (rel > 0 ? 1 : 3)) % 4)
    }

    free(dir) {
      return castDist(this, this.x, this.z, dir, SPACING * 8)
    }

    think() {
      const left = (this.dir + 3) % 4,
        right = (this.dir + 1) % 4
      const fS = this.free(this.dir)

      if (mode === 'play') {
        const sharp = Math.min(0.97, 0.84 + game.round * 0.025)
        const aggro = Math.min(0.45, 0.14 + game.round * 0.04)
        const p = game.player
        let choice = this.dir

        if (fS < SPACING * 2 + 0.01 && Math.random() < sharp) {
          const fL = this.free(left),
            fR = this.free(right)
          if (Math.max(fL, fR) > fS)
            choice =
              fL > fR
                ? left
                : fR > fL
                  ? right
                  : Math.random() < 0.5
                    ? left
                    : right
        } else if (p && !p.dead && Math.random() < aggro) {
          const [pdx, pdz] = DIRS[p.dir]
          const tx = p.x + pdx * 14,
            tz = p.z + pdz * 14
          const want =
            Math.abs(tx - this.x) > Math.abs(tz - this.z)
              ? tx > this.x
                ? 1
                : 3
              : tz > this.z
                ? 0
                : 2
          if (
            want !== this.dir &&
            want !== (this.dir + 2) % 4 &&
            this.free(want) > SPACING * 3
          )
            choice = want
        } else if (Math.random() < 0.12) {
          const d = Math.random() < 0.5 ? left : right
          if (this.free(d) > SPACING * 3) choice = d
        }
        if (choice !== this.dir) this.turnTo(choice)
        return
      }

      if (fS < SPACING * 2 + 0.01 && Math.random() < 0.8) {
        const opts = [left, right].filter((d) => this.free(d) > SPACING * 2)
        if (opts.length) this.turnTo(opts[(Math.random() * opts.length) | 0])
        return
      }
      if (Math.random() < 0.2) {
        let d = Math.random() < 0.5 ? left : right
        if (d === 2 && Math.random() < 0.75) d = d === left ? right : left
        if (this.free(d) > SPACING) this.turnTo(d)
      }
    }

    update(dt) {
      if (this.dead) {
        this.deadT += dt
        if (mode === 'attract' && this.deadT > 1.3) this.spawnAttract(false)
        return
      }

      let d = this.speed * dt
      let guard = 8
      while (d > 1e-9 && guard--) {
        let m = this.isPlayer ? d : Math.min(d, this.toNext)
        if (this.isPlayer && this.pending.length) {
          if (this.sinceTurn >= MIN_TURN) {
            this.turnTo(this.pending.shift())
            continue
          }
          m = Math.min(m, MIN_TURN - this.sinceTurn)
        }
        const hit = castDist(this, this.x, this.z, this.dir, m + 1e-4)
        if (hit < m + 1e-4) {
          const [dx, dz] = DIRS[this.dir]
          const other = lastHitOwner
          derez(this, this.x + dx * hit, this.z + dz * hit, false, other)
          
          if (
            other &&
            other !== this &&
            other.dir === (this.dir + 2) % 4 &&
            Math.abs(other.x - this.x) + Math.abs(other.z - this.z) < 2
          )
            derez(other, other.x, other.z, false, this)
          return
        }
        const [dx, dz] = DIRS[this.dir]
        this.x += dx * m
        this.z += dz * m
        d -= m
        this.toNext -= m
        this.sinceTurn += m
        if (this.toNext <= 1e-6) {
          this.toNext = SPACING
          if (!this.isPlayer) this.think()
        }
      }

      if (mode === 'attract') {
        this.trim()
        const depth = depthOf(this.x, this.z)
        if (depth < 3 || depth > FAR + 40 || Math.abs(this.x - camX) > 170)
          derez(this, this.x, this.z, true)
      }
    }

    trim() {
      const pts = this.trail
      let len = 0,
        px = this.x,
        pz = this.z
      for (let i = pts.length - 1; i >= 0; i--) {
        const seg = Math.abs(pts[i][0] - px) + Math.abs(pts[i][1] - pz)
        if (len + seg >= TRAIL_MAX) {
          const t = (TRAIL_MAX - len) / seg
          pts[i] = [px + (pts[i][0] - px) * t, pz + (pts[i][1] - pz) * t]
          pts.splice(0, i)
          return
        }
        len += seg
        px = pts[i][0]
        pz = pts[i][1]
      }
    }

    draw() {
      const life = this.dead ? 1 - this.deadT / 1.1 : 1
      if (life <= 0) return
      const c = this.colour
      const wall = WALL * (this.dead ? life : 1)
      const near = this.isPlayer ? [0.8, 4] : wallNear()
      const pts = this.trail.concat([[this.x, this.z]])

      let fromTail = 0
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i],
          [bx, bz] = pts[i + 1]
        drawWall(
          ax,
          az,
          bx,
          bz,
          wall,
          c,
          life,
          near,
          mode === 'attract' ? fromTail : Infinity,
        )
        fromTail += Math.abs(bx - ax) + Math.abs(bz - az)
      }

      if (this.dead) return
      this.drawRunner()
    }

    drawRunner() {
      const c = this.colour
      const [fx, fz] = DIRS[this.dir]
      const rx = fz,
        rz = -fx
      const P = (side, back, up) =>
        proj(
          this.x + rx * side - fx * back,
          up,
          this.z + rz * side - fz * back,
        )
      const k =
        fogAt(this.x, this.z) *
        (mode === 'attract' ? nearFade(this.x, this.z, 2, 12) : 1)
      if (k <= 0.01) return

      const nose = P(0, 0, 0.45)
      if (!nose) return

      if (nose[2] > 4) {
        const v = [
          P(-0.36, 2.4, 0),
          P(0.36, 2.4, 0),
          P(0.26, 0, 0),
          P(-0.26, 0, 0), // base
          P(-0.3, 2.2, 0.85),
          P(0.3, 2.2, 0.85),
          P(0.16, 0.5, 0.5),
          P(-0.16, 0.5, 0.5), // top
        ]
        if (v.every(Boolean)) {
          const faces = [
            [0, 1, 5, 4],
            [3, 0, 4, 7],
            [1, 2, 6, 5],
            [4, 5, 6, 7],
            [2, 3, 7, 6],
          ]
          ctx.fillStyle = rgba(c, 0.16 * k)
          ctx.strokeStyle = rgba(c, 0.9 * k)
          ctx.lineWidth = 1.2
          for (const f of faces) {
            ctx.beginPath()
            ctx.moveTo(v[f[0]][0], v[f[0]][1])
            for (let i = 1; i < 4; i++) ctx.lineTo(v[f[i]][0], v[f[i]][1])
            ctx.closePath()
            ctx.fill()
            ctx.stroke()
          }
        }
      }

      const r = clamp(nose[2] * 1.4, 3, 90)
      const g = ctx.createRadialGradient(
        nose[0],
        nose[1],
        0,
        nose[0],
        nose[1],
        r,
      )
      g.addColorStop(0, `rgba(255,255,255,${k})`)
      g.addColorStop(0.25, rgba(c, 0.9 * k))
      g.addColorStop(1, rgba(c, 0))
      ctx.fillStyle = g
      ctx.fillRect(nose[0] - r, nose[1] - r, r * 2, r * 2)
    }
  }

  let particles = []
  let flashes = []
  let shockwaves = []

  function derez(cy, x, z, silent, killer) {
    if (cy.dead) return
    cy.dead = true
    cy.deadT = 0
    if (silent) return
    derezCount++
    flashes.push({ x, z, life: 1, colour: cy.colour })
    for (let i = 0; i < (cy.isPlayer ? 140 : 70); i++) {
      particles.push({
        x,
        z,
        y: rand(0, WALL),
        vx: rand(-5, 5),
        vy: rand(1, 8),
        vz: rand(-5, 5),
        life: rand(0.6, 1.5),
        size: rand(0.06, 0.2),
        colour: cy.colour,
      })
    }
    sfxDerez(depthOf(x, z))
    if (mode === 'play') onPlayDerez(cy, killer)
    else addLog(`PROGRAM ${cy.name} DEREZZED`, cy.rival ? 'hot' : '')
  }

  function updateEffects(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.life -= dt
      if (p.life <= 0) {
        particles.splice(i, 1)
        continue
      }
      p.vy -= 9 * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      if (p.y < 0) {
        p.y = 0
        p.vy *= -0.35
        p.vx *= 0.7
        p.vz *= 0.7
      }
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      flashes[i].life -= dt * 2.2
      if (flashes[i].life <= 0) flashes.splice(i, 1)
    }
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const w = shockwaves[i]
      w.r += 55 * dt
      w.life -= dt * 0.7
      if (w.life <= 0) {
        shockwaves.splice(i, 1)
        continue
      }
      for (const c of cycles) {
        if (c.dead) continue
        if (Math.abs(Math.hypot(c.x - w.x, c.z - w.z) - w.r) < 2.5)
          derez(c, c.x, c.z)
      }
    }
  }

  function drawEffects() {
    for (const p of particles) {
      const s = proj(p.x, p.y, p.z)
      if (!s) continue
      const size = Math.max(1.2, p.size * s[2])
      ctx.fillStyle = rgba(
        p.colour,
        clamp(p.life / 0.8, 0, 1) * fogAt(p.x, p.z),
      )
      ctx.fillRect(s[0] - size / 2, s[1] - size / 2, size, size)
    }

    for (const f of flashes) {
      const a = proj(f.x, 0, f.z),
        b = proj(f.x, 9, f.z)
      if (!a || !b) continue
      const w = clamp(a[2] * 0.6, 2, 60) * f.life
      const g = ctx.createLinearGradient(0, a[1], 0, b[1])
      g.addColorStop(0, `rgba(255,255,255,${f.life})`)
      g.addColorStop(1, rgba(f.colour, 0))
      ctx.fillStyle = g
      ctx.fillRect(a[0] - w / 2, b[1], w, a[1] - b[1])
    }

    for (const w of shockwaves) {
      for (let pass = 0; pass < 2; pass++) {
        ctx.lineWidth = pass ? 1.5 : 7
        ctx.strokeStyle = pass
          ? `rgba(255,255,255,${w.life})`
          : rgba(theme.grid, 0.35 * w.life)
        ctx.beginPath()
        let pen = false
        for (let i = 0; i <= 72; i++) {
          const ang = (i / 72) * Math.PI * 2
          const p = proj(
            w.x + Math.cos(ang) * w.r,
            0.05,
            w.z + Math.sin(ang) * w.r,
          )
          if (!p) {
            pen = false
            continue
          }
          if (pen) ctx.lineTo(p[0], p[1])
          else ctx.moveTo(p[0], p[1])
          pen = true
        }
        ctx.stroke()
      }
    }
  }

  let arena = null
  let boosting = false,
    boostAmt = 0
  let energy = 100

  const game = {
    state: 'off',
    round: 1,
    score: 0,
    best: loadBest(),
    timer: 0,
    player: null,
    rivals: 0,
    count: -1,
    surv: 0,
  }

  function loadBest() {
    try {
      return Number(localStorage.getItem('tributum-best')) || 0
    } catch {
      return 0
    }
  }
  function saveBest() {
    try {
      localStorage.setItem('tributum-best', String(game.best))
    } catch {
      /* storage unavailable */
    }
  }

  const SLOTS = [
    [8, 60, 2],
    [-60, 8, 1],
    [60, -8, 3],
    [-36, 60, 2],
    [36, 60, 2],
    [-60, -36, 1],
    [60, 36, 3],
  ]

  function showOverlay(kicker, title, sub = '', prompt = '') {
    ov.kicker.textContent = kicker
    ov.title.textContent = title
    ov.sub.textContent = sub
    ov.prompt.textContent = prompt
    overlay.classList.remove('pop')
    void overlay.offsetWidth
    overlay.classList.add('show', 'pop')
  }
  const hideOverlay = () => overlay.classList.remove('show')

  function startGame() {
    if (!booted) dismissBoot()
    if (document.activeElement && document.activeElement.blur)
      document.activeElement.blur()
    mode = 'play'
    body.classList.add('playing')
    meterLabel.textContent = 'BOOST ENERGY'
    game.round = 1
    game.score = 0
    addLog('ENTERING THE ARENA', 'bright')
    startRound()
  }

  function startRound() {
    const cx = snap(camX),
      cz = snap(camZ + ARENA_HALF - 4)
    arena = { x: cx, z: cz }
    particles = []
    flashes = []
    shockwaves = []
    energy = 100
    boosting = false

    const speedNow = Math.min(26, 17 + game.round * 1.2)
    const n = Math.min(2 + game.round, SLOTS.length)

    game.player = new Cycle({
      isPlayer: true,
      x: cx,
      z: cz - 60,
      dir: 0,
      baseSpeed: speedNow + 1,
    })
    cycles = [game.player]
    const slots = SLOTS.slice(0, n)
    slots.forEach(([sx2, sz2, dir], i) => {
      cycles.push(
        new Cycle({
          rival: true,
          x: cx + sx2,
          z: cz + sz2,
          dir,
          baseSpeed: speedNow,
          tone: i % 3,
        }),
      )
    })

    game.rivals = n
    game.state = 'intro'
    game.timer = 0
    game.surv = 0
    game.count = -1
    camH = 16 
    gridBoost = 2
    showOverlay(
      'ARENA SEQUENCE',
      `ROUND ${game.round}`,
      `${n} RIVAL${n > 1 ? 'S' : ''} ON THE GRID`,
    )
    addLog(`ROUND ${game.round} :: ${n} RIVALS`, 'hot')
  }

  function onPlayDerez(cy, killer) {
    const racing = game.state === 'racing'
    if (cy.isPlayer) {
      const reason =
        killer === null
          ? 'YOU HIT THE ARENA WALL'
          : killer === cy
            ? 'YOU HIT YOUR OWN WALL'
            : killer
              ? `YOU HIT RIVAL ${killer.name}`
              : 'HEAD-ON COLLISION'
      addLog('YOU WERE DEREZZED', 'hot')
      if (racing) gameOver(reason)
      return
    }
    game.rivals--
    if (racing && killer && killer.isPlayer) {
      game.score += 250
      addLog(`RIVAL ${cy.name} HIT YOUR WALL  +250`, 'bright')
    } else {
      addLog(`RIVAL ${cy.name} DEREZZED`, 'hot')
    }
  }

  function gameOver(reason) {
    game.state = 'over'
    game.timer = 0
    const record = game.score > game.best
    if (record) {
      game.best = game.score
      saveBest()
    }
    showOverlay(
      reason,
      'DEREZZED',
      `SCORE ${game.score}${record ? '  ·  NEW BEST' : `  ·  BEST ${game.best}`}`,
    )
    setTimeout(() => {
      if (game.state === 'over')
        ov.prompt.textContent = matchMedia('(pointer: coarse)').matches
          ? 'TAP TO RIDE AGAIN'
          : 'SPACE TO RIDE AGAIN  ·  ESC TO EXIT'
    }, 900)
  }

  function roundCleared() {
    game.state = 'cleared'
    game.timer = 0
    const bonus = 500 * game.round
    game.score += bonus
    if (game.score > game.best) {
      game.best = game.score
      saveBest()
    }
    showOverlay(
      'ALL RIVALS DEREZZED',
      `ROUND ${game.round} CLEARED`,
      `BONUS +${bonus}  ·  SCORE ${game.score}`,
    )
    addLog(`ROUND ${game.round} CLEARED  +${bonus}`, 'bright')
    sfxWin()
  }

  function exitGame() {
    mode = 'attract'
    game.state = 'off'
    arena = null
    body.classList.remove('playing')
    meterLabel.textContent = 'DISC ENERGY'
    hideOverlay()
    boosting = false
    cycles = []
    for (let i = 0; i < CYCLE_COUNT; i++) cycles.push(new Cycle())
    addLog('LEFT THE ARENA')
  }

  function canRestart() {
    return game.state === 'over' && game.timer > 0.9
  }

  function updateGame(dt) {
    game.timer += dt
    const p = game.player

    if (game.state === 'intro') {
      const steps = [
        [1.3, '3'],
        [1.9, '2'],
        [2.5, '1'],
        [3.1, 'GO'],
      ]
      for (let i = game.count + 1; i < steps.length; i++) {
        if (game.timer < steps[i][0]) break
        game.count = i
        showOverlay('', steps[i][1])
        sfxCount(i === steps.length - 1)
        if (i === steps.length - 1) {
          game.state = 'racing'
          setTimeout(() => {
            if (game.state === 'racing') hideOverlay()
          }, 600)
        }
      }
      return
    }

    if (game.state === 'racing' || game.state === 'over') {
      for (const c of cycles) c.update(dt)
      headOnCheck()
    }

    if (game.state === 'racing') {
      game.surv += dt
      if (game.surv >= 0.1) {
        game.score += 1
        game.surv -= 0.1
      } 
      if (p.dead) return
      if (game.rivals <= 0) roundCleared()
    }

    if (game.state === 'cleared' && game.timer > 2.8) {
      game.round++
      startRound()
    }
  }

  function headOnCheck() {
    for (let i = 0; i < cycles.length; i++) {
      const a = cycles[i]
      if (a.dead) continue
      for (let j = i + 1; j < cycles.length; j++) {
        const b = cycles[j]
        if (b.dead) continue
        if (Math.abs(a.x - b.x) + Math.abs(a.z - b.z) < 0.9) {
          derez(a, a.x, a.z, false, undefined)
          derez(b, b.x, b.z, false, undefined)
        }
      }
    }
  }

  function drawArena() {
    if (!arena) return
    const c = theme.allies[1],
      h = ARENA_HALF
    const x0 = arena.x - h,
      x1 = arena.x + h,
      z0 = arena.z - h,
      z1 = arena.z + h
    const near = [0.6, 3]
    const opts = { posts: true, fill: 0.08 }
    drawWall(x0, z0, x1, z0, ARENA_WALL, c, 1, near, Infinity, opts)
    drawWall(x1, z0, x1, z1, ARENA_WALL, c, 1, near, Infinity, opts)
    drawWall(x1, z1, x0, z1, ARENA_WALL, c, 1, near, Infinity, opts)
    drawWall(x0, z1, x0, z0, ARENA_WALL, c, 1, near, Infinity, opts)
  }

  function render(t, parallax) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)

    ctx.save()
    ctx.translate(W / 2, hz)
    ctx.rotate(roll)
    ctx.translate(-W / 2, -hz)

    drawSky(t, parallax)
    drawFloor()

    ctx.globalCompositeOperation = 'lighter'
    drawPulses()
    drawArena()
    for (const c of cycles) c.draw()
    drawEffects()
    ctx.restore()

    if (bloomOK) {
      bctx.globalCompositeOperation = 'copy'
      bctx.drawImage(canvas, 0, 0, bloom.width, bloom.height)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.45
      ctx.drawImage(bloom, 0, 0, canvas.width, canvas.height)
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }
  }

  let mx = 0,
    my = 0,
    sx = 0,
    sy = 0,
    idle = 0

  window.addEventListener('pointermove', (e) => {
    mx = (e.clientX / W) * 2 - 1
    my = (e.clientY / H) * 2 - 1
    idle = 0
  })

  function steer(rel) {
    if (
      mode === 'play' &&
      game.state === 'racing' &&
      game.player &&
      !game.player.dead
    )
      game.player.steer(rel)
  }

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (!booted) {
      dismissBoot()
      return
    }
    const k = e.key.toLowerCase()

    if (mode === 'play') {
      if (
        [
          'arrowleft',
          'arrowright',
          'arrowup',
          'arrowdown',
          ' ',
          'enter',
        ].includes(k)
      )
        e.preventDefault()
      if (e.repeat && k !== ' ' && k !== 'arrowup' && k !== 'w') return
      if (k === 'arrowleft' || k === 'a') steer(-1)
      else if (k === 'arrowright' || k === 'd') steer(1)
      else if (k === ' ' || k === 'arrowup' || k === 'w' || k === 'enter') {
        if (canRestart()) startGame()
        else boosting = true
      } else if (k === 'escape') exitGame()
    } else if (k === 'p') {
      startGame()
    }

    if (k === 'c') toggleTheme()
    else if (k === 'm') toggleAudio()
  })

  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase()
    if (k === ' ' || k === 'arrowup' || k === 'w' || k === 'enter')
      boosting = false
  })

  window.addEventListener('blur', () => {
    boosting = false
  })

  document.querySelectorAll('[data-touch]').forEach((btn) => {
    const act = btn.dataset.touch
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      if (canRestart()) {
        startGame()
        return
      }
      if (act === 'left') steer(-1)
      else if (act === 'right') steer(1)
      else if (act === 'boost') boosting = true
    })
    if (act === 'boost')
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) =>
        btn.addEventListener(ev, () => {
          boosting = false
        }),
      )
  })

  overlay.addEventListener('pointerdown', () => {
    if (canRestart()) startGame()
  })
  rideBtn.addEventListener('click', startGame)
  exitBtn.addEventListener('click', exitGame)

  let throwing = false

  function throwDisc() {
    if (!booted) return dismissBoot()
    if (mode !== 'attract' || throwing) return
    if (energy < 35) {
      addLog('INSUFFICIENT DISC ENERGY', 'hot')
      return
    }
    throwing = true
    energy -= 35
    body.classList.add('throwing', 'has-thrown')
    addLog('IDENTITY DISC DEPLOYED', 'bright')
    sfxThrow()

    const impact = () => {
      if (mode !== 'attract') return
      shockwaves.push({ x: camX, z: camZ + 40, r: 0, life: 1 })
      gridBoost = 2.2
      boost = 10
      sfxImpact()
    }

    if (reduceMotion) {
      impact()
      throwing = false
      body.classList.remove('throwing')
      return
    }

    const duration = 1500
    discThrow.animate(
      [
        {
          transform: 'translate3d(0,0,0)',
          easing: 'cubic-bezier(.15,.65,.35,1)',
        },
        {
          transform: 'translate3d(0,6vh,-5200px)',
          offset: 0.46,
          easing: 'cubic-bezier(.6,0,.4,1)',
        },
        { transform: 'translate3d(0,0,0)' },
      ],
      { duration },
    )

    const whirl = discWhirl.animate(
      [{ transform: 'rotate(0deg)' }, { transform: 'rotate(2520deg)' }],
      { duration, easing: 'cubic-bezier(.3,.1,.3,1)' },
    )

    setTimeout(impact, duration * 0.46)
    whirl.finished.then(() => {
      throwing = false
      body.classList.remove('throwing')
      if (mode === 'attract') addLog('DISC RECOVERED')
      sfxCatch()
    })
  }

  disc.addEventListener('click', throwDisc)
  
  function toggleTheme() {
    themeKey = themeKey === 'user' ? 'system' : 'user'
    theme = THEMES[themeKey]
    body.dataset.theme = themeKey
    cycles.forEach((c) => c.recolour())
    stats.side.textContent = theme.label
    gridBoost = 2
    body.classList.remove('flip')
    void body.offsetWidth
    body.classList.add('flip')
    addLog(`ALLEGIANCE → ${theme.label}`, 'bright')
    sfxBlip()
  }

  themeBtn.addEventListener('click', toggleTheme)

  const sound = {
    ac: null,
    master: null,
    on: false,
    noise: null,
    engine: null,
    engineGain: null,
  }

  function initAudio() {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return false
    const ac = new AC()
    const master = ac.createGain()
    master.gain.value = 0
    master.connect(ac.destination)

    const filter = ac.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 240
    filter.Q.value = 7
    const drone = ac.createGain()
    drone.gain.value = 0.2
    filter.connect(drone)
    drone.connect(master);
    [
      [55, 0, 'sawtooth', 0.5],
      [55, 8, 'sawtooth', 0.5],
      [27.5, 0, 'triangle', 0.6],
    ].forEach(([f, det, type, vol]) => {
      const o = ac.createOscillator()
      const g = ac.createGain()
      o.type = type
      o.frequency.value = f
      o.detune.value = det
      g.gain.value = vol
      o.connect(g)
      g.connect(filter)
      o.start()
    })
    const lfo = ac.createOscillator()
    const lfoGain = ac.createGain()
    lfo.frequency.value = 0.07
    lfoGain.gain.value = 150
    lfo.connect(lfoGain)
    lfoGain.connect(filter.frequency)
    lfo.start()

    const engine = ac.createOscillator()
    const engineFilter = ac.createBiquadFilter()
    const engineGain = ac.createGain()
    engine.type = 'sawtooth'
    engine.frequency.value = 80
    engineFilter.type = 'lowpass'
    engineFilter.frequency.value = 700
    engineGain.gain.value = 0
    engine.connect(engineFilter)
    engineFilter.connect(engineGain)
    engineGain.connect(master)
    engine.start()

    const buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

    Object.assign(sound, { ac, master, noise: buf, engine, engineGain })
    return true
  }

  function toggleAudio() {
    if (!sound.ac && !initAudio()) {
      addLog('NO AUDIO HARDWARE', 'hot')
      return
    }
    sound.on = !sound.on
    sound.ac.resume()
    sound.master.gain.setTargetAtTime(
      sound.on ? 0.6 : 0,
      sound.ac.currentTime,
      0.25,
    )
    audioBtn.setAttribute('aria-pressed', String(sound.on))
    audioBtn.querySelector('span').textContent = sound.on ? 'ON' : 'OFF'
    addLog(sound.on ? 'AUDIO CHANNEL OPEN' : 'AUDIO CHANNEL CLOSED')
  }

  audioBtn.addEventListener('click', toggleAudio)

  function updateEngine() {
    if (!sound.on) return
    const p = game.player
    const live = mode === 'play' && game.state === 'racing' && p && !p.dead
    const t = sound.ac.currentTime
    sound.engineGain.gain.setTargetAtTime(live ? 0.07 : 0, t, 0.1)
    if (live)
      sound.engine.frequency.setTargetAtTime(40 + p.speed * 2.4, t, 0.08)
  }

  function tone({ type = 'sine', from, to, dur, vol = 0.2, delay = 0 }) {
    if (!sound.on) return
    const ac = sound.ac,
      t0 = ac.currentTime + delay
    const o = ac.createOscillator(),
      g = ac.createGain()
    o.type = type
    o.frequency.setValueAtTime(from, t0)
    o.frequency.exponentialRampToValueAtTime(to, t0 + dur)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(g)
    g.connect(sound.master)
    o.start(t0)
    o.stop(t0 + dur + 0.05)
  }

  function hiss({ filter = 'bandpass', from, to, dur, vol = 0.2, delay = 0 }) {
    if (!sound.on) return
    const ac = sound.ac,
      t0 = ac.currentTime + delay
    const src = ac.createBufferSource(),
      f = ac.createBiquadFilter(),
      g = ac.createGain()
    src.buffer = sound.noise
    f.type = filter
    f.frequency.setValueAtTime(from, t0)
    f.frequency.exponentialRampToValueAtTime(to, t0 + dur)
    g.gain.setValueAtTime(vol, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    src.connect(f)
    f.connect(g)
    g.connect(sound.master)
    src.start(t0)
    src.stop(t0 + dur + 0.05)
  }

  const sfxThrow = () => {
    tone({ type: 'triangle', from: 200, to: 1400, dur: 0.6, vol: 0.18 })
    hiss({ from: 500, to: 5000, dur: 0.6, vol: 0.2 })
    tone({
      type: 'triangle',
      from: 1300,
      to: 220,
      dur: 0.7,
      vol: 0.14,
      delay: 0.75,
    })
  }
  const sfxImpact = () => {
    tone({ from: 140, to: 28, dur: 0.9, vol: 0.5 })
    hiss({ filter: 'lowpass', from: 1600, to: 80, dur: 0.8, vol: 0.35 })
  }
  const sfxCatch = () =>
    tone({ type: 'square', from: 900, to: 300, dur: 0.08, vol: 0.08 })
  const sfxBlip = () => {
    tone({ type: 'square', from: 440, to: 880, dur: 0.12, vol: 0.06 })
    tone({
      type: 'square',
      from: 660,
      to: 1320,
      dur: 0.12,
      vol: 0.05,
      delay: 0.1,
    })
  }
  const sfxTurn = () =>
    tone({ type: 'square', from: 260, to: 200, dur: 0.05, vol: 0.04 })
  const sfxCount = (go) =>
    tone({
      type: 'square',
      from: go ? 880 : 440,
      to: go ? 880 : 440,
      dur: go ? 0.4 : 0.15,
      vol: 0.08,
    })
  const sfxWin = () =>
    [523, 659, 784, 1046].forEach((f, i) =>
      tone({
        type: 'triangle',
        from: f,
        to: f,
        dur: 0.25,
        vol: 0.12,
        delay: i * 0.12,
      }),
    )
  const sfxDerez = (dist) => {
    const v = clamp(1 - dist / FAR, 0.1, 1)
    hiss({ filter: 'highpass', from: 4000, to: 500, dur: 0.5, vol: 0.25 * v })
    tone({ type: 'square', from: 320, to: 40, dur: 0.4, vol: 0.08 * v })
  }

  const t0 = performance.now()
  function addLog(msg, tone) {
    const li = document.createElement('li')
    const ts = document.createElement('span')
    ts.className = 'ts'
    ts.textContent = ((performance.now() - t0) / 1000)
      .toFixed(2)
      .padStart(7, '0')
    li.append(ts, msg)
    if (tone) li.className = tone
    logEl.prepend(li)
    while (logEl.children.length > 7) logEl.lastChild.remove()
  }

  const AMBIENT = [
    'SECTOR SWEEP COMPLETE',
    'I/O TOWER HANDSHAKE ... OK',
    'ENERGY LEVELS NOMINAL',
    'RECOGNISER PATROL ROUTED',
    'MEMORY DEFRAG 3% ... 41% ... OK',
    'PACKET STORM ON HORIZON',
    'BIT REPORTS: YES',
    'GRID INTEGRITY 99.7%',
    'UNKNOWN USER SIGNAL DETECTED',
    'ARENA OPEN :: PRESS P TO RIDE',
  ]
  let ambientTimer = 4

  let frames = 0,
    fpsTime = 0,
    statTime = 0
  function updateStats(dt) {
    frames++
    fpsTime += dt
    statTime += dt
    if (statTime < 0.15) return
    statTime = 0
    const p = mode === 'play' ? game.player : null
    stats.x.textContent = (p ? p.x - arena.x : camX).toFixed(2)
    stats.z.textContent = p
      ? (p.z - arena.z).toFixed(2)
      : String(Math.floor(camZ)).padStart(6, '0')
    stats.v.textContent = `${(p ? (p.dead ? 0 : p.speed) : speed).toFixed(1)} U/S`
    stats.programs.textContent = cycles.filter((c) => !c.dead).length
    stats.derez.textContent = derezCount
    stats.round.textContent = game.round
    stats.rivals.textContent = Math.max(0, game.rivals)
    stats.score.textContent = game.score
    stats.best.textContent = Math.max(game.best, game.score)
    meter.style.setProperty('--e', `${energy}%`)
    if (fpsTime > 1) {
      stats.fps.textContent = Math.round(frames / fpsTime)
      frames = 0
      fpsTime = 0
    }
  }

  const BOOT_LINES = [
    'DUBSAR SYSTEMA  ::  BIOS REV 1982.12',
    'MEMORY CHECK .............. 640K OK',
    'MOUNTING GRID ............. OK',
    'COMPILING PROGRAMS ........ OK',
    'CALIBRATING IDENTITY DISC . OK',
    '',
    '> ENTERING THE GRID',
  ]
  let booted = false

  function dismissBoot() {
    if (booted) return
    booted = true
    body.classList.add('booted')
    addLog('SYSTEM ONLINE', 'bright')
    addLog(`${CYCLE_COUNT} PROGRAMS ON THE GRID`)
  }

  function runBoot() {
    if (reduceMotion) {
      bootText.textContent = BOOT_LINES.join('\n')
      setTimeout(dismissBoot, 600)
      return
    }
    let i = 0
    const next = () => {
      if (booted) return
      if (i < BOOT_LINES.length) {
        bootText.textContent += (i ? '\n' : '') + BOOT_LINES[i++]
        setTimeout(next, i === BOOT_LINES.length ? 500 : 230)
      } else {
        setTimeout(dismissBoot, 450)
      }
    }
    next()
  }

  document.getElementById('boot').addEventListener('click', dismissBoot)

  let last = performance.now(),
    time = 0

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    time += dt
    idle += dt
    const ease = (k) => Math.min(1, dt * k)

    const tx = idle > 5 ? Math.sin(time * 0.23) * 0.35 : mx
    const ty = idle > 5 ? Math.sin(time * 0.17) * 0.25 : my
    sx += (tx - sx) * ease(2.5)
    sy += (ty - sy) * ease(2.5)

    const p = game.player
    const canBoost =
      mode === 'play' && game.state === 'racing' && p && !p.dead && energy > 0
    boostAmt += ((boosting && canBoost ? 1 : 0) - boostAmt) * ease(6)
    if (boosting && canBoost) energy = Math.max(0, energy - 30 * dt)
    else energy = Math.min(100, energy + (mode === 'play' ? 10 : 14) * dt)
    gridBoost = 1 + (gridBoost - 1) * Math.pow(0.15, dt)
    rollKick *= Math.pow(0.03, dt)

    let parallax = 0
    if (mode === 'attract') {
      boost *= Math.pow(0.25, dt)
      speed = CRUISE + boost
      camZ += speed * dt
      camX += (sx * 10 - camX) * ease(3)
      camYaw += wrapAngle(0 - camYaw) * ease(3)
      camH += (clamp(2.6 + sy * 1.3, 1.1, 4.2) - camH) * ease(3)
      hz += (baseHorizon - sy * H * 0.05 - hz) * ease(4)
      roll += ((reduceMotion ? 0 : -sx * 0.035) - roll) * ease(5)
      focal = focalBase
      parallax = -sx

      for (const c of cycles) c.update(dt)

      if (booted && (ambientTimer -= dt) <= 0) {
        ambientTimer = rand(5, 10)
        addLog(AMBIENT[(Math.random() * AMBIENT.length) | 0])
      }
    } else {
      updateGame(dt)
      const k = game.state === 'intro' ? 2.4 : 7
      camYaw +=
        wrapAngle(p.dir * HALF_PI - camYaw) *
        ease(game.state === 'intro' ? 3 : 6)
      sinY = Math.sin(camYaw)
      cosY = Math.cos(camYaw)
      const dist = 7 + boostAmt * 2.5
      camX += (p.x - sinY * dist - camX) * ease(k)
      camZ += (p.z - cosY * dist - camZ) * ease(k)
      camH += (3.2 - camH) * ease(game.state === 'intro' ? 1.6 : 4)
      hz += (H * 0.42 - hz) * ease(4)
      roll += ((reduceMotion ? 0 : rollKick) - roll) * ease(8)
      focal = focalBase * (1 - 0.12 * boostAmt)
      speed = p.dead ? 0 : p.speed
    }

    sinY = Math.sin(camYaw)
    cosY = Math.cos(camYaw)

    updatePulses(dt)
    updateEffects(dt)
    updateEngine()

    disc.style.setProperty('--rx', `${52 - sy * 16}deg`)
    disc.style.setProperty('--ry', `${sx * 24}deg`)

    render(time, parallax)
    updateStats(dt)
    requestAnimationFrame(frame)
  }

  resize()
  window.addEventListener('resize', resize)
  hz = baseHorizon
  for (let i = 0; i < CYCLE_COUNT; i++) cycles.push(new Cycle())
  for (let i = 0; i < 14; i++) pulses.push(newPulse(true))
  runBoot()
  requestAnimationFrame(frame)
})()

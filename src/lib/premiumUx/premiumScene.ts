import type { ProMaxSceneShape } from '@/lib/proMaxTheme'

const PREMIUM_EASE = 'cubic-bezier(0.25, 1, 0.5, 1)'

export interface PremiumSceneHandle {
  dispose: () => void
  setPointer: (nx: number, ny: number) => void
}

type ThreeModule = typeof import('three')

function readAccent(canvas: HTMLCanvasElement): string {
  return (
    getComputedStyle(canvas.closest('.vng-room-shell') ?? document.documentElement)
      .getPropertyValue('--vng-dos-accent')
      .trim() || '#00f0ff'
  )
}

function makeMaterial(THREE: ThreeModule, accent: string) {
  return new THREE.MeshStandardMaterial({
    color: accent,
    emissive: accent,
    emissiveIntensity: 0.35,
    metalness: 0.65,
    roughness: 0.25,
    transparent: true,
    opacity: 0.55,
  })
}

function createMainMesh(THREE: ThreeModule, shape: ProMaxSceneShape, accent: string) {
  const material = makeMaterial(THREE, accent)
  switch (shape) {
    case 'sphere':
      return new THREE.Mesh(new THREE.SphereGeometry(1.15, 48, 48), material)
    case 'knot':
      return new THREE.Mesh(new THREE.TorusKnotGeometry(0.85, 0.26, 160, 24), material)
    case 'dodecahedron':
      return new THREE.Mesh(new THREE.DodecahedronGeometry(1.2, 0), material)
    case 'octahedron':
      return new THREE.Mesh(new THREE.OctahedronGeometry(1.25, 0), material)
    case 'box':
      return new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), material)
    case 'particles':
      return null
    case 'torus':
    default:
      return new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.28, 32, 72), material)
  }
}

function createParticles(THREE: ThreeModule, accent: string, shape: ProMaxSceneShape) {
  const count = shape === 'particles' ? 680 : 380
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const r = 1.4 + Math.random() * 1.5
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = r * Math.cos(phi)
  }
  return new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3)),
    new THREE.PointsMaterial({
      color: accent,
      size: shapeSize(shape) * 0.028,
      transparent: true,
      opacity: 0.58,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  )
}

function shapeSize(shape: ProMaxSceneShape) {
  if (shape === 'particles') return 1.35
  if (shape === 'box') return 1.1
  return 1
}

/** 3D-сцена на фоне: выбираемая фигура + частицы, реагирует на курсор. */
export async function createPremiumScene(
  canvas: HTMLCanvasElement,
  shape: ProMaxSceneShape = 'torus'
): Promise<PremiumSceneHandle> {
  const THREE = await import('three')
  const accent = readAccent(canvas)

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.setClearColor(0x000000, 0)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
  camera.position.z = 4.2

  const main = createMainMesh(THREE, shape, accent)
  if (main) scene.add(main)

  const particles = createParticles(THREE, accent, shape)
  scene.add(particles)

  const ambient = new THREE.AmbientLight(0xffffff, 0.35)
  const key = new THREE.PointLight(accent, 1.2, 20)
  key.position.set(2, 1.5, 3)
  scene.add(ambient, key)

  let pointerX = 0
  let pointerY = 0
  let targetX = 0
  let targetY = 0
  let raf = 0
  let running = true
  const scale = shapeSize(shape)

  function resize() {
    const parent = canvas.parentElement
    const w = parent?.clientWidth ?? window.innerWidth
    const h = parent?.clientHeight ?? window.innerHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / Math.max(h, 1)
    camera.updateProjectionMatrix()
  }

  function tick() {
    if (!running) return
    raf = requestAnimationFrame(tick)
    pointerX += (targetX - pointerX) * 0.06
    pointerY += (targetY - pointerY) * 0.06

    if (main) {
      main.rotation.x += 0.0022 + pointerY * 0.0012
      main.rotation.y += 0.0034 + pointerX * 0.0016
      main.position.x = pointerX * 0.12 * scale
      main.position.y = -pointerY * 0.1 * scale
    }
    particles.rotation.y -= 0.0009 + pointerX * 0.0004
    particles.rotation.x = pointerY * 0.16

    camera.position.x = pointerX * 0.35
    camera.position.y = -pointerY * 0.22
    camera.lookAt(0, 0, 0)

    renderer.render(scene, camera)
  }

  const onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(raf)
    } else if (running) {
      tick()
    }
  }

  resize()
  tick()
  window.addEventListener('resize', resize)
  document.addEventListener('visibilitychange', onVisibility)

  const disposables: { dispose(): void }[] = []
  if (main) {
    disposables.push(main.geometry)
    disposables.push(main.material as { dispose(): void })
  }
  disposables.push(particles.geometry)
  disposables.push(particles.material as { dispose(): void })

  return {
    setPointer(nx: number, ny: number) {
      targetX = nx
      targetY = ny
    },
    dispose() {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
      disposables.forEach((d) => d.dispose())
      renderer.dispose()
    },
  }
}

export { PREMIUM_EASE }

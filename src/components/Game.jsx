// src/components/GamePhysics.jsx
import React, { useRef, useState, useEffect, useCallback } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Physics, useBox, usePlane, useSphere } from '@react-three/cannon'
import { Clone, Html, Stars, useGLTF } from '@react-three/drei'
import { motion, AnimatePresence } from 'framer-motion'

/* ===== CONFIG ===== */
const PLATFORM_HP = 3
const DEBRIS_PER_BREAK = 12
const PLAYER_RADIUS = 0.45
const GRAVITY = -9.81
const JUMP_IMPULSE = 8.5
const MOVE_SPEED = 6.5         // desired horizontal speed (m/s)
const MOVE_IMPULSE_SCALE = 1.0 // multiplier for correction impulse
const DEBRIS_LIFETIME = 16200
const IGNORE_COLLISION_MS = 350 // ignore early collisions after scene start (prevents spawn hits)
const PLAYER_VISUAL_HEIGHT = 1.8

/* ===== helpers ===== */
const rand = (a, b) => Math.random() * (b - a) + a

function PlayerAvatar() {
  const { scene } = useGLTF('/models/barlowAvatar.glb')

  const { scale, yOffset } = React.useMemo(() => {
    const bounds = new THREE.Box3().setFromObject(scene)
    const size = new THREE.Vector3()
    bounds.getSize(size)

    const height = size.y || PLAYER_VISUAL_HEIGHT
    const nextScale = PLAYER_VISUAL_HEIGHT / height
    const footOffset = -PLAYER_RADIUS - bounds.min.y * nextScale

    return {
      scale: nextScale,
      yOffset: footOffset
    }
  }, [scene])

  useEffect(() => {
    scene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
  }, [scene])

  return (
    <group position={[0, yOffset, 0]} scale={scale}>
      <Clone object={scene} castShadow receiveShadow />
    </group>
  )
}

/* ---------------- Player (sphere physics + avatar visual) ---------------- */
function PlayerBody({ positionRef, setHoveredPlatform, lockActiveRef, camRotRef }) {
  const { camera } = useThree()
  // sphere body
  const [ref, api] = useSphere(() => ({
    mass: 1,
    args: [PLAYER_RADIUS],
    position: [-6, 1.4, 0],
    linearDamping: 0.28,
    angularDamping: 1,
    allowSleep: false
  }))

  // input state
  const keys = useRef({ w: false, s: false, a: false, d: false, space: false })
  const camRot = camRotRef || useRef({ x: 0, y: 0 })
  const grounded = useRef(false)
  const lastVel = useRef([0, 0, 0])
  const tmpV = new THREE.Vector3()
  const visualRef = useRef()

  // pointer lock and drag-to-rotate mouse-look
  const mouseDownRef = useRef(false)
  useEffect(() => {
    const onMouse = (e) => {
      if (document.pointerLockElement || lockActiveRef?.current || mouseDownRef.current) {
        camRot.current.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camRot.current.x - (e.movementY || 0) * 0.002))
        camRot.current.y -= (e.movementX || 0) * 0.002
      }
    }
    const onDown = () => { mouseDownRef.current = true }
    const onUp = () => { mouseDownRef.current = false }
    window.addEventListener('mousemove', onMouse)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMouse)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup', onUp)
    }
  }, [lockActiveRef])

  // keep lockRef in sync with actual pointer lock state
  useEffect(() => {
    const onLockChange = () => { lockActiveRef.current = !!document.pointerLockElement }
    document.addEventListener('pointerlockchange', onLockChange)
    return () => document.removeEventListener('pointerlockchange', onLockChange)
  }, [lockActiveRef])

  // keyboard input (prevent page scroll for space/arrow)
  useEffect(() => {
    const kd = (e) => {
      if ([" ", "Spacebar", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) e.preventDefault()
      if (e.key === 'w') keys.current.w = true
      if (e.key === 's') keys.current.s = true
      if (e.key === 'a') keys.current.a = true
      if (e.key === 'd') keys.current.d = true
      if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') { keys.current.space = true; console.debug('Player: space down') }
    }
    const ku = (e) => {
      if ([" ", "Spacebar", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) e.preventDefault()
      if (e.key === 'w') keys.current.w = false
      if (e.key === 's') keys.current.s = false
      if (e.key === 'a') keys.current.a = false
      if (e.key === 'd') keys.current.d = false
      if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') { keys.current.space = false; console.debug('Player: space up') }
    }
    window.addEventListener('keydown', kd, { passive: false })
    window.addEventListener('keyup', ku, { passive: false })
    return () => {
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
    }
  }, [])

  // subscribe to velocity -> used for grounded detection
  useEffect(() => {
    const unsub = api.velocity.subscribe((v) => { lastVel.current = v })
    return unsub
  }, [api])

  // subscribe to position for camera follow
  useEffect(() => {
    const unsub = api.position.subscribe((p) => {
      if (positionRef) positionRef.current = { x: p[0], y: p[1], z: p[2] }
    })
    return unsub
  }, [api, positionRef])

  // update loop - movement + camera follow
  useFrame(() => {
    const yaw = camRot.current.y
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))   // forward along camera
    const right   = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw))  // right along camera

    tmpV.set(0, 0, 0)
    if (keys.current.w) tmpV.add(forward)   // W moves forward
    if (keys.current.s) tmpV.sub(forward)   // S moves backward
    if (keys.current.a) tmpV.sub(right)     // A moves left
    if (keys.current.d) tmpV.add(right)     // D moves right

    if (tmpV.lengthSq() > 0.0001) {
      tmpV.normalize()
      const desired = tmpV.multiplyScalar(MOVE_SPEED)
      const curV = lastVel.current || [0, 0, 0]
      const ix = (desired.x - (curV[0] || 0)) * MOVE_IMPULSE_SCALE
      const iz = (desired.z - (curV[2] || 0)) * MOVE_IMPULSE_SCALE
      api.applyImpulse([ix, 0, iz], [0, 0, 0])

      // rotate the visible avatar to face the move direction
      if (visualRef.current) visualRef.current.rotation.y = yaw
    }

    // jump
    const p = positionRef?.current
    const vy = lastVel.current[1] ?? 0
    if (p) {
      grounded.current = (p.y <= 1.32 || (Math.abs(vy) < 2.5 && p.y <= 1.5))
      if (keys.current.space && grounded.current) {
        api.applyImpulse([0, JUMP_IMPULSE, 0], [0, 0, 0])
        grounded.current = false
        keys.current.space = false
      }
    }
  })


  // keep the physics sphere invisible and render the avatar on top of it
  return (
    <group ref={ref}>
      <mesh visible={false}>
        <sphereGeometry args={[PLAYER_RADIUS, 18, 18]} />
        <meshStandardMaterial transparent opacity={0} />
      </mesh>
      <group ref={visualRef}>
        <PlayerAvatar />
      </group>
    </group>
  )
}

/* ---------------- Ground (static plane) ---------------- */
function Ground() {
  const [ref] = usePlane(() => ({ rotation: [-Math.PI / 2, 0, 0], position: [0, 0, 0] }))
  return (
    <mesh ref={ref} receiveShadow>
      <planeGeometry args={[200, 200]} />
      <meshStandardMaterial color={'#101216'} />
    </mesh>
  )
}

/* ---------------- Platform (static physics box) ---------------- */
function PlatformPhysics({ slug, pos = [10, 10, 0], label, color = '#2b2b7a', onBreak, registerVisual, sceneStart }) {
  const [broken, setBroken] = useState(false)
  const [hp, setHp] = useState(PLATFORM_HP)
  const materialRef = useRef()
  const collideHandlerRef = useRef(null)
  const [ref, api] = useBox(() => ({
    args: [3, 0.5, 2],
    type: 'Static',
    position: pos,
    onCollide: (e) => { if (collideHandlerRef.current) collideHandlerRef.current(e) }
  }))

  // register visuals
  useEffect(() => {
    if (!registerVisual) return
    registerVisual.current = registerVisual.current || {}
    registerVisual.current[slug] = {
      pulse: (intensity = 0.08) => {
        if (!ref.current) return
        const start = performance.now()
        const dur = 220
        const origScale = ref.current.scale.clone()
        const tick = () => {
          if (!ref.current) return
          const t = (performance.now() - start) / dur
          if (t >= 1) { ref.current.scale.copy(origScale); return }
          const a = Math.sin(t * Math.PI) * intensity
          ref.current.scale.set(origScale.x + a, origScale.y + a * 0.6, origScale.z + a)
          requestAnimationFrame(tick)
        }
        tick()
      },
      setStage: (stage) => {
        if (!materialRef.current) return
        const mat = materialRef.current
        if (stage === 0) {
          mat.color = new THREE.Color(color)
          mat.emissiveIntensity = 0
        } else if (stage === 1) {
          mat.color = new THREE.Color('#664a36')
          mat.emissive = new THREE.Color(0x6b3f1a)
          mat.emissiveIntensity = 0.08
        } else if (stage === 2) {
          mat.color = new THREE.Color('#5c2d0d')
          mat.emissive = new THREE.Color(0xff8b3c)
          mat.emissiveIntensity = 0.22
        }
      }
    }
    return () => { if (registerVisual.current) delete registerVisual.current[slug] }
  }, [slug, registerVisual, ref, color])

  // collision handler
  const handleCollide = useCallback(
    (e) => {
      if (performance.now() - sceneStart < IGNORE_COLLISION_MS) return
      const other = e.body || (e.target && e.target.body) || null
      if (!other) return
      if (other.userData?.type === 'debris') return // <-- ignore debris
      const otherMass = typeof other.mass === 'number' ? other.mass : 0
      if (otherMass > 0 && otherMass < 0.9) return

      const n = e.contact?.ni
      const normalY = n ? Math.abs(n.y) : 0
      if (normalY < 0.6) return

      setHp((cur) => {
        if (cur <= 0) return cur
        const next = cur - 1
        if (registerVisual?.current?.[slug]) {
          const stage = PLATFORM_HP - next
          registerVisual.current[slug].pulse(0.08)
          registerVisual.current[slug].setStage(Math.min(stage, 2))
        }
        if (next <= 0 && !broken) {
          setBroken(true)
          api.position.set(pos[0], -100, pos[2])
          onBreak && onBreak({ slug, pos, label })
        }
        return next
      })
    },
    [registerVisual, sceneStart, api, pos, slug, label, broken, onBreak]
  )

  useEffect(() => { collideHandlerRef.current = handleCollide; return () => { collideHandlerRef.current = null } }, [handleCollide])

  return (
    <group>
      {!broken && (
        <mesh ref={ref} castShadow receiveShadow>
          <boxGeometry args={[3, 0.4, 2]} />
          <meshStandardMaterial ref={materialRef} color={color} />
        </mesh>
      )}
      <Html position={[pos[0], pos[1] + 0.95, pos[2]]} center>
        <div style={{
          padding: '6px 10px',
          borderRadius: 8,
          background: broken ? 'rgba(60,20,20,0.6)' : 'rgba(0,0,0,0.55)',
          color: '#fff',
          fontWeight: 700,
          fontSize: 13,
          textAlign: 'center'
        }}>{label}{!broken ? ` (${hp})` : ' (broken)'}</div>
      </Html>
    </group>
  )
}

/* ---------------- Debris dynamic boxes (physics) ---------------- */
function DebrisBox({ initial }) {
  const [ref, api] = useBox(() => ({
    mass: 0.25,
    args: [0.14, 0.14, 0.14],
    position: initial.pos,
    rotation: [rand(0, 1), rand(0, 1), rand(0, 1)],
    userData: { type: 'debris' } // <-- mark debris
  }))

  useEffect(() => {
    api.velocity.set(initial.vel[0], initial.vel[1], initial.vel[2])
    const t = setTimeout(() => {
      api.position.set(0, -100, 0)
      try { api.mass.set(0) } catch (e) { }
    }, DEBRIS_LIFETIME)
    return () => clearTimeout(t)
  }, [])

  return (
    <mesh ref={ref} castShadow>
      <boxGeometry args={[0.14, 0.14, 0.14]} />
      <meshStandardMaterial color={initial.color || '#d4a05a'} metalness={0.2} roughness={0.5} />
    </mesh>
  )
}

/* ---------------- UI Modals ---------------- */
function PlatformModal({ visible, project, onClose }) {
  if (!visible || !project) return null
  return (
    <AnimatePresence>
      {visible && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
          <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} style={{
            zIndex: 70,
            width: 'min(720px, 94%)',
            padding: 20,
            borderRadius: 12,
            background: 'linear-gradient(180deg,#2b1b00,#1a1200)',
            color: '#fff',
            border: '1px solid rgba(255,220,120,0.22)'
          }}>
            <h2 style={{ margin: 0, color: '#ffd86b' }}>{project.title}</h2>
            <div style={{ marginTop: 8, opacity: 0.95 }}>{project.desc}</div>
            <div style={{ marginTop: 16 }}>
              <button onClick={onClose} style={{
                padding: '8px 12px',
                borderRadius: 8,
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#fff'
              }}>Close</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function FinalCTA({ visible, onPlayAgain }) {
  if (!visible) return null
  return (
    <AnimatePresence>
      {visible && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.6), rgba(3,3,10,0.85))' }} />
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} style={{
            zIndex: 90, background: '#081024', borderRadius: 12, padding: 28, boxShadow: '0 20px 60px rgba(2,6,23,0.8)',
            textAlign: 'center', color: 'white', width: 'min(720px, 94%)'
          }}>
            <h2 style={{ margin: 0 }}>You uncovered all the treasures!</h2>
            <p style={{ opacity: 0.85, marginTop: 8 }}>Thanks for exploring — download my CV or play again.</p>

            <div style={{ marginTop: 20, display: 'flex', gap: 12, justifyContent: 'center' }}>
              <a href="/assets/Barlow_Rewita_CV.pdf" download
                style={{
                  background: 'linear-gradient(90deg,#ffd86b,#ffb94a)',
                  padding: '10px 14px',
                  borderRadius: 8,
                  color: '#3b2300',
                  fontWeight: 700,
                  textDecoration: 'none'
                }}>Download CV</a>

              <button onClick={onPlayAgain} style={{
                background: '#0ea5a5',
                padding: '10px 14px',
                borderRadius: 8,
                color: '#fff',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer'
              }}>Play Again</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ---------------- Camera Rig ---------------- */
function CameraRig({ targetRef, camRotRef }) {
  const { camera } = useThree()
  useFrame(() => {
    if (!targetRef?.current) return
    const t = targetRef.current

    const yaw = camRotRef.current.y
    const pitch = THREE.MathUtils.clamp(camRotRef.current.x, -0.35, 0.35) // ~20 deg up/down

    // calculate camera offset behind player
    const distance = 3.5
    const height = 1.7
    const offsetX = Math.sin(yaw) * distance
    const offsetZ = Math.cos(yaw) * distance
    const camPos = new THREE.Vector3(t.x - offsetX, t.y + height, t.z - offsetZ)
    camera.position.lerp(camPos, 0.16)

    // calculate look target with pitch
    const lookDir = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch)
    )
    const lookTarget = new THREE.Vector3(t.x, t.y + 1.2, t.z).add(lookDir)
    camera.lookAt(lookTarget)
  })
  return null
}




/* ---------------- Main GamePhysics component ---------------- */
export default function GamePhysics({ onOpenProject }) {
  // platforms initial data (center Y around 0.6 so top ~0.8)
  const initialPlatforms = [
    { slug: 'skills', pos: [-3, 2, -1], label: 'Skills' },
    { slug: 'corps', pos: [0, 0.6, 1], label: 'Corps App' },
    { slug: 'ai', pos: [3, 0.6, -1], label: 'AI Chatbot' },
    { slug: 'rc', pos: [6, 0.6, 1], label: 'IoT RC' },
    { slug: 'mech', pos: [9, 0.6, -1], label: 'Voxel Mech' },
    { slug: 'values', pos: [12, 0.6, 1], label: 'Values' }
  ]

  const [platforms, setPlatforms] = useState(initialPlatforms.map(p => ({ ...p, hp: PLATFORM_HP, broken: false })))
  const [hovered, setHovered] = useState(null)
  const [modalProject, setModalProject] = useState(null)
  const [finalVisible, setFinalVisible] = useState(false)
  const visualReg = useRef({})
  const lockRef = useRef(false)
  const playerRef = useRef(null)
  const camRotRef = useRef({ x: 0, y: 0 })
  const sceneStart = useRef(performance.now())
  const debrisList = useRef([])

  // spawn debris helper
  const spawnDebrisReal = useCallback((center, color = '#d4a05a') => {
    const items = []
    for (let i = 0; i < DEBRIS_PER_BREAK; i++) {
      items.push({
        id: `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        pos: [center[0] + rand(-0.6, 0.6), center[1] + rand(0.2, 0.9), center[2] + rand(-0.6, 0.6)],
        vel: [rand(-2.2, 2.2), rand(2.8, 5.0), rand(-2.2, 2.2)],
        color
      })
    }
    debrisList.current = debrisList.current.concat(items)
    // auto-clear after lifetime (DebrisBox itself will zero out its body)
    setTimeout(() => {
      debrisList.current = debrisList.current.filter(d => !items.some(it => it.id === d.id))
    }, DEBRIS_LIFETIME + 500)
  }, [])

  // onBreak handler from PlatformPhysics
  const handlePlatformBreak = useCallback(({ slug, pos, label }) => {
    // spawn debris
    spawnDebrisReal(pos, '#d89f48')
    // open platform modal after short delay so debris is visible
    setTimeout(() => {
      setModalProject({ title: label, desc: `This is the ${label} project — more details are on my portfolio.` })
    }, 420)
    setPlatforms(prev => {
      const next = prev.map(p => (p.slug === slug ? { ...p, broken: true, hp: 0 } : p))
      const allBroken = next.every(p => p.broken)
      if (allBroken) setTimeout(() => setFinalVisible(true), 650)
      return next
    })

    if (onOpenProject) onOpenProject(slug)
  }, [spawnDebrisReal, onOpenProject])

  // reset level
  const resetAll = () => {
    debrisList.current = []
    visualReg.current = {}
    setModalProject(null)
    setFinalVisible(false)
    setPlatforms(initialPlatforms.map(p => ({ ...p, hp: PLATFORM_HP, broken: false })))
    sceneStart.current = performance.now()
  }

  // project data (for modal content)
  const projectData = {
    corps: { title: 'Corps App', desc: 'Award-winning mobile booking & event app (Flutter, ASP.NET Core, Azure).' },
    ai: { title: 'AI Chatbot', desc: 'Generative AI prototype (Python, React, RAG).' },
    rc: { title: 'IoT RC', desc: 'Remote-control car with low-latency camera (Raspberry Pi).' },
    mech: { title: 'Voxel Mech', desc: 'Unity voxel mech builder with TUI systems.' },
    skills: { title: 'Skills', desc: 'Full-stack, cloud, embedded, and game development.' },
    values: { title: 'Values', desc: 'Resilient and disciplined: father, married, full-time worker while studying.' }
  }

  // request pointer lock safely and keep lockRef in sync via pointerlockchange
  const tryRequestPointerLock = () => {
    try {
      document.body.requestPointerLock && document.body.requestPointerLock()
    } catch (e) {
      console.warn('pointer lock request failed', e)
    }
  }

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}
      onClick={() => { tryRequestPointerLock() }}>
      <Canvas shadows camera={{ position: [0, 3.5, 9], fov: 60 }}>
        <ambientLight intensity={0.45} />
        <directionalLight position={[8, 12, 6]} intensity={0.9} castShadow />
        <Stars radius={80} depth={40} count={1200} factor={4} fade />

        <Physics gravity={[0, GRAVITY, 0]} defaultContactMaterial={{ restitution: 0.02, friction: 0.9 }}>
          <Ground />

          {/* Render platforms only if not broken - PlatformPhysics will call handlePlatformBreak */}
          {platforms.map(p => !p.broken && (
            <PlatformPhysics
              key={p.slug}
              slug={p.slug}
              pos={p.pos}
              label={p.label}
              color={'#2b2b7a'}
              registerVisual={visualReg}
              onBreak={handlePlatformBreak}
              sceneStart={sceneStart.current}
            />
          ))}

          {/* Player */}
          <PlayerBody positionRef={playerRef} setHoveredPlatform={setHovered} lockActiveRef={lockRef} camRotRef={camRotRef} />

          {/* Camera follows the player's physics body */}
          <CameraRig targetRef={playerRef} camRotRef={camRotRef} />

          {/* Debris physics: map current debrisList snapshot to DebrisBox which will time out itself */}
          {debrisList.current.map((d) => <DebrisBox key={d.id} initial={d} />)}
        </Physics>
      </Canvas>

      {/* HUD: instructions */}
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 30, color: '#fff', background: 'rgba(0,0,0,0.25)', padding: 10, borderRadius: 8 }}>
        Click to lock mouse — WASD to move, Space to jump
      </div>

      {/* hover hint */}
      {hovered && (
        <div style={{ position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%)', color: '#fff', background: 'rgba(0,0,0,0.35)', padding: '8px 12px', borderRadius: 8, zIndex: 30 }}>
          Jump onto {hovered} to crack it
        </div>
      )}

      {/* per-platform modal (no CV download here) */}
      <PlatformModal visible={!!modalProject} project={modalProject} onClose={() => setModalProject(null)} />

      {/* final CTA overlay (with CV download & final note) */}
      <FinalCTA visible={finalVisible} onPlayAgain={resetAll} />
    </div>
  )
}

useGLTF.preload('/models/barlowAvatar.glb')

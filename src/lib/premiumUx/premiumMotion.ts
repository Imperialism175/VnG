import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const EASE = 'power3.out'
const PREMIUM_EASE_CSS = 'cubic-bezier(0.25, 1, 0.5, 1)'

function isSidebarChrome(el: HTMLElement): boolean {
  return Boolean(el.closest('.vng-room-sidefeed, .vng-room-roster, .vng-room-layout__side, .vng-room-layout__roster'))
}

function splitTextToChars(el: HTMLElement) {
  if (el.dataset.premiumSplit === '1') return
  const text = el.textContent ?? ''
  if (!text.trim()) return
  el.dataset.premiumSplit = '1'
  el.setAttribute('aria-label', text)
  el.textContent = ''
  ;[...text].forEach((ch) => {
    const span = document.createElement('span')
    span.className = 'vng-premium-char'
    span.setAttribute('aria-hidden', 'true')
    span.textContent = ch === ' ' ? '\u00A0' : ch
    el.appendChild(span)
  })
}

function restorePremiumTextSplits(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('[data-premium-split="1"]').forEach((el) => {
    const label = el.getAttribute('aria-label')
    if (label != null) {
      el.textContent = label
    }
    delete el.dataset.premiumSplit
    el.removeAttribute('aria-label')
  })
}

function cleanupPremiumMotion(root: HTMLElement) {
  gsap.set(root.querySelectorAll<HTMLElement>('.vng-premium-char, .vng-dos-hud__row, .vng-premium-hero'), {
    opacity: 1,
    y: 0,
    rotateX: 0,
    scale: 1,
    clearProps: 'transform,opacity,filter',
  })
  restorePremiumTextSplits(root)
  ScrollTrigger.getAll().forEach((t) => t.kill())
  gsap.killTweensOf(root.querySelectorAll('*'))
}

function heroReveal(root: HTMLElement) {
  const brand = root.querySelector<HTMLElement>('.vng-dos-hud__brand')
  if (brand) splitTextToChars(brand)

  const chars = brand?.querySelectorAll<HTMLElement>('.vng-premium-char')
  if (chars?.length) {
    gsap.from(chars, {
      opacity: 0,
      y: 10,
      stagger: 0.02,
      duration: 0.5,
      ease: EASE,
      delay: 0.08,
      clearProps: 'transform,opacity',
    })
  }
}

function bindScrollReveals(root: HTMLElement) {
  const targets = root.querySelectorAll<HTMLElement>(
    '.vng-panel, .vng-room-sidefeed, .vng-room-layout__roster > *, .vng-dice-throw-pit, .vng-stat-tile, .vng-counter-block'
  )

  targets.forEach((el, i) => {
    if (isSidebarChrome(el)) return
    el.classList.add('vng-premium-reveal')
    gsap.fromTo(
      el,
      { opacity: 0, y: 36, scale: 0.92 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.95,
        ease: EASE,
        delay: Math.min(i * 0.03, 0.18),
        scrollTrigger: {
          trigger: el,
          scroller: findScrollParent(el) ?? undefined,
          start: 'top 92%',
          toggleActions: 'play none none reverse',
        },
      }
    )
  })
}

function bindParallax(root: HTMLElement) {
  const layers = root.querySelectorAll<HTMLElement>('.vng-panel, .vng-room-sidefeed')
  layers.forEach((el) => {
    if (isSidebarChrome(el)) return
    gsap.to(el, {
      y: -12,
      ease: 'none',
      scrollTrigger: {
        trigger: el,
        scroller: findScrollParent(el) ?? undefined,
        start: 'top bottom',
        end: 'bottom top',
        scrub: 0.85,
      },
    })
  })
}

function findScrollParent(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement
  while (node && node !== document.body) {
    const style = getComputedStyle(node)
    const scrollable =
      /auto|scroll/.test(style.overflowY) &&
      node.scrollHeight > node.clientHeight + 2
    if (scrollable) return node
    node = node.parentElement
  }
  return null
}

function bindMagneticButtons(root: HTMLElement) {
  const selectors = '.vng-tui-btn, .vng-retro-btn, .vng-retro-tab, button.vng-roll-cta, .vng-dice-btn'
  const buttons = root.querySelectorAll<HTMLElement>(selectors)
  const cleanups: (() => void)[] = []

  buttons.forEach((btn) => {
    btn.classList.add('vng-premium-magnetic')
    const onMove = (e: PointerEvent) => {
      const rect = btn.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dx = ((e.clientX - cx) / rect.width) * 10
      const dy = ((e.clientY - cy) / rect.height) * 10
      gsap.to(btn, { x: dx, y: dy, duration: 0.38, ease: EASE })
    }
    const onLeave = () => {
      gsap.to(btn, { x: 0, y: 0, duration: 0.55, ease: EASE })
    }
    btn.addEventListener('pointermove', onMove)
    btn.addEventListener('pointerleave', onLeave)
    cleanups.push(() => {
      btn.removeEventListener('pointermove', onMove)
      btn.removeEventListener('pointerleave', onLeave)
      gsap.set(btn, { clearProps: 'x,y' })
    })
  })

  return () => cleanups.forEach((fn) => fn())
}

function bindAmbientFloat(root: HTMLElement) {
  const targets = root.querySelectorAll<HTMLElement>(
    '.vng-panel, .vng-stat-tile, .vng-counter-block, .vng-dice-throw-pit'
  )
  targets.forEach((el, i) => {
    if (isSidebarChrome(el)) return
    gsap.to(el, {
      y: '+=6',
      duration: 2.8 + (i % 5) * 0.35,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
      delay: (i % 7) * 0.12,
    })
  })
}

function bindSoftHovers(root: HTMLElement) {
  const items = root.querySelectorAll<HTMLElement>(
    '.vng-tui-btn, .vng-retro-tab, .vng-stat-tile, .vng-panel, input, textarea, select, .vng-tui-input'
  )
  items.forEach((el) => {
    if (el.classList.contains('vng-panel') && isSidebarChrome(el)) return
    el.classList.add('vng-premium-hoverable')
    const onEnter = () => gsap.to(el, { scale: 1.02, duration: 0.28, ease: EASE })
    const onLeave = () => gsap.to(el, { scale: 1, duration: 0.38, ease: EASE })
    el.addEventListener('pointerenter', onEnter)
    el.addEventListener('pointerleave', onLeave)
  })
  return () => {
    items.forEach((el) => {
      gsap.set(el, { clearProps: 'scale' })
    })
  }
}

function bindFeedMotion(root: HTMLElement) {
  const rows = root.querySelectorAll<HTMLElement>('.vng-feed-item, .vng-room-feed__line, .vng-event-line')
  rows.forEach((el, i) => {
    gsap.from(el, {
      opacity: 0,
      x: -12,
      duration: 0.55,
      ease: EASE,
      delay: Math.min(i * 0.04, 0.5),
    })
  })
}

function bindTabMotion(root: HTMLElement) {
  const tabs = root.querySelectorAll<HTMLElement>('.vng-retro-tab, .vng-terminal-tabs button')
  tabs.forEach((tab) => {
    const pulse = () => {
      const active =
        tab.classList.contains('vng-retro-tab--active') || tab.classList.contains('vng-tab--active')
      if (!active) return
      gsap.fromTo(tab, { boxShadow: '0 0 0px transparent' }, {
        boxShadow: '0 0 22px color-mix(in srgb, var(--vng-dos-accent) 45%, transparent)',
        duration: 0.8,
        ease: EASE,
        yoyo: true,
        repeat: 1,
      })
    }
    tab.addEventListener('click', pulse)
  })
}

export function animatePremiumTabPane(el: HTMLElement | null) {
  if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  if (!el.closest('[data-vng-theme-variant="premium"]')) return
  gsap.fromTo(
    el,
    { opacity: 0, y: 14, filter: 'blur(6px)' },
    { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.48, ease: EASE, clearProps: 'filter' }
  )
}

function bindKineticScroll(root: HTMLElement) {
  const scrollers = root.querySelectorAll<HTMLElement>(
    '.vng-feed-scroll, .vng-room-roster__list, .vng-room-layout__main'
  )
  const cleanups: (() => void)[] = []

  scrollers.forEach((el) => {
    el.classList.add('vng-premium-scroll')
    let target = el.scrollTop
    let current = el.scrollTop
    let raf = 0

    const tick = () => {
      current += (target - current) * 0.14
      if (Math.abs(target - current) < 0.4) {
        current = target
        el.scrollTop = current
        return
      }
      el.scrollTop = current
      raf = requestAnimationFrame(tick)
    }

    const onWheel = (e: WheelEvent) => {
      if (el.scrollHeight <= el.clientHeight + 1) return
      e.preventDefault()
      const max = el.scrollHeight - el.clientHeight
      target = Math.max(0, Math.min(max, target + e.deltaY))
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(tick)
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    cleanups.push(() => {
      cancelAnimationFrame(raf)
      el.removeEventListener('wheel', onWheel)
    })
  })

  return () => cleanups.forEach((fn) => fn())
}

export function initPremiumMotion(root: HTMLElement, level: 'off' | 'low' | 'full' = 'full'): () => void {
  if (level === 'off' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return () => undefined
  }

  restorePremiumTextSplits(root)
  heroReveal(root)
  bindSoftHovers(root)
  bindTabMotion(root)

  if (level === 'low') {
    bindAmbientFloat(root)
    ScrollTrigger.refresh()
    return () => cleanupPremiumMotion(root)
  }

  const unbindScroll = bindKineticScroll(root)
  bindScrollReveals(root)
  bindParallax(root)
  bindAmbientFloat(root)
  bindFeedMotion(root)
  const unbindMagnetic = bindMagneticButtons(root)

  ScrollTrigger.refresh()

  return () => {
    unbindScroll()
    unbindMagnetic()
    cleanupPremiumMotion(root)
  }
}

export { PREMIUM_EASE_CSS }

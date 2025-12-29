'use client'

import { useSyncExternalStore } from 'react'
import { DEFAULT_FIREWALL_RULES, type FirewallRule, type Protocol } from '@/engine/firewall/rules'

export type FirewallAttackTraffic = {
  protocol: Protocol
  port: number
}

export type FirewallRulesState = {
  visible: boolean
  rules: FirewallRule[]
  attackTraffic: FirewallAttackTraffic
}

const cloneDefaults = () => (DEFAULT_FIREWALL_RULES || []).map((r) => ({ ...r }))

const DEFAULT_ATTACK_TRAFFIC: FirewallAttackTraffic = { protocol: 'TCP', port: 22 }

const store = {
  state: { visible: false, rules: cloneDefaults(), attackTraffic: { ...DEFAULT_ATTACK_TRAFFIC } } as FirewallRulesState,
  listeners: new Set<() => void>(),
  set(partial: Partial<FirewallRulesState>) {
    store.state = { ...store.state, ...partial }
    store.listeners.forEach((l) => l())
  },
}

export function useFirewallRules() {
  const subscribe = (l: () => void) => {
    store.listeners.add(l)
    return () => store.listeners.delete(l)
  }
  const snapshot = useSyncExternalStore(subscribe, () => store.state, () => store.state)

  const show = () => store.set({ visible: true })
  const hide = () => store.set({ visible: false })
  const toggle = () => store.set({ visible: !store.state.visible })

  const setRules = (rules: FirewallRule[]) => {
    const next = Array.isArray(rules) ? rules.map((r) => ({ ...r })) : []
    store.set({ rules: next })
  }

  const setAttackTraffic = (traffic: Partial<FirewallAttackTraffic>) => {
    const cur = store.state.attackTraffic || DEFAULT_ATTACK_TRAFFIC
    const next: FirewallAttackTraffic = {
      protocol: traffic.protocol ?? cur.protocol,
      port: typeof traffic.port === 'number' ? traffic.port : cur.port,
    }
    store.set({ attackTraffic: next })
  }

  const resetRules = () => store.set({ rules: cloneDefaults() })
  const resetAttackTraffic = () => store.set({ attackTraffic: { ...DEFAULT_ATTACK_TRAFFIC } })

  return { ...snapshot, show, hide, toggle, setRules, setAttackTraffic, resetRules, resetAttackTraffic }
}

export function getFirewallRulesState() {
  return store.state
}

export function setFirewallRules(rules: FirewallRule[]) {
  const next = Array.isArray(rules) ? rules.map((r) => ({ ...r })) : []
  store.set({ rules: next })
}

export function setFirewallAttackTraffic(traffic: Partial<FirewallAttackTraffic>) {
  const cur = store.state.attackTraffic || DEFAULT_ATTACK_TRAFFIC
  const next: FirewallAttackTraffic = {
    protocol: traffic.protocol ?? cur.protocol,
    port: typeof traffic.port === 'number' ? traffic.port : cur.port,
  }
  store.set({ attackTraffic: next })
}

export function toggleFirewallRulesPanel() {
  store.set({ visible: !store.state.visible })
}

export function showFirewallRulesPanel() {
  store.set({ visible: true })
}

export function hideFirewallRulesPanel() {
  store.set({ visible: false })
}

export function resetFirewallRulesToDefaults() {
  store.set({ rules: cloneDefaults() })
}

export function resetFirewallAttackTrafficToDefaults() {
  store.set({ attackTraffic: { ...DEFAULT_ATTACK_TRAFFIC } })
}

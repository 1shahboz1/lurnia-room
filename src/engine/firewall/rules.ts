'use client'

export type Zone = 'LAN' | 'WAN'
export type Protocol = 'TCP' | 'UDP'
export type RuleAction = 'ALLOW' | 'DENY'

export type FirewallRule = {
  id: string
  srcZone: Zone
  dstZone: Zone
  protocol: Protocol
  port: number
  action: RuleAction
}

export type FirewallTraffic = {
  srcZone: Zone
  dstZone: Zone
  protocol: Protocol
  port: number
}

export type FirewallDecision = {
  action: RuleAction
  matchedRuleIndex: number | null
  matchedRuleId: string | null
}

export function matchesRule(rule: FirewallRule, traffic: FirewallTraffic): boolean {
  return (
    rule.srcZone === traffic.srcZone &&
    rule.dstZone === traffic.dstZone &&
    rule.protocol === traffic.protocol &&
    Number(rule.port) === Number(traffic.port)
  )
}

/**
 * Evaluates rules top-to-bottom. First match wins.
 * If no rule matches, the default behavior is DENY.
 */
export function evaluateFirewallRules(rules: FirewallRule[], traffic: FirewallTraffic): FirewallDecision {
  const list = Array.isArray(rules) ? rules : []
  for (let i = 0; i < list.length; i++) {
    const r = list[i]
    if (!r) continue
    if (matchesRule(r, traffic)) {
      return {
        action: r.action,
        matchedRuleIndex: i,
        matchedRuleId: r.id,
      }
    }
  }
  return { action: 'DENY', matchedRuleIndex: null, matchedRuleId: null }
}

export const DEFAULT_FIREWALL_RULES: FirewallRule[] = [
  // Default-deny posture for the core HTTPS demo.
  // Learners must explicitly allow outbound + inbound TCP/443 to make web traffic work.
  {
    id: 'rule-1',
    srcZone: 'LAN',
    dstZone: 'WAN',
    protocol: 'TCP',
    port: 443,
    action: 'DENY',
  },
  {
    id: 'rule-2',
    srcZone: 'WAN',
    dstZone: 'LAN',
    protocol: 'TCP',
    port: 443,
    action: 'DENY',
  },
  // Keep the attack demo initially vulnerable so the "Simulate Attack" lesson works.
  {
    id: 'rule-3',
    srcZone: 'WAN',
    dstZone: 'LAN',
    protocol: 'TCP',
    port: 22,
    action: 'ALLOW',
  },
]

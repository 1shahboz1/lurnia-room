/**
 * Command Executor
 * 
 * Parses and executes network commands from the terminal.
 * Handles argument substitution and effect scheduling.
 */

import type {
  Command,
  ParsedCommand,
  CommandExecutionResult,
  CommandEffect,
  EmitPacketsEffect,
  UpdateMetadataEffect,
  StartPhaseEffect,
  OpenInfoBoardEffect,
  DispatchEventEffect,
} from '@/types/terminal';

import { evaluateFirewallRules, type Protocol as FirewallProtocol, type Zone as FirewallZone } from '@/engine/firewall/rules'
import { getFirewallRulesState } from '@/store/useFirewallRules'

/**
 * Load commands from the JSON catalog
 */
export async function loadCommands(): Promise<Command[]> {
  try {
    const response = await fetch('/commands.json');
    if (!response.ok) {
      throw new Error('Failed to load commands.json');
    }
    const commands: Command[] = await response.json();
    return commands;
  } catch (error) {
    console.error('Error loading commands:', error);
    return [];
  }
}

/**
 * Load commands for a specific room when available.
 *
 * Convention:
 * - /commands.<roomId>.json (e.g. /commands.firewall.json)
 * - fallback to /commands.json
 */
export async function loadCommandsForRoom(roomId?: string): Promise<Command[]> {
  const candidates: string[] = [];
  if (roomId) {
    candidates.push(`/commands.${roomId}.json`);
  }
  candidates.push('/commands.json');

  for (const path of candidates) {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        continue;
      }
      const commands: Command[] = await response.json();
      return commands;
    } catch (error) {
      console.warn(`Error loading commands from ${path}:`, error);
      continue;
    }
  }

  return [];
}

/**
 * Parse a command string and match it to a command definition
 */
export function parseCommand(
  input: string, 
  commands: Command[]
): ParsedCommand | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Split by whitespace but preserve quotes
  const tokens = trimmed.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  if (tokens.length === 0) return null;

  const commandName = tokens[0];
  
  // Find matching command
  const command = commands.find(cmd => cmd.id === commandName);
  if (!command) return null;

  // Extract arguments
  const args: Record<string, string> = {};
  for (let i = 0; i < command.args.length; i++) {
    const argName = command.args[i];
    const argValue = tokens[i + 1] || '';
    args[argName] = argValue.replace(/^"(.*)"$/, '$1'); // Remove quotes
  }

  return {
    command,
    args,
    raw: trimmed
  };
}

/**
 * Replace template tokens like {{domain}} with actual values
 * Also replaces dynamic tokens like {{IP}}, {{TIMESTAMP}}, {{QUERY_TIME}}, etc.
 */
export function substituteTokens(text: string, args: Record<string, string>): string {
  // Import dynamic utilities
  const {
    getIpForDomain,
    getRandomQueryTime,
    getDnsTimestamp,
    getDnsServerIp,
    getRandomTtl
  } = require('./domainIpMap')

  let result = text

  // Replace user-provided arguments
  for (const [key, value] of Object.entries(args)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
    result = result.replace(regex, value)
  }

  // Replace dynamic tokens
  // Get domain for IP lookup (try domain, host, or first arg)
  const domain = args.domain || args.host || Object.values(args)[0] || 'example.com'

  // {{IP}} - Dynamic IP based on domain
  result = result.replace(/\{\{IP\}\}/g, getIpForDomain(domain))

  // {{TIMESTAMP}} - Current timestamp
  result = result.replace(/\{\{TIMESTAMP\}\}/g, getDnsTimestamp())

  // {{QUERY_TIME}} - Random query time (18-35ms)
  result = result.replace(/\{\{QUERY_TIME\}\}/g, getRandomQueryTime().toString())

  // {{DNS_SERVER}} - DNS server IP from topology
  result = result.replace(/\{\{DNS_SERVER\}\}/g, getDnsServerIp())

  // {{TTL}} - Random TTL value
  result = result.replace(/\{\{TTL\}\}/g, getRandomTtl().toString())

  // Firewall-room troubleshooting tokens (best-effort; safe no-ops in other rooms)
  try {
    const parsePort = (v: any): number | null => {
      const n = Number.parseInt(String(v || ''), 10)
      if (!Number.isFinite(n)) return null
      if (n < 1 || n > 65535) return null
      return n
    }

    const isIp = (v: string) => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(v)

    const zoneForHost = (host: string): FirewallZone => {
      const h = String(host || '').trim()
      if (!h) return 'WAN'
      if (!isIp(h)) return 'WAN'
      if (h.startsWith('192.168.') || h.startsWith('10.') || h.startsWith('127.')) return 'LAN'
      // 172.16.0.0/12
      if (h.startsWith('172.')) {
        const parts = h.split('.')
        const second = Number.parseInt(parts[1] || '', 10)
        if (Number.isFinite(second) && second >= 16 && second <= 31) return 'LAN'
      }
      return 'WAN'
    }

    const urlRaw = String(args.url || '').trim()

    let host = String(args.host || args.ip || args.domain || '').trim()
    let port = parsePort(args.port)
    let protocol: FirewallProtocol = (String(args.protocol || 'TCP').toUpperCase() === 'UDP') ? 'UDP' : 'TCP'

    if ((!host || port == null) && urlRaw) {
      try {
        const u = new URL(urlRaw)
        host = host || u.hostname
        const urlPort = parsePort(u.port)
        port = port ?? (urlPort != null ? urlPort : (u.protocol === 'http:' ? 80 : 443))
        // curl/http still uses TCP
        protocol = 'TCP'
      } catch {
        // If the URL doesn't parse (e.g. bare IP), keep best-effort host/port
      }
    }

    // Default to LAN source (terminal is assumed to run from the LAN desktop)
    const srcZone: FirewallZone = (String(args.srcZone || 'LAN').toUpperCase() === 'WAN') ? 'WAN' : 'LAN'
    const dstZone: FirewallZone = (String(args.dstZone || '').toUpperCase() === 'LAN')
      ? 'LAN'
      : (String(args.dstZone || '').toUpperCase() === 'WAN')
        ? 'WAN'
        : zoneForHost(host)

    const fwState = getFirewallRulesState?.()
    const fwRules = (fwState && Array.isArray((fwState as any).rules)) ? (fwState as any).rules : []

    const shouldEval = port != null && (protocol === 'TCP' || protocol === 'UDP') && (srcZone !== dstZone)

    // Simplified learning model: treat connectivity as requiring BOTH directions to be allowed.
    // (Real firewalls are stateful; this room's rules are intentionally simplified.)
    const forward = shouldEval
      ? evaluateFirewallRules(fwRules, { srcZone, dstZone, protocol, port: port as number })
      : ({ action: 'ALLOW', matchedRuleIndex: null, matchedRuleId: null } as any)

    const reverse = shouldEval
      ? evaluateFirewallRules(fwRules, { srcZone: dstZone, dstZone: srcZone, protocol, port: port as number })
      : ({ action: 'ALLOW', matchedRuleIndex: null, matchedRuleId: null } as any)

    const finalAction = (srcZone === dstZone)
      ? 'ALLOW'
      : (forward.action === 'ALLOW' && reverse.action === 'ALLOW')
        ? 'ALLOW'
        : 'DENY'

    const fmtVia = (d: any) => (d?.matchedRuleIndex != null ? `Rule ${d.matchedRuleIndex + 1}` : 'Default')

    const via = (srcZone === dstZone)
      ? 'No firewall (same zone)'
      : `OUT ${srcZone}→${dstZone}: ${forward.action} (${fmtVia(forward)}) • IN ${dstZone}→${srcZone}: ${reverse.action} (${fmtVia(reverse)})`

    const fwLine = (port != null)
      ? `# Firewall: ${protocol}/${port} • ${via}`
      : `# Firewall: ${protocol} • ${via}`

    // Basic decision tokens
    result = result.replace(/\{\{FW_DECISION\}\}/g, String(finalAction || 'UNKNOWN'))
    result = result.replace(/\{\{FW_MATCH\}\}/g, via)

    // Connection simulation tokens
    const telnetResult = (finalAction === 'ALLOW')
      ? `Connected to ${host}.\nEscape character is '^]'.\n${fwLine}`
      : `telnet: Unable to connect to remote host: Operation timed out\n${fwLine}`

    const ncResult = (finalAction === 'ALLOW')
      ? `Connection to ${host} ${port ?? ''} port [tcp/*] succeeded!\n${fwLine}`
      : `nc: connectx to ${host} port ${port ?? ''} (tcp) failed: Operation timed out\n${fwLine}`

    const curlOk = (finalAction === 'ALLOW')
    const curlResult = curlOk
      ? `HTTP/1.1 200 OK\nserver: web-server\ncontent-type: text/html; charset=UTF-8\n\n<html>…</html>\n${fwLine}`
      : `curl: (7) Failed to connect to ${host} port ${port ?? ''}: Connection timed out\n${fwLine}`

    result = result.replace(/\{\{FW_TELNET_RESULT\}\}/g, telnetResult)
    result = result.replace(/\{\{FW_NC_RESULT\}\}/g, ncResult)
    result = result.replace(/\{\{FW_CURL_RESULT\}\}/g, curlResult)
  } catch {
    // Ignore firewall token failures; leave any unknown tokens as-is.
  }

  return result
}

/**
 * Execute command effects with proper timing
 */
export async function executeCommandEffects(
  effects: CommandEffect[],
  args: Record<string, string>,
  callbacks: {
    onConsoleOutput?: (text: string) => void;
    onEmitPackets?: (effect: EmitPacketsEffect) => void;
    onUpdateMetadata?: (effect: UpdateMetadataEffect) => void;
    onStartPhase?: (effect: StartPhaseEffect) => void;
    onOpenInfoBoard?: (effect: OpenInfoBoardEffect) => void;
  }
): Promise<void> {
  for (const effect of effects) {
    // Apply delay if specified
    if (effect.delayMs && effect.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, effect.delayMs));
    }

    // Execute effect based on type
    switch (effect.type) {
      case 'consoleOutput':
        if (callbacks.onConsoleOutput) {
          const text = substituteTokens(effect.text, args);
          callbacks.onConsoleOutput(text);
        }
        break;

      case 'emitPackets':
        if (callbacks.onEmitPackets) {
          callbacks.onEmitPackets(effect as EmitPacketsEffect);
        }
        break;

      case 'updateMetadata':
        if (callbacks.onUpdateMetadata) {
          const metadataEffect = effect as UpdateMetadataEffect;
          // Substitute tokens in metadata values
          const kv: Record<string, any> = {};
          for (const [k, v] of Object.entries(metadataEffect.kv)) {
            kv[k] = typeof v === 'string' ? substituteTokens(v, args) : v;
          }
          callbacks.onUpdateMetadata({
            ...metadataEffect,
            kv
          });
        }
        break;

      case 'startPhase':
        if (callbacks.onStartPhase) {
          callbacks.onStartPhase(effect as StartPhaseEffect);
        }
        break;

      case 'openInfoBoard':
        if (callbacks.onOpenInfoBoard) {
          callbacks.onOpenInfoBoard(effect as OpenInfoBoardEffect);
        }
        break;

      case 'dispatchEvent':
        try {
          if (typeof window !== 'undefined') {
            const ev = effect as DispatchEventEffect;
            window.dispatchEvent(new CustomEvent(ev.name, { detail: ev.detail }));
          }
        } catch (err) {
          console.warn('dispatchEvent failed:', err);
        }
        break;

      default:
        console.warn('Unknown effect type:', (effect as any).type);
    }
  }
}

/**
 * Execute a parsed command
 */
export async function executeCommand(
  parsed: ParsedCommand,
  callbacks: {
    onConsoleOutput?: (text: string) => void;
    onEmitPackets?: (effect: EmitPacketsEffect) => void;
    onUpdateMetadata?: (effect: UpdateMetadataEffect) => void;
    onStartPhase?: (effect: StartPhaseEffect) => void;
    onOpenInfoBoard?: (effect: OpenInfoBoardEffect) => void;
  }
): Promise<CommandExecutionResult> {
  try {
    await executeCommandEffects(parsed.command.effects, parsed.args, callbacks);
    
    return {
      success: true,
      effects: parsed.command.effects
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get command suggestions based on partial input
 */
export function getCommandSuggestions(
  partial: string,
  commands: Command[]
): Command[] {
  const trimmed = partial.trim().toLowerCase();
  if (!trimmed) return commands;

  // Extract just the first word (the command name)
  const firstWord = trimmed.split(/\s+/)[0];

  return commands.filter(cmd => 
    cmd.id.toLowerCase().startsWith(firstWord) ||
    cmd.help.toLowerCase().includes(firstWord)
  );
}

/**
 * Format command usage for help display
 */
export function formatCommandHelp(command: Command): string {
  return `${command.usage}\n  ${command.help}`;
}

/**
 * Get full help text for all commands
 */
export function getFullHelp(commands: Command[]): string {
  const lines = ['Available commands:\n'];
  
  for (const cmd of commands) {
    lines.push(`  ${cmd.usage.padEnd(40)} - ${cmd.help}`);
  }
  
  return lines.join('\n');
}

/**
 * Calculate Levenshtein distance between two strings (for typo detection)
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Find closest matching command for typo suggestions
 */
export function findClosestCommand(
  input: string,
  commands: Command[]
): Command | null {
  const inputLower = input.toLowerCase();
  let closestCmd: Command | null = null;
  let minDistance = Infinity;

  for (const cmd of commands) {
    const distance = levenshteinDistance(inputLower, cmd.id.toLowerCase());
    // Only suggest if distance is 1-2 (likely typo)
    if (distance < minDistance && distance <= 2) {
      minDistance = distance;
      closestCmd = cmd;
    }
  }

  return closestCmd;
}

/**
 * Generate helpful error message with hints
 */
export function getErrorMessage(
  input: string,
  commands: Command[]
): { message: string; suggestion?: string } {
  const tokens = input.trim().split(/\s+/);
  const commandName = tokens[0];

  // Find the command to check if it exists
  const command = commands.find(cmd => cmd.id === commandName);

  if (!command) {
    // Command not found - check for typos
    const closest = findClosestCommand(commandName, commands);
    if (closest) {
      return {
        message: `Command not found: ${commandName}`,
        suggestion: `Did you mean: ${closest.id}?`
      };
    }
    return {
      message: `Command not found: ${commandName}`,
      suggestion: 'Type "help" for available commands'
    };
  }

  // Command exists but may be missing arguments
  const providedArgs = tokens.length - 1;
  const requiredArgs = command.args.length;

  if (providedArgs < requiredArgs) {
    const missingArgs = command.args.slice(providedArgs).map(arg => `{{${arg}}}`).join(' ');
    return {
      message: `Missing arguments for: ${commandName}`,
      suggestion: `Usage: ${command.usage}\nExample: ${commandName} ${command.args.map(arg => 
        arg === 'domain' || arg === 'host' ? 'google.com' : 
        arg === 'port' ? '443' : 
        arg === 'url' ? 'https://google.com' : 'value'
      ).join(' ')}`
    };
  }

  return {
    message: `Error executing: ${commandName}`,
    suggestion: undefined
  };
}

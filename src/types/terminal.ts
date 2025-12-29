/**
 * Terminal Command System Types
 *
 * These types define the structure for interactive network commands.
 * Commands can emit packets, update entity metadata, output console text, start phases/flows,
 * and dispatch custom events.
 */

export type CommandEffectType =
  | 'emitPackets'
  | 'updateMetadata'
  | 'consoleOutput'
  | 'startPhase'
  | 'openInfoBoard'
  | 'dispatchEvent';

export type PacketStyle =
  | 'dns_query'
  | 'dns_response'
  | 'tls_handshake'
  | 'tls_encrypted'
  | 'http_req'
  | 'http_resp'
  | 'icmp'
  | 'tcp_syn';

// NOTE: Some rooms still use legacy phase names (e.g. TLSHandshake).
export type Phase = 'DNS' | 'PKI' | 'TLSHandshake' | 'HTTPS';

export type EntityId =
  | 'desktop1'
  | 'desktop2'
  | 'switch1'
  | 'router1'
  | 'firewall1'
  | 'earth1'
  | 'dns1'
  | 'web1'
  | 'cdn1'
  | 'pki1'
  | 'attacker';

/**
 * Base effect interface
 */
export interface BaseEffect {
  type: CommandEffectType;
  delayMs?: number;
}

/**
 * Emit network packets along a path
 */
export interface EmitPacketsEffect extends BaseEffect {
  type: 'emitPackets';
  path: EntityId[];
  style: PacketStyle;
  count: number;
}

/**
 * Update metadata on an entity (e.g., server status)
 */
export interface UpdateMetadataEffect extends BaseEffect {
  type: 'updateMetadata';
  entity: EntityId;
  kv: Record<string, any>;
}

/**
 * Output text to the console
 */
export interface ConsoleOutputEffect extends BaseEffect {
  type: 'consoleOutput';
  text: string;
}

/**
 * Start a specific phase (DNS, TLS, or HTTPS)
 */
export interface StartPhaseEffect extends BaseEffect {
  type: 'startPhase';
  phase: Phase;
}

/**
 * Open the info board for an entity
 */
export interface OpenInfoBoardEffect extends BaseEffect {
  type: 'openInfoBoard';
  entity: EntityId;
}

/**
 * Dispatch a custom window event (room integrations listen for these).
 */
export interface DispatchEventEffect extends BaseEffect {
  type: 'dispatchEvent';
  name: string;
  detail?: any;
}

export type CommandEffect =
  | EmitPacketsEffect
  | UpdateMetadataEffect
  | ConsoleOutputEffect
  | StartPhaseEffect
  | OpenInfoBoardEffect
  | DispatchEventEffect;

/**
 * Command definition
 */
export interface Command {
  id: string;
  usage: string;
  help: string;
  args: string[];
  effects: CommandEffect[];
}

/**
 * Command catalog
 */
export interface CommandCatalog {
  commands: Command[];
}

/**
 * Parsed command with arguments
 */
export interface ParsedCommand {
  command: Command;
  args: Record<string, string>;
  raw: string;
}

/**
 * Command execution result
 */
export interface CommandExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  effects?: CommandEffect[];
}

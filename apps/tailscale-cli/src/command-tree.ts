import type { CommandDescription, NextAction } from '@garage/cli-protocol'
import { defaultLimit } from '@garage/tailscale'

export interface RootHealth {
  readonly configured: true
  readonly reachable: boolean
  readonly backendState?: string | undefined
  readonly peerCount?: number | undefined
  readonly exitNodeCount?: number | undefined
  readonly currentExitNode?: string | undefined
  readonly errorCode?: string | undefined
}

export interface RootResult {
  readonly name: 'tailscale'
  readonly description: string
  readonly commands: ReadonlyArray<CommandDescription>
  readonly health: RootHealth
}

export const rootCommand = 'tailscale'
export const limitFlag = '--limit'

export const commandTree: ReadonlyArray<CommandDescription> = [
  { command: rootCommand, description: 'Show this command tree and local daemon health' },
  {
    command: `${rootCommand} status [--limit <n>]`,
    description: 'Return local tailnet state and a bounded peer sample',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum peers to include', default: defaultLimit }],
  },
  {
    command: `${rootCommand} peers [--limit <n>]`,
    description: 'Return peers from tailscale status',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum peers to return', default: defaultLimit }],
  },
  {
    command: `${rootCommand} exit-nodes [--limit <n>]`,
    description: 'Return peers advertising exit-node service',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum exit nodes to return', default: defaultLimit }],
  },
  { command: `${rootCommand} current-exit-node`, description: 'Return the exit node currently in use, if any' },
  { command: `${rootCommand} dns`, description: 'Return tailscale dns status output' },
  { command: `${rootCommand} ip`, description: 'Return this machine tailnet IPv4 and IPv6 addresses' },
  { command: `${rootCommand} whois <ip-or-host>`, description: 'Return tailscale whois --json for a target' },
  { command: `${rootCommand} ping <host>`, description: 'Run tailscale ping --c 3 for a target' },
]

export const installNextAction: NextAction = {
  command: 'tailscale status --json',
  description: 'Install Tailscale on PATH and log in with tailscale up from an interactive shell',
}

export const showCommandsAction: NextAction = { command: rootCommand, description: 'Show available commands' }

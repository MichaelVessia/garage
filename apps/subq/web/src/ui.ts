import { clsx } from 'clsx'

// Class-string helpers replicating the old shadcn-style component variants.

const buttonBase =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50'

const buttonVariants = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90',
  destructive: 'text-destructive hover:bg-destructive/10',
  outline: 'border border-input bg-background hover:bg-muted hover:border-muted-foreground/50',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  ghost: 'hover:bg-muted hover:text-foreground',
  link: 'text-primary underline-offset-4 hover:underline',
} as const

const buttonSizes = {
  default: 'h-9 px-4 py-2',
  sm: 'h-8 rounded-md px-3 text-xs',
  lg: 'h-10 rounded-md px-8',
  icon: 'h-9 w-9',
} as const

export const button = (
  options: {
    variant?: keyof typeof buttonVariants
    size?: keyof typeof buttonSizes
    class?: string
  } = {}
): string =>
  clsx(buttonBase, buttonVariants[options.variant ?? 'default'], buttonSizes[options.size ?? 'default'], options.class)

export const input = (options: { error?: boolean; class?: string } = {}): string =>
  clsx(
    'flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 disabled:cursor-not-allowed disabled:opacity-50',
    options.error === true && 'border-destructive focus:border-destructive focus:ring-destructive/15',
    options.class
  )

export const select = (options: { error?: boolean; class?: string } = {}): string =>
  clsx(input(options), 'appearance-none bg-background')

export const card = (options: { class?: string } = {}): string =>
  clsx('rounded-lg border bg-card text-card-foreground shadow-sm', options.class)

export const navLink = (isActive: boolean): string =>
  clsx(
    'py-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
    isActive ? 'text-foreground border-foreground' : 'text-muted-foreground border-transparent hover:text-foreground'
  )

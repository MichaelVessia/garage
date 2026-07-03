import * as Option from 'effect/Option'

/**
 * Standard injection site rotation order.
 * Used to suggest the next injection site based on the last one used.
 */
export const SITE_ROTATION = [
  'Left abdomen',
  'Right abdomen',
  'Left thigh',
  'Right thigh',
  'Left upper arm',
  'Right upper arm',
] as const
export type InjectionSiteRotation = (typeof SITE_ROTATION)[number]
const isValidSite = (site: string): site is InjectionSiteRotation =>
  SITE_ROTATION.some((rotationSite) => rotationSite === site)
/**
 * Get the next suggested injection site based on the last site used.
 * Rotates through sites in order to help distribute injection locations.
 */
export const getNextSite = (lastSite: Option.Option<string>): InjectionSiteRotation => {
  const [defaultSite] = SITE_ROTATION
  return Option.match(lastSite, {
    onNone: () => defaultSite,
    onSome: (site) => {
      if (!isValidSite(site)) {
        return defaultSite
      }
      const currentIndex = SITE_ROTATION.indexOf(site)
      return SITE_ROTATION[(currentIndex + 1) % SITE_ROTATION.length] ?? defaultSite
    },
  })
}

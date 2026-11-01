/** Which commit this bundle was built from ("unknown" outside a git checkout). */
export const FORGE_BUILD: string =
  typeof __FORGE_BUILD__ === 'string' ? __FORGE_BUILD__ : 'unknown';

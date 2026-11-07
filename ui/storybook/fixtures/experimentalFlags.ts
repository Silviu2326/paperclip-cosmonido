/**
 * Instance experimental flags returned by the Storybook fetch fixtures.
 *
 * Mutable on purpose, like `onboardingFixtureState`: the fetch handler is
 * installed once, so a story sets what it reads (usually from a decorator) to
 * render the shell the way a given deployment has it, e.g. the streamlined
 * sidebar that production uses.
 */
export const experimentalFlagState: Record<string, boolean> = {};

export function setExperimentalFlags(flags: Record<string, boolean>): void {
  for (const key of Object.keys(experimentalFlagState)) delete experimentalFlagState[key];
  Object.assign(experimentalFlagState, flags);
}

/**
 * Where the store's connection and its access are managed: two places on the
 * workspace's Settings page. Every lock and "needs access" card links here.
 */

/** The "Autommerce access" panel (what the connected store lets Autommerce do). */
export const STORE_ACCESS_ANCHOR = "store-access";
/** The Integrations section (connect, reconnect or disconnect the store). */
export const STORE_CONNECTION_ANCHOR = "store-connection";

export const storeAccessHref = (workspaceSlug: string) => `/w/${workspaceSlug}/settings#${STORE_ACCESS_ANCHOR}`;
export const storeConnectionHref = (workspaceSlug: string) => `/w/${workspaceSlug}/settings#${STORE_CONNECTION_ANCHOR}`;

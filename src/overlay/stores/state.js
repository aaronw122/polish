import { writable } from 'svelte/store';

/** Whether the overlay is active (hover/click enabled). */
export const active = writable(true);

/** Currently hovered DOM element. */
export const hoveredElement = writable(null);

/** Currently selected DOM element. */
export const selectedElement = writable(null);

/**
 * Source data from the server — { file, selector, line, properties, cssFiles, matchedRules }.
 */
export const sourceData = writable(null);

/** Whether the panel is currently visible. */
export const panelVisible = writable(false);

/** Debounce timers keyed by CSS property name. */
export const debounceTimers = writable({});

/** Whether the shortcut hint has been shown. */
export const shortcutHintShown = writable(false);

/** Whether uniform spacing mode is on (lock icon). */
export const uniformMode = writable(false);

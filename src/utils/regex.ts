/** Escapes user text for use inside a RegExp (search filters, spec §9). */
export const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

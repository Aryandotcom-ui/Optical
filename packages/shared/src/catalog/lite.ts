/**
 * The parts of the catalogue module with no Zod: vocabularies, constants and
 * URL helpers. Browser code imports from here (`@optical/shared/catalog/lite`)
 * so the schema library stays out of client bundles; types are free to come
 * from the full module.
 */
export * from './constants';
export * from './url';

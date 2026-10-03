// The canonical public-page reader and interactive target share the same
// public-only address policy. No loopback/private-network escape hatch.
export { isPublicAddress, validateUrl } from '../browser/security.js';

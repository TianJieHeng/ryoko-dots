import { readFileSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { OpenAIRealtimeMedia } from './voice-media.js';

/** Server-owned opt-in only. Reading configuration never downloads or activates models. */
export function loadVoiceMedia(path: string | undefined): OpenAIRealtimeMedia {
  if (!path) return new OpenAIRealtimeMedia();
  try {
    if (!isAbsolute(path)) throw new Error();
    const stat = statSync(path);
    if (!stat.isFile() || stat.size > 16384) throw new Error();
    return new OpenAIRealtimeMedia(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    // Zod issues can contain input values: never reflect media secrets or config paths.
    throw new Error(
      'Invalid server-owned voice configuration. Media remains unavailable.',
    );
  }
}

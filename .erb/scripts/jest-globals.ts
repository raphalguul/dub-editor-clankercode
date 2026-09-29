// jsdom does not expose TextEncoder/TextDecoder, which Chromium and Node both
// provide. VideoTools decodes base64 subtitle payloads with TextDecoder, so the
// tests need them on the global.
import { TextDecoder, TextEncoder } from 'util';

const globalScope = global as unknown as Record<string, unknown>;

if (typeof globalScope.TextEncoder === 'undefined') {
    globalScope.TextEncoder = TextEncoder;
}

if (typeof globalScope.TextDecoder === 'undefined') {
    globalScope.TextDecoder = TextDecoder;
}

// eslint-disable-next-line no-control-regex
const ILLEGAL_TITLE_CHARS = /[<>:"/\\|?*\x00-\x1F\x7F]/g;

// Windows resolves these to the device rather than the file, extension or not.
// renameVideo builds its id straight from the title with no prefix at all, so
// the guard has to run before the name is assembled.
const RESERVED_DEVICE_NAMES =
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

const MAX_TITLE_LENGTH = 120;

export const sanitizeClipTitle = (
    title: string | undefined | null,
    fallback = 'Untitled'
): string => {
    let cleaned = (title || '')
        .replace(ILLEGAL_TITLE_CHARS, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/, '');

    if (cleaned.length > MAX_TITLE_LENGTH) {
        cleaned = cleaned.slice(0, MAX_TITLE_LENGTH).replace(/[. ]+$/, '');
    }

    if (RESERVED_DEVICE_NAMES.test(cleaned)) {
        cleaned = '_' + cleaned;
    }

    return cleaned || fallback;
};

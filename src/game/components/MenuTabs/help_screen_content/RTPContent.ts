import type { ContentSection } from '../ContentSection';
import { HELP_RTP_TITLE } from '../../../../backend/LocalizationData';

const FALLBACK_RTP_TEXT = '96.49% - 96.6%';

export function getRtpContent(gameAPI?: { getRtpRange: () => string | null } | null): ContentSection {
    const fromApi = gameAPI?.getRtpRange() ?? null;
    const value = fromApi != null ? fromApi : FALLBACK_RTP_TEXT;

    return {
        Header: {
            opts: { padding: { top: 12, bottom: 12 } },
            key: HELP_RTP_TITLE,
            value: 'RTP',
        },
        Content: [{ Text: { opts: { padding: 2 }, value } }],
    };
}

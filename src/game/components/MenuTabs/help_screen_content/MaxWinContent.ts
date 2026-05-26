import type { ContentSection } from '../ContentSection';
import { HELP_MAX_WIN_TITLE } from '../../../../backend/LocalizationData';
import { MAX_WIN_MULTIPLIER } from '../../../../config/GameConfig';

function formatMaxWinMultiplier(multiplier: number): string {
    return multiplier.toLocaleString() + 'x';
}

export function getMaxWinContent(gameAPI?: { getMaxWin: () => number | null } | null): ContentSection {
    const fromApi = gameAPI?.getMaxWin() ?? null;
    const multiplier = fromApi != null ? fromApi : MAX_WIN_MULTIPLIER;
    const value = formatMaxWinMultiplier(multiplier);

    return {
        Header: {
            opts: { padding: { top: 12, bottom: 12 } },
            key: HELP_MAX_WIN_TITLE,
            value: 'Max Win',
        },
        Content: [{ Text: { opts: { padding: 2 }, value } }],
    };
}

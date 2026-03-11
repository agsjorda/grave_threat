import type { ContentSection } from '../ContentSection';

export const maxWinContent: ContentSection = {
    Header: {
        opts: { padding: { top: 12, bottom: 12 } },
        key: 'help_max-win-title',
        value: 'Max Win',
    },
    Content: [
        { Text: { opts: { padding: 2 }, value: '21,000x' } },
    ],
};

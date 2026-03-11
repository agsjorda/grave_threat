import type { ContentSection } from '../ContentSection';

export const gameRulesContent: ContentSection = {
    Header: {
        opts: { 
            padding: { top: 12, bottom: 12 },
        },
        key: 'help_game-rules-title',
        value: 'Game Rules',
    },
    Content: [
        {
            Text: {
                opts: { padding: 2 },
                key: 'help_game-rules-desc',
            },
        },
    ],
};

import type { ContentSection } from '../ContentSection';

export const betControlsSection: ContentSection = {
    Header: {
        key: 'help_bet-controls-title',
        value: 'Bet Controls',
    },
    Border: {
        opts: {
            margin: 16,
            padding: 16,
            style: { fillColor: 0xffffff, strokeColor: 0xffffff, fillAlpha: 0.1, strokeAlpha: 0.0 },
        }
    },
    Content: [
        {
            RichText: {
                opts: {
                    padding: { bottom: 12},
                },
                    parts: [
                        {
                            TextImage: {
                                key: 'betControlsMinus',
                                opts: {
                                    padding: { right: 6},
                                },
                            }
                        },
                        {
                            TextImage: {
                                key: 'betControlsPlus',
                                opts: {
                                    padding: { left: 6, right: 12 },
                                },
                            }
                        },
                        {
                            Text: {
                                key: 'help_buttons-label',
                                value: 'Buttons',
                                style: {
                                    fontSize: '26px',
                                },
                            }
                        }
                ]
            }
        },
        {
            Text: {
                key: 'help_bet-controls-desc',
                value: 'Adjust your total bet',
            }
        }
    ]
};

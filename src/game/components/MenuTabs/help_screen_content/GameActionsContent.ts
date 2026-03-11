import type { ContentSection } from '../ContentSection';

/** Shared border opts for Game Actions item boxes (spin, amplify bet, autoplay, turbo). */
const gameActionsBorderOpts = {
    margin: 16,
    padding: 16,
    style: { fillColor: 0xffffff, strokeColor: 0xffffff, fillAlpha: 0.1, strokeAlpha: 0.0 },
} as const;

const spinSection: ContentSection = {
    Border: {
        opts: gameActionsBorderOpts,
    },
    Content: [
        {
            RichText: {
                opts: {
                    padding: { bottom: 20 },
                },
                parts: [
                    {
                        TextImage: {
                            key: 'spin_button',
                            opts: {
                                padding: { right: 20},
                            },
                        }
                    },
                    {
                        Text: {
                            key: 'help_spin-label',
                            value: 'Spin',
                            style: {
                                fontSize: '24px',
                            },
                        }
                    }
                ]
            }
        },
        {
            Text: {
                key: 'help_spin-desc',
                value: 'Starts the game round.',
            }
        }
    ]
};

const buyFeatureSection: ContentSection = {
    Border: {
        opts: { ...gameActionsBorderOpts },
    },
    Content: [
        {
            RichText: {
                opts: {
                    padding: { top: -12, left: -16, right: 12  },
                },
                parts: [
                    {
                        TextImage: {
                            key: 'feature',
                            text: {
                                value: 'BUY FEATURE\nCURRENCY:10000',
                                align: 'center',
                                style: {
                                    fontSize: '14px',
                                },
                            },
                        }
                    },
                    {
                        Text: {
                            key: 'help_buy-feature-label',
                            value: 'Buy Feature',
                            style: {
                                fontSize: '24px',
                            },
                        }
                    }
                ]
            }
        },
        {
            Text: {
                key: 'help_buy-feature-desc',
                value: 'Lets you buy the free spins round for 100x your total bet.',
            }
        }
    ]
};

const amplifyBetSection: ContentSection = {
    Border: {
        opts: gameActionsBorderOpts,
    },
    Content: [
        {
            RichText: {
                opts: {
                    padding: { bottom: 20 },
                },
                parts: [
                    {
                        TextImage: {
                            key: 'amplify_bet_button',
                            opts: {
                                padding: { right: 20},
                            },
                        }
                    },
                    {
                        Text: {
                            key: 'help_amplify-label',
                            value: 'Amplify Bet',
                            style: {
                                fontSize: '24px',
                            },
                        }
                    }
                ]
            }
        },
        {
            Text: {
                key: 'help_amplify-desc',
                value: 'You\'re wagering 25% more per spin, but you also have better chances at hitting big features.',
            }
        }
    ]
};

const autoplaySection: ContentSection = {
    Border: {
        opts: gameActionsBorderOpts,
    },
    Content: [
        {
            RichText: {
                opts: {
                    padding: { bottom: 20 },
                },
                parts: [
                    {
                        TextImage: {
                            key: 'autoplay_button',
                            opts: {
                                padding: { right: 20},
                            },
                        }
                    },
                    {
                        Text: {
                            key: 'help_autoplay-label',
                            value: 'Auto Play',
                            style: {
                                fontSize: '24px',
                            },
                        }
                    }
                ]
            }
        },
        {
            Text: {
                key: 'help_autoplay-desc',
                value: 'Opens the autoplay menu. Tap again to stop autoplay.',
            }
        }
    ]
};

const turboSection: ContentSection = {
    Border: {
        opts: gameActionsBorderOpts,
    },
    Content: [
        {
            RichText: {
                opts: {
                    padding: { bottom: 20 },
                },
                parts: [
                    {
                        TextImage: {
                            key: 'turbo_button',
                            opts: {
                                padding: { right: 20},
                            },
                        }
                    },
                    {
                        Text: {
                            key: 'help_turbo-label',
                            value: 'Turbo',
                            style: {
                                fontSize: '24px',
                            },
                        }
                    }
                ]
            }
        },
        {
            Text: {
                key: 'help_turbo-desc',
                value: 'Speeds up the game.',
            }
        }
    ]
};

export const gameActionsSection: ContentSection = {
    Header: {
        key: 'help_game-actions-title',
        value: 'Game Actions',
        opts: {
            padding: { top: 24 },
        },
    },
    Content: [
        { ChildSection: spinSection },
        { ChildSection: buyFeatureSection },
        { ChildSection: amplifyBetSection },
        { ChildSection: autoplaySection },
        { ChildSection: turboSection },
    ]
};

import type { ContentSection } from '../ContentSection';

/** Shared border opts for General Controls item boxes (sounds, settings, info). */
const generalControlsBorderOpts = {
    margin: 16,
    padding: 16,
    style: { fillColor: 0xffffff, strokeColor: 0xffffff, fillAlpha: 0.1, strokeAlpha: 0.0 },
} as const;

const soundsContent: ContentSection = {
    Border: {
        opts: generalControlsBorderOpts,
    },
    Content: [
        {
            RichText: {
                opts: {
                    padding: { top: 6, bottom: 24 },
                },
                parts: [
                    {
                        TextImage: {
                            key: 'sound_icon_on',
                            opts: {
                                padding: { right: 6 },
                            },
                        }
                    },
                    {
                        TextImage: {
                            key: 'sound_icon_off',
                            opts: {
                                padding: { left: 6, right: 12 },
                            },
                        }
                    },
                    {
                        Text: {
                            key: 'help_sounds-label',
                            value: 'Sounds',
                            style: {
                                fontSize: '24px',
                            }
                        }
                    }
                ]
            }
        },
        {
            Text: {
                key: 'help_sounds-desc',
                value: 'Toggle game sounds on or off.',
            }
        },
    ]
};

const settingsContent: ContentSection = {
    Border: {
        opts: generalControlsBorderOpts,
    },
    Content: [
        {
            RichText: {
                opts: {
                    padding: { top: 6, bottom: 24 },
                },
                parts: [
                    {
                        TextImage: {
                            key: 'settings_icon',
                            opts: {
                                padding: { right: 16 },
                            },
                        }
                    },
                    {
                        Text: {
                            key: 'help_settings-label',
                            value: 'Settings',
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
                key: 'help_settings-desc',
                value: 'Access gameplay preferences and systems options.',
                opts: {
                    padding: { top: -6 },
                },
            }
        }
    ]
};

const infoContent: ContentSection = {
    Border: {
        opts: generalControlsBorderOpts,
    },
    Content: [
        {
            RichText: {
                opts: {
                    padding: { top: 0 },
                },
                parts: [
                    {
                        TextImage: {
                            key: 'info_icon',
                            opts: {
                                padding: { right: 16 },
                            },
                        }
                    },
                    {
                        Text: {
                            key: 'help_info-label',
                            value: 'Info',
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
                key: 'help_info-desc',
                value: 'View game rules, features, and paytable.',
                opts: {
                    padding: { top: 12 },
                },
            }
        }

    ]
};

export const generalControlsSection: ContentSection = {
    Content: [
        {
            Header: {
                key: 'help_general-controls-title',
                value: 'General Controls',
                opts: {
                    padding: { top: 36, bottom: 12 },
                },
            }
        },
        { ChildSection: soundsContent },
        { ChildSection: settingsContent },
        { ChildSection: infoContent },
    ]
};

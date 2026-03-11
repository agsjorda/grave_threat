import type { ContentSection } from '../ContentSection';

export const tumbleWinContent: ContentSection = {
    Header: {
        key: 'help_tumble-win',
        value: 'Tumble Win',
        opts: {
            margin: { top: 50, bottom: 10 },
        },
    },
    Border: {
        opts: {
            margin: { top: 10, bottom: 10 },
            padding: { top: 20, bottom: 20, right: 20, left: 20 },
            style: { fillColor: 0xffffff, strokeColor: 0xffffff, fillAlpha: 0.1, strokeAlpha: 0.2 },
        },
    },
    Content: [
        {
            Image: {
                opts: {
                    align: 0.5,
                    anchor: { x: 0.5, y: 0 },
                    size: 'fitToWidth',
                },
                key: 'tumbleWin' 
            } 
        },
        {
            Text: {
                opts: {
                    padding: { top: 40, bottom: 10 },
                },
                key: 'help_tumble-desc',
                value: 'After each spin, winning symbols are paid and then removed from the screen. Remaining symbols drop down, and new ones fall from above to fill the empty spaces.\n\nTumbles continue as long as new winning combinations appear — there is no limit to the number of tumbles per spin.\n\nAll wins are credited to the player\'s balance after all tumbles from a base spin are completed.',
            }
        }
    ]
};

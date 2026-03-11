import type { BorderOpts, ContentItem, ContentSection, GridCell, TextOpts } from '../ContentSection';
import { CurrencyManager } from '../../CurrencyManager';
import { SYMBOL_PAYTABLE, SYMBOL_PAY_COUNTS, getScatterFreeSpins } from '../../Spin';
import { HELPSCREEN_PAYOUT_SCATTER_DEBUG_LINE } from '../../../../config/GameConfig';

interface PayoutContentOptions {
    defaultOuterBorderStyle: BorderOpts;
    getBetAmount: () => number;
    getIsDemo?: () => boolean;
}

const SYMBOL_CHILD_SECTION_GAP = 10;
const symbolCount = 7;
const baseSymbolKey = 'symbol';
export const scatterSymbolKey = `${baseSymbolKey}0`;
const SCATTER_COUNTS = [3, 4, 5, 6, 7] as const;

/** Scale multipliers for help payout symbol images. Scatter (0) uses 1. */
const symbolImageScaleMultiplier: Record<number, number> = {
    0: 0.5,
    1: 1,
    2: 1,
    3: 1,
    4: 1,
    5: 1,
    6: 1,
    7: 1,
};

function getSymbolScaleMultiplier(imageKey: string): number {
    const match = new RegExp(`${baseSymbolKey}(\\d+)`).exec(imageKey);
    if (match == null) return 1;
    const index = parseInt(match[1], 10);
    return symbolImageScaleMultiplier[index] ?? 1;
}

function getSymbolPayouts(): Record<number, number[]> {
    const payouts: Record<number, number[]> = {};
    for (let symbolIndex = 1; symbolIndex <= symbolCount; symbolIndex++) {
        const row = SYMBOL_PAYTABLE[symbolIndex];
        payouts[symbolIndex] = SYMBOL_PAY_COUNTS.map((count) => row?.[count] ?? 0);
    }
    return payouts;
}

const payoutRanges: readonly string[] = SYMBOL_PAY_COUNTS.map(String);
const symbolPayouts = getSymbolPayouts();

const symbolPayoutRangeTextOpts: TextOpts = {
    padding: 0,
    align: 0,
    anchor: { x: 0, y: 0.5 },
    style: { fontSize: '20px', fontFamily: 'Poppins-Regular', fontStyle: 'bold', color: '#FFFFFF' },
    fitToBounds: true,
};

const symbolPayoutValueTextOpts: TextOpts = {
    padding: 0,
    align: 1,
    anchor: { x: 1, y: 0.5 },
    style: { fontSize: '20px', fontFamily: 'Poppins-Regular', color: '#FFFFFF' },
    fitToBounds: true,
};

function formatPayout(value: number): string {
    return value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function applyBetToPayout(baseValue: number, getBetAmount: () => number): number {
    return baseValue * getBetAmount();
}

function buildSymbolPayoutGridCells(
    rangesForSymbol: readonly string[],
    payoutValues: number[],
    getBetAmount: () => number,
    getIsDemo?: () => boolean
): GridCell[] {
    const gridCells: GridCell[] = [];

    for (let row = 0; row < payoutValues.length; row++) {
        const rangeValue = rangesForSymbol[row] ?? rangesForSymbol[rangesForSymbol.length - 1] ?? '';
        const adjustedPayout = applyBetToPayout(payoutValues[row] ?? 0, getBetAmount);
        const formattedPayout = formatPayout(adjustedPayout);
        const isDemo = getIsDemo?.() ?? false;
        const prefix = isDemo ? '' : CurrencyManager.getInlinePrefix().trimEnd();
        const payoutText = prefix ? `${prefix}\u00A0${formattedPayout}` : formattedPayout;

        gridCells.push({
            Text: {
                opts: { ...symbolPayoutRangeTextOpts },
                value: rangeValue,
            },
        });

        gridCells.push({
            Text: {
                opts: { ...symbolPayoutValueTextOpts },
                value: payoutText,
            },
        });
    }

    return gridCells;
}

function buildScatterGridCells(): GridCell[] {
    const gridCells: GridCell[] = [];

    for (const count of SCATTER_COUNTS) {
        gridCells.push({
            Text: {
                opts: { ...symbolPayoutRangeTextOpts },
                value: String(count),
            },
        });

        gridCells.push({
            Text: {
                opts: { ...symbolPayoutValueTextOpts },
                value: `${getScatterFreeSpins(count)} FS`,
            },
        });
    }

    return gridCells;
}

function createSymbolChildContentSection(
    imageKey: string,
    payoutValues: number[],
    baseSymbolChildContentSection: ContentSection,
    getBetAmount: () => number,
    getIsDemo?: () => boolean
): ContentSection {
    const numRows = payoutValues.length;
    const gridCells = buildSymbolPayoutGridCells(payoutRanges, payoutValues, getBetAmount, getIsDemo);

    const baseRowItem = baseSymbolChildContentSection.Content?.[0];
    if (!baseRowItem || !('Row' in baseRowItem) || !baseRowItem.Row) {
        throw new Error('[PayoutContent] Base section must contain a Row item');
    }

    const baseImageItem = baseRowItem.Row.items[0];
    const baseGridItem = baseRowItem.Row.items[1];
    if (!('Image' in baseImageItem) || !('Grid' in baseGridItem)) {
        throw new Error('[PayoutContent] Base section Row must contain Image and Grid items');
    }

    return {
        Border: baseSymbolChildContentSection.Border,
        Content: [
            {
                Row: {
                    opts: baseRowItem.Row.opts,
                    items: [
                        {
                            Image: {
                                opts: {
                                    ...baseImageItem.Image.opts,
                                    scale: getSymbolScaleMultiplier(imageKey),
                                    scaleAffectsLayout: false,
                                },
                                key: imageKey,
                            },
                        },
                        {
                            Grid: {
                                opts: {
                                    columns: 2,
                                    rows: numRows,
                                    alignment: baseGridItem.Grid.opts?.alignment ?? 'justified',
                                    gap: baseGridItem.Grid.opts?.gap ?? { x: 8, y: 8 },
                                    spacing: baseGridItem.Grid.opts?.spacing ?? 'fitToWidth',
                                    verticalSpacing: baseGridItem.Grid.opts?.verticalSpacing ?? 0,
                                    horizontalSpacing: baseGridItem.Grid.opts?.horizontalSpacing ?? 0,
                                    columnWidthPercents: baseGridItem.Grid.opts?.columnWidthPercents ?? [40],
                                    padding: baseGridItem.Grid.opts?.padding,
                                    align: baseGridItem.Grid.opts?.align,
                                    offset: baseGridItem.Grid.opts?.offset,
                                    anchor: baseGridItem.Grid.opts?.anchor,
                                },
                                cells: gridCells,
                            },
                        },
                    ],
                },
            },
        ],
    };
}

function getSymbolPayoutContent(
    baseSymbolChildContentSection: ContentSection,
    getBetAmount: () => number,
    getIsDemo?: () => boolean
): ContentSection {
    const childSections: ContentSection[] = [];

    for (let symbolIndex = 1; symbolIndex <= symbolCount; symbolIndex++) {
        const payoutData = symbolPayouts[symbolIndex];
        if (!payoutData || payoutData.length === 0) continue;

        const imageKey = `${baseSymbolKey}${symbolIndex}`;
        const childSection = createSymbolChildContentSection(
            imageKey,
            payoutData,
            baseSymbolChildContentSection,
            getBetAmount,
            getIsDemo
        );

        childSections.push(childSection);
    }

    const contentItems: ContentItem[] = childSections.map((section) => ({ ChildSection: section }));
    return {
        Header: {
            opts: { padding: { top: 12, bottom: 12 }, align: 0, anchor: { x: 0, y: 0 }, style: { fontSize: 24, fontFamily: 'Poppins-Regular' } },
            key: 'help_payout-title',
            value: 'Payout',
        },
        Content: contentItems,
    };
}

function getScatterPayoutContent(baseSymbolChildBorderStyle: BorderOpts): ContentSection {
    return {
        Border: {
            opts: { ...baseSymbolChildBorderStyle, margin: { bottom: 12, right: 0, left: 0 } },
        },
        debugRedBordersOnElements: HELPSCREEN_PAYOUT_SCATTER_DEBUG_LINE,
        Content: [
            {
                Header: {
                    opts: {},
                    key: 'help_scatter-title',
                    value: 'Scatter',
                },
            },
            {
                Image: {
                    opts: {
                        padding: 2,
                        align: 0.5,
                        offset: { x: 0, y: 10 },
                        anchor: { x: 0.5, y: 0 },
                        scale: getSymbolScaleMultiplier(scatterSymbolKey),
                        scaleAffectsLayout: false,
                        debugRedBorder: HELPSCREEN_PAYOUT_SCATTER_DEBUG_LINE,
                    },
                    key: scatterSymbolKey,
                },
            },
            {
                Grid: {
                    opts: {
                        padding: { top: 40, bottom: 40, right: 75, left: 75 },
                        columns: 2,
                        rows: SCATTER_COUNTS.length,
                        alignment: 'justified',
                        verticalSpacing: 8,
                        columnWidthPercents: [20],
                    },
                    cells: buildScatterGridCells(),
                },
            },
            {
                Text: {
                    opts: { padding: 2 },
                    key: 'help_scatter-desc',
                },
            },
        ],
    };
}

export function getPayoutContent(options: PayoutContentOptions): {
    symbolPayoutContent: ContentSection;
    scatterPayoutContent: ContentSection;
} {
    const baseSymbolChildContentSection: ContentSection = {
        Border: {
            opts: {
                ...options.defaultOuterBorderStyle,
                margin: { bottom: SYMBOL_CHILD_SECTION_GAP },
            },
        },
        Content: [
            {
                Row: {
                    opts: {
                        spacing: 'spread',
                        gap: 25,
                        columnWidthPercents: [40],
                    },
                    items: [
                        {
                            Image: {
                                opts: {
                                    align: 0,
                                    offset: { x: 20, y: 0 },
                                    anchor: { x: 0, y: 0.5 },
                                    size: 'fitToHeight',
                                    maxHeight: 100,
                                },
                                key: '',
                            },
                        },
                        {
                            Grid: {
                                opts: {
                                    padding: { right: 12, left: 12 },
                                    columns: 2,
                                    rows: 0,
                                    alignment: 'justified',
                                    spacing: 'fitToWidth',
                                    verticalSpacing: 10,
                                    columnWidthPercents: [35],
                                },
                                cells: [],
                            },
                        },
                    ],
                },
            },
        ],
    };

    const symbolPayoutContent = getSymbolPayoutContent(
        baseSymbolChildContentSection,
        options.getBetAmount,
        options.getIsDemo
    );
    const scatterPayoutContent = getScatterPayoutContent(options.defaultOuterBorderStyle);

    return { symbolPayoutContent, scatterPayoutContent };
}

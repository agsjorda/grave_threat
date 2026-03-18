# AGENTS.MD - Agent Operating Rules

This file defines how agents should work in this repository.
For game-specific replacement context, always read `GAME_TEMPLATE.md` first.

## 1. Source Of Truth

- Use `GAME_TEMPLATE.md` as the primary guide for where to replace images, text, rules, and values.
- If there is any conflict, prefer implementation in code and then update `GAME_TEMPLATE.md`.

## 2. Build And Test Policy

- Do not run `npm run build`, `vite build`, or full project test suites by default.
- Run build/tests only when the user explicitly asks, or when required to verify a risky change.
- If a verification command is skipped, state it clearly in the final summary.

## 3. Naming Conventions

Follow existing naming patterns unless the user asks for a rename.

- File naming for classes/scenes: `PascalCase` (example: `GameScene.ts`)
- TypeScript classes/components/types: `PascalCase`
- Functions/variables/methods: `camelCase`
- Constants in config files: `UPPER_SNAKE_CASE`
- Asset keys in `AssetConfig.ts`: **snake_case** (example: `bg_default`, `header_winbar`, `header_border`, `bg_bonus`, `normal_bg_cover`)
- Bonus marker keys: `bonus_multiplier_x{value}`
- Symbol assets: `Symbol{index}_PC.*` and static `symbol{index}.png`

## 4. Template Boundaries

- Treat `src/backend/` as shared integration code; avoid skin-level edits there.
- Prefer config-driven changes in `src/config/` and `src/game/components/Spin.ts` before scene-level rewrites.
- Keep event names and manager APIs stable unless the task explicitly requires changing contracts.

## 5. Change Scope

- Keep edits minimal and targeted; avoid unrelated refactors.
- Preserve existing behavior outside requested scope.
- Do not delete or rename assets/keys without updating all references.

## 6. Documentation Rule

When adding a new replace point (new assets folder, config constant, or game rule source), update `GAME_TEMPLATE.md` in the same change.

## 7. Change Approval

- Ask the user for confirmation before changing any file.
- Do not make code or config edits until the user explicitly approves.

## 8. VSCode File Reference Rule

- When referencing files in responses, use clickable markdown links with line numbers so they jump to exact changes in VSCode.
- Use workspace-relative targets with `#L` anchors (example: `[BonusHeader.ts#L120](pastry_cub/src/game/components/BonusHeader.ts#L120)`).
- Avoid absolute-path link targets (for this setup they may open in the browser).

## 9. Change Link Requirement

- Always include clickable file links for all modified files in the final response.
- Include at least one line anchor per changed file (prefer the main edit location).

## 10. Task Decomposition And Subagent Usage

For complex tasks, prefer structured decomposition before implementation.

### When To Use Multi-Agent / Subagents
Use a multi-agent approach (if available in the environment) when the task includes:
- Multiple independent concerns (e.g., UI, logic, config, assets)
- Large codebase exploration across multiple folders
- Parallel analysis (e.g., bug finding, performance review, config validation)
- Multi-step feature work requiring separation of planning, implementation, and validation

### When NOT To Use Subagents
- Small, localized changes (single file or simple config edit)
- Clearly scoped fixes with minimal impact

### Execution Strategy
For complex approved tasks:
1. Break the task into clearly defined subtasks
2. Identify which parts can be done independently
3. If multi-agent support is available, assign subtasks to separate agents
4. Ensure all outputs are consolidated into a single consistent result

### Constraints
- Always follow **Change Approval (Section 7)** before any implementation
- Do not allow parallel work to introduce conflicting edits
- Maintain consistency with existing naming and architecture rules

### Goal
Improve speed and accuracy for complex tasks while keeping changes safe, minimal, and aligned with repository standards.
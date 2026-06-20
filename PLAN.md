You are refactoring an existing PixiJS-based frontend project used to generate multiple OBS browser-source pages.

Primary goal:
Improve folder structure, remove duplication, standardize page implementation, and keep each OBS page isolated.

Important constraint:
Do not merge all pages into one runtime application.
Each OBS page must remain independently loadable as its own browser-source page.
Each page should still be easy to open directly in OBS as a standalone URL or HTML entrypoint.

Current problem:

- Poor folder structure.
- Many duplicated PixiJS setup patterns.
- Repeated CSS, JS, asset loading, scene initialization, animation loops, resize handling, config parsing, and utility logic.
- Pages are isolated, which is good and must be preserved.
- The project lacks consistent conventions for page layout, naming, shared utilities, and reusable rendering primitives.

Target architecture:
Keep isolated pages, but introduce shared internal libraries.

Each page should own: - Its page-specific entrypoint. - Its local configuration. - Its local scene composition. - Its local styles if needed. - Its local assets if they are unique.

Shared code should own: - PixiJS app/bootstrap logic. - OBS/browser-source helpers. - Resize handling. - Asset loading helpers. - Animation/ticker utilities. - Common UI primitives. - Shared effects. - Shared constants. - Type definitions. - Common CSS reset/theme variables. - Logging/debug helpers.

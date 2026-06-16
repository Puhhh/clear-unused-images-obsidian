# Changelog

All notable changes to this fork are documented in this file.

## [Unreleased]

- No unreleased changes yet.

## [1.5.4] - 2026-06-16

### Changed

- Updated trash cleanup to use Obsidian's file manager so trash deletion follows the user's Obsidian deletion preference.
- Migrated the old Obsidian Trash and System Trash plugin destinations to one Obsidian-configured trash destination.

## [1.5.3] - 2026-06-15

### Changed

- Updated build dependencies to resolve npm audit vulnerabilities.
- Added a release workflow dependency audit gate.

## [1.5.2] - 2026-06-02

### Changed

- Migrated the build and test toolchain with root esbuild config, Vitest, `versions.json`, and GitHub Actions release publishing.
- Added GitHub artifact attestations for release assets.
- Updated release metadata to require Obsidian 1.8.10 or newer.

## [1.5.1] - 2026-05-29

### Fixed

- Fixed automatic empty folder cleanup after image cleanup so it only removes folders that directly contained deleted images.
- Fixed file cleanup logging after trash deletion so Obsidian-detached files are not also reported as failed deletions.

## [1.5.0] - 2026-05-29

### Added

- Added a setting to clear empty folders automatically after unused image cleanup deletes images.

## [1.4.5] - 2026-05-29

### Added

- Added the `Clear unused folders` command for recursively removing empty folders while respecting excluded folder paths.

## [1.4.4] - 2026-04-29

### Added

- Added ESLint integration with the Obsidian plugin recommended rules.
- Added a regression test to keep link detection compatible with older iOS versions.

### Fixed

- Fixed required Obsidian review issues for UI text, async handling, console usage, and TypeScript primitives.
- Removed regex lookbehind from link detection for iOS compatibility.
- Replaced the browser confirm call with an Obsidian confirmation modal before permanent deletion.

## [1.4.3] - 2026-04-29

### Changed

- Renamed the plugin to `Clear Unused Images Plus`.
- Changed the plugin ID to `clear-unused-images-plus`.
- Shortened the fork description to refer to vaults instead of Obsidian vaults.
- Added this changelog and linked it from the documentation and release notes.

## [1.4.2] - 2026-04-28

### Changed

- Hardened cleanup safety and added a review flow before broad deletions.

## [1.4.1] - 2026-04-28

### Fixed

- Fixed the plugin display name shown in the Obsidian menu.

## [1.4.0] - 2026-04-28

### Added

- Added periodic image cleanup scheduling.

## [1.3.0] - 2026-04-28

### Added

- Added automatic image cleanup during vault startup.

## [1.2.1] - 2026-04-28

### Changed

- Hardened attachment detection and cleanup flow.

## [1.2.0] - 2026-04-28

### Changed

- Renamed the forked plugin metadata from the original upstream package.
- Added the MIT license and transferred fork metadata to the current maintainer.

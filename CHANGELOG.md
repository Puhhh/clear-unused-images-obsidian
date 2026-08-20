# Changelog

All notable changes to this fork are documented in this file.

## [Unreleased]

## [1.8.0] - 2026-08-20

### Added

- Renamed `Attachment folder suffixes` to `Attachment folder rules` and added case-sensitive vault-relative parent paths and anchored regular expressions while preserving existing case-insensitive suffix values.
- Added reviewed cleanup of a selected attachment folder's direct parent when it becomes empty, without cascading to higher ancestors.

### Security

- Rejected invalid or potentially expensive attachment-folder regular expressions before cleanup and limited rule evaluation to a bounded, linear-matching subset.
- Revalidated attachment folder rules, exclusions, exact parent type, and emptiness immediately before moving a reviewed parent folder to Obsidian-configured trash.

## [1.7.0] - 2026-08-19

### Added

- Added an `Attachment folder suffixes` setting that can treat matching folders as atomic attachments during manual `Clear unused attachments`, with external-reference and exclusion checks plus an explicit folder review.

### Security

- Revalidated reviewed attachment folders, their descendants, configured suffixes, references, and exclusions immediately before moving each folder to Obsidian-configured trash.
- Updated locked development dependencies to versions that pass the release audit.

## [1.6.1] - 2026-07-24

### Added

- Added searchable plugin settings in Obsidian 1.13.0 and newer while preserving the standard settings page on older supported Obsidian versions.

## [1.6.0] - 2026-07-24

### Added

- Added an `Excluded file extensions` setting that always keeps the listed file types, whether or not they are linked from a note (case insensitive, leading dot optional).

<img width="951" height="150" alt="image" src="https://github.com/user-attachments/assets/3ed7a705-5e30-4850-99d4-d8e64267bb9d" />

- Added a collapsible protected-files section to the cleanup review dialog that lists the unused files your exclusion settings are keeping, so it is clear what was left behind and why.
- Added a protected-files view to the cleanup review dialog for vaults where every unused file is excluded, replacing the delete confirmation with a read-only summary.

<img width="713" height="306" alt="image" src="https://github.com/user-attachments/assets/620a9f9d-9eee-41a5-9513-86caf6cf4d14" />

### Fixed

- Listed unused files protected by excluded extensions in the cleanup review dialog alongside those protected by excluded folders, so a vault whose only unused files are excluded no longer reports that all attachments are used.

### Security

- Updated locked development dependencies to resolve findings reported by the release audit.

### Contributors

- Thanks to [@WolfExplode](https://github.com/WolfExplode) for their first merged contribution in [#10](https://github.com/Puhhh/clear-unused-images-obsidian/pull/10).

## [1.5.6] - 2026-06-17

### Changed

- Updated README guidance for Obsidian 1.8.10+, quick-start cleanup usage, excluded folders, development installs, and signed release tags.

### Security

- Limited frontmatter reference traversal depth so deeply nested metadata cannot overflow the cleanup scan stack.

## [1.5.5] - 2026-06-16

### Changed

- Changed file and folder cleanup so it always uses Obsidian's file manager deletion preference.

### Removed

- Removed the plugin-controlled permanent deletion setting, confirmation flow, and related documentation screenshot.

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

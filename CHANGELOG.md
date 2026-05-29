# Changelog

All notable changes to this fork are documented in this file.

## 1.5.0

- Added a setting to clear empty folders automatically after unused image cleanup deletes images.

## 1.4.5

- Added the `Clear unused folders` command for recursively removing empty folders while respecting excluded folder paths.

## 1.4.4

- Added ESLint integration with the Obsidian plugin recommended rules.
- Fixed required Obsidian review issues for UI text, async handling, console usage, and TypeScript primitives.
- Removed regex lookbehind from link detection for iOS compatibility.
- Replaced the browser confirm call with an Obsidian confirmation modal before permanent deletion.
- Added a regression test to keep link detection compatible with older iOS versions.

## 1.4.3

- Renamed the plugin to `Clear Unused Images Plus`.
- Changed the plugin ID to `clear-unused-images-plus`.
- Shortened the fork description to refer to vaults instead of Obsidian vaults.
- Added this changelog and linked it from the documentation and release notes.

## 1.4.2

- Hardened cleanup safety and added a review flow before broad deletions.

## 1.4.1

- Fixed the plugin display name shown in the Obsidian menu.

## 1.4.0

- Added periodic image cleanup scheduling.

## 1.3.0

- Added automatic image cleanup during vault startup.

## 1.2.1

- Hardened attachment detection and cleanup flow.

## 1.2.0

- Renamed the forked plugin metadata from the original upstream package.
- Added the MIT license and transferred fork metadata to the current maintainer.

# clear-unused-images

`clear-unused-images` is a fork of [`oz-clear-unused-images`](https://github.com/ozntel/oz-clear-unused-images-obsidian).

The current fork is maintained by [Aleksei Blinov](https://github.com/Puhhh). The original plugin author is [Ozan](https://www.ozan.pl).

This plugin helps keep your vault clean by deleting images that are no longer referenced in your markdown notes.

The plugin collects image links from markdown documents and compares them against image files in your vault.

If any image files are not referenced in any document, they can be deleted automatically.

## Settings

### Deleted Image Destination

Please make sure that you select the destination for deleted images under the "Clear Unused Images Settings" tab. You have 3 options:

![delete-destination](images/delete-destination.png)

1. **Move to Obsidian Trash** - Files are going to be moved to the `.trash` under the Obsidian Vault.

2. **Move to System Trash** - Files are going to be moved to the Operating System trash.

3. **Permanently Delete** - Files are destroyed permanently. You will not be able to revert them.

### Clean Images On Vault Load

You can enable automatic cleanup during vault startup with the `Clean Images On Vault Load` setting.

![clean-images-on-vault-load](images/clean-images-on-vault-load.png)

- The cleanup runs once after the vault layout is ready.
- It only runs the image cleanup flow, not the `Clear Unused Attachments` command.
- If you enable the toggle while Obsidian is already open, the change takes effect on the next vault load.
- If `Permanently Delete` is selected, the existing confirmation dialog still appears before deletion starts.

### Clean Images Every X Minutes

You can also enable recurring automatic cleanup with the `Clean Images Every X Minutes` setting.

- The periodic timer only runs image cleanup while Obsidian stays open.
- The timer starts after the vault layout is ready and waits the full configured interval before the first periodic run.
- If both automatic modes are enabled, the vault-load cleanup runs once on startup and the periodic cleanup starts later on its normal interval.
- Periodic cleanup is disabled when `Permanently Delete` is selected.
- Changing the toggle, interval, or delete destination in settings updates the periodic scheduler for the current session.

### Excluded Folders

You can exclude folders from which you do not want images to be removed during the scan. If there are multiple folders to exclude, separate them with commas. Please provide the full path inside the vault:

![excluded-folders](images/excluded-folders.png)

You can now exclude all subfolders under the folder paths provided above:

![exclude-subfolders](images/exclude-subfolders.png)

## How to use

1. Activate the plugin from Community Plugins.

2. You can either:

    - Activate the ribbon icon from plugin settings and click the icon in the left ribbon to run the cleanup:

    ![ribbon-icon-settings](images/ribbon-icon-settings.png)

    - Or use the ribbon icon or open the Command Palette with `Ctrl/Cmd + P` and run `Clear Unused Images`.

    ![clear-command](images/clear-command.png)

3. If you have turned on the "Delete Logs" option in plugin settings, you will see a modal with information about which images were deleted from your vault:

![logs-modal](images/logs-modal.png)

If all images are used, you will see the following message:

![nothing-deleted](images/nothing-deleted.png)

**Scanned Image Formats** : jpg, jpeg, png, gif, svg, bmp, webp

## Planned Features

-   [x] Creating settings for users to select the destination of the deleted files
-   [x] Excluded folders settings for the scan
-   [x] Images to be cleaned during load of the vault if users chooses.
-   [x] Images to be cleaned every X minutes depending on user's choice

## Support

This repository is distributed under the [MIT License](LICENSE).

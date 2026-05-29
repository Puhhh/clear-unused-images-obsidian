export interface FolderLike<TNode> {
    path: string;
    children: TNode[];
}

export const getEmptyFoldersInDeleteOrder = <TNode, TFolder extends TNode & FolderLike<TNode>>(
    rootFolder: TFolder,
    isFolder: (node: TNode) => node is TFolder,
    isProtectedFolder: (folder: TFolder) => boolean = () => false
): TFolder[] => {
    const emptyFolders: TFolder[] = [];

    const visitFolder = (folder: TFolder, canDeleteFolder: boolean): boolean => {
        if (isProtectedFolder(folder)) {
            return false;
        }

        let remainingChildren = 0;
        for (const child of folder.children) {
            if (isFolder(child)) {
                const childDeleted = visitFolder(child, true);
                if (!childDeleted) {
                    remainingChildren++;
                }
            } else {
                remainingChildren++;
            }
        }

        const isEmptyAfterChildCleanup = remainingChildren === 0;
        if (canDeleteFolder && isEmptyAfterChildCleanup) {
            emptyFolders.push(folder);
            return true;
        }

        return false;
    };

    visitFolder(rootFolder, false);
    return emptyFolders;
};

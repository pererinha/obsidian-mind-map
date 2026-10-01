import { SplitDirection } from 'obsidian';

export class MindMapSettings {
    splitDirection: SplitDirection = 'horizontal';
    nodeMinHeight: number = 16;
    lineHeight: string = '1em';
    spacingVertical: number = 5;
    spacingHorizontal: number = 80;
    paddingX: number = 8;
    /** POC editor: list items in a heading's body become nodes. */
    listItemsAsNodes: boolean = true;
}
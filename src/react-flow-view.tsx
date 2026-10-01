import { ItemView, TFile, WorkspaceLeaf } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import reactFlowCss from '@xyflow/react/dist/style.css';
import { EditorSync, injectCss, whenSized } from './editor-sync';
import { PlainNode } from './md-tree';
import { MapEditor, MapEditorHandle } from './map-editor';
import { MindMapSettings } from './settings';

export const RF_VIEW_TYPE = 'poc-react-flow';

export default class ReactFlowView extends ItemView {
    private filePath: string;
    private sync: EditorSync;
    private host: HTMLDivElement;
    private reactRoot: Root;
    private editor: MapEditorHandle;

    constructor(leaf: WorkspaceLeaf, private settings: MindMapSettings) {
        super(leaf);
    }

    getViewType(): string {
        return RF_VIEW_TYPE;
    }

    getDisplayText(): string {
        return `React Flow: ${this.filePath ?? ''}`;
    }

    getIcon(): string {
        return 'dot-network';
    }

    getState() {
        return { file: this.filePath };
    }

    async setState(state: { file?: string }, result: any) {
        if (state?.file && state.file !== this.filePath) {
            this.filePath = state.file;
            await this.start();
        }
        return super.setState(state, result);
    }

    async onOpen() {
        injectCss('poc-react-flow-css', reactFlowCss);
        this.contentEl.empty();
        this.contentEl.addClass('poc-editor-content');
        this.host = this.contentEl.createDiv({ cls: 'poc-editor-host' });
        this.registerEvent(this.app.workspace.on('resize', () => this.editor?.fit()));
    }

    async onClose() {
        this.sync?.unwatch();
        this.reactRoot?.unmount();
    }

    private async start() {
        const file = this.app.vault.getAbstractFileByPath(this.filePath);
        if (!(file instanceof TFile)) {
            this.host.setText(`File not found: ${this.filePath}`);
            return;
        }
        this.sync?.unwatch();
        this.sync = new EditorSync(this.app, file, root => this.editor?.reload(root), {
            listItems: this.settings.listItemsAsNodes,
        });
        const root = await this.sync.load();
        const sized = await whenSized(this.host);
        console.log(`[poc][rf] host sized before init: ${sized}`);

        this.reactRoot?.unmount();
        this.reactRoot = createRoot(this.host);
        this.reactRoot.render(
            <MapEditor
                root={root}
                onChange={(next: PlainNode, source: string) => this.commit(next, source)}
                onReady={handle => (this.editor = handle)}
            />,
        );
        this.sync.watch();
    }

    /** Writes the tree and shows the editor what was written (reconcile may reorder list items before headings). */
    private async commit(next: PlainNode, source: string) {
        if (await this.sync.commit(next, `rf ${source}`)) {
            this.editor?.reload(this.sync.root());
        }
    }
}

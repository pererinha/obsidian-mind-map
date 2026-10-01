import { ItemView, TFile, WorkspaceLeaf } from 'obsidian';
import MindMap from 'simple-mind-map/index.js';
import Drag from 'simple-mind-map/src/plugins/Drag.js';
import Select from 'simple-mind-map/src/plugins/Select.js';
import KeyboardNavigation from 'simple-mind-map/src/plugins/KeyboardNavigation.js';
import { EditorSync, whenSized } from './editor-sync';
import { PlainNode } from './md-tree';

export const SMM_VIEW_TYPE = 'poc-simple-mind-map';

MindMap.usePlugin(Drag).usePlugin(Select).usePlugin(KeyboardNavigation);

interface SmmNode {
    data: { text: string; uid: string; expand?: boolean };
    children: SmmNode[];
}

function toEngine(node: PlainNode): SmmNode {
    return { data: { text: node.title, uid: node.id, expand: true }, children: node.children.map(toEngine) };
}

function fromEngine(node: SmmNode): PlainNode {
    return {
        id: node.data.uid,
        title: (node.data.text ?? '').replace(/\s*\n\s*/g, ' '),
        children: (node.children ?? []).map(fromEngine),
    };
}

export default class SimpleMindMapView extends ItemView {
    private filePath: string;
    private sync: EditorSync;
    private mindMap: any;
    private host: HTMLDivElement;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType(): string {
        return SMM_VIEW_TYPE;
    }

    getDisplayText(): string {
        return `SimpleMindMap: ${this.filePath ?? ''}`;
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
        this.contentEl.empty();
        this.contentEl.addClass('poc-editor-content');
        this.host = this.contentEl.createDiv({ cls: 'poc-editor-host' });
        this.registerEvent(this.app.workspace.on('resize', () => this.mindMap?.resize()));
    }

    async onClose() {
        this.sync?.unwatch();
        this.mindMap?.destroy();
    }

    private async start() {
        const file = this.app.vault.getAbstractFileByPath(this.filePath);
        if (!(file instanceof TFile)) {
            this.host.setText(`File not found: ${this.filePath}`);
            return;
        }
        this.sync?.unwatch();
        this.sync = new EditorSync(this.app, file, root => this.reload(root));
        const root = await this.sync.load();
        const sized = await whenSized(this.host);
        console.log(`[poc][smm] host sized before init: ${sized}`);

        this.mindMap?.destroy();
        this.mindMap = new MindMap({
            el: this.host,
            data: toEngine(root),
            layout: 'logicalStructure',
            theme: 'default',
            defaultInsertSecondLevelNodeText: 'New node',
            defaultInsertBelowSecondLevelNodeText: 'New node',
        });

        this.mindMap.on('data_change', (data: SmmNode) => {
            console.log('[poc][smm] data_change');
            this.sync.commit(fromEngine(data), 'smm data_change');
        });
        this.mindMap.on('afterExecCommand', (name: string) => console.log(`[poc][smm] command ${name}`));
        this.sync.watch();
    }

    private reload(root: PlainNode) {
        const selected: string[] = this.mindMap.renderer.activeNodeList.map((node: any) => node.getData('uid'));
        this.mindMap.updateData(toEngine(root));
        this.mindMap.once('node_tree_render_end', () => {
            selected.forEach(uid => {
                const node = this.mindMap.renderer.findNodeByUid(uid);
                if (node) {
                    this.mindMap.renderer.setNodeActive(node, true);
                }
            });
        });
    }
}

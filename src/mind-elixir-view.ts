import { ItemView, TFile, WorkspaceLeaf } from 'obsidian';
import MindElixir from 'mind-elixir';
import type { MindElixirInstance, NodeObj } from 'mind-elixir';
import mindElixirCss from 'mind-elixir/dist/MindElixir.css';
import { EditorSync, injectCss, whenSized } from './editor-sync';
import { PlainNode } from './md-tree';

export const ME_VIEW_TYPE = 'poc-mind-elixir';

function toEngine(node: PlainNode): NodeObj {
    return { id: node.id, topic: node.title, children: node.children.map(toEngine) };
}

function fromEngine(node: NodeObj): PlainNode {
    return {
        id: node.id,
        title: node.topic.replace(/\s*\n\s*/g, ' '),
        children: (node.children ?? []).map(fromEngine),
    };
}

export default class MindElixirView extends ItemView {
    private filePath: string;
    private sync: EditorSync;
    private mind: MindElixirInstance;
    private host: HTMLDivElement;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType(): string {
        return ME_VIEW_TYPE;
    }

    getDisplayText(): string {
        return `Mind Elixir: ${this.filePath ?? ''}`;
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
        injectCss('poc-mind-elixir-css', mindElixirCss);
        this.contentEl.empty();
        this.contentEl.addClass('poc-editor-content');
        this.host = this.contentEl.createDiv({ cls: 'poc-editor-host' });
        this.registerEvent(this.app.workspace.on('resize', () => this.mind?.toCenter()));
    }

    async onClose() {
        this.sync?.unwatch();
        this.mind?.destroy();
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
        console.log(`[poc][me] host sized before init: ${sized}`);

        this.mind?.destroy();
        this.mind = new MindElixir({
            el: this.host,
            direction: MindElixir.RIGHT,
            draggable: true,
            contextMenu: true,
            toolBar: true,
            keypress: true,
            allowUndo: true,
            theme: document.body.hasClass('theme-dark') ? MindElixir.DARK_THEME : MindElixir.THEME,
        });
        this.mind.init({ nodeData: toEngine(root) });

        this.mind.bus.addListener('operation', operation => {
            if (operation.name === 'beginEdit') {
                return;
            }
            console.log(`[poc][me] operation ${operation.name}`);
            this.commit(`operation:${operation.name}`);
        });
        // undo/redo call refresh(), which emits no operation; linkDiv is the only signal.
        this.mind.bus.addListener('linkDiv', () => this.commit('linkDiv'));
        this.sync.watch();
    }

    private commit(source: string) {
        const data = this.mind.getData();
        this.sync.commit(fromEngine(data.nodeData), `me ${source}`);
    }

    private reload(root: PlainNode) {
        const selected = this.mind.currentNodes.map(topic => topic.nodeObj.id);
        this.mind.refresh({ nodeData: toEngine(root) });
        try {
            this.mind.selectNodes(selected.map(id => this.mind.findEle(id)));
        } catch (e) {
            console.log('[poc][me] selection lost after reload', e);
        }
    }
}

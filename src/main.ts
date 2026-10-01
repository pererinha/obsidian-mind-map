import {
    Plugin,
    Vault,
    Workspace,
    WorkspaceLeaf, 
  } from 'obsidian';
import MindmapView from './mindmap-view';
import { MM_VIEW_TYPE } from './constants';
import { MindMapSettings } from './settings';
import { MindMapSettingsTab } from './settings-tab';
import MindElixirView, { ME_VIEW_TYPE } from './mind-elixir-view';
import SimpleMindMapView, { SMM_VIEW_TYPE } from './simple-mind-map-view';
import ReactFlowView, { RF_VIEW_TYPE } from './react-flow-view';

  
  export default class MindMap extends Plugin {
    vault: Vault;
    workspace: Workspace;
    mindmapView: MindmapView;
    settings: MindMapSettings;
    
    async onload() {
      console.log("Loading Mind Map plugin");
      this.vault = this.app.vault;
      this.workspace = this.app.workspace;
      this.settings = Object.assign({
        splitDirection: 'Horizontal',
        nodeMinHeight: 16,
        lineHeight: '1em',
        spacingVertical: 5,
        spacingHorizontal: 80,
        paddingX: 8
    }, await this.loadData());

      this.registerView(
        MM_VIEW_TYPE,
        (leaf: WorkspaceLeaf) =>
          (this.mindmapView = new MindmapView(this.settings, leaf, {path:this.activeLeafPath(this.workspace), basename: this.activeLeafName(this.workspace)}))
      );
      
      this.addCommand({
        id: 'app:markmap-preview',
        name: 'Preview the current note as a Mind Map',
        callback: () => this.markMapPreview(),
        hotkeys: []
      });

      this.addSettingTab(new MindMapSettingsTab(this.app, this));

      // POC: editable mind maps backed by the note's headings.
      this.registerView(ME_VIEW_TYPE, (leaf: WorkspaceLeaf) => new MindElixirView(leaf));
      this.registerView(SMM_VIEW_TYPE, (leaf: WorkspaceLeaf) => new SimpleMindMapView(leaf));
      this.registerView(RF_VIEW_TYPE, (leaf: WorkspaceLeaf) => new ReactFlowView(leaf));
      this.addCommand({
        id: 'poc-edit-mind-elixir',
        name: 'POC: Edit current note as mind map (Mind Elixir)',
        callback: () => this.openPocEditor(ME_VIEW_TYPE),
      });
      this.addCommand({
        id: 'poc-edit-simple-mind-map',
        name: 'POC: Edit current note as mind map (SimpleMindMap)',
        callback: () => this.openPocEditor(SMM_VIEW_TYPE),
      });
      this.addCommand({
        id: 'poc-edit-react-flow',
        name: 'POC: Edit current note as mind map (React Flow)',
        callback: () => this.openPocEditor(RF_VIEW_TYPE),
      });

    }

    markMapPreview() {
      const fileInfo = {path: this.activeLeafPath(this.workspace), basename: this.activeLeafName(this.workspace)};
      this.initPreview(fileInfo);
    }

    async initPreview(fileInfo: any) {
      if (this.app.workspace.getLeavesOfType(MM_VIEW_TYPE).length > 0) {
        return;
      }
      const preview = this.app.workspace.splitActiveLeaf(this.settings.splitDirection);
      const mmPreview = new MindmapView(this.settings, preview, fileInfo);
      preview.open(mmPreview);
    }
      
    async openPocEditor(viewType: string) {
      const file = this.app.workspace.getActiveFile();
      if (!file) {
        return;
      }
      const leaf = this.app.workspace.getLeaf('split', 'vertical');
      await leaf.setViewState({ type: viewType, state: { file: file.path }, active: true });
    }

    onunload() {
      console.log("Unloading Mind Map plugin");
    }

    activeLeafPath(workspace: Workspace) {
      return workspace.activeLeaf?.view.getState().file;
    }

    activeLeafName(workspace: Workspace) {
      return workspace.activeLeaf?.getDisplayText();
    }



}
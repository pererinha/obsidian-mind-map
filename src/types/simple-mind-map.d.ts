// simple-mind-map ships no type declarations on npm; the POC uses it untyped.
declare module 'simple-mind-map/index.js' {
    const MindMap: any;
    export default MindMap;
}
declare module 'simple-mind-map/src/plugins/Drag.js' { const Drag: any; export default Drag; }
declare module 'simple-mind-map/src/plugins/Select.js' { const Select: any; export default Select; }
declare module 'simple-mind-map/src/plugins/KeyboardNavigation.js' { const KeyboardNavigation: any; export default KeyboardNavigation; }
declare module '*.css' {
    const css: string;
    export default css;
}

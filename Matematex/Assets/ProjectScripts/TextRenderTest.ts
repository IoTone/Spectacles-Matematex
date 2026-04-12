// TextRenderTest.ts — find the right text component pattern for this Lens Studio version
//
// Usage:
//   1. Create a Text 3D object in the scene editor (one that you can SEE)
//   2. Drop this script on a SceneObject
//   3. Drag the working Text 3D SceneObject to the templateText slot
//   4. Run, read the console, and tell me which letters appear

@component
export class TextRenderTest extends BaseScriptComponent {

    @input
    @hint("The editor-created Text 3D SceneObject (the one you can see)")
    templateText: SceneObject;

    @input
    @hint("World z to place test texts")
    worldZ: number = 35.0;

    onAwake(): void {
        print("[TextRenderTest] ====== START ======");

        if (!this.templateText) {
            print("[TextRenderTest] FATAL: assign templateText (the working Text 3D)");
            return;
        }

        // Step 1: Enumerate components on the template
        this.enumerateComponents(this.templateText, "templateText");

        // Step 2: Recurse into children
        const childCount = this.templateText.getChildrenCount();
        print(`[TextRenderTest] templateText children: ${childCount}`);
        for (let i = 0; i < childCount; i++) {
            const child = this.templateText.getChild(i);
            this.enumerateComponents(child, `child[${i}] "${child.name}"`);
        }

        // Step 3: Try cloning the template via copyWholeHierarchy (SceneObject method)
        print("[TextRenderTest] --- Cloning via copyWholeHierarchy ---");
        try {
            const clone = (this.templateText as any).copyWholeHierarchy?.();
            if (clone) {
                clone.setParent(this.getSceneObject());
                clone.getTransform().setWorldPosition(new vec3(5, 0, this.worldZ));
                const setOk = this.tryUpdateTextContent(clone, "CLONE_RIGHT");
                print(`[TextRenderTest] copyWholeHierarchy clone at (5,0,${this.worldZ}); text update: ${setOk}`);
            } else {
                print(`[TextRenderTest] copyWholeHierarchy returned null/undefined`);
            }
        } catch (e: any) {
            print(`[TextRenderTest] copyWholeHierarchy FAILED: ${e.message || e}`);
        }

        // Step 4: Try copyComponent approach (manual clone)
        // Create a new SceneObject and copy each component from the template
        print("[TextRenderTest] --- Manual copyComponent approach ---");
        try {
            const target = global.scene.createSceneObject('TestText_CopyComp');
            target.setParent(this.getSceneObject());
            target.getTransform().setWorldPosition(new vec3(-5, 0, this.worldZ));

            // Iterate template components by trying known type names
            const tryTypes = ['Component.Text', 'Component.Text 3D', 'Component.Text3D', 'Text', 'Component.MaterialMeshVisual'];
            let copied = false;
            for (const t of tryTypes) {
                try {
                    const srcComp = this.templateText.getComponent(t as any);
                    if (srcComp) {
                        const newComp = (target as any).copyComponent?.(srcComp);
                        if (newComp) {
                            print(`[TextRenderTest] Copied component "${t}" -> new component on clone`);
                            // Update its text
                            try {
                                (newComp as any).text = "COPYCOMP";
                                print(`[TextRenderTest]   text updated to "COPYCOMP"`);
                            } catch (e) {
                                print(`[TextRenderTest]   text update failed: ${e}`);
                            }
                            copied = true;
                            break;
                        } else {
                            print(`[TextRenderTest] copyComponent("${t}") returned null`);
                        }
                    }
                } catch (e) { /* ignore */ }
            }
            if (!copied) {
                print(`[TextRenderTest] No component could be copied from template`);
            }
        } catch (e: any) {
            print(`[TextRenderTest] copyComponent test FAILED: ${e.message || e}`);
        }

        print("[TextRenderTest] ====== END ======");
    }

    private enumerateComponents(obj: SceneObject, label: string): void {
        print(`[TextRenderTest] ${label}: name="${obj.name}"`);

        // Try a wide variety of component type names
        const candidates = [
            'Component.Text',
            'Component.Text 3D',
            'Component.Text3D',
            'Component.TextRenderer',
            'Text',
            'Text 3D',
            'Component.Image',
            'Component.RenderMeshVisual',
            'Component.MaterialMeshVisual',
            'Component.SpriteVisual',
        ];

        for (const t of candidates) {
            try {
                const c = obj.getComponent(t as any);
                if (c) {
                    let typeName = '?';
                    try { typeName = (c as any).getTypeName(); } catch (e) {}
                    print(`[TextRenderTest]   getComponent("${t}") -> OK, typeName=${typeName}`);

                    // If it has a `text` property, dump useful info
                    const ca = c as any;
                    if (ca.text !== undefined) {
                        print(`[TextRenderTest]     text="${ca.text}" size=${ca.size}`);
                    }
                }
            } catch (e) { /* ignore */ }
        }

        // Try getComponentCount / getComponentByIndex if available
        try {
            const count = (obj as any).getComponentCount?.();
            if (typeof count === 'number') {
                print(`[TextRenderTest]   componentCount=${count}`);
                for (let i = 0; i < count; i++) {
                    const c = (obj as any).getComponentByIndex?.(i);
                    if (c) {
                        let typeName = '?';
                        try { typeName = c.getTypeName(); } catch (e) {}
                        print(`[TextRenderTest]   component[${i}]: typeName=${typeName}`);
                    }
                }
            }
        } catch (e) { /* ignore */ }
    }

    private tryUpdateTextContent(obj: SceneObject, newText: string): string {
        // Try to set the text via various component types
        const candidates = [
            'Component.Text',
            'Component.Text 3D',
            'Component.Text3D',
            'Text',
        ];
        for (const t of candidates) {
            try {
                const c = obj.getComponent(t as any) as any;
                if (c && c.text !== undefined) {
                    c.text = newText;
                    return `${t} (text set to "${newText}")`;
                }
            } catch (e) { /* ignore */ }
        }
        return 'no text component found';
    }
}

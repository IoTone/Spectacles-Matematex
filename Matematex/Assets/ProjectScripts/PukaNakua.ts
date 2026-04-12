// Working Lens Studio TypeScript Script: Four Floating 3D Texts with Wave Animation
// Creates FOUR vertically dispersed text objects in world space
// Each bobs up/down with a phase offset → creates a smooth vertical wave effect

@component
export default class FloatingTextScript2 extends BaseScriptComponent {

    @input
    amplitude: number = 0.4; // Bob height (meters) – tweak for more/less movement

    @input
    speed: number = 2.5; // Animation speed – higher = faster wave

    @input
    size: number = 0.35; // Text scale – adjust for visibility

    private textObjects: SceneObject[] = [];
    private basePositions: vec3[] = [];
    private phases: number[] = [];
    private accumulatedTime: number = 0.0;

    onAwake(): void {
        const texts = ["Hello", "Spectacles!", "Lens", "Studio!"];
        const colors = [
            new vec4(1.0, 0.4, 0.4, 1), // Light red
            new vec4(0.4, 1.0, 0.4, 1), // Light green
            new vec4(0.4, 0.4, 1.0, 1), // Light blue
            new vec4(1.0, 1.0, 0.4, 1)  // Light yellow
        ];
        const baseYs = [0.8, 1.4, 2.0, 2.6]; // Vertically dispersed (higher up for head-level view)
        const phaseOffsets = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5]; // Wave pattern

        for (let i = 0; i < texts.length; i++) {
            const obj = global.scene.createSceneObject("FloatingText" + i);
            
            const textComp: any = obj.createComponent("Component.Text");
            
            textComp.text = texts[i];
            textComp.size = this.size;
            textComp.textFill.color = colors[i];
            
            // Optional – uncomment if you want explicit bounds/alignment (may need type fixes)
            // textComp.worldSpaceRect = Rect.create(-1.2, 1.2, -0.6, 0.6);
            // textComp.horizontalAlignment = HorizontalAlignment.Center;
            // textComp.verticalAlignment = VerticalAlignment.Center;
            
            textComp.depthTest = true;
            
            const trans = obj.getTransform();
            const basePos = new vec3(0.0, baseYs[i], -1.8); // All centered, 1.8m forward
            trans.setLocalPosition(basePos);
            
            this.textObjects.push(obj);
            this.basePositions.push(basePos);
            this.phases.push(phaseOffsets[i]);
        }

        // Bind update event (required for frame-by-frame animation)
        const updateEvent = this.createEvent("UpdateEvent");
        updateEvent.bind(this.onUpdate.bind(this));
    }

    private onUpdate(event: UpdateEvent): void {
        this.accumulatedTime += event.getDeltaTime();
        
        for (let i = 0; i < this.textObjects.length; i++) {
            const yOffset = Math.sin(this.accumulatedTime * this.speed + this.phases[i]) * this.amplitude;
            
            const newPos = new vec3(
                this.basePositions[i].x,
                this.basePositions[i].y + yOffset,
                this.basePositions[i].z
            );
            
            this.textObjects[i].getTransform().setLocalPosition(newPos);
        }
    }
}
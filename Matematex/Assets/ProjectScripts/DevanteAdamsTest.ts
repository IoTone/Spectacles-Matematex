// Fully Working Lens Studio TypeScript Script: Floating 3D Text in World Space
// Key Fix: Explicitly create and bind UpdateEvent in onAwake() – required for class-based TS scripts!

@component
export default class FloatingTextScript extends BaseScriptComponent {

    @input
    amplitude: number = 1.0; // Large amplitude for VERY obvious up/down movement

    @input
    speed: number = 2.0;

    @input
    baseHeight: number = 1.5;

    @input
    size: number = 0.5; // Large text for easy visibility in AR

    private textObject: SceneObject | null = null;
    private basePosition!: vec3;
    private accumulatedTime: number = 0.0;

    onAwake(): void {
        print("FloatingTextScript: onAwake called – creating text");

        this.textObject = global.scene.createSceneObject("FloatingText");
        
        const textComp: any = this.textObject.createComponent("Component.Text");
        
        textComp.text = "Hello Spectacles! (Bobbing)";
        textComp.size = this.size;
        textComp.textFill.color = new vec4(1, 1, 1, 1);
        
        // Optional lines – safe to comment out if any type issues
        // textComp.worldSpaceRect = Rect.create(-1.5, 1.5, -0.6, 0.6);
        // textComp.horizontalAlignment = HorizontalAlignment.Center;
        // textComp.verticalAlignment = VerticalAlignment.Center;
        
        textComp.depthTest = true;
        
        const trans = this.textObject.getTransform();
        this.basePosition = new vec3(0.0, this.baseHeight, -2.0); // Closer/further for better view
        trans.setLocalPosition(this.basePosition);

        // Critical: Bind the update function to frame updates
        const updateEvent = this.createEvent("UpdateEvent");
        updateEvent.bind(this.onUpdate.bind(this));

        print("FloatingTextScript: UpdateEvent bound – animation should start now");
    }

    // This method will now be called every frame
    private onUpdate(event: UpdateEvent): void {
        if (!this.textObject) return;
        
        this.accumulatedTime += event.getDeltaTime();
        
        const yOffset = Math.sin(this.accumulatedTime * this.speed) * this.amplitude;
        
        const newPos = new vec3(
            this.basePosition.x,
            this.basePosition.y + yOffset,
            this.basePosition.z
        );
        
        this.textObject.getTransform().setLocalPosition(newPos);
    }
}
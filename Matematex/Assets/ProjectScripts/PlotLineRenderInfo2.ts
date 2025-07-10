import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import {Circle} from "../RuntimeGizmos/RuntimeGizmos/Circle";
@component
export class PlotLineRenderInfo2 extends BaseScriptComponent {
    // TODO: Switch this to be a dynamic asset loaded from the scene
    @input
    @hint("Choose an Interactable Mesh - P1")
    public interactableMeshP1!: Interactable;

    @input
    @hint("Choose an Interactable Mesh - P2")
    public interactableMeshP2!: Interactable;
    
    @input
    @hint("Choose a Text Scene Object")
    public functionText: Text;
    
    @input
    @hint("Choose a Vector Parens Text Scene Object")
    public vector1Parens: Text;
    
    @input
    @hint("Choose a Vector Component Text Scene Object")
    public vector1Text: Text;
    
    @input
    @hint("Choose a Vector Parens Text Scene Object")
    public vector2Parens: Text;
    
    @input
    @hint("Choose a Vector Component Text Scene Object")
    public vector2Text: Text;
    
    onAwake() {
        this.createEvent("OnStartEvent").bind(() => {
            this.onStart()
        })
        
    }
    
    onStart() {
        this.setupCallbacks();
    }
    
    private setupCallbacks = (): void => {
        this.interactableMeshP1.onTriggerEnd.add(this.onTriggerEndEvent);
        this.interactableMeshP2.onTriggerEnd.add(this.onTriggerEndEvent);
    }

    // Convert flat number array to vec3 array
    private numberArrayToVec3Array(numbers: number[]): vec3[] {
        const vec3Array: vec3[] = [];
        if (numbers.length % 3 !== 0) {
            print(`Error: Number array length (${numbers.length}) is not a multiple of 3, cannot convert to vec3.`);
            return vec3Array;
        }

        for (let i = 0; i < numbers.length; i += 3) {
            const x = numbers[i];
            const y = numbers[i + 1];
            const z = numbers[i + 2];
            if (isNaN(x) || isNaN(y) || isNaN(z)) {
                print(`Warning: Invalid vec3 at index ${i / 3}: (${x}, ${y}, ${z}). Skipping.`);
                continue;
            }
            vec3Array.push(new vec3(x, y, z));
        }
        return vec3Array;
    }

    // Compute normal from three vertices using cross product
    private computeNormalFromVertices(v0: vec3, v1: vec3, v2: vec3): vec3 | null {
        const edge1 = v1.sub(v0);
        const edge2 = v2.sub(v0);
        const normal = edge1.cross(edge2);
        const length = normal.length;
        if (isNaN(length) || length < 0.0001) {
            print("Warning: Cross product produced invalid normal (degenerate triangle or collinear points).");
            return null;
        }
        return normal.normalize();
    }
    
        
    private onTriggerEndEvent = (): void => {
        // interactableMesh
        print("End trigger");
        
        let computeLinePointDebugInfo = (obj : Interactable) : vec3 => {

            const sceneObj = obj.sceneObject;
                
           
            var meshVisual = sceneObj.getComponent("Component.RenderMeshVisual");
            if(meshVisual)
            {
            	// ...
                print("Mesh visual found");
                
                // Get the transform
                const transform = meshVisual.getTransform();
                
                const mesh = meshVisual.mesh;
                
                const worldPos = transform.getWorldPosition();
                const localPos = transform.getLocalPosition();
                print(
                  "PlotRenderInfo " +
                    " - World: (" +
                    worldPos.x.toFixed(2) +
                    ", " +
                    worldPos.y.toFixed(2) +
                    ", " +
                    worldPos.z.toFixed(2) +
                    ") Local: (" +
                    localPos.x.toFixed(2) +
                    ", " +
                    localPos.y.toFixed(2) +
                    ", " +
                    localPos.z.toFixed(2) +
                    ")"
                );
                
                return worldPos;
            }
        }
              
        print("DebugInfo P1:");
        let vecp1 = computeLinePointDebugInfo(this.interactableMeshP1);
        
        print("DebugInfo P2:");
        let vecp2 = computeLinePointDebugInfo(this.interactableMeshP2);
        
        let dvec = vecp1.sub(vecp2);
            
            
        this.vector1Parens.enabled = true;
        this.vector2Parens.enabled = true;
        this.vector1Text.enabled = true;
        this.vector2Text.enabled = true;
        this.functionText.text = `r=        +λ`;
        // this.vector1Text.text = `${worldverts[3].x.toFixed(2)}\n${worldverts[3].y.toFixed(2)}\n${worldverts[3].z.toFixed(2)}`;
        this.vector1Text.text = `${vecp1.x.toFixed(2)}\n${vecp1.y.toFixed(2)}\n${vecp1.z.toFixed(2)}`;
        this.vector2Text.text = `${dvec.x.toFixed(2)}\n${dvec.y.toFixed(2)}\n${dvec.z.toFixed(2)}`;

        
        
    }
}

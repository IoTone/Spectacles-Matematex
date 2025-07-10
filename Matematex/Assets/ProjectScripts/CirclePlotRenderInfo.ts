import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import {Circle} from "../RuntimeGizmos/RuntimeGizmos/Circle";
@component
export class CirclePlotRenderInfo extends BaseScriptComponent {
    // TODO: Switch this to be a dynamic asset loaded from the scene
    @input
    @hint("Choose an Interactable Circle Mesh")
    public interactableMesh!: Interactable;

    @input
    @hint("Choose an Interactable Circle Mesh, should be same as above")
    public interactableCircle!: Circle;
    
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
    @hint("Choose a Vector Component Text Scene Object")
    public operation1Text: Text;
    
    @input
    @hint("Choose a Vector Parens Text Scene Object")
    public vector2Parens: Text;
    
    @input
    @hint("Choose a Vector Component Text Scene Object")
    public vector2Text: Text;
    
    @input
    @hint("Choose a Vector Component Text Scene Object")
    public operation2Text: Text;
    
    @input
    @hint("Choose a Vector Parens Text Scene Object")
    public vectorOCParens: Text;
    
    @input
    @hint("Choose a Vector Component Text Scene Object")
    public vectorOCText: Text;
    
    @input
    @hint("Choose a Vector Brackets Text Scene Object")
    public vectorBrackets: Text;
    
    private centerPos: vec3;
    
    onAwake() {
        this.createEvent("OnStartEvent").bind(() => {
            this.onStart()
        })
        
    }
    
    onStart() {
        this.setupCallbacks();
    }
    
    private setupCallbacks = (): void => {
        if (!this.interactableMesh) {
            print("interactableMesh is not valid");    
        } else {
            print(this.interactableMesh);
            this.interactableMesh.onTriggerEnd.add(this.onTriggerEndEvent)
            // this.interactableMesh.onInteractorTriggerEnd.add(this.onTriggerEndEvent);
        }
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
        const sceneObj = this.interactableMesh.sceneObject;
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
            
            // Get the radius info
            let R =  this.interactableCircle.radius;
            // this.transform = sceneObject.getTransform();
            
            
            // Extract vertex positions using attribute "position"
            const vertexData: number[] = mesh.extractVerticesForAttribute("position") as number[];
            if (!vertexData || vertexData.length === 0) {
                print("Error: Failed to extract vertex positions from RenderMesh or mesh has no vertices.");
                return;
            }
            
            
            // Extract indices
            const indices: number[] = mesh.extractIndices();
            if (!indices || indices.length === 0) {
                print("Error: Failed to extract indices from RenderMesh or mesh has no indices.");
                return;
            }
        
            // Validate indices length (must be multiple of 3 for triangles)
            if (indices.length % 3 !== 0) {
                print(`Warning: Indices length (${indices.length}) is not a multiple of 3, which is unexpected for triangle meshes.`);
            }
        
            // Log total number of indices and triangles
            const indexCount: number = indices.length;
            const triangleCount: number = Math.floor(indexCount / 3);
            print(`Found ${indexCount} indices, forming ${triangleCount} triangles in RenderMesh.`);
        
            
            // Get world transform matrix
            const worldTransform: mat4 = transform.getWorldTransform();
    
            // Fallback: Compute normal from vertex positions
            const positionData: number[] = mesh.extractVerticesForAttribute("position") as number[];
            if (!positionData || positionData.length < 12) { // 4 vertices * 3 components
                print("Error: Failed to extract vertex positions or insufficient vertices for a plane.");
                return;
            }
    
            const vertices: vec3[] = this.numberArrayToVec3Array(positionData);
            if (vertices.length <= 3) {
                print(`Error need 3 points on the plane: ${vertices} ${vertices.length}`);
                // vertices.length;
            } else {
                print(`Found 3+ points on a plane: ${vertices} ${vertices.length}`);
            }
    
            // --- Get World Coordinates of Four Corners ---
            print("World coordinates of plane corners:");
            const worldverts: vec3[] = [];
            for (let i = 0; i < vertices.length; i++) {
                // Transform local position to world space
                const localPos: vec3 = vertices[i];
                const worldPos: vec3 = worldTransform.multiplyPoint(localPos);
                worldverts.push(worldPos);
                print(`Corner ${i}: (${worldPos.x}, ${worldPos.y}, ${worldPos.z})`);
            }
            
            let centerTransform = this.interactableCircle.centerObject.getTransform();
            this.centerPos = centerTransform.getWorldPosition();
            let OC = this.centerPos;
            let A = worldverts[0];
            let B = worldverts[3];
            let CA = this.centerPos.sub(A);
            let CB = this.centerPos.sub(B);
            let CAdivR = new vec3(A.x/R, A.y/R, A.z/3);
            let normal = CA.cross(CA.cross(CB));
            let nlength = Math.sqrt(Math.pow(normal.x, 2) + Math.pow(normal.y, 2) + Math.pow(normal.z, 2));
            let ndivnlength = new vec3(normal.x/nlength, normal.y/nlength, normal.z/nlength);
            
            print(`new normal (${normal.x.toFixed(2)}, ${normal.y.toFixed(2)}, ${normal.z.toFixed(2)})`);
            print(`new ndivnlength (${ndivnlength.x.toFixed(2)}, ${ndivnlength.y.toFixed(2)}, ${ndivnlength.z.toFixed(2)})`);
            
            
            // const normal2 = this.computeNormalFromVertices(worldverts[0], worldverts[1], worldverts[2]);
            // print(`new normal (${normal.x.toFixed(2)}, ${normal.y.toFixed(2)}, ${normal.z.toFixed(2)})`);
            // print(`new normal2 (${normal2.x.toFixed(2)}, ${normal2.y.toFixed(2)}, ${normal2.z.toFixed(2)})`);
                     
            
            // const solved = this.solveForValueOfAPlane(normal2, worldverts[3]);
            // print(`solved = ${solved}`);
            // TODO: reposition the text to be above the plane
            // this.functionText.text = `${normal2.x.toFixed(2)}x+${normal2.y.toFixed(2)}y+${normal2.z.toFixed(2)}z=${solved.toFixed(2)}`;
            this.vector1Parens.enabled = true;
            this.vector2Parens.enabled = true;
            this.vectorOCParens.enabled = true;
            this.vector1Text.enabled = true;
            this.vector2Text.enabled = true;
            this.operation1Text.enabled = true;
            this.operation2Text.enabled = true;
            this.vectorOCText.enabled = true;
            this.vectorBrackets.enabled = true;
            this.functionText.text = `v=          + ${R}                `;
            this.vectorOCText.text = `${OC.x.toFixed(2)}\n${OC.y.toFixed(2)}\n${OC.z.toFixed(2)}`;
            this.vector1Text.text = `${CAdivR.x.toFixed(2)}\n${CAdivR.y.toFixed(2)}\n${CAdivR.z.toFixed(2)}`;
            this.vector2Text.text = `${ndivnlength.x.toFixed(2)}\n${ndivnlength.y.toFixed(2)}\n${ndivnlength.z.toFixed(2)}`;
            /*
            if (indices && indices.length >= 6) { // >= 6 for 2 triangles
                print(`Indices: [${indices.join(", ")}]`);
            }
            */
            
        }
    }
}

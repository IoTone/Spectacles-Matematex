import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";

@component
export class PlotLineRenderInfo extends BaseScriptComponent {
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
    
    onAwake() {
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
    
    // DEPR
    // 
    // {x: -0.5, y: 0.5, z: 0.5},{x: 0.5, y: 0.5, z: 0.5},{x: 0.5, y: 0.5, z: -0.5}
    // returns a vec3 (normal)
    private normalOfPlane(vertices: vec3[]) : vec3 | null {
    	// x , y , z
        // const vec3Array: vec3[] = [];
        // var vec = new vec3(x, y, z)
    	const a = vertices[0]
    	const b = vertices[1];
    	const c = vertices[2];
        let result = [
    		(
    			((b.y-a.y)*(c.z-a.z))-((b.z-a.z)*(c.y-a.y)) // X
    		),
    		(
    			((b.z-a.z)*(c.x-a.x))-((b.x-a.x)*(c.z-a.z)) // Y
    		),
    		(
    			((b.x-a.x)*(c.y-a.y))-((b.y-a.y)*(c.x-a.x)) // Z
    		)
        ];
    	return new vec3(result[0], result[1], result[2]);

    }
    
    // returns a number
    private solveForValueOfAPlane(normal: vec3, pointinplane: vec3) : number {
    	// x , y , z
        let a = pointinplane;
    	
    	return normal.x*a.x+normal.y*a.y+normal.z*a.z;
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
                
                // Extract vertex positions using attribute "position"
                /*                
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
                
                */
                 // compute from 3 points
                
                /*
                const normal2 = this.computeNormalFromVertices(worldverts[0], worldverts[1], worldverts[2]);
                // print(`new normal (${normal.x.toFixed(2)}, ${normal.y.toFixed(2)}, ${normal.z.toFixed(2)})`);
                print(`new normal2 (${normal2.x.toFixed(2)}, ${normal2.y.toFixed(2)}, ${normal2.z.toFixed(2)})`);
                         
                
                const solved = this.solveForValueOfAPlane(normal2, worldverts[3]);
                print(`solved = ${solved}`);
                */
                // TODO: reposition the text to be above the plane
                // this.functionText.text = `${normal2.x.toFixed(2)}x+${normal2.y.toFixed(2)}y+${normal2.z.toFixed(2)}z=${solved.toFixed(2)}`; 
                
                return worldPos;
            }
        }
        
        print("DebugInfo P1:");
        let vecp1 = computeLinePointDebugInfo(this.interactableMeshP1);
        
        print("DebugInfo P2:");
        let vecp2 = computeLinePointDebugInfo(this.interactableMeshP2);
        
        let dvec = vecp1.sub(vecp2);
        
        let getFormattedVectorComponentWithOperator = (d: number) : string => {
            d = d*-1;
            if (d == 0) {
                return "";
            } else if (d > 0) {
                return `+${d.toFixed(2)}`;
            } else {
                return `${d.toFixed(2)}`;
            }
        }
        let x0 = getFormattedVectorComponentWithOperator(vecp1.x);
        let y0 = getFormattedVectorComponentWithOperator(vecp1.y);
        let z0 = getFormattedVectorComponentWithOperator(vecp1.z);
        let txt = `d=PQ=${dvec}, P = (x1​,y1​,z1​)\n\n(x${x0})/${dvec.x.toFixed(2)})=(y${y0})/${dvec.y.toFixed(2)})=(z${z0})/${dvec.z.toFixed(2)})`;
        print(txt);
        this.functionText.text = txt;
        
    }
}

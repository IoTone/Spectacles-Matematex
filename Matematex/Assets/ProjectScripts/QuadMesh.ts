@component
export class QuadMesh extends BaseScriptComponent {
    @input
    @hint("Material to apply to the 3D line mesh")
    public material!: Material;
    private meshVisual!: RenderMeshVisual;
    private builder!: MeshBuilder;
    
    
    onAwake() {

        this.builder = new MeshBuilder([
            { name: "position", components: 3 },
            { name: "normal", components: 3 },
            { name: "texture0", components: 2 },
        ]);
        
        this.builder.topology = MeshTopology.Triangles;
        this.builder.indexType = MeshIndexType.UInt16;
        
        var left = -.5;
        var right = .5;
        var top = .5;
        var bottom = -.5;
        
        this.builder.appendVerticesInterleaved([
            // Position         Normal      UV       Index
            left, top, 0,       0, 0, 1,    0, 1,    // 0
            left, bottom, 0,    0, 0, 1,    0, 0,    // 1
            right, bottom, 0,   0, 0, 1,    1, 0,    // 2
            right, top, 0,      0, 0, 1,    1, 1,    // 3
        ]);
        
        this.builder.appendIndices([
            0,1,2, // First Triangle
            2,3,0, // Second Triangle
        ]);
        
        this.meshVisual = this.sceneObject.createComponent(
          "Component.RenderMeshVisual"
        );
        this.meshVisual.mainMaterial = this.material;
        
        if(this.builder.isValid()){
            this.meshVisual.mesh = this.builder.getMesh();
            this.builder.updateMesh();
        } else{
            print("Mesh data invalid!");
        }
    }
    
}



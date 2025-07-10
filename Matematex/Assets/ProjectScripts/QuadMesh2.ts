// QuadMesh2.ts
@component
export class QuadMesh extends BaseScriptComponent {
    @input
    @hint("Material to apply to the 3D line mesh")
    public material!: Material;

    private meshVisual!: RenderMeshVisual;
    private builder!: MeshBuilder;

    onAwake() {
        // Initialize RenderMeshVisual
        this.meshVisual = this.sceneObject.createComponent("Component.RenderMeshVisual");

        // Initialize MeshBuilder with position and normal attributes
        this.builder = new MeshBuilder([
            { name: "position", components: 3 },
            { name: "normal", components: 3 },
            { name: "texture0", components: 2 },
        ]);

        // Define vertices and normals for two quads (8 vertices, 24 floats for positions, 24 for normals)
        // Quad 1: Centered at (0, 0, 0), size 2x2
        // Quad 2: Centered at (4, 0, 0), size 2x2 (offset by 4 units on x-axis for 2-unit gap)
        var vertices = [
            // Quad 1 positions
            -1, -1, 0, // BL
             1, -1, 0, // BR
             1,  1, 0, // TR
            -1,  1, 0, // TL
            // Quad 2 positions
             3, -1, 0, // BL
             5, -1, 0, // BR
             5,  1, 0, // TR
             3,  1, 0  // TL
        ];
        var normals = [
            // Quad 1 normals (facing +Z)
            0, 0, 1,
            0, 0, 1,
            0, 0, 1,
            0, 0, 1,
            // Quad 2 normals (facing +Z)
            0, 0, 1,
            0, 0, 1,
            0, 0, 1,
            0, 0, 1
        ];

        // Define indices for two quads (4 triangles, 12 indices)
        var indices = [
            // Quad 1
            0, 1, 2, // BL, BR, TR
            0, 2, 3, // BL, TR, TL
            // Quad 2
            4, 5, 6, // BL, BR, TR
            4, 6, 7  // BL, TR, TL
        ];

        // Set up mesh
        this.builder.appendVerticesInterleaved(vertices.concat(normals));
        this.builder.appendIndices(indices);
        this.builder.topology = MeshTopology.Triangles;

        // Log mesh state for debugging
        print(`Vertices: ${vertices.length / 3}, Normals: ${normals.length / 3}, Indices: ${indices.length}`);
        print(`Mesh valid: ${this.builder.isValid()}`);

        // Validate and assign mesh
        if (this.builder.isValid()) {
            this.meshVisual.mesh = this.builder.getMesh();
            this.builder.updateMesh();
        } else {
            print("Mesh data invalid!");
        }

        // Apply material
        if (this.material) {
            this.meshVisual.mainMaterial = this.material;
        }
    }
}
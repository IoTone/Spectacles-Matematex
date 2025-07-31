@component
export class GridOfQuads extends BaseScriptComponent {
  // @input('MeshVisual')
  // private meshVisual!: MeshVisual;
  @input
  @hint("Material to apply to the 3D line mesh")
  public material!: Material;
  private meshVisual!: RenderMeshVisual;
    
  onAwake() {
    const M = 50; // Number of quads along each axis
    const S = 2; // Size of each quad
    const D = 4 / 7; // Space between quads, calculated for 128x128
    const step = S + D;

    const vertices = [];
    for (let j = 0; j <= M; j++) {
      for (let i = 0; i <= M; i++) {
        const x = i * step;
        const y = j * step;
        const z = 0;
        vertices.push(x, y, z);
      }
    }

    const indices = [];
    for (let j = 0; j < M; j++) {
      for (let i = 0; i < M; i++) {
        const BL = i + j * (M + 1);
        const BR = (i + 1) + j * (M + 1);
        const TR = (i + 1) + (j + 1) * (M + 1);
        const TL = i + (j + 1) * (M + 1);
        indices.push(BL, BR, TR, BL, TR, TL);
      }
    }

    const meshBuilder = new MeshBuilder([{ name: "position", components: 3 }]);
    meshBuilder.appendVerticesInterleaved(vertices);
    // meshBuilder.updateIndices(indices);
    meshBuilder.appendIndices(indices);
    // meshBuilder.updateMesh();
    meshBuilder.topology = MeshTopology.Triangles;
    
    this.meshVisual = this.sceneObject.createComponent(
          "Component.RenderMeshVisual"
    );
        
    this.meshVisual.mainMaterial = this.material;
        
    if(meshBuilder.isValid()){
        this.meshVisual.mesh = meshBuilder.getMesh();
        meshBuilder.updateMesh();
    } else{
        print("Mesh data invalid!");
    }
  }
}
// scatterPlot.ts
@component
export class ScatterPlot extends BaseScriptComponent {
  // @input('MeshVisual')
  // private meshVisual!: MeshVisual;
  @input
  @hint("Material to apply to the 3D line mesh")
  public material!: Material;
  
  @input("vec3", "{1, 1, 0}")
  @widget(new ColorWidget())
  public _color: vec3 = new vec3(1, 1, 0);
    
  private meshVisual!: RenderMeshVisual;
    
  onAwake() {
    const data = Array.from({ length: 20 }, () => ({
      x: (Math.random() - 0.5) * 10,
      y: (Math.random() - 0.5) * 10,
      z: (Math.random() - 0.5) * 10
    }));

    const meshBuilder = new MeshBuilder([{ name: "position", components: 3 }]);
    meshBuilder.topology = MeshTopology.Points;

    const vertices = [];
    data.forEach(point => {
      vertices.push(point.x, point.y, point.z);
    });
    meshBuilder.appendVerticesInterleaved(vertices);

    for (let i = 0; i < data.length; i++) {
      meshBuilder.appendIndices([i]);
    }
    meshBuilder.updateMesh();
    // this.meshVisual.mesh = meshBuilder.getMesh();
    this.setupMeshVisual();
  }
    
  private setupMeshVisual(): void {
    this.meshVisual = this.sceneObject.createComponent(
      "Component.RenderMeshVisual"
    );
    
    this.updateMaterial();
  }

    
  private updateMaterial(): void {
    if (this.meshVisual) {
      if (this.material) {
        this.meshVisual.mainMaterial = this.material;
        try {
          this.material.mainPass.baseColor = new vec4(
            this._color.x,
            this._color.y,
            this._color.z,
            1.0
          );
          print(
            "ScatterPlot: Material applied successfully with color (" +
              this._color.x +
              ", " +
              this._color.y +
              ", " +
              this._color.z +
              ")"
          );
        } catch (e) {
          print("ScatterPlot: Could not update material color - " + e);
        }
      } else {
        print(
          "ScatterPlot: Warning - No material assigned. Please assign a material in the Inspector."
        );
      }
    }
  }
}
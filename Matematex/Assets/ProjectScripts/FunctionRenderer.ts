// FunctionRenderer.ts

// Type alias for algebraic function
type AlgebraicFunction = (x: number, y?: number) => number | [number, number, number];

@component
export class FunctionRenderer extends BaseScriptComponent {
  // @input('MeshVisual')
  // private meshVisual: Component.MeshVisual;
  private meshVisual!: RenderMeshVisual;

  @input
  private renderMode: string = 'volume'; // 'volume' or 'line'

  @input
  private resolution: number = 50; // Grid size (volume) or points (line)

  @input
  private scale: number = 1.0; // Scale function output

  @input('vec4')
  private color: vec4 = new vec4(0, 1, 0, 1); // Green

  // Function parameters (updated via MQTT)
  public funcType: 'surface' | 'curve' = 'surface';
  public func: AlgebraicFunction = (x, y) => Math.sin(x) * Math.cos(y!); // Default: z = sin(x) * cos(y)

  private vertices: number[] = [];
  private indices: number[] = [];
  private meshBuilder!: MeshBuilder;

  // Predefined functions to avoid eval
  private static readonly functionMap: { [key: string]: AlgebraicFunction } = {
    'sin_cos': (x, y) => Math.sin(x) * Math.cos(y!),
    'wave': (x, y) => Math.sin(Math.sqrt(x * x + y! * y!)),
    'helix': (t) => [Math.cos(t), Math.sin(t), t * 0.5],
    'spiral': (t) => [t * Math.cos(t), t * Math.sin(t), t * 0.2]
  };

  onAwake() {
    this.initializeMesh();
    this.updateMesh();
    this.applyMaterial();
  }

  onUpdate() {
    this.updateMesh(); // Animate using getDeltaTime() if needed
  }

  // Update function via MQTT
  public setFunction(type: 'surface' | 'curve', func: string | AlgebraicFunction) {
    this.funcType = type;
    try {
      if (typeof func === 'string') {
        const predefinedFunc = FunctionRenderer.functionMap[func];
        if (!predefinedFunc) {
          throw new Error(`Unknown function: ${func}`);
        }
        this.func = predefinedFunc;
      } else {
        const testResult = func(0, type === 'surface' ? 0 : undefined);
        if (type === 'surface' && typeof testResult !== 'number') {
          throw new Error('Surface function must return a number');
        }
        if (type === 'curve' && (!Array.isArray(testResult) || testResult.length !== 3)) {
          throw new Error('Curve function must return [number, number, number]');
        }
        this.func = func;
      }
      this.updateMesh();
    } catch (err) {
      print(`Function set error: ${err}`);
    }
  }

  private initializeMesh() {
    this.meshBuilder = new MeshBuilder([{ name: 'position', components: 3 }]);
    this.updateTopology();
  }

  private updateTopology() {
    this.meshBuilder.topology =
      this.renderMode === 'volume' ? MeshTopology.Triangles : MeshTopology.LineStrip;
  }

  private updateMesh() {
    if (!this.meshBuilder) return;

    this.vertices = [];
    this.indices = [];

    if (this.renderMode === 'volume' && this.funcType === 'surface') {
      this.generateSurface();
    } else if (this.renderMode === 'line' && this.funcType === 'curve') {
      this.generateCurve();
    } else {
      print(`Invalid combination: renderMode=${this.renderMode}, funcType=${this.funcType}`);
      return;
    }

    /*
    // Update vertices and indices
    this.meshBuilder.setAttributeData('position', new Float32Array(this.vertices));
    this.meshBuilder.setIndexData(new Uint16Array(this.indices));

    // Assign mesh to MeshVisual
    this.meshVisual.setMesh(this.meshBuilder.getMesh());
    */
  }

  private generateSurface() {
    const n = Math.max(2, Math.min(this.resolution, 100)); // Clamp resolution
    const range = 5.0; // x, y from -5 to 5

    // Generate vertices
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = (i / (n - 1)) * 2 * range - range;
        const y = (j / (n - 1)) * 2 * range - range;
        let z: number;
        try {
          const result = this.func(x, y);
          z = typeof result === 'number' ? result * this.scale : 0;
        } catch (err) {
          print(`Function error at x=${x}, y=${y}: ${err}`);
          z = 0;
        }
        this.vertices.push(x, y, z);
      }
    }

    // Generate triangle indices
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < n - 1; j++) {
        const idx = i * n + j;
        this.indices.push(idx, idx + 1, idx + n);
        this.indices.push(idx + 1, idx + n + 1, idx + n);
      }
    }
  }

  private generateCurve() {
    const n = Math.max(2, Math.min(this.resolution, 200)); // Clamp resolution
    const range = 5.0; // t from -5 to 5

    // Generate vertices
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1)) * 2 * range - range;
      let x: number, y: number, z: number;
      try {
        const result = this.func(t);
        if (Array.isArray(result) && result.length === 3) {
          [x, y, z] = result.map(v => v * this.scale);
        } else {
          x = y = z = 0;
        }
      } catch (err) {
        print(`Function error at t=${t}: ${err}`);
        x = y = z = 0;
      }
      this.vertices.push(x, y, z);
    }

    // LineStrip indices
    for (let i = 0; i < n; i++) {
      this.indices.push(i);
    }
}
  private applyMaterial() {
    /*
    const material = this.meshVisual.getMaterial(0);
    if (material) {
      material.mainPass.baseColor = this.color;
    } */
  }
}
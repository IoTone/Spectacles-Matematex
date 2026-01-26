@component
export default class PodLaTeXLens2 extends BaseScriptComponent {

    @input
    private containerName: string = "LatexContainer"; // Name for the parent container

    @input
    private baseSize: number = 0.15; // Base text size in meters

    @input
    private lineSpacing: number = 0.2; // Vertical spacing between lines (meters)

    @input
    private textColor: vec4 = new vec4(1, 1, 1, 1); // White

    private container: SceneObject | null = null;

    onAwake(): void {
        // Create a container object to hold all text lines
        this.container = global.scene.createSceneObject(this.containerName);

        // Example LaTeX input (align* environment)
        const latexInput = `
        % The following shows typesetting power of LaTeX:
        \\begin{align}
            E_0 &= mc^2 \\\\
            E &= \\frac{mc^2}{\sqrt{1-\frac{v^2}{c^2}}}
        \\end{align} 
        \\begin{align*}
            x^2 + y^2 &= 1 \\\\
            y &= \\sqrt{1 - x^2}
        \\end{align*}
        `.trim();

        // Starting position (tweak as needed – in front/up from camera)
        const startPos = new vec3(0, 1.5, -1.5);

        this.renderLatexLines(latexInput, startPos);
    }

    // Simple renderer: Split on \\\\ for multi-line math, create one text object per line
    private renderLatexLines(input: string, startPos: vec3): void {
        if (!this.container) return;

        // Clean and split into lines (handle \\\\ as line break)
        const rawLines = input
            .replace(/\\begin{align\*\}|\\end{align\*\}/g, '') // Strip environment
            .split('\\\\')
            .map(l => l.trim())
            .filter(l => l.length > 0);

        let currentY = startPos.y;

        for (const line of rawLines) {
            print("parsing: " + line);
            // Create new SceneObject per line
            const textObj = global.scene.createSceneObject("LatexLine");
            textObj.setParent(this.container); // Parent for organization/cleanup

            const textComp: any = textObj.createComponent("Component.Text");

            // Basic setup (tweak for math symbols – Component.Text supports Unicode/superscript limitedly)
            textComp.text = line;
            textComp.size = this.baseSize;
            textComp.textFill.color = this.textColor;
            textComp.depthTest = true;

            // Optional: Bounds for better centering (use Rect.create if no type issues)
            // textComp.worldSpaceRect = Rect.create(-1.0, 1.0, -0.3, 0.3);

            textComp.horizontalAlignment = HorizontalAlignment.Center;
            textComp.verticalAlignment = VerticalAlignment.Center;

            // Position: Center X/Z, stack downward on Y
            const trans = textObj.getTransform();
            trans.setLocalPosition(new vec3(startPos.x, currentY, startPos.z));

            // Move down for next line
            currentY -= this.lineSpacing;
        }
    }
}
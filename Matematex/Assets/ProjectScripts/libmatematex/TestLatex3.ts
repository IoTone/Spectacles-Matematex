@component
export default class PodLaTeXLens3 extends BaseScriptComponent {

    @input
    private containerName: string = "LatexContainer";

    @input
    private baseSize: number = 0.15;

    @input
    private lineSpacing: number = 0.25;

    @input
    private textColor: vec4 = new vec4(1, 1, 1, 1);

    @input
    private sqrtRadicalScale: number = 1.6;

    @input
    private sqrtContentScale: number = 0.9;

    @input
    private sqrtBarThickness: number = 0.15;

    @input
    private sqrtDashMultiplier: number = 2.2;

    @input
    private sqrtLeftOffset: number = -0.6;

    @input
    private sqrtGroupOffset: number = 0.1;

    private container: SceneObject | null = null;

    onAwake(): void {
        this.container = global.scene.createSceneObject(this.containerName);

        const latexInput = `
The following shows typesetting power of LaTeX:
\\begin{align}
E_0 &= mc^2 \\\\
E &= \\frac{mc^2}{\\sqrt{1-\\frac{v^2}{c^2}}}
\\end{align}
\\begin{align*}
x^2 + y^2 &= 1 \\\\
y &= \\sqrt{1 - x^2}
\\end{align*}
        `.trim();

        const startPos = new vec3(0, 1.8, -1.5);

        this.renderLatexLines(latexInput, startPos);
    }

    private renderLatexLines(input: string, startPos: vec3): void {
        if (!this.container) return;

        const rawLines = input
            .replace(/\\begin{align\*}|\\end{align\*}|\\begin{align}|\\end{align}/g, '')
            .split('\\\\\\\\')
            .map(l => l.trim())
            .filter(l => l.length > 0);

        let currentY = startPos.y;

        for (let line of rawLines) {
            print("Parsing line: " + line);

            line = line
                .replace(/\^2/g, '²')
                .replace(/\^3/g, '³')
                .replace(/E_0/g, 'E₀')
                .replace(/x\^2/g, 'x²')
                .replace(/y\^2/g, 'y²')
                .replace(/mc\^2/g, 'mc²')
                .replace(/v\^2/g, 'v²')
                .replace(/c\^2/g, 'c²');

            const sqrtRegex = /(.*)&=\s*\\sqrt\{([^}]*)\}/;
            const match = line.match(sqrtRegex);

            if (match) {
                const leftText = match[1].trim() + " =";
                const sqrtContent = match[2].trim();

                this.createTextBlock(
                    this.container,
                    leftText,
                    new vec3(startPos.x + this.sqrtLeftOffset, currentY, startPos.z),
                    1.0,
                    HorizontalAlignment.Right
                );

                this.renderComposedSqrt(
                    this.container,
                    sqrtContent,
                    new vec3(startPos.x + this.sqrtGroupOffset, currentY, startPos.z)
                );
            } else {
                this.createTextBlock(
                    this.container,
                    line,
                    new vec3(startPos.x, currentY, startPos.z),
                    1.0,
                    HorizontalAlignment.Center
                );
            }

            currentY -= this.lineSpacing;
        }
    }

    private createTextBlock(
        parent: SceneObject,
        text: string,
        pos: vec3,
        scale: number = 1.0,
        hAlign: HorizontalAlignment = HorizontalAlignment.Center
    ): void {
        const obj = global.scene.createSceneObject("TextBlock");
        obj.setParent(parent);

        const comp: any = obj.createComponent("Component.Text");
        comp.text = text;
        comp.size = this.baseSize * scale;
        comp.textFill.color = this.textColor;
        comp.depthTest = true;
        comp.horizontalAlignment = hAlign;
        
        // Fixed: Use VerticalAlignment.Center (Lens Studio enum uses "Center", not "Middle")
        comp.verticalAlignment = VerticalAlignment.Center;

        obj.getTransform().setLocalPosition(pos);
    }

    private renderComposedSqrt(parent: SceneObject, content: string, basePos: vec3): void {
        const group = global.scene.createSceneObject("SqrtGroup");
        group.setParent(parent);
        group.getTransform().setLocalPosition(basePos);

        // Radical √
        this.createTextBlock(
            group,
            "√",
            new vec3(0, -this.baseSize * 0.1, 0),
            this.sqrtRadicalScale,
            HorizontalAlignment.Left
        );

        // Overbar
        const dashCount = Math.max(8, Math.ceil(content.length * this.sqrtDashMultiplier));
        this.createTextBlock(
            group,
            "─".repeat(dashCount),
            new vec3(this.baseSize * 0.4, this.baseSize * 0.65, 0),
            this.sqrtBarThickness,
            HorizontalAlignment.Left
        );

        // Content
        this.createTextBlock(
            group,
            content,
            new vec3(this.baseSize * 0.5, this.baseSize * 0.05, 0),
            this.sqrtContentScale,
            HorizontalAlignment.Left
        );
    }
}
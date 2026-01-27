@component
export default class PodLaTeXLens2 extends BaseScriptComponent {

    @input
    private containerName: string = "LatexContainer";

    @input
    private baseSize: number = 0.20;

    @input
    private regularTextScale: number = 1.4;

    @input
    private lineSpacing: number = 0.40;

    @input
    private textColor: vec4 = new vec4(1, 1, 1, 1);

    @input
    @hint("Default Z position for all text (negative = in front of camera)")
    private defaultZOffset: number = -1.5;

    @input
    @hint("Z offset for radical lines relative to text (e.g., -0.005 = lines in front)")
    private symbolZLayer: number = -0.005;

    @input
    private unlitMaterial: Material;

    @input
    private lineTexture: Texture;

    @input
    private sqrtThickness: number = 0.18;

    @input
    private sqrtHeightMultiplier: number = 3.0;

    @input
    private sqrtSlantMultiplier: number = 1.8;

    @input
    private sqrtBarOverhang: number = 0.4;

    @input
    private sqrtContentScale: number = 1.15;

    @input
    private sqrtContentXOffset: number = 0.55;

    @input
    private sqrtContentYOffset: number = 0.25;

    @input
    private sqrtLeftOffset: number = -0.6;

    @input
    private sqrtGroupOffset: number = 0.1;

    private container: SceneObject | null = null;

    onAwake(): void {
        if (!this.unlitMaterial) {
            print("ERROR: Assign an Unlit Material to 'unlitMaterial' in the Inspector!");
            return;
        }

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

        const startPos = new vec3(0, 2.0, this.defaultZOffset);

        this.renderLatexLines(latexInput, startPos);
    }

    private renderLatexLines(input: string, startPos: vec3): void {
        if (!this.container) return;

        const rawLines = input
            .replace(/\\begin\{align[^}]*\}|\\end\{align[^}]*\}/g, '')
            .replace(/\\\\/g, '\n')
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0);

        let currentY = startPos.y;

        for (let line of rawLines) {
            // Interpret &= as plain = (alignment marker in LaTeX align*)
            line = line.replace(/&=/g, '=');

            // Unicode fixes
            line = line
                .replace(/\^2/g, '²')
                .replace(/\^3/g, '³')
                .replace(/E_0/g, 'E₀')
                .replace(/x\^2/g, 'x²')
                .replace(/y\^2/g, 'y²')
                .replace(/mc\^2/g, 'mc²')
                .replace(/v\^2/g, 'v²')
                .replace(/c\^2/g, 'c²');

            // Updated regex: matches lines like "y = \sqrt{...}" after &= replacement
            const sqrtRegex = /(.*)=\s*\\sqrt\{([^}]*)\}/;
            const match = line.match(sqrtRegex);

            if (match) {
                // match[1] is everything before the = (may have trailing space)
                let leftText = match[1].trimEnd() + " ="; // Removes trailing space, adds clean " ="
                const sqrtContent = match[2].trim();

                this.createTextBlock(
                    this.container,
                    leftText,
                    new vec3(startPos.x + this.sqrtLeftOffset, currentY, startPos.z),
                    this.regularTextScale,
                    HorizontalAlignment.Right
                );

                this.renderCustomSqrt(
                    this.container,
                    sqrtContent,
                    new vec3(startPos.x + this.sqrtGroupOffset, currentY, startPos.z)
                );
            } else {
                this.createTextBlock(
                    this.container,
                    line,
                    new vec3(startPos.x, currentY, startPos.z),
                    this.regularTextScale,
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
        comp.verticalAlignment = VerticalAlignment.Center;

        obj.getTransform().setLocalPosition(pos);
    }

    private renderCustomSqrt(parent: SceneObject, content: string, basePos: vec3): void {
        const group = global.scene.createSceneObject("CustomSqrtGroup");
        group.setParent(parent);
        group.getTransform().setLocalPosition(basePos);

        const s = this.baseSize;
        const thickness = s * this.sqrtThickness;
        const height = s * this.sqrtHeightMultiplier;

        const charWidthApprox = s * 0.65;
        const contentWidth = content.length * charWidthApprox * this.sqrtContentScale;

        this.createLineSegment(group, new vec3(0, height * 0.15, this.symbolZLayer), new vec3(0, 0, this.symbolZLayer), thickness);
        this.createLineSegment(group, new vec3(0, 0, this.symbolZLayer), new vec3(s * this.sqrtSlantMultiplier, height, this.symbolZLayer), thickness);
        this.createLineSegment(
            group,
            new vec3(s * (this.sqrtSlantMultiplier - 0.3), height, this.symbolZLayer),
            new vec3(s * (this.sqrtSlantMultiplier - 0.3) + contentWidth + s * this.sqrtBarOverhang, height, this.symbolZLayer),
            thickness
        );

        this.createTextBlock(
            group,
            content,
            new vec3(s * this.sqrtContentXOffset + contentWidth * 0.5, height * this.sqrtContentYOffset, 0),
            this.sqrtContentScale,
            HorizontalAlignment.Center
        );
    }

    private createLineSegment(
        parent: SceneObject,
        start: vec3,
        end: vec3,
        thickness: number
    ): void {
        const lineObj = global.scene.createSceneObject("LineSegment");
        lineObj.setParent(parent);

        const imageComp: any = lineObj.createComponent("Component.Image");

        const material = this.unlitMaterial.clone();
        material.mainPass.baseColor = this.textColor;
        if (this.lineTexture) {
            material.mainPass.baseTexture = this.lineTexture;
        }
        imageComp.mainMaterial = material;

        const direction = end.sub(start);
        const length = direction.length;
        if (length === 0) return;

        const center = start.add(direction.uniformScale(0.5));
        const angle = Math.atan2(direction.y, direction.x);

        const trans = lineObj.getTransform();
        trans.setLocalPosition(center);
        trans.setLocalRotation(quat.angleAxis(angle, vec3.forward()));
        trans.setLocalScale(new vec3(length, thickness, 1));
    }
}
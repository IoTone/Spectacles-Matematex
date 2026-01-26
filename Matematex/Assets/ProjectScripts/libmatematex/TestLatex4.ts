@component
export default class PodLaTeXLens4 extends BaseScriptComponent {

    @input
    private containerName: string = "LatexContainer";

    @input
    private baseSize: number = 0.15;

    @input
    private lineSpacing: number = 0.28;

    @input
    private textColor: vec4 = new vec4(1, 1, 1, 1);

    @input lineTexture : Texture;

    @input
    private sqrtThickness: number = 0.18;

    @input
    private sqrtHeightMultiplier: number = 3.2;

    @input
    private sqrtSlantMultiplier: number = 1.8;

    @input
    private sqrtBarOverhang: number = 0.4;

    @input
    private sqrtContentScale: number = 0.85;

    @input
    private sqrtContentXOffset: number = 0.4;

    @input
    private sqrtContentYOffset: number = 0.15;

    @input
    private sqrtLeftOffset: number = -0.6;

    @input
    private sqrtGroupOffset: number = 0.1;

    private container: SceneObject | null = null;

    onAwake(): void {
        if (!this.lineTexture) {
            print("ERROR: Assign a solid-color Texture to 'lineTexture' in the Inspector!");
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
        comp.verticalAlignment = VerticalAlignment.Center;

        obj.getTransform().setLocalPosition(pos);
    }

    private renderCustomSqrt(parent: SceneObject, content: string, basePos: vec3): void {
        const group = global.scene.createSceneObject("CustomSqrtGroup");
        group.setParent(parent);
        group.getTransform().setLocalPosition(basePos);

        // Fixed: Use @ts-ignore to bypass strict TypeScript checking for Billboard (it's a valid runtime component)
        // @ts-ignore
        group.createComponent("Component.Canvas");

        const s = this.baseSize;
        const thickness = s * this.sqrtThickness;
        const height = s * this.sqrtHeightMultiplier;

        const charWidthApprox = s * 0.6;
        const contentWidth = content.length * charWidthApprox * this.sqrtContentScale;

        // 1. Short vertical tick
        this.createLineSegment(
            group,
            new vec3(0, height * 0.15, 0),
            new vec3(0, 0, 0),
            thickness,
            this.textColor
        );

        // 2. Diagonal slant
        this.createLineSegment(
            group,
            new vec3(0, 0, 0),
            new vec3(s * this.sqrtSlantMultiplier, height, 0),
            thickness,
            this.textColor
        );

        // 3. Horizontal overbar
        this.createLineSegment(
            group,
            new vec3(s * (this.sqrtSlantMultiplier - 0.3), height, 0),
            new vec3(s * (this.sqrtSlantMultiplier - 0.3) + contentWidth + s * this.sqrtBarOverhang, height, 0),
            thickness,
            this.textColor
        );

        // 4. Content
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
        thickness: number,
        color: vec4
    ): void {
        const lineObj = global.scene.createSceneObject("LineSegment");
        lineObj.setParent(parent);

        const imageComp: any = lineObj.createComponent("Component.Image");
        imageComp.mainPass.baseTex = this.lineTexture;
        imageComp.mainPass.baseColor = color;

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
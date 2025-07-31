// TypeScript implementation of a simplified Pod::LaTeX for Lens Studio and Spectacles
// Original Perl module: https://github.com/timj/perl-Pod-LaTeX/blob/master/lib/Pod/LaTeX.pm
// This parses a POD-like format and renders it as AR text in Lens Studio

// Import Lens Studio Scripting API types
// Ensure these are available via Lens Studio's TypeScript definitions: https://github.com/huggingface/snapchat-lens-api[](https://support.lensstudio.snapchat.com/hc/en-us/community/posts/360043146692-Type-definitions-for-the-Scripting-API)
// import { SceneObject, Text, vec3, vec2 } from "./SpectaclesInteractionKit.lspkg"
// import {ToggleButton} from "SpectaclesInteractionKit.lspkg/Components/UI/ToggleButton/ToggleButton"
import {findSceneObjectByName} from "SpectaclesInteractionKit.lspkg/Utils/SceneObjectUtils"

// Configuration interface for POD-to-AR conversion
interface PodLaTeXConfig {
  head1Size: number;
  head2Size: number;
  itemSize: number;
  textColor: vec3; // RGB color for text
  spacing: number; // Vertical spacing between text elements
}

// Main class for POD-to-AR text conversion
@component
export class PodLaTeXLens extends BaseScriptComponent {
  // Input properties for Lens Studio
  @input
  private textObject!: Text; // Reference to a Text component in the scene
  private config: PodLaTeXConfig = {
    head1Size: 0.05,
    head2Size: 0.04,
    itemSize: 0.03,
    textColor: new vec3(1, 1, 1), // White text
    spacing: 0.06, // Vertical spacing in world units
  };

  private outputLines: string[] = [];
  private currentY: number = 0; // Track vertical position for text placement
  private inPod: boolean = false;
  private verbatim: boolean = false;

  // Escape special characters for display (simplified for AR text)
  private escapeText(text: string): string {
    // Replace special characters that might cause issues in AR text
    const escapeMap: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
    };
    return text.replace(/[&<>]/g, (match) => escapeMap[match] || match);
  }

  // Process POD-like commands
  private processCommand(command: string, args: string, scene: SceneObject, pos: vec3): SceneObject[] {
    const objects: SceneObject[] = [];
    const newTextObj = scene.createComponent("Component.Text");

    switch (command.toLowerCase()) {
      case 'head1':
        newTextObj.size = this.config.head1Size;
        newTextObj.text = this.escapeText(args);
        break;
      case 'head2':
        newTextObj.size = this.config.head2Size;
        newTextObj.text = this.escapeText(args);
        break;
      case 'item':
        newTextObj.size = this.config.itemSize;
        newTextObj.text = "- " + this.escapeText(args);
        break;
      case 'begin':
        if (args.toLowerCase() === 'verbatim') {
          this.verbatim = true;
          newTextObj.text = ''; // Verbatim block starts
        }
        break;
      case 'end':
        if (args.toLowerCase() === 'verbatim') {
          this.verbatim = false;
          newTextObj.text = ''; // Verbatim block ends
        }
        break;
      case 'for':
        if (args.toLowerCase().startsWith('latex')) {
          // In a real implementation, parse LaTeX for AR display if needed
          newTextObj.text = this.escapeText(args.replace(/^latex\s+/i, ''));
        }
        break;
    }

    if (newTextObj.text) {
      print(newTextObj.text);
        var textObject = global.scene.createSceneObject("FloatingText");
        var transform = textObject.createComponent("Component.ScreenTransform");
        var textComponent = textObject.createComponent("Component.Text");
        
        // handle the transform offset
        textComponent.getTransform().setWorldPosition(pos);
        //
        // textComponent.text = "Hello Spectacles!";
        // 
        print(pos);
        textComponent = newTextObj;
        textComponent.textFill.color = new vec4(0, 0, 0, 1); // this.config.textColor;
        textComponent.size = 28;
        textComponent.horizontalAlignment = HorizontalAlignment.Center;
        textComponent.verticalAlignment = VerticalAlignment.Center;
      // objects.push(newTextObj);
      objects.push(scene);
    }
    return objects;
  }

  // Process plain text
  private processText(text: string, scene: SceneObject): SceneObject[] {
    if (!text.trim() && !this.verbatim) return [];
    const newTextObj = scene.createComponent("Component.Text");
    
    newTextObj.size = this.config.itemSize;
    newTextObj.text = this.verbatim ? text : this.escapeText(text);
    return [scene];
  }

  // Create a new Text SceneObject
  private createTextObject(scene: SceneObject): SceneObject {
    const textComp = scene.createComponent('Component.Text');
    // const textComp = textObj.createComponent<Text>('Text');
    textComp.textFill.color = new vec4(0, 0, 0, 1); // this.config.textColor;
    textComp.horizontalAlignment = HorizontalAlignment.Center;
    textComp.verticalAlignment = VerticalAlignment.Center;
    // textComp.position = new vec2(0, this.currentY);
    this.currentY -= this.config.spacing; // Move down for next text
    // return textObj;
    // return textObj;
    return scene;
  }

  // Parse POD-like input and create AR text objects
  public parsePod(input: string, scene: SceneObject, pos: vec3): void {
    this.currentY = 0; // Reset vertical position
    const lines = input.split('\n');
    let inList = false;

    var yoffset = pos.y;
    
    for (const line of lines) {
      if (line.trim() === '' && !this.verbatim) {
        continue;
      }

      if (line.startsWith('=') && !this.verbatim) {
        const match = line.match(/^=(\w+)\s*(.*)$/);
        if (match) {
          const [, command, args] = match;
          if (command === 'over') {
            inList = true;
          } else if (command === 'back') {
            inList = false;
          } else {
            yoffset = yoffset + 10.0;
            pos.y = yoffset;
            const objects = this.processCommand(command, args, scene, pos);
            // objects.forEach(obj => scene.addSceneObject(obj));
            // objects.forEach(obj => obj.setParent(scene));
          }
        }
      } else {
        const objects = this.processText(line, scene);
        // objects.forEach(obj => scene.addSceneObject(obj));
        // objects.forEach(obj => obj.setParent(scene));
      }
    }
  }

  // Lens Studio lifecycle method
  public onAwake(): void {
    // Example POD input (in a real project, this could be loaded dynamically)


    const podInput =`
=head1 AR Documentation
Welcome to the AR lens documentation.

=head2 Features
This lens displays POD-like content in AR.

=over
=item Interactive Text
Text rendered in 3D space.
=item Verbatim Support
=begin verbatim
Code: x = y + z;
=end verbatim
=back
    `;
    const scene = global.scene.createSceneObject("MyLatex");
    // var scene = global.scene.getRootObject().getChildByName("CalculatorResults");
    
    /*
    const targetSceneObjectName = "CalculatorResults";
    const scene = findSceneObjectByName(global.scene.getRootObject(0), targetSceneObjectName);
    if (scene === null) {
      throw new Error(
        `${targetSceneObjectName} could not be found in children of SceneObject: ${global.scene.getRootObject(0).name}`
      )
    }
        */
    // const scene = this.sceneObject.getScene();
    // TODO: use a specific scene object not simply the root object
    this.parsePod(podInput, scene, new vec3(0.00,3.00,5.00));
  }
}

// export default PodLaTeXLens;
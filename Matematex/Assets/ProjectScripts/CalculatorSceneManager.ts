import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { setTimeout } from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils";

@component
export class CalculatorSceneManager extends BaseScriptComponent {
    @input
    @hint("Audio Soundtrack")
    public mainAudioLoop: AudioComponent;
    
    onAwake() {
        this.setupCallbacks();
        setTimeout(() => {
            this.mainAudioLoop.play(-1 /* forever */);
        }, 15000);
        
    }
    
    private setupCallbacks = (): void => {
        
    }
}

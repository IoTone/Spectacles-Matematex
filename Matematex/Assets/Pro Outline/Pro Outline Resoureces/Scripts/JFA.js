
//@input int outlineThickness
//@input Asset.Texture mask {"label":"Input Mask"}

//@input bool advanced
//@input bool isFullScreen {"label":"Full Screen Quality", "showIf":"advanced"}
//@input vec2 customRes = {256,512} {"label":"Resolution", "showIf":"isFullScreen", "showIfValue": "false"}
//@input Asset.Material firstPass {"label":"First Pass", "showIf":"advanced"}
//@input Asset.Material JFAStep {"label":"JFA Step", "showIf":"advanced"}
//@input int startingRenderOrder {"label":"Render Order From", "showIf":"advanced"}

var frame = 0;
var passes, stepSize, finalPostEffectComponent;

function setJFAParams() {        
    passes = Math.ceil(Math.log2(script.outlineThickness)) + 1;
    stepSize = Math.pow(2,passes-1);        

    finalPostEffectComponents = script.getSceneObject().getComponents("Component.PostEffectVisual");     
}

function setJFA() {
    setJFAParams();
    
    var baseOutline = createRenderTarget();    
    var camBaseEdge = createCamera(baseOutline, script.startingRenderOrder++, "outline");
    script.firstPass.mainPass.inputMap = script.mask;
    createPostEffect(camBaseEdge.renderLayer, script.firstPass, script.startingRenderOrder++);            
    
    var oddStepRT = baseOutline//createRenderTarget();    
    var lastStep = oddStepRT;    
    var camStep = createCamera(lastStep, script.startingRenderOrder++, "step");        
        
    createPostEffect(camStep.renderLayer, script.firstPass, script.startingRenderOrder++);            
      
    for (var i=0; i<passes; i++) {     
        var mat = script.JFAStep.clone();
        mat.mainPass.stepSize = stepSize / Math.pow(2, i);        
        mat.mainPass.inputMap = lastStep;
        createPostEffect(camStep.renderLayer, mat,  script.startingRenderOrder++);                       
    }   

    // final pass    
    finalPostEffectComponents.forEach(function(finalPostEffectComponent) {
        finalPostEffectComponent.mainPass.inputMap = lastStep;    
        finalPostEffectComponent.mainPass.borderSize =  script.outlineThickness;
    });
}


function createPostEffect(renderLayer, material, renderOrder) {
    var postEffectObject = global.scene.createSceneObject("PostEffect");
    var postEffectComponent = postEffectObject.createComponent("Component.PostEffectVisual");

    postEffectObject.layer = renderLayer;

    postEffectComponent.clearMaterials();
    postEffectComponent.addMaterial(material);
    postEffectComponent.setRenderOrder(renderOrder);

    return postEffectObject;
}

function createRenderTarget(fullScreen) {
    var renderTarget = global.scene.createRenderTargetTexture();    
    renderTarget.control.useScreenResolution = script.isFullScreen;
    renderTarget.control.resolution = script.customRes;
    
    
    renderTarget.control.clearColorEnabled = true;
    renderTarget.control.clearColor = new vec4(0.0, 0.0, 0.0, 0.0);
//    renderTarget.control.clearDepthEnabled = false;
    renderTarget.control.fxaa = false;
    renderTarget.control.msaa = false;
    return renderTarget;
}

function createCamera(renderTargets, renderOrder, name) {
    var cameraObject = global.scene.createSceneObject("Camera " + name);
    var cameraComponent = cameraObject.createComponent("Component.Camera");
    cameraComponent.enabled = true;

    cameraComponent.renderLayer = LayerSet.makeUnique();
    cameraComponent.near = 1.0;
    cameraComponent.far = 1000.0;
    cameraComponent.devicePropertyUsage = Camera.DeviceProperty.All;
    cameraComponent.renderOrder = renderOrder;
    cameraComponent.renderTarget = renderTargets;

    return cameraComponent;
}


setJFA();
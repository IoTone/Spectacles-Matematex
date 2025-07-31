// import texsvg from "./libmatematex/texsvg/index";

// import {EventEmitter} from "../utils/node-eventemitter";
// import type TypedEmitter from '../typed-emitter';

// import {katex} from "./libmatematex/katex/types/katex.d";
// import katex from   "./libmatematex/katex.js"


@component
export class MatematexTester extends BaseScriptComponent {
    onAwake() {
        this.createEvent("OnStartEvent").bind(() => {
            this.onStart()
        })
    }
    
    
    onStart() {
        // const html = katex.renderToString('\\ce{CO2 + C -> 2 C0}');
        // const [tex, file] = (_ as [string, string | undefined]);
        
        /*
        const [tex, file]: [string, string | undefined] = undefined;
        // Hardcode some text
        // options are hardcoded
        texsvg(tex, { optimize: true })
        .then((svg) => {
            // output svg to stdout if it's not going to be saved to a file
            if (!file) {
              print(svg);
              return;
            }
        
            return new Promise((resolve, reject) => {
                print("svg generated");
                resolve(undefined);

            });
          })
          .catch((error) => {
            print(error);
          });
            */
        
    }
}

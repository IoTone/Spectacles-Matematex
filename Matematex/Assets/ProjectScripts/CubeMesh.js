// Builds a cube mesh and applies it to meshVisual
//@input Component.MeshVisual meshVisual
//@input vec3 center = {0,0,0}
//@input vec3 size = {4,4,4}

var builder = new MeshBuilder([
    { name: "position", components: 3 },
    { name: "normal", components: 3 },
    { name: "texture0", components: 2 },
]);

builder.topology = MeshTopology.Triangles;
builder.indexType = MeshIndexType.UInt16;

var halfSize = script.size.uniformScale(.5);
var right =  script.center.x + halfSize.x;
var left =   script.center.x - halfSize.x;
var top =    script.center.y + halfSize.y;
var bottom = script.center.y - halfSize.y;
var front =  script.center.z + halfSize.z;
var back =   script.center.z - halfSize.z;

// UVs of quad in order: Top left, Bottom left, Bottom right, Top right
const QUAD_UVS = [[0,1], [0,0], [1,0], [1,1]];

// Append data for 4 vertices in a quad shape
function addQuadVerts(meshBuilder, normal, positions){
    for(var i=0; i<positions.length; i++){
        meshBuilder.appendVertices([positions[i], normal, QUAD_UVS[i]]);
    }
}

// Append the indices for two triangles, forming a quad
function addQuadIndices(meshBuilder, topLeft, bottomLeft, bottomRight, topRight){
    meshBuilder.appendIndices([
        topLeft, bottomLeft, bottomRight, // First Triangle
        bottomRight, topRight, topLeft // Second Triangle
    ]);
}

// Define the normal direction and vertex positions for each side of the cube
var sides = [
    { normal: [0,0,1], // Front
      positions: [[left,top,front], [left,bottom,front], [right,bottom,front], [right,top,front]] },
    { normal: [0,0,-1], // Back
      positions: [[right,top,back], [right,bottom,back], [left,bottom,back], [left,top,back]] },
    { normal: [1,0,0], // Right
      positions: [[right,top,front], [right,bottom,front], [right,bottom,back], [right,top,back]] },
    { normal: [-1,0,0], // Left
      positions: [[left,top,back], [left,bottom,back], [left,bottom,front], [left,top,front]] },
    { normal: [0,1,0], // Top
      positions: [[left,top,back], [left,top,front], [right,top,front], [right,top,back]] },
    { normal: [0,-1,0], // Bottom
      positions: [[left,bottom,front], [left,bottom,back], [right,bottom,back], [right,bottom,front]] },
];

// For each side, append the vertex data and indices
for(var i=0; i<sides.length; i++){
    var index = i * 4;
    addQuadVerts(builder, sides[i].normal, sides[i].positions);
    addQuadIndices(builder, index, index+1, index+2, index+3);
}

// Make sure the mesh is valid, then apply and update
if(builder.isValid()){
    script.meshVisual.mesh = builder.getMesh();
    builder.updateMesh();
}
else{
    print("Mesh data invalid!");
}
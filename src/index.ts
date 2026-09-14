import cytoscape from 'cytoscape';
import type {
    EdgeCollection, EdgeSingular, NodeCollection, NodeSingular
} from 'cytoscape';

export type LayoutAlgorithm =
    | 'force'
    | 'stress';

// Centralized Layout Parameters
export interface LayoutParameters {
    LAYOUT_ALGORITHM: LayoutAlgorithm;

    // Force-directed parameters
    IDEAL_LENGTH: number;
    REPULSION: number;
    SPRING_K: number;
    ITERATIONS: number;
    ANGULAR_STRENGTH: number;
    CENTER_GRAVITY: number;
    USE_ANGULAR_FORCE: boolean;
    RANDOMIZE_INITIAL_POSITIONS: boolean;

    // Structure detection parameters
    MIN_STAR_LEAVES: number;
    MIN_CYCLE_LENGTH: number;
    MAX_CYCLE_LENGTH: number;
    MIN_CHAIN_LENGTH: number;
    MIN_PARALLEL_NEIGHBORS: number;

    // Layout spacing parameters
    CYCLE_NODE_SPACING: number;
    STAR_RING_SPACING: number;
    STAR_BASE_NODES_PER_RING: number;
    CHAIN_MIN_RADIUS: number;
    PARALLEL_GAP: number;
    LEAF_NODE_DISTANCE: number;

    // Virtual node parameters
    VNODE_RADIUS_MULTIPLIER: number;
    VNODE_REPULSION: number;
    VNODE_SPRING_K: number;
    VNODE_ITERATIONS: number;
    VNODE_ANGULAR_STRENGTH: number;

    // Layout control flags
    SPREAD_V_NODES: boolean;
    SUBSTRUCTURE_LAYOUT: boolean;
    ENABLE_INITIAL_FORCE_LAYOUT: boolean;

    // Step-by-step mode
    STEP_BY_STEP: boolean;

    SHOW_ALL_EDGES: boolean;
}

// @ts-ignore
export const DEFAULT_PARAMS: LayoutParameters = {

    // Force-directed parameters
    IDEAL_LENGTH: 100,
    REPULSION: 300,
    SPRING_K: 0.15,
    ITERATIONS: 600,
    ANGULAR_STRENGTH: 0.2,
    CENTER_GRAVITY: 0.01,
    USE_ANGULAR_FORCE: false,
    RANDOMIZE_INITIAL_POSITIONS: false,

    // Structure detection parameters
    MIN_STAR_LEAVES: 3,
    MIN_CYCLE_LENGTH: 3,
    MAX_CYCLE_LENGTH: 30,
    MIN_CHAIN_LENGTH: 2,
    MIN_PARALLEL_NEIGHBORS: 2,

    // Layout spacing parameters
    CYCLE_NODE_SPACING: 100,
    STAR_RING_SPACING: 100,
    STAR_BASE_NODES_PER_RING: 6,
    CHAIN_MIN_RADIUS: 150,
    PARALLEL_GAP: 80,
    LEAF_NODE_DISTANCE: 200,

    // Virtual node parameters
    VNODE_RADIUS_MULTIPLIER: 0.2,
    //    VNODE_IDEAL_LENGTH: 100,
    VNODE_REPULSION: 10000,
    VNODE_SPRING_K: 0.15,
    VNODE_ITERATIONS: 1000,
    VNODE_ANGULAR_STRENGTH: 0.1,

    // Layout control flags
    SPREAD_V_NODES: true,
    SUBSTRUCTURE_LAYOUT: false,
    ENABLE_INITIAL_FORCE_LAYOUT: false,

    // Step-by-step mode
    STEP_BY_STEP: false,

    LAYOUT_ALGORITHM: 'stress',

    SHOW_ALL_EDGES: true
};

// Step snapshot for debugging and visualization
export interface LayoutStep {
    stepNumber: number;
    stepName: string;
    description: string;
    nodePositions: { [nodeId: string]: { x: number; y: number } };
    virtualNodes?: VNode[];
    virtualEdges?: VEdge[];
    metadata?: any;
}

export type SubstructureType =
    | 'Normal'
    | 'Cycle'
    | 'Chain'
    | 'Star-Center'
    | 'Star-Member'
    | 'Parallel'
    | 'LeafButNotChain';

type Node = cytoscape.NodeSingular;
type Edge = cytoscape.EdgeSingular;
type Nodes = cytoscape.NodeCollection;
type Edges = cytoscape.EdgeCollection;

class VNode {
    public id: string;
    public type: any;
    public center_x: number;
    public center_y: number;
    public radius: number;
    public rotate_angle: number = 0;
    public nodes: Node[] = []; // stores node objects
    public neighbors: VNode[] = [];
    public _permanentOrder?: string[];

    constructor(id: string, x: number, y: number, radius: number) {
        this.id = id;
        this.center_x = x;
        this.center_y = y;
        this.radius = radius;

        // 2. Initialization: leave unassigned, so the value is undefined
        this._permanentOrder = undefined;
    }

    public get position() {
        return {x: this.center_x, y: this.center_y};
    }

    public setPosition(x: number, y: number): void {
        this.center_x = x;
        this.center_y = y;
    }

    public addNode(node: Node): void {
        this.nodes.push(node);
    }

    public setPermanentOrder(order: string[]): void {
        this._permanentOrder = [...order];
    }

    public getPermanentOrder(): string[] | undefined {
        return this._permanentOrder;
    }

    public toSnapshot() {
        return {
            id: this.id,
            type: this.type,
            center_x: this.center_x,
            center_y: this.center_y,
            radius: this.radius,
            rotate_angle: this.rotate_angle,
            nodeIds: this.nodes
        };
    }
}

class VEdge {
    public source: VNode;
    public target: VNode;
    public weight: number;
    // weight is number of edges between source node and target node,
    // normally is 1, but can be 2 or more for like parallel edges

    constructor(source: VNode, target: VNode, weight: number = 1) {
        this.source = source;
        this.target = target;
        this.weight = weight;
    }

    public toSnapshot() {
        return {
            source: this.source.id, target: this.target.id, weight: this.weight
        };
    }
}

// export default function register(cytoscape: any) {
//     if (!cytoscape) return;
//     cytoscape('layout', 'SubstructureLayout', SubstructureLayout);
// }

/**
 * Register this layout as a Cytoscape.js layout extension.
 *
 * Usage:
 *   import cytoscape from 'cytoscape';
 *   import substructureLayout from './cytoscape-substructure-layout';
 *
 *   substructureLayout(cytoscape);
 *
 *   cy.layout({
 *       name: 'substructure-layout',
 *       layoutAlgorithm: 'force',
 *       idealLength: 100,
 *       repulsion: 10000,
 *       springK: 0.15,
 *       iterations: 400
 *   }).run();
 */

export default function register(cytoscapeInstance: any) {
    if (!cytoscapeInstance) {
        throw new Error('cytoscape-substructure-layout: Cytoscape.js instance is required');
    }

    // Avoid duplicate registration when the plugin is initialized more than once.
    try {
        cytoscapeInstance('layout', 'substructure-layout', SubstructureLayout);
    } catch (error) {
        // Cytoscape normally throws if an extension with the same name is already
        // registered. Keeping registration idempotent makes the plugin easier to use
        // in hot-reload/demo environments.
        const message = error instanceof Error ? error.message : String(error);
        if (!/already|exists|registered/i.test(message)) {
            throw error;
        }
    }
}

// Optional named export for consumers that prefer: import { register } ...
export {SubstructureLayout};

/////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Enhanced force-directed layout with structure awareness
 */
function SubstructureLayout(this: any, options: any) {
    this.options = options || {};
    this.cy = this.options.cy;
    this.eles = this.options.eles || this.cy.elements();
    this.boundingBox = this.options.boundingBox;

    this.stopped = false;

    if (!this.cy) {
        throw new Error('cytoscape-substructure-layout: options.cy is required');
    }

    // Public Cytoscape.js options use camelCase. The original algorithm uses
    // uppercase internal parameters, so normalize the public API here.
    // `params` is still accepted for backward compatibility with the old demo.
    const p = this.options.params || {};
    const publicParams = {

        IDEAL_LENGTH: this.options.idealLength,
        REPULSION: this.options.repulsion,
        SPRING_K: this.options.springK,
        ITERATIONS: this.options.iterations,
        ANGULAR_STRENGTH: this.options.angularStrength,
        CENTER_GRAVITY: this.options.centerGravity,
        USE_ANGULAR_FORCE: this.options.useAngularForce,
        RANDOMIZE_INITIAL_POSITIONS: this.options.randomizeInitialPositions,

        MIN_STAR_LEAVES: this.options.minStarLeaves,
        MIN_CYCLE_LENGTH: this.options.minCycleLength,
        MAX_CYCLE_LENGTH: this.options.maxCycleLength,
        MIN_CHAIN_LENGTH: this.options.minChainLength,
        MIN_PARALLEL_NEIGHBORS: this.options.minParallelNeighbors,

        CYCLE_NODE_SPACING: this.options.cycleNodeSpacing,
        STAR_RING_SPACING: this.options.starRingSpacing,
        STAR_BASE_NODES_PER_RING: this.options.starBaseNodesPerRing,
        CHAIN_MIN_RADIUS: this.options.chainMinRadius,
        PARALLEL_GAP: this.options.parallelGap,
        LEAF_NODE_DISTANCE: this.options.leafNodeDistance,

        VNODE_RADIUS_MULTIPLIER: this.options.vnodeRadiusMultiplier,
        VNODE_REPULSION: this.options.vnodeRepulsion,
        VNODE_SPRING_K: this.options.vnodeSpringK,
        VNODE_ITERATIONS: this.options.vnodeIterations,
        VNODE_ANGULAR_STRENGTH: this.options.vnodeAngularStrength,

        SPREAD_V_NODES: this.options.spreadVNodes,
        SUBSTRUCTURE_LAYOUT: this.options.substructureLayout,
        ENABLE_INITIAL_FORCE_LAYOUT: this.options.enableInitialForceLayout,
        STEP_BY_STEP: this.options.stepByStep,

        LAYOUT_ALGORITHM: 'stress',

        SHOW_ALL_EDGES: true
    };

    // Merge defaults -> legacy params -> public camelCase options. Undefined
    // public values are ignored so defaults are preserved.
    const camelToInternal: Record<string, any> = {};
    Object.keys(publicParams).forEach((key) => {
        const value = publicParams[key as keyof typeof publicParams];

        if (value !== undefined) {
            camelToInternal[key] = value;
        }
    });

    this.params = {
        ...DEFAULT_PARAMS, ...p, ...camelToInternal
    };

    // Instance-specific arrays instead of global
    this.vnodes = [];
    this.vedges = [];

    // Step-by-step mode data
    this.steps = [];
    this.currentStepIndex = -1;
}

/**
 * Capture a snapshot of the current layout state
 */
SubstructureLayout.prototype.captureStep = function (stepName: string, description: string, metadata?: any) {
    if (!this.params.STEP_BY_STEP) return;

    const nodes = this.cy.nodes();
    const nodePositions: { [nodeId: string]: { x: number; y: number } } = {};

    nodes.forEach((node: NodeSingular) => {
        nodePositions[node.id()] = {
            x: node.position().x, y: node.position().y
        };
    });

    // Deep clone virtual nodes and edges if they exist
    const virtualNodes = this.vnodes.length > 0 ? JSON.parse(JSON.stringify(this.vnodes.map((v: VNode) => ({
        id: v.id,
        type: v.type,
        center_x: v.center_x,
        center_y: v.center_y,
        radius: v.radius,
        rotate_angle: v.rotate_angle,
        nodeIds: v.nodes?.map((n: any) => n.id()) || []
    })))) : undefined;

    const virtualEdges = this.vedges.length > 0 ? JSON.parse(JSON.stringify(this.vedges.map((e: VEdge) => ({
        source: e.source.id, target: e.target.id
    })))) : undefined;

    const step: LayoutStep = {
        stepNumber: this.steps.length, stepName, description, nodePositions, virtualNodes, virtualEdges, metadata
    };

    this.steps.push(step);
    this.currentStepIndex = this.steps.length - 1;

    console.log(`[Step ${step.stepNumber}] ${stepName}: ${description}`);
};

/////////////// Check whether two node arrays are identical, ignoring order
function areNodesEqual(arr1: cytoscape.NodeCollection, arr2: cytoscape.NodeCollection): boolean {
    // 1. Different lengths mean they are definitely different
    if (arr1.length !== arr2.length) return false;

    // 2. Extract all IDs and put them into a Set
    const ids1 = new Set(arr1.map((node: Node) => node.id()));

    // 3. Check whether every ID in arr2 exists in the Set
    return arr2.every(node => ids1.has((node as NodeSingular).id()));
}

////////////////sum length of all edges ////////////////
function totalEdgeLength(edges: Edges) {
    let total = 0;
    edges.forEach((edge: Edge) => {
        const s = edge.source();
        const t = edge.target();
        if (s && t) {
            const dx = (t.position().x || 0) - (s.position().x || 0);
            const dy = (t.position().y || 0) - (s.position().y || 0);
            const length = Math.sqrt(dx * dx + dy * dy);
            total += length;
        }
    })
    return total;
}

/**
 * Arrange the Node array into a rectangular matrix
 *
 * dirVector: direction of the long side of the rectangle
 * colSpacing: distance between nodes along the long-side direction
 * rowSpacing: distance between rows along the short-side direction
 * cols: number of nodes per row; calculated automatically if omitted
 */
function layoutRectangular(nodes: NodeSingular[], center: { x: number, y: number }, dirVector: {
    x: number, y: number
}, rowSpacing: number = 60, colSpacing: number = 60, cols?: number) {
    const n = nodes.length;

    if (n === 0) {
        return;
    }

    // ============================================================
    // 1. Determine matrix dimensions
    // ============================================================

    let finalCols: number;

    if (cols !== undefined && cols > 0) {
        finalCols = Math.min(cols, n);
    } else {
        finalCols = Math.ceil(Math.sqrt(n));

    }

    let rows = Math.ceil(n / finalCols);

    // A small number of nodes are placed in a single row
    if (n < 5) {
        finalCols = 1;
        rows = n;
    }

    // ============================================================
    // 2. Calculate the two unit direction vectors
    //
    // uLong  = long-side direction = dirVector
    // uShort = short-side direction = perpendicular to dirVector
    // ============================================================

    const magnitude = Math.sqrt(dirVector.x * dirVector.x + dirVector.y * dirVector.y);

    const safeMagnitude = Math.max(magnitude, 0.000001);

    const uLong = {
        x: dirVector.x / safeMagnitude, y: dirVector.y / safeMagnitude
    };

    const uShort = {
        x: -uLong.y, y: uLong.x
    };

    // ============================================================
    // 3. Iterate over all Nodes
    // ============================================================

    nodes.forEach((node, i) => {

        // Row containing the current node
        const row = Math.floor(i / finalCols);

        // Column containing the current node
        const col = i % finalCols;

        // --------------------------------------------------------
        // Actual number of nodes in the current row
        // --------------------------------------------------------

        const isLastRow = row === rows - 1;

        const nodesInThisRow = isLastRow ? (n % finalCols || finalCols) : finalCols;

        // ========================================================
        // 4. Position along the long-side direction
        // Arrange symmetrically around center
        // ========================================================

        const longWidth = (nodesInThisRow - 1) * colSpacing;

        const offsetLong = col * colSpacing - longWidth / 2;

        // ========================================================
        // 5. Position along the short-side direction
        //
        // Center each row as a whole
        // ========================================================

        const totalShortHeight = (rows - 1) * rowSpacing;

        const offsetShort = row * rowSpacing - totalShortHeight / 2;

        // ========================================================
        // 6. Calculate the final coordinates
        //
        // position =
        //      center
        //    + offset along the long-side direction
        //    + offset along the short-side direction
        // ========================================================

        const x = center.x + offsetLong * uLong.x + offsetShort * uShort.x;

        const y = center.y + offsetLong * uLong.y + offsetShort * uShort.y;

        node.position({
            x, y
        });
    });
}

SubstructureLayout.prototype.identifyStructures = function (nodes: NodeCollection) {
    const params = this.params;

    // 0. Reset all markers
    nodes.data('structType', 'Normal');
    // nodes.data('structColor', '#999999');
    nodes.data('groupId', null); // Added: reset group ID for cycles
    nodes.data('innerId', null);  // index inner a circle
    nodes.data('parallelGroupIdVec', []);

    // improve the above 'data' definition
    nodes.data('structs', {});

    ///////////////////////////// 2. detecting Cycle - by DFS algorithm /////////////////
    const allCycles: string[][] = [];  // each sub-array represents an independent cycle
    if (1) {
        const normalNodes: Node[] = nodes.toArray().filter((n: Node) => n.data('structType') === 'Normal' && n.degree() >= 2); //degree >= 2 means possible in a cycle
        const seenCycles = new Set<string>();

        // To avoid duplicate cycles (like A-B-C and B-C-A), we sort and stringify for a check

        normalNodes.forEach((startNode: Node, startIndex: number) => {
            // We only find cycles where startNode is the node with the lowest index
            // This is a massive optimization to prevent finding the same cycle N times
            const startId = startNode.id();

            const findCycles = (u: Node, parent: Node | null, path: string[]) => {
                const neighbors = u.neighborhood().nodes().toArray().filter((n: any) => n.data('structType') === 'Normal');

                if (neighbors.length < 8) { // If a node has too many neighbors, it is unlikely to be part of a cycle; this mainly improves efficiency and prevents the search from getting stuck here
                    for (const v of neighbors) {
                        const vId = v.id();
                        // 1. Found a cycle back to our specific START node
                        if (vId === startId && path.length >= params.MIN_CYCLE_LENGTH) {
                            const cycle = [...path];
                            const sortedKey = [...cycle].sort().join(',');
                            if (!seenCycles.has(sortedKey)) {
                                allCycles.push(cycle);
                                seenCycles.add(sortedKey);
                            }
                            continue;
                        }

                        // 2. Optimization: only visit nodes with higher index than startNode
                        // and nodes NOT already in the current path
                        const vIdx = normalNodes.findIndex(node => node.id() === vId); // index in nodes array

                        if (vIdx > startIndex && !path.includes(vId)) {
                            // define circle has less than 30 nodes, this is for large graph efficiency
                            // if(path.length < 5) {
                            findCycles(v, u, [...path, vId]);
                            // }
                        }
                    }
                }
            };
            findCycles(startNode, null, [startId]);
        });
    }

    // --- 2. Secondary filtering: remove cycles with an overlap of >= 2 nodes ---
    const filteredCycles: string[][] = [];
    allCycles.sort((a, b) => b.length - a.length);
    // It is recommended to sort cycles by size first; smaller cycles are usually more meaningful because fundamental cycles tend to be shorter
    allCycles.forEach((currentCycle) => {
        const currentSet = new Set(currentCycle);

        // Check whether the current cycle overlaps any saved cycle by two or more nodes
        const isRedundant = filteredCycles.some(existingCycle => {
            let overlapCount = 0;
            for (const nodeId of existingCycle) {
                if (currentSet.has(nodeId)) {
                    overlapCount++;
                }
                // Performance optimization: stop counting as soon as the overlap reaches 2
                if (overlapCount >= 2) return true;
            }
            return false;
        });

        if ((!isRedundant && currentCycle.length > 2 && currentCycle.length != 4)) {
            filteredCycles.push(currentCycle);
        }
        if ((!isRedundant && currentCycle.length == 4)) {

            const subNodes = currentCycle.map(id => nodes.toArray().find((n: Node) => n.id() === id));
            if (!((subNodes[0]?.degree(false) == 2 && subNodes[2]?.degree(false) == 2 && subNodes[1]?.degree(false) != 2 && subNodes[3]?.degree(false) != 2) || (subNodes[0]?.degree(false) == 2 && subNodes[2]?.degree(false) == 2 && subNodes[1]?.degree(false) == 2 && subNodes[3]?.degree(false) == 2))) {
                filteredCycles.push(currentCycle);
            }
        }
    });

    let circleIndex = 1;     // why 1 works ????
    filteredCycles.forEach((currentCycle) => {
        let innerIndex = 0;
        currentCycle.forEach((circle_node: any) => {
            nodes.forEach((node: any) => {
                if (node.data('structType') === 'Normal' && node.id() === circle_node) {
                    node.addClass('substructure-cycle')
                    node.data('structType', 'Cycle');
                    // node.data('structColor', '#2196F3');
                    node.data('groupId', 'Cycle_' + circleIndex);
                    node.data('innerId', innerIndex);

                    // for multiple struct types, we use a 'structs' object to store the data
                    node.data('structs', {
                        ...node.data('structs'), Cycle: {
                            color: '#2196F3', groupId: 'Cycle_' + circleIndex, innerId: innerIndex
                        }
                    });

                    innerIndex++;
                }
            });
        })
        circleIndex++;
    })

    console.log("num of cycles: ", filteredCycles.length);

    ////////////////////////////////////////// Define the storage structure for chains  ////////////////////////////
    interface Chain {
        chainId: string;
        nodes: any[]; // stores node objects
    }

    const chains: Chain[] = [];
    const processedNodeIds = new Set<string>(); // avoid processing nodes more than once

    // 2. Find all leaf nodes (Normal type with degree 1)
    const leafNodes = nodes.filter((n: any) => n.data('structType') === 'Normal' && n.neighborhood().nodes().length === 1);

    let chainId = 0;
    leafNodes.forEach((leaf: any) => {

        if (processedNodeIds.has(leaf.id())) return;

        const currentChainNodes: any[] = [];
        let currentNode = leaf;
        let nodeId = 0;
        // 3. Trace inward along the chain
        while (currentNode) {

            currentChainNodes.push(currentNode);
            processedNodeIds.add(currentNode.id());

            // Find the next neighbor
            const neighbors = currentNode
                .neighborhood('node')
                .filter((n: any) =>
                    n.id() !== currentNode.id() &&
                    n.data('structType') === 'Normal' &&
                    !processedNodeIds.has(n.id())
                );

            // Chain continuation conditions:
            // 1. There is exactly one unvisited Normal neighbor
            // 2. The neighbor must not have a high degree (if degree > 2, a branching point has been reached and the chain ends)
            if (neighbors.length === 1) {
                const nextNode = neighbors[0];

                const nextNodeNeighborCount = nextNode
                    .neighborhood('node')
                    .filter((n: any) => n.id() !== nextNode.id())
                    .length;

                if (nextNodeNeighborCount > 2) {
                    break;
                }

                currentNode = nextNode;
            } else {
                // No neighbors or multiple neighbors (branching), so the chain ends
                currentNode = null;
            }
        }

        // 4. Save the chain that was found
        if (currentChainNodes.length >= params.MIN_CHAIN_LENGTH) {
            nodeId = 0;
            currentChainNodes.forEach((node: any) => {
                node.addClass('substructure-chain')
                node.data('structType', 'Chain');
                // node.data('structColor', '#FFF176');
                node.data('groupId', 'Chain_' + chainId);
                node.data('innerId', nodeId);

                node.data('structs', {
                    ...node.data('structs'), Chain: {
                        color: '#FFF176', groupId: 'Chain_' + chainId, innerId: nodeId
                    }
                });
                nodeId++;
            })
            chainId++;
            chains.push({
                chainId: `chain_${leaf.id()}`, // name it using the leaf node ID
                nodes: currentChainNodes
            });
        } else {
            /////////////////////////////// leafs that not in a chain ///////////////////////////
            currentChainNodes.forEach((node: any) => {

                node.data('structType', 'LeafButNotChain');
                // node.data('structColor', '#aaa');
                node.data('groupId', null);
                node.data('innerId', null);

                node.data('structs', {
                    ...node.data('structs'), LeafButNotChain: {
                        color: '#aaa', groupId: null, innerId: null
                    }
                });
                nodeId++;
            })
        }
    });

    ///////////////////////////////// Star structure ///////////
    let starIndex: number = 0;
    nodes.forEach((node: any) => {

        const neighbors = node.neighborhood().nodes();

        // Number of distinct neighbors
        const neighborCount = neighbors.length;

        // Check whether the neighbors consist only of distinct neighbor nodes
        const leafNeighbors = neighbors.filter((n: Node) => n.neighborhood().nodes().length === 1);

        if (leafNeighbors.length >= params.MIN_STAR_LEAVES && neighborCount >= params.MIN_STAR_LEAVES) {

            if (node.data('structType') !== 'Cycle' && node.data('structType') !== 'Chain') {

                const groupId = 'Star_' + starIndex;

                node.addClass(['substructure-star', 'substructure-star-center'])
                node.data('structType', 'Star-Center');
                // node.data('structColor', '#F48FB1');
                node.data('groupId', groupId);

                node.data('structs', {
                    ...node.data('structs'), Star: {
                        role: 'Center', color: '#F48FB1', groupId
                    }
                });

                leafNeighbors.forEach((leaf: Node) => {
                    leaf.addClass(['substructure-star', 'substructure-member'])

                    leaf.data('structType', 'Star-Member');
                    // leaf.data('structColor', '#F48FB1');
                    leaf.data('groupId', groupId);

                    leaf.data('structs', {
                        ...leaf.data('structs'), Star: {
                            role: 'Member', color: '#F48FB1', groupId
                        }
                    });
                });

                starIndex++;
            }
        }
    });

    /////////////////////////////// Find parallel/diamond structures ///////////////////////////////////

    // let diamonds = [];
    let parallelId = 0;
    // Whether any two nodes have common neighbors
    for (let i = 0; i < nodes.length; i++) {
        let nodeVecParallel = [];
        const u = nodes[i];
        const u1 = u.neighborhood().nodes();

        if (u.data('structType') === 'Normal') {
            for (let j = 0; j < nodes.length; j++) {
                if (i === j) continue;
                const v = nodes[j];
                if (v.data('structType') === 'Normal') {
                    const v1 = v.neighborhood().nodes();
                    if (areNodesEqual(v1, u1) && v1.length >= params.MIN_PARALLEL_NEIGHBORS && u1.length >= params.MIN_PARALLEL_NEIGHBORS) {
                        if (nodeVecParallel.length === 0) {
                            nodeVecParallel.push(u.id());
                        }
                        nodeVecParallel.push(v.id());
                    }
                }
            }
        }
        if (nodeVecParallel.length >= 2) {
            nodeVecParallel.forEach(v => {
                nodes.forEach((node: Node) => {
                    if (node.id() == v) {
                        node.addClass('substructure-parallel')
                        node.data('structType', 'Parallel');
                        // node.data('structColor', '#50C878');
                        node.data('groupId', 'Parallel' + parallelId);

                        node.data('structs', {
                            ...node.data('structs'), Parallel: {
                                color: '#50C878', groupId: `Parallel_${parallelId}`
                            }
                        });
                    }
                })
            })

            u1.forEach((v1: Node) => {
                nodes.forEach((node: Node) => {
                    if (node.id() == v1.id()) {
                        node.data('parallelGroupIdVec', [...node.data('parallelGroupIdVec'), 'Parallel' + parallelId]);
                    }
                })
            })
            parallelId++;
        }
    }

    console.log("num of chains: ", chains.length);
};

interface NetworkInfo {
    component: cytoscape.Collection;
    nodes: cytoscape.Collection;

    index: number;
    nodeCount: number;

    width: number;
    height: number;

    bb: cytoscape.BoundingBox12;
}

SubstructureLayout.prototype.run = function () {

    this.stopped = false;
    this.trigger({
        type:'layoutstart',
        layout:this
    });

    const params = this.params;

    const components = this.cy.elements().components();

    const networkInfos: NetworkInfo[] = [];

    components.forEach((component: any, index: any) => {

        this.vnodes = [];
        this.vedges = [];

        console.log(`independent net: ${index + 1}`);

        // 1. get user defined boundingBox，if not then default cy container
        const bb = this.boundingBox || this.cy.extent();

        const width = bb.x2 - bb.x1;
        const height = bb.y2 - bb.y1;

        // none parent nodes
        let nodes = component.nodes().filter((node: Node) => !node.data('isParent'));

        const seenPairs = new Set<string>();
        const edgeSet = this.eles.edges().filter((edge: Edge) => {
            const sourceId = edge.source().id();
            const targetId = edge.target().id();

            // remove self-loop from layout
            if (sourceId === targetId) return false;

            const pairKey = [sourceId, targetId].sort().join('---');

            // remove duplicate edge from layout
            if (seenPairs.has(pairKey)) return false;

            seenPairs.add(pairKey);

            return true;
        });

        // 2. NOW define your collections to get the updated state
        if (params.RANDOMIZE_INITIAL_POSITIONS) {
            nodes.forEach((node: NodeSingular) => {
                node.position({
                    x: bb.x1 + Math.random() * width, y: bb.y1 + Math.random() * height
                });
            });
        }

        console.log("num of nodes: " + nodes.length);
        console.log("num of edges: " + edgeSet.length);

        // Capture initial state
        this.captureStep('Initial', 'Initial node positions before any layout', {
            nodeCount: nodes.length, edgeCount: edgeSet.length
        });

        // 1. Identify structures (mark structType and use components to separate independent cycles)
        this.identifyStructures(nodes);

        this.captureStep('Structure Detection', 'Structures identified (Stars, Cycles, Chains, Parallel)', {
            stars: nodes.filter((n: any) => n.data('structType')?.startsWith('Star')).length,
            cycles: nodes.filter((n: any) => n.data('structType') === 'Cycle').length,
            chains: nodes.filter((n: any) => n.data('structType') === 'Chain').length,
            parallel: nodes.filter((n: any) => n.data('structType') === 'Parallel').length
        });

        //************ Classify and save each type into the virtual-node array *///////////
        if (1) {
            nodes.forEach((n: any) => {
                if (n.data('structType') === 'Normal' || n.data('structType') === 'LeafButNotChain') {
                    let nodesarray: any[] = [];
                    nodesarray.push(n);
                    this.vnodes.push({
                        type: 'Normal',
                        id: n.id(),
                        center_x: n.data.x,
                        center_y: n.data.y,
                        radius: 1,
                        rotate_angle: 0,
                        nodes: nodesarray
                    } as VNode);
                    // }else if (n.data('structType') === 'Cycle') {
                } else if (n.data('structs')?.Cycle != null) {
                    let flag = true;
                    this.vnodes.forEach((vp: any) => {
                        // if (vp.type === 'Cycle' && vp.id === n.data('groupId')) {
                        if (vp.type === 'Cycle' && vp.id === n.data('structs')?.Cycle?.groupId) {  // for cycle that has star
                            vp.nodes.push(n);
                            flag = false;
                        }
                    });
                    if (flag) { // not saved yet
                        let nodesarray: any[] = [];
                        nodesarray.push(n);
                        this.vnodes.push({
                            type: 'Cycle',
                            id: n.data("groupId"),
                            center_x: n.data.x,
                            center_y: n.data.y,
                            radius: 1,
                            rotate_angle: 0,
                            nodes: nodesarray
                        } as VNode);
                    }
                } else if (n.data('structType') === 'Chain') {
                    let flag = true;
                    this.vnodes.forEach((vp: any) => {
                        if (vp.type === 'Chain' && vp.id === n.data('groupId')) {
                            vp.nodes.push(n);

                            flag = false;
                        }
                    });
                    if (flag) { // not saved yet
                        let nodesarray: any[] = [];
                        nodesarray.push(n);

                        this.vnodes.push({
                            type: 'Chain',
                            id: n.data("groupId"),
                            center_x: n.data.x,
                            center_y: n.data.y,
                            radius: 1,
                            rotate_angle: 0,
                            nodes: nodesarray
                        } as VNode);
                    }
                } else if (n.data('structType') === 'Parallel') {
                    let flag = true;
                    this.vnodes.forEach((vp: any) => {
                        if (vp.type === 'Parallel' && vp.id === n.data('groupId')) {
                            vp.nodes.push(n);
                            flag = false;
                        }
                    });
                    if (flag) { // not saved yet
                        let nodesarray: any[] = [];
                        nodesarray.push(n);
                        this.vnodes.push({
                            type: 'Parallel',
                            id: n.data("groupId"),
                            center_x: n.data.x,
                            center_y: n.data.y,
                            radius: 1,
                            rotate_angle: 0,
                            nodes: nodesarray
                        } as VNode);
                    }
                } else if (n.data('structType') == 'Star-Center' || n.data('structType') == 'Star-Member') {
                    // } else if ((n.data('structType') == 'Star-Center' || n.data('structType') == 'Star-Member' ) && (n.data('structs')?.Cycle == null ) ) {
                    let flag = true;
                    this.vnodes.forEach((vp: any) => {
                        if (vp.type === 'Star' && vp.id === n.data('groupId')) {
                            vp.nodes.push(n);
                            flag = false;
                        }
                    });
                    if (flag) { // not saved yet
                        let nodesarray: any[] = [];
                        nodesarray.push(n);
                        this.vnodes.push({
                            type: 'Star',
                            id: n.data("groupId"),
                            center_x: n.data.x,
                            center_y: n.data.y,
                            radius: 1,
                            rotate_angle: 0,
                            nodes: nodesarray
                        } as VNode);
                    }
                }
            });
        }
        this.captureStep('Virtual Nodes Created', 'Virtual nodes created for structures', {vnodeCount: this.vnodes.length});

        //construct virtual edges for virtual nodes
        if (1) {

            // --------------------------------------------------------
            // 1. Build mapping: real Node ID -> VNode
            // --------------------------------------------------------

            const nodeToVNode = new Map<string, VNode>();

            for (const vnode of this.vnodes) {

                if (!vnode.nodes) continue;

                for (const node of vnode.nodes) {

                    // Should Star-Member participate in VNode edge construction?
                    // Keep this consistent with the original logic:
                    //
                    // In the original code, when actually creating edges:
                    // if (n1.data("structType") != 'Star-Member')
                    //
                    // Therefore, Star-Member can be ignored here.
                    if (node.data("structType") === "Star-Member") {
                        continue;
                    }

                    nodeToVNode.set(node.id(), vnode);
                }
            }

            // --------------------------------------------------------
            // 2. Traverse the real Edges
            //
            // Determine directly:
            //
            // realNode1 -> VNode1
            // realNode2 -> VNode2
            //
            // Then:
            //
            // VNode1 <-> VNode2 : connectionCount++
            // --------------------------------------------------------

            const connectionMap = new Map<string, {
                source: VNode; target: VNode; count: number;
            }>();

            for (const edge of edgeSet) {

                const sourceNode = edge.source();
                const targetNode = edge.target();

                const sourceId = sourceNode.id();
                const targetId = targetNode.id();

                const sourceVNode = nodeToVNode.get(sourceId);

                const targetVNode = nodeToVNode.get(targetId);

                // If the corresponding VNode cannot be found, skip it
                if (!sourceVNode || !targetVNode) {
                    continue;
                }

                // ----------------------------------------------------
                // Edge is inside the same VNode
                //
                // Original logic:
                //
                // count == 2
                //
                // This means both ends of the edge are in the same VNode,
                // so no virtual edge is created.
                // ----------------------------------------------------

                if (sourceVNode === targetVNode) {
                    continue;
                }

                // ----------------------------------------------------
                // To ensure that:
                //
                // A -> B
                // B -> A
                //
                // A -> B and B -> A are treated as the same VEdge
                //
                // Use the VNode index / ID to build a unique key
                // ----------------------------------------------------

                const id1 = sourceVNode.id;
                const id2 = targetVNode.id;

                const key = id1 < id2 ? `${id1}---${id2}` : `${id2}---${id1}`;

                const existing = connectionMap.get(key);

                if (existing) {

                    existing.count++;

                } else {

                    connectionMap.set(key, {
                        source: id1 < id2 ? sourceVNode : targetVNode,

                        target: id1 < id2 ? targetVNode : sourceVNode,

                        count: 1
                    });
                }
            }

            // --------------------------------------------------------
            // 3. Create VEdges based on connectionMap
            // --------------------------------------------------------

            connectionMap.forEach(({
                                       source, target, count
                                   }) => {

                const vedge = new VEdge(source, target, count);

                this.vedges.push(vedge);
            });
        }

        this.captureStep('Virtual Edges Created', 'Virtual edges created between virtual nodes', {vedgeCount: this.vedges.length});
        ///////////////////////////////////////////////////////////////////////////

        /////////////////////////update virtual nodes's neighbors////////////////////////////////
        this.vedges.forEach((vedge: VEdge) => {
            vedge.source.neighbors = vedge.source.neighbors || [];
            vedge.target.neighbors = vedge.target.neighbors || [];
            vedge.source.neighbors.push(vedge.target);
            vedge.target.neighbors.push(vedge.source);
        })

        ///////////////////////////////// Update the centers of virtual nodes //////////////////////////
        this.vnodes.forEach((v1: any) => {
            if (v1.nodes && v1.nodes.length > 0) {
                const sumX = v1.nodes.reduce((acc: number, curr: any) => acc + (curr.position().x || 0), 0);
                const sumY = v1.nodes.reduce((acc: number, curr: any) => acc + (curr.position().y || 0), 0);

                v1.center_x = sumX / v1.nodes.length;
                v1.center_y = sumY / v1.nodes.length;
            } else {
                v1.center_x = v1.center_x || 0;
                v1.center_y = v1.center_y || 0;
            }
        });

        //////////////////////////////// Update the radius of virtual nodes /////////////////////////////
        if (1) {
            this.vnodes.forEach((v1: any) => {
                if (v1.type == 'Star') {
                    const allMemberNode = v1.nodes.filter((node: {
                        data: (arg0: string) => string;
                    }) => node.data('structType') !== 'Star-Center');
                    const ringSpacing = params.STAR_RING_SPACING;
                    const baseNodesInFirstRing = params.STAR_BASE_NODES_PER_RING;

                    // 1. Pre-calculate how many nodes go into each ring
                    const rings: any[][] = [];
                    let tempNodes = [...allMemberNode];
                    let currentRingSize = baseNodesInFirstRing;

                    while (tempNodes.length > 0) {
                        // Take the next chunk of nodes for this ring
                        rings.push(tempNodes.splice(0, currentRingSize));
                        // Increase capacity for the next ring
                        currentRingSize += baseNodesInFirstRing;
                    }
                    v1.radius = (rings.length + 0) * ringSpacing;
                } else if (v1.type == 'Cycle') {
                    const count = v1.nodes.length;
                    const k = params.CYCLE_NODE_SPACING;
                    v1.radius = (count * k) / (2 * Math.PI);
                } else if (v1.type == 'Parallel') {
                    // v1.radius = 300;
                    const n = v1.nodes.length;
                    if (n === 0) {
                        v1.radius = 0;
                    } else {
                        // 1. Mirror the core row/column logic of the original layout function
                        let finalCols = Math.ceil(Math.sqrt(n));
                        if (n < 3) finalCols = n;
                        const rows = Math.ceil(n / finalCols);

                        // 2. Use the spacing values passed to the layout (assuming both are 60)
                        const colSpacing = 60;
                        const rowSpacing = 60;

                        // 3. Calculate the grid width and height (center-to-edge distances)
                        const totalWidth = (finalCols - 1) * colSpacing;
                        const totalHeight = (rows - 1) * rowSpacing;

                        // 4. Use the Pythagorean theorem to calculate the distance from the center to a corner, plus a safety margin for one node itself (e.g. 20)
                        const nodeSelfRadius = 20;
                        v1.radius = Math.sqrt((totalWidth / 2) ** 2 + (totalHeight / 2) ** 2) + nodeSelfRadius;
                    }
                } else if (v1.type == 'Chain') {
                    const count = v1.nodes.length;
                    const miniMumRadius = params.CHAIN_MIN_RADIUS;
                    v1.radius = Math.max((count * params.CYCLE_NODE_SPACING) / (2 * Math.PI), miniMumRadius);
                } else {
                    v1.radius = 10;
                }
            });
        }

        this.captureStep('Virtual Nodes Positioned', 'Virtual node centers and radii calculated', null);

        //******************** virtual node force layout ************************
        if (params.LAYOUT_ALGORITHM === 'force') {
            const IDEAL_LENGTH = params.IDEAL_LENGTH;
            // const IDEAL_LENGTH=3000;

            const REPULSION = params.REPULSION;
            const SPRING_K = params.SPRING_K;
            const ITERATIONS = params.ITERATIONS;
            // const ITERATIONS =2000;
            // const ANGULAR_STRENGTH = params.ANGULAR_STRENGTH;
            //const USE_ANGULAR_FORCE = params.USE_ANGULAR_FORCE;

            var colisionFlag = true;
            let iter = 0;
            var maxAttractMove = 10e10;
            var maxRepulsetMove = 10e10;
            var numOfCollision = 0;

            // Adjust the exit threshold: only consider the whole graph truly stationary when the maximum movement of every node is below 0.5 pixels
            const ENERGY_THRESHOLD = 0.5;

            // Build the adjacency list in advance so it can be reused seamlessly for both "initial ordering" and the "later angular force"
            const adj = new Map<string, VNode[]>();
            this.vedges.forEach((e: VEdge) => {
                if (!e.source || !e.target) return;
                if (!adj.has(e.source.id)) adj.set(e.source.id, []);
                if (!adj.has(e.target.id)) adj.set(e.target.id, []);
                adj.get(e.source.id)!.push(e.target);
                adj.get(e.target.id)!.push(e.source);
            });

            this.vnodes.forEach((node: VNode) => {
                if (!node._permanentOrder) {
                    const allNeighbors = adj.get(node.id) || [];
                    // Filter out leaf nodes (terminal attached nodes with degree <= 2)
                    const leafNeighbors = allNeighbors.filter((nb: VNode) => {
                        const nbEdges = adj.get(nb.id) || [];
                        return nbEdges.length <= 2;
                    });

                    if (leafNeighbors.length >= 2) {
                        // Sort to establish a clean initial topological ordering
                        leafNeighbors.sort((a: VNode, b: VNode) => a.id.localeCompare(b.id));
                        node._permanentOrder = leafNeighbors.map((a: VNode) => a.id);

                        // Also give them an initial star-shaped radial geometric distribution that is guaranteed not to cross
                        leafNeighbors.forEach((nb: VNode, index: number) => {
                            const initAngle = (Math.PI * 2 / leafNeighbors.length) * index;
                            nb.center_x = node.center_x + Math.cos(initAngle) * IDEAL_LENGTH;
                            nb.center_y = node.center_y + Math.sin(initAngle) * IDEAL_LENGTH;
                        });
                    }
                }
            });

            while (iter < ITERATIONS) {
                if(this.stopped){
                    break;
                }
                iter++;

                // Reset total movement-energy statistics before each iteration
                maxAttractMove = 0;
                maxRepulsetMove = 0;
                let maxAngularMove = 0;
                numOfCollision = 0;

                ////////////////////// Place each node at the position of its corresponding virtual node

                    this.vnodes.forEach((v: any) => {
                        v.nodes.forEach((n: any) => {
                            n.position().x = v.center_x + Math.random() * 5;
                            n.position().y = v.center_y + Math.random() * 5;
                        })
                    });


                // [Core correction] Perform all physical calculations in virtual space; no longer repeatedly shuffle real nodes randomly within each frame
                this.captureStep('Virtual Nodes Positioned step ' + iter, 'Virtual node centers and radii calculated', null);

                // Count the current number of collisions
                for (let i = 0; i < this.vnodes.length; i++) {
                    for (let j = i + 1; j < this.vnodes.length; j++) {
                        const n1 = this.vnodes[i];
                        const n2 = this.vnodes[j];
                        let dx = n1.center_x - n2.center_x;
                        let dy = n1.center_y - n2.center_y;
                        const centerDist = Math.sqrt(dx * dx + dy * dy) || 1;
                        if (centerDist < (n1.radius + n2.radius)) {
                            numOfCollision++;
                        }
                    }
                }

                // Calculate the current global cooling factor (the core simulated-annealing control)
                const cooling = Math.pow(1 - iter / ITERATIONS, 2);

                /* ---------- A. Attraction (Spring) ---------- */
                if (1) {
                    this.vedges.forEach((e: VEdge) => {
                        const s = e.source;
                        const t = e.target;
                        if (!s || !t) return;

                        const dx = t.center_x - s.center_x;
                        const dy = t.center_y - s.center_y;
                        const centerDist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);

                        const surfaceDist = centerDist - (s.radius + t.radius);
                        const delta = Math.max(0, surfaceDist - IDEAL_LENGTH);

                        // Apply the cooling factor to the attractive force
                        let force = SPRING_K * delta * cooling;

                        const fx = (force * dx) / centerDist;
                        const fy = (force * dy) / centerDist;

                        s.center_x += fx;
                        s.center_y += fy;
                        t.center_x -= fx;
                        t.center_y -= fy;

                        maxAttractMove = Math.max(maxAttractMove, Math.abs(fx), Math.abs(fy));
                    });
                }

                /* ---------- B. Repulsion ---------- */
                if (1) {
                    const MIN_GAP = 0.1;
                    for (let i = 0; i < this.vnodes.length; i++) {
                        for (let j = i + 1; j < this.vnodes.length; j++) {
                            const n1 = this.vnodes[i];
                            const n2 = this.vnodes[j];

                            let dx = n1.center_x - n2.center_x;
                            let dy = n1.center_y - n2.center_y;

                            if (dx === 0 && dy === 0) {
                                dx = (Math.random() - 0.5) * 0.1;
                                dy = (Math.random() - 0.5) * 0.1;
                            }

                            const centerDist = Math.sqrt(dx * dx + dy * dy) || 1;
                            const minDistance = n1.radius + n2.radius;

                            let force = 0;
                            if (centerDist < minDistance) {
                                const overlap = minDistance - centerDist;
                                force = (REPULSION * 5) * (overlap / (centerDist + MIN_GAP));
                            } else {
                                const gap = centerDist - minDistance;
                                force = REPULSION / (gap * gap + 20);
                            }

                            // Apply the cooling factor to the repulsive force
                            force *= cooling;

                            const maxForceLimit = REPULSION * 2 * cooling;
                            if (force > maxForceLimit) force = maxForceLimit;

                            const fx = (force * dx) / centerDist;
                            const fy = (force * dy) / centerDist;

                            this.vnodes[i].center_x += fx;
                            this.vnodes[i].center_y += fy;
                            this.vnodes[j].center_x -= fx;
                            this.vnodes[j].center_y -= fy;

                            maxRepulsetMove = Math.max(maxRepulsetMove, Math.abs(fx), Math.abs(fy));
                        }
                    }
                }

                /* ---------- C. Angular Repulsion ---------- */
                if (params.USE_ANGULAR_FORCE) {
                    const norm = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

                    type AngleItem = {
                        nb: VNode; dx: number; dy: number; dist: number; angle: number;
                    };

                    const ANGULAR_STRENGTH = params.ANGULAR_STRENGTH;
                    const MAX_FORCE = 2.0;

                    this.vnodes.forEach((node: VNode) => {

                        if (!node._permanentOrder || node._permanentOrder.length < 2) {
                            return;
                        }

                        const orderMap = new Map<string, number>(node._permanentOrder.map((id: string, index: number) => [id, index]));

                        const leaves: VNode[] = this.vnodes.filter((v: VNode) => orderMap.has(v.id));

                        const count = leaves.length;

                        if (count < 2) {
                            return;
                        }

                        const idealGap = (Math.PI * 2) / count;

                        const items: AngleItem[] = leaves
                            .map((nb: VNode): AngleItem => {

                                const dx = nb.center_x - node.center_x;

                                const dy = nb.center_y - node.center_y;

                                return {
                                    nb, dx, dy, dist: Math.sqrt(dx * dx + dy * dy) || 1, angle: Math.atan2(dy, dx)
                                };
                            })
                            .sort((a: AngleItem, b: AngleItem): number => a.angle - b.angle);

                        for (let i = 0; i < count; i++) {

                            const left: AngleItem = items[i];

                            const right: AngleItem = items[(i + 1) % count];

                            let gap = norm(right.angle - left.angle);

                            if (gap < 0) {
                                gap += Math.PI * 2;
                            }

                            // The gap is already large enough
                            if (gap >= idealGap) {
                                continue;
                            }

                            const gapError = idealGap - gap;

                            let force = gapError * ANGULAR_STRENGTH;

                            force = Math.min(force, MAX_FORCE);

                            // Tangential direction of the left item
                            const ltx = -left.dy / left.dist;

                            const lty = left.dx / left.dist;

                            // Tangential direction of the right item
                            const rtx = -right.dy / right.dist;

                            const rty = right.dx / right.dist;

                            // Push them apart in opposite directions
                            left.nb.center_x -= ltx * force;

                            left.nb.center_y -= lty * force;

                            right.nb.center_x += rtx * force;

                            right.nb.center_y += rty * force;

                            if (typeof maxAngularMove !== "undefined") {
                                maxAngularMove = Math.max(maxAngularMove, force);
                            }
                        }
                    });
                }

                // [Exit criterion] Only allow an early safe exit when all movement energy in the graph has completely settled and become extremely small
                const totalMaxMovement = Math.max(maxAttractMove, maxRepulsetMove, maxAngularMove);
                if (totalMaxMovement < ENERGY_THRESHOLD && iter > 10) {
                    break;
                }
            }

            this.vnodes.forEach((v: any) => {
                v.nodes.forEach((n: any) => {
                    n.position().x = v.center_x;
                    n.position().y = v.center_y;
                })
            });

            //********************** anti-collision step
            if (1) {
                colisionFlag = true;
                numOfCollision = 0;
                const padding = IDEAL_LENGTH;
                let iter = 0;
                while (colisionFlag) {
                    if(this.stopped){
                        break;
                    }
                    iter++;
                    colisionFlag = false;
                    for (let i = 0; i < this.vnodes.length; i++) {
                        for (let j = i + 1; j < this.vnodes.length; j++) {
                            const n1 = this.vnodes[i];
                            const n2 = this.vnodes[j];

                            let dx = n1.center_x - n2.center_x;
                            let dy = n1.center_y - n2.center_y;

                            // if two nodes are exactly the same position
                            if (dx === 0 && dy === 0) {
                                dx = (Math.random() - 0.5) * 0.1;
                                dy = (Math.random() - 0.5) * 0.1;
                            }

                            const centerDist = Math.sqrt(dx * dx + dy * dy) || 1;

                            const r1 = n1.radius;
                            const r2 = n2.radius;
                            const minDistance = r1 + r2;

                            if (centerDist < (minDistance + padding)) {
                                colisionFlag = true;
                                numOfCollision++;

                                // 1.2 Calculate the physical overlap distance
                                const overlap = minDistance + padding - centerDist;

                                // 1.3 Calculate the normalized direction vector
                                let nx = dx / centerDist;
                                let ny = dy / centerDist;

                                // 1.4 Move each node half the distance in opposite directions (50%)
                                const moveDistance = overlap / 2;
                                const offsetX = nx * moveDistance;
                                const offsetY = ny * moveDistance;

                                n1.center_x += offsetX;
                                n1.center_y += offsetY;

                                n2.center_x -= offsetX;
                                n2.center_y -= offsetY;
                            }
                        }
                    }

                    // [Optimization 3] Safety valve: exit directly if the iteration count becomes too large (typically when nodes are extremely dense)
                    if (numOfCollision > 10000) {
                        console.warn("avoid dead loop");
                        break;
                    }
                    // this.captureStep('Anti-collision', 'Eliminate all collisions ' + iter, { iterations: ITERATIONS });
                }
                this.captureStep('Anti-collision', 'Eliminate all collisions', {iterations: ITERATIONS});
                if (1) {
                    numOfCollision = 0;
                    for (let i = 0; i < this.vnodes.length; i++) {
                        for (let j = i + 1; j < this.vnodes.length; j++) {
                            const n1 = this.vnodes[i];
                            const n2 = this.vnodes[j];

                            let dx = n1.center_x - n2.center_x;
                            let dy = n1.center_y - n2.center_y;

                            const centerDist = Math.sqrt(dx * dx + dy * dy);
                            if (centerDist < (IDEAL_LENGTH + n1.radius + n2.radius)) {
                                numOfCollision++
                            }
                        }
                    }
                }
            }

            this.captureStep('Virtual Node Layout', 'Force-directed layout applied to virtual nodes', {iterations: ITERATIONS});
        }

        //******************** stress force layout ************************
        // Stress Majorization algorithm
        // All-Pairs shortest-path calculation and Guttman Transform (weighted Laplacian updates),
        // while retaining the polar-coordinate initialization for leaf nodes and the Anti-Collision post-processing in the original code
        if (params.LAYOUT_ALGORITHM === 'stress') {
            const IDEAL_LENGTH = params.IDEAL_LENGTH;
            const ITERATIONS = params.ITERATIONS;
            const ENERGY_THRESHOLD = 0.5;

            const numNodes = this.vnodes.length;
            if (numNodes === 0) return;

            // Index mapping: ID -> array index, for matrix operations
            const nodeIndexMap = new Map<string, number>();
            this.vnodes.forEach((v: VNode, i: number) => nodeIndexMap.set(v.id, i));

            // Extract the adjacency list for reuse during initialization
            const adj = new Map<string, VNode[]>();
            this.vedges.forEach((e: VEdge) => {
                if (!e.source || !e.target) return;
                if (!adj.has(e.source.id)) adj.set(e.source.id, []);
                if (!adj.has(e.target.id)) adj.set(e.target.id, []);
                adj.get(e.source.id)!.push(e.target);
                adj.get(e.target.id)!.push(e.source);
            });

            // -------------------------------------------------------------
            // [Preprocessing 1] Calculate the shortest-path distance matrix between every pair of nodes in the graph (APSP - Floyd Warshall)
            // -------------------------------------------------------------
            const distMatrix: number[][] = Array.from({length: numNodes}, () => new Array(numNodes).fill(Infinity));
            const weightMatrix: number[][] = Array.from({length: numNodes}, () => new Array(numNodes).fill(0));

            for (let i = 0; i < numNodes; i++) distMatrix[i][i] = 0;

            // Assign the ideal distance baseline based on real edges
            this.vedges.forEach((e: VEdge) => {
                if (!e.source || !e.target) return;
                const u = nodeIndexMap.get(e.source.id);
                const v = nodeIndexMap.get(e.target.id);
                if (u !== undefined && v !== undefined) {
                    const idealDist = IDEAL_LENGTH + e.source.radius + e.target.radius;
                    distMatrix[u][v] = Math.min(distMatrix[u][v], idealDist);
                    distMatrix[v][u] = Math.min(distMatrix[v][u], idealDist);
                }
            });

            // Use Floyd-Warshall to compute shortest paths between all node pairs
            for (let k = 0; k < numNodes; k++) {
                for (let i = 0; i < numNodes; i++) {
                    for (let j = 0; j < numNodes; j++) {
                        if (distMatrix[i][k] + distMatrix[k][j] < distMatrix[i][j]) {
                            distMatrix[i][j] = distMatrix[i][k] + distMatrix[k][j];
                        }
                    }
                }
            }

            // Calculate the weight matrix W_ij = 1 / (d_ij ^ 2)
            for (let i = 0; i < numNodes; i++) {
                for (let j = 0; j < numNodes; j++) {
                    if (i !== j && distMatrix[i][j] !== Infinity) {
                        // Account for the actual node radius to prevent excessive crowding
                        const minR = this.vnodes[i].radius + this.vnodes[j].radius;
                        const d = Math.max(distMatrix[i][j], minR);
                        weightMatrix[i][j] = 1 / (d * d);
                    }
                }
            }

            // -------------------------------------------------------------
            // [Preprocessing 2] Establish topological ordering and initial coordinates
            // -------------------------------------------------------------
            this.vnodes.forEach((node: VNode) => {
                if (!node._permanentOrder) {
                    const allNeighbors = adj.get(node.id) || [];
                    const leafNeighbors = allNeighbors.filter((nb: VNode) => {
                        const nbEdges = adj.get(nb.id) || [];
                        return nbEdges.length <= 2;
                    });

                    if (leafNeighbors.length >= 2) {
                        leafNeighbors.sort((a: VNode, b: VNode) => a.id.localeCompare(b.id));
                        node._permanentOrder = leafNeighbors.map((a: VNode) => a.id);

                        leafNeighbors.forEach((nb: VNode, index: number) => {
                            const initAngle = (Math.PI * 2 / leafNeighbors.length) * index;
                            nb.center_x = node.center_x + Math.cos(initAngle) * IDEAL_LENGTH;
                            nb.center_y = node.center_y + Math.sin(initAngle) * IDEAL_LENGTH;
                        });
                    }
                }
            });

            // -------------------------------------------------------------
            // [Main loop] Stress Majorization iteration (Guttman Transform)
            // -------------------------------------------------------------
            let iter = 0;
            while (iter < ITERATIONS) {
                if (this.stopped) {
                    break;
                }
                iter++;
                let maxStressMove = 0;

                // Temporary array for the new coordinates calculated in this iteration
                const nextX = new Float64Array(numNodes);
                const nextY = new Float64Array(numNodes);

                for (let i = 0; i < numNodes; i++) {
                    const vi = this.vnodes[i];
                    let sumWeight = 0;
                    let sumX = 0;
                    let sumY = 0;

                    for (let j = 0; j < numNodes; j++) {
                        if (i === j) continue;

                        const vj = this.vnodes[j];
                        const wij = weightMatrix[i][j];
                        if (wij === 0) continue;

                        const dij = distMatrix[i][j];

                        let dx = vi.center_x - vj.center_x;
                        let dy = vi.center_y - vj.center_y;

                        if (dx === 0 && dy === 0) {
                            dx = (Math.random() - 0.5) * 0.1;
                            dy = (Math.random() - 0.5) * 0.1;
                        }

                        const currentDist = Math.sqrt(dx * dx + dy * dy) || 1;

                        // Guttman Transform formula: calculate the weighted average obtained by projecting/pulling all other nodes j toward/from i according to the ideal distance dij
                        const invDist = dij / currentDist;
                        sumX += wij * (vj.center_x + dx * invDist);
                        sumY += wij * (vj.center_y + dy * invDist);
                        sumWeight += wij;
                    }

                    if (sumWeight > 0) {
                        nextX[i] = sumX / sumWeight;
                        nextY[i] = sumY / sumWeight;
                    } else {
                        nextX[i] = vi.center_x;
                        nextY[i] = vi.center_y;
                    }
                }

                // Apply coordinate updates and track the maximum displacement
                for (let i = 0; i < numNodes; i++) {
                    const vi = this.vnodes[i];
                    const moveX = Math.abs(nextX[i] - vi.center_x);
                    const moveY = Math.abs(nextY[i] - vi.center_y);
                    maxStressMove = Math.max(maxStressMove, moveX, moveY);

                    vi.center_x = nextX[i];
                    vi.center_y = nextY[i];
                }

                // Check the convergence condition and exit early
                if (maxStressMove < ENERGY_THRESHOLD && iter > 10) {
                    break;
                }
            }

            // Map the calculated virtual coordinates back to the real nodes
            this.vnodes.forEach((v: any) => {
                v.nodes.forEach((n: any) => {
                    n.position().x = v.center_x;
                    n.position().y = v.center_y;
                });
            });

            // -------------------------------------------------------------
            // [Post-processing] Collision / overlap removal (Node Overlap Removal)
            // -------------------------------------------------------------
            if (1) {
                let colisionFlag = true;
                let numOfCollision = 0;
                const padding = IDEAL_LENGTH;
                let overlapIter = 0;

                while (colisionFlag) {
                    if (this.stopped) {
                        break;
                    }
                    overlapIter++;
                    colisionFlag = false;

                    for (let i = 0; i < this.vnodes.length; i++) {
                        for (let j = i + 1; j < this.vnodes.length; j++) {
                            const n1 = this.vnodes[i];
                            const n2 = this.vnodes[j];

                            let dx = n1.center_x - n2.center_x;
                            let dy = n1.center_y - n2.center_y;

                            if (dx === 0 && dy === 0) {
                                dx = (Math.random() - 0.5) * 0.1;
                                dy = (Math.random() - 0.5) * 0.1;
                            }

                            const centerDist = Math.sqrt(dx * dx + dy * dy) || 1;
                            const minDistance = n1.radius + n2.radius;

                            if (centerDist < (minDistance + padding)) {
                                colisionFlag = true;
                                numOfCollision++;

                                const overlap = minDistance + padding - centerDist;
                                const nx = dx / centerDist;
                                const ny = dy / centerDist;

                                const moveDistance = overlap / 2;
                                n1.center_x += nx * moveDistance;
                                n1.center_y += ny * moveDistance;
                                n2.center_x -= nx * moveDistance;
                                n2.center_y -= ny * moveDistance;
                            }
                        }
                    }

                    if (numOfCollision > 10000 || overlapIter > 300) {
                        console.warn("Avoid dead loop in overlap removal");
                        break;
                    }
                }
                this.captureStep('Anti-collision', 'Eliminate all collisions', {iterations: ITERATIONS});
            }

            this.captureStep('Virtual Node Layout', 'Stress Majorization layout applied to virtual nodes', {iterations: ITERATIONS});
        }

        /////////////////////////////////////////////////////////////////////////////
        if (1) {
            if (params.SPREAD_V_NODES) {
                this.vnodes.forEach((v: any) => {
                    v.nodes.forEach((n: any) => {
                        n.position().x = v.center_x + Math.random() * 5;
                        n.position().y = v.center_y + Math.random() * 5;
                    })
                });
                this.captureStep('Nodes Spread to VNode Centers', 'Real nodes spread to their virtual node centers', null);
            }
        }

        /////////////////////  Delete the old layout so that only virtual-node VNode layout remains  ////////////////
        if (!params.SUBSTRUCTURE_LAYOUT) {
            const IDEAL_LENGTH = params.LEAF_NODE_DISTANCE;
            this.vnodes.forEach((v: any) => {
                if (v.type == 'Star') {

                    // if(targetNode){    // star is an independent star, not attached to a Cycle
                    if (1) {
                        const allMemberNode = v.nodes.filter((node: {
                            data: (arg0: string) => string;
                        }) => node.data('structType') !== 'Star-Center');
                        const ringSpacing = params.STAR_RING_SPACING;
                        const baseNodesInFirstRing = params.STAR_BASE_NODES_PER_RING;

                        // 1. Pre-calculate how many nodes go into each ring
                        const rings: any[][] = [];
                        let tempNodes = [...allMemberNode];
                        let currentRingSize = baseNodesInFirstRing;

                        while (tempNodes.length > 0) {
                            // Take the next chunk of nodes for this ring
                            rings.push(tempNodes.splice(0, currentRingSize));
                            // Increase capacity for the next ring
                            currentRingSize += baseNodesInFirstRing;
                        }

                        // If the last ring contains only one node,
                        // move it to the previous ring.
                        if (rings.length > 1 && rings[rings.length - 1].length === 1) {
                            const lastNode = rings.pop()![0];
                            rings[rings.length - 1].push(lastNode);
                        }

                        // 2. Position the nodes ring by ring
                        rings.forEach((ringNodes, ringIdx) => {
                            const ringNumber = ringIdx + 1;
                            const radius = ringNumber * ringSpacing;
                            const totalInThisRing = ringNodes.length; // This is the key for even distribution

                            ringNodes.forEach((node, nodeIdx) => {
                                // Evenly distribute based on actual count in THIS ring
                                let angle = ringIdx * Math.PI / 12.0 + (nodeIdx / totalInThisRing) * 2 * Math.PI;

                                // Stagger every ring
                                angle += (Math.PI / totalInThisRing);

                                node.position({
                                    x: v.center_x + Math.cos(angle) * radius, y: v.center_y + Math.sin(angle) * radius
                                });
                            });
                        });
                    }
                } else if (v.type == 'Chain') {
                    // 1. Still use a temporary object to group nodes by groupId
                    const chainGroups: { [key: string]: any[] } = {};

                    v.nodes.forEach((node: any) => {
                        if (node.data('structType') == 'Chain') {
                            const groupId = node.data('groupId');
                            if (!chainGroups[groupId]) {
                                chainGroups[groupId] = [];
                            }
                            if (node.degree() === 1) { // Put the leaf node of the chain first, to identify which node is the chain leaf
                                chainGroups[groupId].unshift(node);//Insert the element at the beginning of the array and shift the existing elements back.
                            } else {
                                chainGroups[groupId].push(node);
                            }
                        }
                    });

                    for (const groupId in chainGroups) {
                        if (chainGroups.hasOwnProperty(groupId)) {
                            const gNodes = chainGroups[groupId];

                            gNodes.sort((a, b) => {
                                return Number(a.data('innerId')) - Number(b.data('innerId'));
                            });

                            const count = gNodes.length;

                            if (count >= 2) {

                                // ============================================================
                                // 1. Calculate the arithmetic mean center of the current node group
                                // ============================================================

                                let cx = 0;
                                let cy = 0;

                                gNodes.forEach((n: any) => {

                                    cx += n.position().x;
                                    cy += n.position().y;

                                });

                                cx /= count;
                                cy /= count;

                                // ============================================================
                                // 2. Special handling: exactly 3 nodes
                                //
                                // Three nodes form a strict equilateral triangle
                                //
                                // Note:
                                // Do not use CHAIN_MIN_RADIUS
                                // Prevent the triangle from being artificially enlarged
                                // ============================================================

                                if (count === 3) {

                                    // --------------------------------------------------------
                                    // Triangle side length
                                    //
                                    // CYCLE_NODE_SPACING represents the desired node spacing
                                    // --------------------------------------------------------

                                    const sideLength = params.CYCLE_NODE_SPACING;

                                    // --------------------------------------------------------
                                    // Circumradius of the equilateral triangle
                                    //
                                    // side = sqrt(3) * radius
                                    //
                                    // Therefore:
                                    //
                                    // radius = side / sqrt(3)
                                    // --------------------------------------------------------

                                    const radius = sideLength / Math.sqrt(3);

                                    // ========================================================
                                    // 3. Search for the best rotation angle
                                    //
                                    // Use exactly the same strategy as for a normal network
                                    //
                                    // 0°
                                    // 10°
                                    // 20°
                                    // ...
                                    // 350°
                                    //
                                    // For each calculation:
                                    //
                                    // totalEdgeLength(edges)
                                    //
                                    // Find the minimum value
                                    // ========================================================

                                    let minTotalLength = Number.POSITIVE_INFINITY;

                                    let bestRotate = 0;

                                    for (let rotate = 0; rotate < 360; rotate += 10) {

                                        // ----------------------------------------------------
                                        // Three nodes are evenly distributed around the circumference
                                        //
                                        // Between every pair of nodes:
                                        //
                                        // 120°
                                        //
                                        // Therefore, an equilateral triangle is naturally formed
                                        // ----------------------------------------------------

                                        gNodes.forEach((n: any, i: number) => {

                                            const angle = i * 2 * Math.PI / 3 + rotate * Math.PI / 180;

                                            n.position({

                                                x: cx + Math.cos(angle) * radius,

                                                y: cy + Math.sin(angle) * radius

                                            });

                                        });

                                        // ----------------------------------------------------
                                        // Calculate the total edge length at the current rotation angle
                                        // ----------------------------------------------------

                                        const totalLength = totalEdgeLength(edgeSet);

                                        // ----------------------------------------------------
                                        // Save the best rotation
                                        // ----------------------------------------------------

                                        if (totalLength < minTotalLength) {

                                            minTotalLength = totalLength;

                                            bestRotate = rotate;

                                        }

                                    }

                                    // ========================================================
                                    // 4. Reapply positions using the best rotation angle
                                    // ========================================================

                                    gNodes.forEach((n: any, i: number) => {

                                        const angle = i * 2 * Math.PI / 3 + bestRotate * Math.PI / 180;

                                        n.position({

                                            x: cx + Math.cos(angle) * radius,

                                            y: cy + Math.sin(angle) * radius

                                        });

                                    });

                                    return;
                                }

                                // ============================================================
                                // 3. count > 3
                                //
                                // Keep the original layout strategy:
                                //
                                // gNodes[0]
                                //     ↓
                                // Center node
                                //
                                // gNodes[1...]
                                //     ↓
                                // Circumference nodes
                                // ============================================================

                                // ============================================================
                                // 4. Calculate the standard radius based on the number of nodes
                                // ============================================================

                                const miniMumRadius = params.CHAIN_MIN_RADIUS;

                                const radius = Math.max((count * params.CYCLE_NODE_SPACING) / (2 * Math.PI),

                                    miniMumRadius);

                                // ============================================================
                                // 5. Sort / circumference nodes
                                // ============================================================

                                const sorted = gNodes.slice(1);

                                // ============================================================
                                // 6. Search for the best rotation angle
                                // ============================================================

                                let minTotalLength = Number.POSITIVE_INFINITY;

                                let bestRotate = 0;

                                for (let rotate = 0; rotate < 360; rotate += 10) {

                                    // --------------------------------------------------------
                                    // Forcefully overwrite the coordinates of circumference nodes
                                    // --------------------------------------------------------

                                    sorted.forEach((n: any, i: number) => {

                                        const angle = (i / sorted.length) * 2 * Math.PI + rotate * Math.PI / 180;

                                        n.position({

                                            x: cx + Math.cos(angle) * radius,

                                            y: cy + Math.sin(angle) * radius

                                        });

                                    });

                                    // --------------------------------------------------------
                                    // Calculate the total edge length at the current rotation
                                    // --------------------------------------------------------

                                    const totalLength = totalEdgeLength(edgeSet);

                                    // --------------------------------------------------------
                                    // Save the best rotation
                                    // --------------------------------------------------------

                                    if (totalLength < minTotalLength) {

                                        minTotalLength = totalLength;

                                        bestRotate = rotate;

                                    }

                                }

                                // ============================================================
                                // 7. Apply the best rotation angle
                                // ============================================================

                                sorted.forEach((n: any, i: number) => {

                                    const angle = (i / sorted.length) * 2 * Math.PI + bestRotate * Math.PI / 180;

                                    n.position({

                                        x: cx + Math.cos(angle) * radius,

                                        y: cy + Math.sin(angle) * radius

                                    });
                                });

                                // ============================================================
                                // 8. Place the first node at the center
                                // ============================================================

                                gNodes[0].position({

                                    x: cx, y: cy

                                });
                            }

                        }
                    }
                } else if (v.type == 'Parallel') {
                    let endVec: any = [];
                    nodes.forEach((n: any, i: number) => {
                        if (n.data('parallelGroupIdVec').includes(v.id) && n.data('structType') != 'Parallel') {
                            // Extract the endpoint nodes of the same group
                            endVec.push(n);
                        }
                    })

                    if (endVec.length >= 2) { // should be >= 2; otherwise an error may occur

                        // There is a node array; distribute all nodes in it evenly along the perpendicular bisector of the two points n1 and n2
                        const p1 = endVec[0].position();
                        const p2 = endVec[1].position();
                        const diff = {x: p2.x - p1.x, y: p2.y - p1.y};

                        layoutRectangular(v.nodes, {x: v.center_x, y: v.center_y}, diff);
                    }
                }
                if (v.type == 'Cycle') {
                    // 1. Check that nodes exists and is not empty
                    if (v.nodes && v.nodes.length > 0) {
                        v.nodes.sort((a: any, b: any) => {
                            // Assume innerId is a number. If it is a string, localeCompare can be used
                            const idA = a.data('innerId') ?? 0;
                            const idB = b.data('innerId') ?? 0;
                            return idA - idB; // sort in ascending order
                        });
                    }
                    // 2. Calculate the standard radius based on the number of nodes (to keep node spacing close to k)
                    const count = v.nodes.length;
                    const k = params.CYCLE_NODE_SPACING;
                    const radius = (count * k) / (2 * Math.PI);

                    // 3. Sort to prevent nodes from flickering around the circumference
                    const sorted = v.nodes;
                    const sortedReverse = sorted.slice().reverse();
                    let reverseFlag = false;

                    let minTotalLength = 10e10;
                    let bestRotate = 0;    //Find the best rotation angle

                    //clock-wise
                    for (let rotate = 0; rotate < 360; rotate = rotate + 10) {
                        // 4. Forcefully overwrite coordinates: this guarantees a "perfect circle"
                        sorted.forEach((n: any, i: number) => {
                            const angle = (i / count) * 2 * Math.PI + rotate;
                            n.position({
                                x: v.center_x + Math.cos(angle) * radius, y: v.center_y + Math.sin(angle) * radius
                            });
                        });
                        const totalLength = totalEdgeLength(edgeSet);
                        if (minTotalLength > totalLength) {
                            minTotalLength = totalLength;
                            bestRotate = rotate;
                        }
                    }

                    //anti-clock-wise
                    for (let rotate = 0; rotate < 360; rotate = rotate + 10) {
                        // 4. Forcefully overwrite coordinates: this guarantees a "perfect circle"
                        sortedReverse.forEach((n: any, i: number) => {
                            const angle = (i / count) * 2 * Math.PI + rotate;
                            n.position({
                                x: v.center_x + Math.cos(angle) * radius, y: v.center_y + Math.sin(angle) * radius
                            });
                        });
                        const totalLength = totalEdgeLength(edgeSet);
                        if (minTotalLength > totalLength) {
                            reverseFlag = true;
                            minTotalLength = totalLength;
                            bestRotate = rotate;
                        }
                    }

                    // 4. Forcefully overwrite coordinates: this guarantees a "perfect circle"
                    if (!reverseFlag) {
                        sorted.forEach((n: any, i: number) => {
                            const angle = (i / count) * 2 * Math.PI + bestRotate;
                            n.position({
                                x: v.center_x + Math.cos(angle) * radius, y: v.center_y + Math.sin(angle) * radius
                            });
                        });
                    } else {
                        sortedReverse.forEach((n: any, i: number) => {
                            const angle = (i / count) * 2 * Math.PI + bestRotate;
                            n.position({
                                x: v.center_x + Math.cos(angle) * radius, y: v.center_y + Math.sin(angle) * radius
                            });
                        });
                    }
                }
            })

            nodes.forEach((n: any, i: number) => {
                if (n.data('structType') == 'LeafButNotChain') {

                    let fatherPos = n.neighborhood().nodes().first().position();

                    let maxTotalLength = 10e10;
                    let bestRotate = 0;    //Find the best rotation angle
                    let aroundNodesVec: any[] = [];

                    nodes.forEach((nd: any, i: number) => {
                        if (((nd.position().x - fatherPos.x) * (nd.position().x - fatherPos.x) + (nd.position().y - fatherPos.y) * (nd.position().y - fatherPos.y)) < 2 * IDEAL_LENGTH * IDEAL_LENGTH) {
                            aroundNodesVec.push(nd);
                        }
                    })

                    for (let rotate = 0; rotate <= 360; rotate = rotate + 10) {
                        n.position({
                            x: fatherPos.x + Math.cos(rotate * 3.14 / 180) * IDEAL_LENGTH,
                            y: fatherPos.y + Math.sin(rotate * 3.14 / 180) * IDEAL_LENGTH
                        });
                        let totalLength = 0;
                        aroundNodesVec.forEach((nd: any, i: number) => {
                            if (nd.id() != n.id()) {
                                const tmpDis = 1 / Math.sqrt((nd.position().x - n.position().x) * (nd.position().x - n.position().x) + (nd.position().y - n.position().y) * (nd.position().y - n.position().y));
                                totalLength += tmpDis;
                            }
                        });

                        if (maxTotalLength > totalLength) {
                            maxTotalLength = totalLength;
                            bestRotate = rotate;
                        }
                    }
                    //
                    n.position({
                        x: fatherPos.x + Math.cos(bestRotate * 3.14 / 180) * IDEAL_LENGTH,
                        y: fatherPos.y + Math.sin(bestRotate * 3.14 / 180) * IDEAL_LENGTH
                    });

                }
            })
            this.captureStep('Substructure Layout', 'Individual structures laid out (Cycles, Stars, Chains, Parallel)', null);
        }

        if (nodes.length == 2) {
            nodes[0].position().x = 0;
            nodes[0].position().y = 0;
            nodes[1].position().x = 100;
            nodes[1].position().y = 0;
        }

        if (nodes.length == 3) {
            nodes[0].position().x = 0;
            nodes[0].position().y = 0;
            nodes[1].position().x = 100;
            nodes[1].position().y = 0;
            nodes[2].position().x = 50;
            nodes[2].position().y = 90;
        }

        rotateNetworkToMinimumBoundingBox(nodes)

        if (1) {
            let maxDis = 0;
            let maxS = 0;
            let maxT = 0;
            let minDist = 10e10;
            let minS = 0;
            let minT = 0;
            let avgDis = 0;
            edgeSet.forEach((e: { source: () => any; target: () => any; position: { y: number; }; }) => {
                const s = e.source();
                const t = e.target();
                const distance = Math.sqrt(Math.pow(s.position().x - t.position().x, 2) + Math.pow(s.position().y - t.position().y, 2));
                if (maxDis < distance) {
                    maxDis = distance;
                    maxS = s.id();
                    maxT = t.id();
                }
                if (minDist > distance) {
                    minDist = distance;
                    minS = s.id();
                    minT = t.id();
                }
                avgDis += distance;
            })
            console.log("maxDis:", maxDis, " ", maxS, "->", maxT);
            console.log("minDist:", minDist, " ", minS, "->", minT);
            console.log("avgDis:", avgDis / edgeSet.length);
        }

        const bb2 = nodes.boundingBox();

        networkInfos.push({

            component: component,

            nodes: nodes,

            index: index,

            nodeCount: nodes.length,

            width: bb2.w,

            height: bb2.h,

            bb: bb2

        });

    });

    this.packNetworks(networkInfos);

    if (1) {

        networkInfos.forEach((networkInfo, index) => {

            const nodes = networkInfo.nodes;

            // All parent IDs in the current network
            const parentIds = new Set<string>();

            nodes.forEach((node: any) => {

                const groupId = node.data('groupId');

                if (groupId) {
                    parentIds.add(index + "_" + groupId);
                }

            });

            // ========================================
            // Create parent
            // ========================================

            parentIds.forEach((parentId: string) => {

                // Parent already exists
                if (!this.cy.getElementById(parentId).empty()) {
                    return;
                }

                // Find children
                const children = nodes.filter((node: any) => {
                    return (index + "_" + node.data('groupId')) === parentId;
                });

                if (children.length === 0) {
                    return;
                }

                // ========================================
                // ① Save the original positions of the children
                // ========================================

                const originalPositions = new Map<string, {
                    x: number, y: number
                }>();

                children.forEach((node: any) => {

                    const pos = node.position();

                    originalPositions.set(node.id(), {
                        x: pos.x, y: pos.y
                    });

                });

                // ========================================
                // ② Calculate the bounding box from the original positions
                // ========================================

                const bb = children.boundingBox();

                const centerX = (bb.x1 + bb.x2) / 2;
                const centerY = (bb.y1 + bb.y2) / 2;

                // ========================================
                // ③ Create the parent
                // ========================================

                const parent = this.cy.add({

                    group: 'nodes',

                    data: {
                        id: parentId, label: parentId
                    },

                    position: {
                        x: centerX, y: centerY
                    },

                    classes: 'substructure-group'

                }).first();

                // ========================================
                // ④ Establish the compound relationship
                // ========================================

                children.forEach((node: any) => {

                    node.move({
                        parent: parentId
                    });

                });

                // ========================================
                // ⑤ Restore the original absolute positions of the children
                // ========================================

                children.forEach((node: any) => {

                    const original = originalPositions.get(node.id());

                    if (!original) {
                        return;
                    }

                    node.position({
                        x: original.x, y: original.y
                    });

                });

                // ========================================
                // ⑥ Restore the center position of the parent
                // ========================================

                parent.position({
                    x: centerX, y: centerY
                });
            });

        });

    }

    this.captureStep('Final', 'Final layout complete', null);

    this.cy.fit(null, 50);

    this.trigger({
        type: 'layoutstop'
    });

    return this;
};

SubstructureLayout.prototype.destroy = function () {
    this.stop();

    const nodes = this.eles ? this.eles.nodes() : (this.cy ? this.cy.nodes() : null);

    if (nodes && nodes.length > 0) {
        nodes.forEach((node: any) => {
            node.removeClass([
                'substructure-cycle',
                'substructure-chain',
                'substructure-star',
                'substructure-star-center',
                'substructure-member',
                'substructure-parallel'
            ].join(' '));

            node.removeData('structType');
            node.removeData('groupId');
            node.removeData('innerId');
            node.removeData('parallelGroupIdVec');
            node.removeData('structs');
        });
    }

    if (this.cy && this._onEventHandler) {
        this.cy.off('tap', this._onEventHandler);
        this._onEventHandler = null;
    }

    this.vnodes = [];
    this.vedges = [];
    this.steps = [];
    this.currentStepIndex = -1;

    if (this.eles) {
        this.eles.emit('layoutdestroy');
    }

    return this;
};

SubstructureLayout.prototype.stop = function () {
    if (this.stopped) {
        return this;
    }

    this.stopped = true;

    if (this.frameId) {
        cancelAnimationFrame(this.frameId);
        this.frameId = null;
    }

    this.trigger({
        type: 'layoutstop',
        layout:this
        });

    return this;
};

/**
 * get minimum bounding box , then rotate bounding box and make network rotate to rectangle
 * @param nodes
 */
function rotateNetworkToMinimumBoundingBox(nodes: any) {

    if (!nodes || nodes.length === 0) {
        return null;
    }

    // ============================================================
    // 1. get four corner position for each node in network
    // ============================================================

    const points: {
        x: number; y: number;
    }[] = [];

    nodes.forEach((node: Node) => {

        const pos = node.position();

        const width = node.outerWidth();

        const height = node.outerHeight();

        const halfWidth = width / 2;

        const halfHeight = height / 2;

        points.push({

            x: pos.x - halfWidth,

            y: pos.y - halfHeight

        });

        points.push({

            x: pos.x + halfWidth,

            y: pos.y - halfHeight

        });

        points.push({

            x: pos.x + halfWidth,

            y: pos.y + halfHeight

        });

        points.push({

            x: pos.x - halfWidth,

            y: pos.y + halfHeight

        });

    });

    // ============================================================
    // 2. Convex Hull
    // ============================================================

    const sortedPoints = [...points].sort((a, b) => {

        if (a.x !== b.x) {

            return (a.x - b.x);

        }

        return (a.y - b.y);

    });

    const cross = (o: any, a: any, b: any) => {

        return ((a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x));

    };

    const lower: any[] = [];

    for (const p of sortedPoints) {

        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {

            lower.pop();

        }

        lower.push(p);

    }

    const upper: any[] = [];

    for (let i = sortedPoints.length - 1; i >= 0; i--) {

        const p = sortedPoints[i];

        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {

            upper.pop();

        }

        upper.push(p);

    }

    lower.pop();

    upper.pop();

    const hull = lower.concat(upper);

    if (hull.length < 2) {

        return null;

    }

    // ============================================================
    // 3. search Minimum Area Bounding Rectangle
    // ============================================================

    let bestArea = Number.POSITIVE_INFINITY;

    let bestWidth = 0;

    let bestHeight = 0;

    let bestAngle = 0;

    let bestCenterX = 0;

    let bestCenterY = 0;

    for (let i = 0; i < hull.length; i++) {

        const p1 = hull[i];

        const p2 = hull[(i + 1) % hull.length];

        // --------------------------------------------------------
        // convex hull
        // --------------------------------------------------------

        const edgeAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

        // --------------------------------------------------------
        // rotate to X axis
        // --------------------------------------------------------

        const cos = Math.cos(-edgeAngle);

        const sin = Math.sin(-edgeAngle);

        let minX = Number.POSITIVE_INFINITY;

        let maxX = Number.NEGATIVE_INFINITY;

        let minY = Number.POSITIVE_INFINITY;

        let maxY = Number.NEGATIVE_INFINITY;

        // --------------------------------------------------------
        // rotate all hull
        // --------------------------------------------------------

        hull.forEach((p) => {

            const x = p.x * cos - p.y * sin;

            const y = p.x * sin + p.y * cos;

            minX = Math.min(minX, x);

            maxX = Math.max(maxX, x);

            minY = Math.min(minY, y);

            maxY = Math.max(maxY, y);

        });

        const width = maxX - minX;

        const height = maxY - minY;

        const area = width * height;

        // --------------------------------------------------------
        // search for minimum rectangle
        // --------------------------------------------------------

        if (area < bestArea) {

            bestArea = area;

            bestWidth = width;

            bestHeight = height;

            bestAngle = edgeAngle;

            const centerXRot = (minX + maxX) / 2;

            const centerYRot = (minY + maxY) / 2;

            // ----------------------------------------------------
            // rotate
            // ----------------------------------------------------

            bestCenterX = centerXRot * Math.cos(edgeAngle) - centerYRot * Math.sin(edgeAngle);

            bestCenterY = centerXRot * Math.sin(edgeAngle) + centerYRot * Math.cos(edgeAngle);

        }

    }

    // ============================================================
    // 4. make sure：
    //
    // width >= height
    //
    // ============================================================

    if (bestHeight > bestWidth) {

        const temp = bestWidth;

        bestWidth = bestHeight;

        bestHeight = temp;

        // --------------------------------------------------------
        // rotate 90°
        // --------------------------------------------------------

        bestAngle += Math.PI / 2;

    }

    // ============================================================
    // 5. Normalize angle
    //
    // [-PI, PI]
    // ============================================================

    while (bestAngle > Math.PI) {

        bestAngle -= 2 * Math.PI;

    }

    while (bestAngle < -Math.PI) {

        bestAngle += 2 * Math.PI;

    }

    // ============================================================
    // 6. rotate network according to bounding box center
    // ============================================================

    const cos = Math.cos(-bestAngle);

    const sin = Math.sin(-bestAngle);

    nodes.forEach((node: Node) => {

        const pos = node.position();

        const dx = pos.x - bestCenterX;

        const dy = pos.y - bestCenterY;

        // ----------------------------------------------------
        // rotate
        // -bestAngle
        // ----------------------------------------------------

        const newX = bestCenterX + dx * cos - dy * sin;

        const newY = bestCenterY + dx * sin + dy * cos;

        node.position({

            x: newX,

            y: newY

        });

    });

    // ============================================================
    // 7. re-calculate Bounding Box after rotation
    // ============================================================

    const finalBB = nodes.boundingBox();

    return {

        width: finalBB.w,

        height: finalBB.h,

        area: finalBB.w * finalBB.h,

        angle: bestAngle,

        centerX: bestCenterX,

        centerY: bestCenterY

    };

}

// If there are multiple networks, organize them into multiple rows.
// Networks with similar sizes are preferentially placed in the same row.
SubstructureLayout.prototype.packNetworks = function (networks: any[]): void {

    if (!networks || networks.length === 0) {
        return;
    }

    // ============================================================
    // 1. Canvas
    // ============================================================

    const container = this.cy.container();

    const canvasWidth = container?.clientWidth ?? 1200;

    const canvasHeight = container?.clientHeight ?? 800;

    const canvasAspect = canvasWidth / canvasHeight;

    // ============================================================
    // 2. Parameters
    // ============================================================

    const H_GAP = 60;

    const V_GAP = 80;

    const SEARCH_STEPS = 300;

    // ------------------------------------------------------------
    // Weight
    //
    // aspect: overall ratio
    //
    // similarity: network similarity on the same row
    //
    // balance: make sure not too crowd on one row
    // ------------------------------------------------------------

    const ASPECT_WEIGHT = 0.60;

    const SIZE_SIMILARITY_WEIGHT = 0.30;

    const ROW_BALANCE_WEIGHT = 0.10;

    // ============================================================
    // 3. Get real bounding boxes
    // ============================================================

    networks.forEach((network: any) => {

        const bb = network.nodes.boundingBox();

        network.x1 = bb.x1;
        network.y1 = bb.y1;
        network.x2 = bb.x2;
        network.y2 = bb.y2;

        network.width = bb.w;
        network.height = bb.h;

        network.centerX = (bb.x1 + bb.x2) / 2;

        network.centerY = (bb.y1 + bb.y2) / 2;

        network.area = Math.max(network.width * network.height, 1);

        network.size = Math.sqrt(network.area);

        network.aspect = network.width / Math.max(network.height, 1);

    });

    // ============================================================
    // 4. Sort
    //
    // large → small
    // ============================================================

    const sortedNetworks = [...networks].sort((a: any, b: any) => {

        if (a.nodeCount !== b.nodeCount) {

            return (b.nodeCount - a.nodeCount);

        }

        return (b.size - a.size);

    });

    // ============================================================
    // 5. Size normalization
    //
    // use log(size) to calculate difference
    //
    // so：
    //
    // 100 → 200
    //
    // and
    //
    // 500 → 1000
    //
    // are same 2 times difference。
    // ============================================================

    const allSizes = sortedNetworks.map((n: any) => Math.log(Math.max(n.size, 1)));

    const minLogSize = Math.min(...allSizes);

    const maxLogSize = Math.max(...allSizes);

    const sizeRange = Math.max(maxLogSize - minLogSize, 0.0001);

    sortedNetworks.forEach((network: any) => {

        network.normalizedSize = (Math.log(Math.max(network.size, 1)) - minLogSize) / sizeRange;

    });

    // ============================================================
    // 6. Width range
    // ============================================================

    const maxNetworkWidth = Math.max(...sortedNetworks.map((n: any) => n.width));

    const totalNetworkWidth = sortedNetworks.reduce((sum: number, n: any) => {

        return (sum + n.width);

    }, 0);

    const minWidth = maxNetworkWidth;

    const maxWidth = totalNetworkWidth + H_GAP * Math.max(sortedNetworks.length - 1, 0);

    // ============================================================
    // 7. Make rows
    // ============================================================

    const makeRows = (widthLimit: number): any[][] => {

        const rows: any[][] = [];

        let currentRow: any[] = [];

        let currentWidth = 0;

        sortedNetworks.forEach((network: any) => {

            const networkWidth = network.width;

            // =================================================
            // First network
            // =================================================

            if (currentRow.length === 0) {

                currentRow.push(network);

                currentWidth = networkWidth;

                return;

            }

            // =================================================
            // Width check
            // =================================================

            const requiredWidth = currentWidth + H_GAP + networkWidth;

            if (requiredWidth > widthLimit) {

                rows.push(currentRow);

                currentRow = [network];

                currentWidth = networkWidth;

                return;

            }

            // =================================================
            // Size similarity check
            // =================================================

            const currentMeanSize = currentRow.reduce((sum: number, n: any) => sum + n.normalizedSize, 0) / currentRow.length;

            const sizeDifference = Math.abs(network.normalizedSize - currentMeanSize);

            // -------------------------------------------------
            // Avoid placing vastly different networks on the same line.
            // -------------------------------------------------

            const SIZE_THRESHOLD = 0.35;

            if (sizeDifference > SIZE_THRESHOLD && currentRow.length >= 2) {

                rows.push(currentRow);

                currentRow = [network];

                currentWidth = networkWidth;

                return;

            }

            currentRow.push(network);

            currentWidth = requiredWidth;

        });

        // =========================================================
        // Last row
        // =========================================================

        if (currentRow.length > 0) {

            rows.push(currentRow);

        }

        return rows;

    };

    // ============================================================
    // 8. Calculate layout size
    // ============================================================

    const calculateLayoutSize = (rows: any[][]) => {

        let totalWidth = 0;

        let totalHeight = 0;

        rows.forEach((row: any[], rowIndex: number) => {

            let rowWidth = 0;

            let rowHeight = 0;

            row.forEach((network: any, index: number) => {

                rowWidth += network.width;

                if (index < row.length - 1) {

                    rowWidth += H_GAP;

                }

                rowHeight = Math.max(rowHeight, network.height);

            });

            totalWidth = Math.max(totalWidth, rowWidth);

            totalHeight += rowHeight;

            if (rowIndex < rows.length - 1) {

                totalHeight += V_GAP;

            }

        });

        return {
            width: totalWidth, height: totalHeight
        };

    };

    // ============================================================
    // 9. Calculate row size similarity score
    //
    // 0 = good
    // 1 = bad
    //
    // using row max/min。
    //
    // case：
    //
    // 100, 110, 120 → good
    //
    // 100, 500, 1000 → bad
    // ============================================================

    const calculateSizeSimilarity = (rows: any[][]): number => {

        if (rows.length === 0) {

            return 1;

        }

        let totalPenalty = 0;

        let totalWeight = 0;

        rows.forEach((row: any[]) => {

            if (row.length <= 1) {

                return;

            }

            const sizes = row.map((n: any) => Math.log(Math.max(n.size, 1)));

            const min = Math.min(...sizes);

            const max = Math.max(...sizes);

            const difference = max - min;

            const weight = row.length;

            totalPenalty += difference * weight;

            totalWeight += weight;

        });

        if (totalWeight === 0) {

            return 0;

        }

        return (totalPenalty / totalWeight / Math.max(sizeRange, 0.0001));

    };

    // ============================================================
    // 10. Row balance score
    //
    // avoid extreme case like：
    //
    // Row 1: 6 networks
    // Row 2: 1 network
    // ============================================================

    const calculateRowBalance = (rows: any[][]): number => {

        if (rows.length <= 1) {

            return 0;

        }

        const counts = rows.map((row: any[]) => row.length);

        const mean = counts.reduce((a: number, b: number) => a + b, 0) / counts.length;

        if (mean <= 0) {

            return 0;

        }

        const variance = counts.reduce((sum: number, count: number) => {

            return (sum + Math.pow(count - mean, 2));

        }, 0) / counts.length;

        return (Math.sqrt(variance) / mean);

    };

    // ============================================================
    // 11. Search best layout
    // ============================================================

    let bestRows: any[][] = [];

    let bestScore = Number.POSITIVE_INFINITY;

    let bestWidth = 0;

    let bestHeight = 0;

    let bestAspect = 0;

    let bestSimilarity = 0;

    for (let i = 0; i < SEARCH_STEPS; i++) {

        const testWidth = minWidth + (maxWidth - minWidth) * i / Math.max(SEARCH_STEPS - 1, 1);

        // ========================================================
        // Make rows
        // ========================================================

        const rows = makeRows(testWidth);

        if (!rows || rows.length === 0) {

            continue;

        }

        // ========================================================
        // Layout size
        // ========================================================

        const layoutSize = calculateLayoutSize(rows);

        const layoutWidth = layoutSize.width;

        const layoutHeight = layoutSize.height;

        if (layoutWidth <= 0 || layoutHeight <= 0) {

            continue;

        }

        // ========================================================
        // Layout aspect
        // ========================================================

        const layoutAspect = layoutWidth / layoutHeight;

        // ========================================================
        // Aspect error
        // ========================================================

        const aspectError = Math.abs(Math.log(layoutAspect / canvasAspect));

        // ========================================================
        // Size similarity
        // ========================================================

        const similarityError = calculateSizeSimilarity(rows);

        // ========================================================
        // Row balance
        // ========================================================

        const rowBalanceError = calculateRowBalance(rows);

        // ========================================================
        // Row count
        //
        // Very small penalty
        // ========================================================

        const rowPenalty = rows.length / Math.max(sortedNetworks.length, 1);

        // ========================================================
        // Final score
        //
        // Key point:
        //
        // Aspect ratio is still the primary objective
        //
        // But size similarity clearly participates in the optimization.
        // ========================================================

        const score = aspectError * ASPECT_WEIGHT *

            100

            +

            similarityError * SIZE_SIMILARITY_WEIGHT * 10

            +

            rowBalanceError * ROW_BALANCE_WEIGHT

            +

            rowPenalty * 0.01;

        // ========================================================
        // Save best
        // ========================================================

        if (score < bestScore) {

            bestScore = score;

            bestRows = rows;

            bestWidth = layoutWidth;

            bestHeight = layoutHeight;

            bestAspect = layoutAspect;

            bestSimilarity = similarityError;

        }

    }

    // ============================================================
    // 12. Fallback
    // ============================================================

    if (bestRows.length === 0) {

        bestRows = makeRows(minWidth);

        const fallbackSize = calculateLayoutSize(bestRows);

        bestWidth = fallbackSize.width;

        bestHeight = fallbackSize.height;

        bestAspect = bestWidth / Math.max(bestHeight, 1);

        bestSimilarity = calculateSizeSimilarity(bestRows);

    }

    // ============================================================
    // 13. Final order
    //
    // search：
    //
    //     large → small
    //
    // display：
    //
    //     small → large
    // ============================================================

    const finalRows = bestRows.map((row: any[]) => {

        return [...row].reverse();

    });

    // ============================================================
    // 16. Calculate row infos
    // ============================================================

    const rowInfos: any[] = [];

    finalRows.forEach((row: any[]) => {

        let rowWidth = 0;

        let rowHeight = 0;

        row.forEach((network: any, index: number) => {

            rowWidth += network.width;

            if (index < row.length - 1) {

                rowWidth += H_GAP;

            }

            rowHeight = Math.max(rowHeight, network.height);

        });

        rowInfos.push({
            row, width: rowWidth, height: rowHeight
        });

    });

    // ============================================================
    // 17. Final layout size
    // ============================================================

    let totalLayoutWidth = 0;

    let totalLayoutHeight = 0;

    rowInfos.forEach((info: any, index: number) => {

        totalLayoutWidth = Math.max(totalLayoutWidth, info.width);

        totalLayoutHeight += info.height;

        if (index < rowInfos.length - 1) {

            totalLayoutHeight += V_GAP;

        }

    });

    const finalAspect = totalLayoutWidth / Math.max(totalLayoutHeight, 1);

    // ============================================================
    // 19. Center layout
    // ============================================================

    const layoutStartX = (canvasWidth - totalLayoutWidth) / 2;

    const layoutStartY = (canvasHeight - totalLayoutHeight) / 2;

    // ============================================================
    // 20. Pack networks
    // ============================================================

    let currentY = layoutStartY;

    rowInfos.forEach((info: any) => {

        const row = info.row;

        let currentX = layoutStartX;

        row.forEach((network: any) => {

            // =================================================
            // Current bounding box
            // =================================================

            const bb = network.nodes.boundingBox();

            // =================================================
            // Move X
            // =================================================

            const dx = currentX - bb.x1;

            // =================================================
            // Move Y
            // =================================================

            const networkCenterY = (bb.y1 + bb.y2) / 2;

            const rowCenterY = currentY + info.height / 2;

            const dy = rowCenterY - networkCenterY;

            // =================================================
            // Move nodes
            // =================================================

            network.nodes.forEach((node: Node) => {

                const pos = node.position();

                node.position({
                    x: pos.x + dx,

                    y: pos.y + dy
                });

            });

            // =================================================
            // Next network
            // =================================================

            currentX += network.width + H_GAP;

        });

        // ========================================================
        // Next row
        // ========================================================

        currentY += info.height + V_GAP;

    });

    // ============================================================
    // 22. Final network positions
    // ============================================================

    finalRows.forEach((row: any[], rowIndex: number) => {

        row.forEach((network: any) => {
            const bb = network.nodes.boundingBox();
        });

    });

};

/**
 * Navigate to a specific step in step-by-step mode
 */
SubstructureLayout.prototype.goToStep = function (stepIndex: number) {
    if (!this.params.STEP_BY_STEP || this.steps.length === 0) {
        console.warn('Step-by-step mode is not enabled or no steps have been captured');
        return this;
    }

    if (stepIndex < 0 || stepIndex >= this.steps.length) {
        console.error(`Invalid step index: ${stepIndex}. Valid range: 0-${this.steps.length - 1}`);
        return this;
    }

    const step = this.steps[stepIndex];
    this.currentStepIndex = stepIndex;

    // Restore node positions
    const nodes = this.cy.nodes();
    nodes.forEach((node: NodeSingular) => {
        const pos = step.nodePositions[node.id()];
        if (pos) {
            node.position({x: pos.x, y: pos.y});
        }
    });

    // Visualize virtual nodes if they exist at this step
    this.visualizeVirtualNodes(step);

    console.log(`[Step ${step.stepNumber}/${this.steps.length - 1}] ${step.stepName}: ${step.description}`);

    this.cy.fit(null, 50);
    return this;
};

/**
 * Go to the next step
 */
SubstructureLayout.prototype.nextStep = function () {
    if (this.currentStepIndex < this.steps.length - 1) {
        return this.goToStep(this.currentStepIndex + 1);
    } else {
        console.log('Already at the last step');
        return this;
    }
};

/**
 * Go to the previous step
 */
SubstructureLayout.prototype.prevStep = function () {
    if (this.currentStepIndex > 0) {
        return this.goToStep(this.currentStepIndex - 1);
    } else {
        console.log('Already at the first step');
        return this;
    }
};

/**
 * Get information about all steps
 */
SubstructureLayout.prototype.listSteps = function () {
    if (!this.params.STEP_BY_STEP || this.steps.length === 0) {
        console.log('No steps available');
        return [];
    }

    console.log(`Total steps: ${this.steps.length}`);
    this.steps.forEach((step: LayoutStep, index: number) => {
        const current = index === this.currentStepIndex ? ' ← CURRENT' : '';
        console.log(`  [${index}] ${step.stepName}: ${step.description}${current}`);
    });

    return this.steps.map((s: LayoutStep) => ({
        stepNumber: s.stepNumber,
        stepName: s.stepName,
        description: s.description,
        hasVirtualNodes: !!s.virtualNodes,
        hasVirtualEdges: !!s.virtualEdges
    }));
};

/**
 * Visualize virtual nodes and edges on the canvas
 */
SubstructureLayout.prototype.visualizeVirtualNodes = function (step: LayoutStep) {
    // Remove previous virtual node visualizations
    this.cy.$('.virtual-node, .virtual-edge').remove();

    if (!step.virtualNodes || step.virtualNodes.length === 0) {
        return;
    }

    const virtualElements: any[] = [];

    // Add virtual nodes as semi-transparent overlay nodes
    step.virtualNodes.forEach((vnode: any) => {
        virtualElements.push({
            group: 'nodes', data: {
                id: `vnode_${vnode.id}`, label: `VNode: ${vnode.type}`, isVirtual: true
            }, position: {
                x: vnode.center_x, y: vnode.center_y
            }, classes: 'virtual-node', style: {
                'width': vnode.radius * 2,
                'height': vnode.radius * 2,
                'background-color': this.getVirtualNodeColor(vnode.type),
                'background-opacity': 0.3,
                'border-width': 2,
                'border-color': this.getVirtualNodeColor(vnode.type),
                'border-opacity': 0.6,
                'label': `V:${vnode.type}`,
                'font-size': 8,
                'text-valign': 'center',
                'text-halign': 'center',
                'color': '#000',
                'text-opacity': 0.7
            }
        });
    });

    // Add virtual edges
    if (step.virtualEdges && step.virtualEdges.length > 0) {
        step.virtualEdges.forEach((vedge: any, idx: number) => {
            virtualElements.push({
                group: 'edges', data: {
                    id: `vedge_${idx}`,
                    source: `vnode_${vedge.source}`,
                    target: `vnode_${vedge.target}`,
                    isVirtual: true
                }, classes: 'virtual-edge', style: {
                    'width': 2, 'line-color': '#ff9800', 'line-style': 'dashed', 'opacity': 0.5
                }
            });
        });
    }

    // Add virtual elements to the graph
    if (virtualElements.length > 0) {
        this.cy.add(virtualElements);
    }
};

/**
 * Get color for virtual node based on type
 */
SubstructureLayout.prototype.getVirtualNodeColor = function (type: string) {
    const colorMap: { [key: string]: string } = {
        'Normal': '#999999', 'Cycle': '#2196F3', 'Star': '#F48FB1', 'Chain': '#FFF176', 'Parallel': '#50C878'
    };
    return colorMap[type] || '#999999';
};

/**
 * Clear all virtual node visualizations
 */
SubstructureLayout.prototype.clearVirtualNodes = function () {
    this.cy.$('.virtual-node, .virtual-edge').remove();
    return this;
};

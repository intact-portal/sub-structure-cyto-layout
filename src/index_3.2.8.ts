import cytoscape, {Core, Collection, NodeCollection, EdgeCollection, NodeSingular, EdgeSingular} from 'cytoscape';

// Centralized Layout Parameters
export interface LayoutParameters {
    //layout algorithm
    FORCE_LAYOUT: boolean;
    STRESS_LAYOUT: boolean;

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
//    VNODE_IDEAL_LENGTH: number;
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
}

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

// @ts-ignore
export const DEFAULT_PARAMS: LayoutParameters = {
    // Force-directed parameters
    IDEAL_LENGTH: 100,
    REPULSION: 10000,
    SPRING_K: 0.15,
    ITERATIONS: 400,
    ANGULAR_STRENGTH: 0.1,
    CENTER_GRAVITY: 0.01,
    USE_ANGULAR_FORCE: true,
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
    SUBSTRUCTURE_LAYOUT: true,
    ENABLE_INITIAL_FORCE_LAYOUT: false,

    // Step-by-step mode
    STEP_BY_STEP: false,
};

class VNode {
    id: any;
    type: any;
    center_x: any;
    center_y: any;
    radius: any;
    rotate_angle: any;
    nodes: any[] | undefined; // 存储节点对象
    neighbors: any[] | undefined;
    public _permanentOrder?: string[];

    constructor(id: string, x: number, y: number, radius: number) {
        this.id = id;
        this.center_x = x;
        this.center_y = y;
        this.radius = radius;

        // 2. 【初始化：默认不赋值，即为 undefined】
        this._permanentOrder = undefined;
    }
}

class VEdge {
    source: any;
    target: any;
    weight: any;  // weight is number of edges between source node and target node,
                  // normally is 1, but can be 2 or more for like parallel edges

    // 构造函数
    constructor(source: any, target: any, weight: any = 1) {
        this.source = source;
        this.target = target;
        this.weight = weight;
    }
}

/////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * 结构增强版力导向布局
 */
function ForceLayout(this: any, options: any) {
    this.options = options;
    this.cy = options.cy;
    this.eles = options.eles;

    // Merge user-provided parameters with defaults
    this.params = {...DEFAULT_PARAMS, ...(options.params || {})};

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
ForceLayout.prototype.captureStep = function (stepName: string, description: string, metadata?: any) {
    if (!this.params.STEP_BY_STEP) return;

    const nodes = this.cy.nodes();
    const nodePositions: { [nodeId: string]: { x: number; y: number } } = {};

    nodes.forEach((node: NodeSingular) => {
        nodePositions[node.id()] = {
            x: node.position().x,
            y: node.position().y
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
        source: e.source.id,
        target: e.target.id
    })))) : undefined;

    const step: LayoutStep = {
        stepNumber: this.steps.length,
        stepName,
        description,
        nodePositions,
        virtualNodes,
        virtualEdges,
        metadata
    };

    this.steps.push(step);
    this.currentStepIndex = this.steps.length - 1;

    console.log(`[Step ${step.stepNumber}] ${stepName}: ${description}`);
};

///////////////判断两个node数组是否相同，不用考虑顺序
function areNodesEqual(arr1: cytoscape.NodeCollection, arr2: cytoscape.NodeCollection):
    boolean {
    // 1. 长度不等，肯定不相同
    if (arr1.length !== arr2.length) return false;

    // 2. 提取所有 ID 并放入 Set
    const ids1 = new Set(arr1.map(node => node.id()));

    // 3. 检查 arr2 中的每个 ID 是否都在 Set 中
    return arr2.every(node => ids1.has((node as NodeSingular).id()));
}

////////////////sum length of all edges ////////////////
function totalEdgeLength(edges: EdgeCollection) {
    let total = 0;
    edges.forEach(edge => {
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
 * 将 Node 数组排列成矩形矩阵
 * @param nodes Cytoscape 节点数组
 * @param center 矩形中心坐标
 * @param dirVector 长边（行进）方向向量
 * @param rowSpacing 行与行之间的距离
 * @param colSpacing 同一行内点与点的距离
 * @param cols 每行固定的点数（不传则自动计算为接近正方形的比例）
 */
function layoutRectangular(
    nodes: NodeSingular[],
    center: { x: number, y: number },
    dirVector: { x: number, y: number },
    rowSpacing: number = 60,
    colSpacing: number = 60,
    cols?: number
) {
    const n = nodes.length;
    if (n === 0) return;

    // 1. Determine Grid Dimensions
    // 'finalCols' will be the number of nodes in the "Vertical Line"
    let finalCols = cols || Math.ceil(Math.sqrt(n));
    if (n < 5) finalCols = n;

    const rows = Math.ceil(n / finalCols);

    // 2. Normalize Vectors
    const mag = Math.max(Math.sqrt(dirVector.x ** 2 + dirVector.y ** 2), 1);
    const uForward = {x: dirVector.x / mag, y: dirVector.y / mag};
    const uSide = {x: -uForward.y, y: uForward.x}; // Perpendicular (Vertical) axis

    // 3. Calculate Total Bounds for Centering
    const totalForwardDepth = (rows - 1) * rowSpacing;

    nodes.forEach((node, i) => {
        const r = Math.floor(i / finalCols); // Row index (Depth)
        const c = i % finalCols;             // Column index (Side-to-Side)

        // Handle centering for the last row if it's incomplete
        const isLastRow = r === rows - 1;
        const nodesInThisRow = isLastRow ? (n % finalCols || finalCols) : finalCols;

        // 4. Calculate Offsets
        // Move "Forward" along the dirVector
        const offsetForward = (r * rowSpacing) - (totalForwardDepth / 2);

        // Move "Side-to-Side" along the perpendicular axis
        const currentRowWidth = (nodesInThisRow - 1) * colSpacing;
        const offsetSide = (c * colSpacing) - (currentRowWidth / 2);

        // 5. Apply Position
        // Final position = Center + (Forward Offset * Forward Unit) + (Side Offset * Side Unit)
        node.position({
            x: center.x + (offsetForward * uForward.x) + (offsetSide * uSide.x),
            y: center.y + (offsetForward * uForward.y) + (offsetSide * uSide.y)
        });
    });
}

ForceLayout.prototype.identifyStructures = function (nodes: NodeCollection) {
    const params = this.params;

    // 0. 重置所有标记
    nodes.data('structType', 'Normal');
    nodes.data('structColor', '#999999');
    nodes.data('groupId', null); // 新增：重置分组 ID for cycle
    nodes.data('innerId', null);  // index inner a circle
    nodes.data('parallelGroupIdVec', []);

    // improve the above 'data' definition
    nodes.data('structs', {});

    ///////////////////////////// 2. detecting Cycle - by DFS algorithm /////////////////
    const visited = new Set<string>();
    const allCycles: string[][] = [];  // each sub-array represents an independent cycle
    if (1) {
        const normalNodes = nodes.toArray().filter((n: any) => n.data('structType') === 'Normal' && n.degree() >= 2); //degree >= 2 means possible in a cycle
        const seenCycles = new Set<string>();

        // To avoid duplicate cycles (like A-B-C and B-C-A), we sort and stringify for a check

        normalNodes.forEach((startNode: any, startIndex: number) => {
            // We only find cycles where startNode is the node with the lowest index
            // This is a massive optimization to prevent finding the same cycle N times
            const startId = startNode.id();

            const findCycles = (u: any, parent: any, path: string[]) => {
                const neighbors = u.neighborhood().nodes().toArray().filter((n: any) =>
                    n.data('structType') === 'Normal'
                );

                if (neighbors.length < 8) { //如果一个节点的邻居太多，那很有可能不在某个环上，这里主要为了效率，否则会一直卡在这里
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

    // --- 2. 二次过滤：去掉重合度 >= 2 的环 ---
    const filteredCycles: string[][] = [];
    allCycles.sort((a, b) => b.length - a.length);
    // 建议先按环的大小排序，通常保留“小环”更有意义（基础环往往更短）
    allCycles.forEach((currentCycle) => {
        const currentSet = new Set(currentCycle);

        // 检查当前环是否与已保存的任何一个环有 2 个以上节点重合
        const isRedundant = filteredCycles.some(existingCycle => {
            let overlapCount = 0;
            for (const nodeId of existingCycle) {
                if (currentSet.has(nodeId)) {
                    overlapCount++;
                }
                // 性能优化：一旦发现重合点达到 2 个，立即停止计数
                if (overlapCount >= 2) return true;
            }
            return false;
        });

        if ((!isRedundant && currentCycle.length > 2 && currentCycle.length != 4)) {
            filteredCycles.push(currentCycle);
        }
        if ((!isRedundant && currentCycle.length == 4)) {

            const subNodes = currentCycle.map(id => nodes.toArray().find(n => n.id() === id));
            if (!((subNodes[0]?.degree(false) == 2 && subNodes[2]?.degree(false) == 2 &&
                    subNodes[1]?.degree(false) != 2 && subNodes[3]?.degree(false) != 2) ||
                (subNodes[0]?.degree(false) == 2 && subNodes[2]?.degree(false) == 2 &&
                    subNodes[1]?.degree(false) == 2 && subNodes[3]?.degree(false) == 2
                ))) {
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
                    node.data('structType', 'Cycle');
                    node.data('structColor', '#2196F3');
                    node.data('groupId', 'Cycle_' + circleIndex);
                    node.data('innerId', innerIndex);

                    // for multiple struct types, we use a 'structs' object to store the data
                    node.data('structs', {
                        ...node.data('structs'),
                        Cycle: {
                            color: '#2196F3',
                            groupId: 'Cycle_' + circleIndex,
                            innerId: innerIndex
                        }
                    });

                    innerIndex++;
                }
            });
        })
        circleIndex++;
    })

    console.log("num of cycles: ", filteredCycles.length);

    ////////////////////////////////////////// 定义链的存储结构  ////////////////////////////
    interface Chain {
        chainId: string;
        nodes: any[]; // 存储节点对象
    }

    const chains: Chain[] = [];
    const processedNodeIds = new Set<string>(); // 避免重复处理

    // 2. 找出所有的叶子节点 (Normal 类型且度数为 1)
    const leafNodes = nodes.filter((n: any) =>
        n.data('structType') === 'Normal' && n.degree() === 1
    );

    let chainId = 0;
    leafNodes.forEach((leaf: any) => {

        if (processedNodeIds.has(leaf.id())) return;

        const currentChainNodes: any[] = [];
        let currentNode = leaf;
        let nodeId = 0;
        // 3. 沿着链向内溯源
        while (currentNode) {

            currentChainNodes.push(currentNode);
            processedNodeIds.add(currentNode.id());

            // 寻找下一个邻居
            const neighbors = currentNode.neighborhood().nodes().filter((n: any) =>
                n.data('structType') === 'Normal' && !processedNodeIds.has(n.id())
            );

            // 链的延续条件：
            // 1. 只有一个未访问的 Normal 邻居
            // 2. 且该邻居的度数不能太高（如果度数 > 2，说明到了分叉点，链结束）
            if (neighbors.length === 1) {
                const nextNode = neighbors[0];

                // 如果下一个节点是分叉点 (degree > 2)，我们把它作为链的终点，但停止继续延伸
                if (nextNode.degree() > 2) {
                    // 可选：是否将分叉点也计入链中？通常不计入，以保持链的独立性
                    break;
                }

                currentNode = nextNode;
            } else {
                // 没有邻居或有多个邻居（分叉），链结束
                currentNode = null;
            }
        }

        // 4. 保存找到的链
        if (currentChainNodes.length >= params.MIN_CHAIN_LENGTH) {
            nodeId = 0;
            currentChainNodes.forEach((node: any) => {
                node.data('structType', 'Chain');
                node.data('structColor', '#FFF176');
                node.data('groupId', 'Chain_' + chainId);
                node.data('innerId', nodeId);

                node.data('structs', {
                    ...node.data('structs'),
                    Chain: {
                        color: '#FFF176',
                        groupId: 'Chain_' + chainId,
                        innerId: nodeId
                    }
                });
                nodeId++;
            })
            chainId++;
            chains.push({
                chainId: `chain_${leaf.id()}`, // 以叶子节点 ID 命名
                nodes: currentChainNodes
            });
        } else {
            /////////////////////////////// leafs that not in a chain ///////////////////////////
            currentChainNodes.forEach((node: any) => {
                node.data('structType', 'LeafButNotChain');
                node.data('structColor', '#aaa');
                node.data('groupId', null);
                node.data('innerId', null);

                node.data('structs', {
                    ...node.data('structs'),
                    LeafButNotChain: {
                        color: '#aaa',
                        groupId: null,
                        innerId: null
                    }
                });
                nodeId++;
            })
        }
    });

    ///////////////////////////////// 星型结构 ///////////
    let starIndex: number = 0;
    nodes.forEach((node: any) => {
        const degree = node.degree();
        const neighbors = node.neighborhood().nodes();
        const leafNeighbors = neighbors.filter((n: any) => n.degree() === 1);

        if (leafNeighbors.length >= params.MIN_STAR_LEAVES && degree >= params.MIN_STAR_LEAVES) {

            if (node.data('structType') != 'Cycle' && node.data('structType') != 'Chain') {
                node.data('structType', 'Star-Center');
                node.data('structColor', '#F48FB1');
                node.data('groupId', 'Star_' + starIndex);

                node.data('structs', {
                    ...node.data('structs'),
                    Star: {
                        role: 'Center',
                        color: '#F48FB1',
                        groupId: `Star_${starIndex}`
                    }
                });

                leafNeighbors.forEach((leaf: any) => {
                    leaf.data('structType', 'Star-Member');
                    leaf.data('structColor', '#F48FB1');
                    leaf.data('groupId', 'Star_' + starIndex);

                    leaf.data('structs', {
                        ...leaf.data('structs'),
                        Star: {
                            role: 'Member',
                            color: '#F48FB1',
                            groupId: `Star_${starIndex}`
                        }
                    });
                });

                starIndex++;
            }
        }
    });

    /////////////////////////////// 找出平行/钻石结构 Parallel ///////////////////////////////////
    if (1) {
        // let diamonds = [];
        let parallelId = 0;
        //任意两个点是否有共同的neighbor
        for (let i = 0; i < nodes.length; i++) {
            let nodeVecParallel = [];
            let terminalVec = [];
            const u = nodes[i];
            const u1 = u.neighborhood().nodes();

            if (u.data('structType') === 'Normal') {
                for (let j = 0; j < nodes.length; j++) {
                    if (i === j) continue;
                    const v = nodes[j];
                    if (v.data('structType') === 'Normal') {
                        const v1 = v.neighborhood().nodes();
                        if (areNodesEqual(v1, u1) && v1.length >= params.MIN_PARALLEL_NEIGHBORS &&
                            u1.length >= params.MIN_PARALLEL_NEIGHBORS) {
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
                    nodes.forEach(node => {
                        if (node.id() == v) {
                            node.data('structType', 'Parallel');
                            node.data('structColor', '#50C878');
                            node.data('groupId', 'Parallel' + parallelId);

                            node.data('structs', {
                                ...node.data('structs'),
                                Parallel: {
                                    color: '#50C878',
                                    groupId: `Parallel_${parallelId}`
                                }
                            });
                        }
                    })
                })

                u1.forEach(v1 => {
                    nodes.forEach(node => {
                        if (node.id() == v1.id()) {
                            node.data('parallelGroupIdVec', [...node.data('parallelGroupIdVec'), 'Parallel' + parallelId]);
                        }
                    })
                })
                parallelId++;
            }
        }
    }

    console.log("num of chains: ", chains.length);
};


ForceLayout.prototype.run = function () {

    const params = this.params;

    const layout_algorithm = this.options.params.LAYOUT_ALGORITHM;


    const components = this.cy.elements().components();

    const GAP = 100;       // 网络之间的水平间距
    const START_X = 100;   // 起始 X
    const START_Y = 100;   // 起始 Y
    let currentX = START_X;

    interface NetworkInfo {
        component: cytoscape.Collection;
        nodes: cytoscape.Collection;

        index: number;
        nodeCount: number;

        width: number;
        height: number;

        bb: cytoscape.BoundingBox12;
    }
    const networkInfos: NetworkInfo[] = [];

    components.forEach((component: any, index: any) => {
        const nodes = component.nodes();
        const edges = component.edges();

        this.vnodes=[];
        this.vedges=[];

        console.log(`independent net: ${index + 1}`);

        // 1. get user defined boundingBox，if not then default cy container
        const bb = this.boundingBox || this.cy.extent();

        // 2. 计算宽度和高度
        const width = bb.x2 - bb.x1;
        const height = bb.y2 - bb.y1;

        // 1. Run removal logic first
        const seenPairs = new Set<string>();
        const toRemove = this.eles.edges().filter((edge: EdgeSingular) => {
            const sourceId = edge.source().id();
            const targetId = edge.target().id();
            if (sourceId === targetId) return true;
            const pairKey = [sourceId, targetId].sort().join('---');
            if (seenPairs.has(pairKey)) return true;
            seenPairs.add(pairKey);
            return false;
        });

        this.cy.remove(toRemove);

        // 2. NOW define your collections to get the updated state
        if (params.RANDOMIZE_INITIAL_POSITION) {
            nodes.forEach((node: NodeSingular) => {
                node.position({
                    x: bb.x1 + Math.random() * width,
                    y: bb.y1 + Math.random() * height
                });
            });
        }

        console.log("num of nodes: " + nodes.length);
        console.log("num of edges: " + edges.length);

        // Capture initial state
        this.captureStep('Initial', 'Initial node positions before any layout', {
            nodeCount: nodes.length,
            edgeCount: edges.length
        });

        // 1. 识别结构 (标记 structType 并通过 components 划分独立环)
        const start = performance.now();
        this.identifyStructures(nodes);
        const end = performance.now();

        this.captureStep('Structure Detection', 'Structures identified (Stars, Cycles, Chains, Parallel)', {
            stars: nodes.filter((n: any) => n.data('structType')?.startsWith('Star')).length,
            cycles: nodes.filter((n: any) => n.data('structType') === 'Cycle').length,
            chains: nodes.filter((n: any) => n.data('structType') === 'Chain').length,
            parallel: nodes.filter((n: any) => n.data('structType') === 'Parallel').length
        });

        //************ 将每种类型分类保存到二维数组中 *///////////
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
                    if (flag) { //还没保存过
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
                    if (flag) { //还没保存过
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
                    if (flag) { //还没保存过
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
                    if (flag) { //还没保存过
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

        //为虚拟节点建好连接边
        if (1) {
            const edgePairs: { source: string; target: string }[] = [];

            for (const edge of edges) {
                let s = edge.source().id();
                let t = edge.target().id();
                let count = 0;

                insideBreak:
                    for (let i = 0; i < this.vnodes.length; i++) {
                        const v1 = this.vnodes[i];
                        count = 0;
                        if (!v1.nodes) continue;
                        v1.nodes.forEach((node: any) => {
                            if (node.id() === s || node.id() === t) {
                                count++;
                            }
                        })
                        if (count == 2) {
                            break insideBreak;
                        }
                    }
                if (count != 2) {  // counts==2 means the edge is inside of vnode
                    edgePairs.push({
                        source: edge.source().id(),
                        target: edge.target().id()
                    });
                }
            }

            for (let i = 0; i < this.vnodes.length - 1; i++) {
                const v1 = this.vnodes[i];
                for (let j = i + 1; j < this.vnodes.length; j++) {
                    // console.log('i:'+i+'   j:' + j);
                    const v2 = this.vnodes[j];
                    if (!v1.nodes || !v2.nodes) continue;

                    if (1) {
                        const nodeVec1 = v1.nodes;
                        const nodeVec2 = v2.nodes;
                        let numConnect = 0;
                        for (const n1 of nodeVec1) {
                            if (n1.data("structType") != 'Star-Member') {    // save time
                                for (const n2 of nodeVec2) {
                                    if (n2.data("structType") != 'Star-Member') {
                                        for (const edge of edgePairs) {
                                            const source = edge.source;
                                            const target = edge.target;

                                            // Logic fix: Checking both directions for an undirected link
                                            if ((n1.id() === source && n2.id() === target) || (n2.id() === source && n1.id() === target)) {
                                                numConnect++;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        if (numConnect > 0) {
                            let vedgeT = new VEdge(v1, v2, numConnect);
                            this.vedges.push(vedgeT);
                        }
                    }
                }
            }
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

        ///////////////////////////////// 更新虚拟节点的中心 //////////////////////////
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

        //////////////////////////////// 更新半径 update radius for virtual nodes /////////////////////////////
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
                        // 1. 镜像原布局函数的行列核心逻辑
                        let finalCols = Math.ceil(Math.sqrt(n));
                        if (n < 3) finalCols = n;
                        const rows = Math.ceil(n / finalCols);

                        // 2. 定义好你在布局里传入的间距（假设都用 60）
                        const colSpacing = 60;
                        const rowSpacing = 60;

                        // 3. 计算网格的长和宽（边缘中心距）
                        const totalWidth = (finalCols - 1) * colSpacing;
                        const totalHeight = (rows - 1) * rowSpacing;

                        // 4. 使用勾股定理计算中心到顶角的距离，并加上单个节点自身的安全留白（比如 20）
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
        if (layout_algorithm === 'MY_ForceLayout') {
            const IDEAL_LENGTH = params.IDEAL_LENGTH;
            // const IDEAL_LENGTH=3000;

            const REPULSION = params.REPULSION;
            const SPRING_K = params.SPRING_K;
            const ITERATIONS = params.ITERATIONS;
            // const ITERATIONS =2000;
            // const ANGULAR_STRENGTH = params.ANGULAR_STRENGTH;
            const USE_ANGULAR_FORCE = params.USE_ANGULAR_FORCE;

            var colisionFlag = true;
            let iter = 0;
            var maxAttractMove = 10e10;
            var maxRepulsetMove = 10e10;
            var maxDist = 10e10;
            var numOfCollision = 0;

            // 调整退出阈值：当全图任何节点的最大移动量都小于 0.5 像素时，才认为真正静止
            const ENERGY_THRESHOLD = 0.5;

            // 提前提取构建邻接表，供“初始秩序建立”和“后期角度力”共同无缝复用
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
                    // 过滤出叶子节点（度数小于等于2的末端挂载节点）
                    const leafNeighbors = allNeighbors.filter((nb: VNode) => {
                        const nbEdges = adj.get(nb.id) || [];
                        return nbEdges.length <= 2;
                    });

                    if (leafNeighbors.length >= 2) {
                        // 排序建立绝对干净的初始拓扑阵列
                        leafNeighbors.sort((a: VNode, b: VNode) => a.id.localeCompare(b.id));
                        node._permanentOrder = leafNeighbors.map((a: VNode) => a.id);

                        // 顺便给它们一个初始的、绝对不交叉的星型辐射状几何分布基础
                        leafNeighbors.forEach((nb: VNode, index: number) => {
                            const initAngle = (Math.PI * 2 / leafNeighbors.length) * index;
                            nb.center_x = node.center_x + Math.cos(initAngle) * IDEAL_LENGTH;
                            nb.center_y = node.center_y + Math.sin(initAngle) * IDEAL_LENGTH;
                        });
                    }
                }
            });


            while (iter < ITERATIONS) {
                iter++;

                // 每一轮开始前，重置总移动能量统计
                maxAttractMove = 0;
                maxRepulsetMove = 0;
                let maxAngularMove = 0;
                numOfCollision = 0;

                ////////////////////// 将node放在对应的virtual node的位置上
                if (1) {
                    this.vnodes.forEach((v: any) => {
                        v.nodes.forEach((n: any) => {
                            n.position().x = v.center_x + Math.random() * 5;
                            n.position().y = v.center_y + Math.random() * 5;
                        })
                    });
                }

                // 【核心修正】物理运算完全在虚拟空间迭代，不再在每帧内部频繁对真实节点做乱序随机洗牌
                this.captureStep('Virtual Nodes Positioned step ' + iter, 'Virtual node centers and radii calculated', null);

                // 统计当前碰撞数
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

                // 计算当前的全局降温系数（模拟退火核心控制）
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

                        // 引力引入降温系数
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

                            // 排斥力同样引入降温系数
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
                    const norm = (a: number): number =>
                        Math.atan2(
                            Math.sin(a),
                            Math.cos(a)
                        );

                    type AngleItem = {
                        nb: VNode;
                        dx: number;
                        dy: number;
                        dist: number;
                        angle: number;
                    };

                    const ANGULAR_STRENGTH = params.ANGULAR_STRENGTH;
                    const MAX_FORCE = 2.0;

                    this.vnodes.forEach((node: VNode) => {

                        if (
                            !node._permanentOrder ||
                            node._permanentOrder.length < 2
                        ) {
                            return;
                        }

                        const orderMap =
                            new Map<string, number>(
                                node._permanentOrder.map(
                                    (
                                        id: string,
                                        index: number
                                    ) => [
                                        id,
                                        index
                                    ]
                                )
                            );

                        const leaves: VNode[] =
                            this.vnodes.filter(
                                (v: VNode) =>
                                    orderMap.has(v.id)
                            );

                        const count =
                            leaves.length;

                        if (count < 2) {
                            return;
                        }

                        const idealGap =
                            (Math.PI * 2) / count;

                        const items: AngleItem[] =
                            leaves
                                .map(
                                    (
                                        nb: VNode
                                    ): AngleItem => {

                                        const dx =
                                            nb.center_x -
                                            node.center_x;

                                        const dy =
                                            nb.center_y -
                                            node.center_y;

                                        return {
                                            nb,
                                            dx,
                                            dy,
                                            dist:
                                                Math.sqrt(
                                                    dx * dx +
                                                    dy * dy
                                                ) || 1,
                                            angle:
                                                Math.atan2(
                                                    dy,
                                                    dx
                                                )
                                        };
                                    }
                                )
                                .sort(
                                    (
                                        a: AngleItem,
                                        b: AngleItem
                                    ): number =>
                                        a.angle -
                                        b.angle
                                );

                        for (
                            let i = 0;
                            i < count;
                            i++
                        ) {

                            const left: AngleItem =
                                items[i];

                            const right: AngleItem =
                                items[
                                (i + 1) %
                                count
                                    ];

                            let gap =
                                norm(
                                    right.angle -
                                    left.angle
                                );

                            if (gap < 0) {
                                gap +=
                                    Math.PI * 2;
                            }

                            // 已经够开
                            if (
                                gap >=
                                idealGap
                            ) {
                                continue;
                            }

                            const gapError =
                                idealGap -
                                gap;

                            let force =
                                gapError *
                                ANGULAR_STRENGTH;

                            force =
                                Math.min(
                                    force,
                                    MAX_FORCE
                                );

                            // left切线方向
                            const ltx =
                                -left.dy /
                                left.dist;

                            const lty =
                                left.dx /
                                left.dist;

                            // right切线方向
                            const rtx =
                                -right.dy /
                                right.dist;

                            const rty =
                                right.dx /
                                right.dist;

                            // 向相反方向推开
                            left.nb.center_x -=
                                ltx * force;

                            left.nb.center_y -=
                                lty * force;

                            right.nb.center_x +=
                                rtx * force;

                            right.nb.center_y +=
                                rty * force;

                            if (
                                typeof maxAngularMove !==
                                "undefined"
                            ) {
                                maxAngularMove =
                                    Math.max(
                                        maxAngularMove,
                                        force
                                    );
                            }
                        }
                    });
                }

                // 【退出判定机制】只有当全图所有移动能量彻底平息、都极其微小时，才允许提前安全退出
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

                                // 1.2 计算重叠的物理长度
                                const overlap = minDistance + padding - centerDist;

                                // 1.3 计算归一化的方向向量
                                let nx = dx / centerDist;
                                let ny = dy / centerDist;

                                // 1.4 两个节点各自向相反方向退让一半（50%）
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

                    // 【优化 3】安全阀：如果迭代次数过多（通常在节点极度密集时发生），直接退出
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
        //Stress Majorization（应力主元化）算法
        //All-Pairs 最短路径计算 和 Guttman Transform（拉普拉斯矩阵加权更新），
        //同时保留了代码中的叶子节点极坐标初始化和防重叠（Anti-Collision）后处理
        if (layout_algorithm === 'MY_StressLayout') {
            const IDEAL_LENGTH = params.IDEAL_LENGTH;
            const ITERATIONS = params.ITERATIONS;
            const ENERGY_THRESHOLD = 0.5;

            const numNodes = this.vnodes.length;
            if (numNodes === 0) return;

            // 索引映射表：ID -> 数组下标，方便矩阵运算
            const nodeIndexMap = new Map<string, number>();
            this.vnodes.forEach((v: VNode, i: number) => nodeIndexMap.set(v.id, i));

            // 邻接表提取供初始化复用
            const adj = new Map<string, VNode[]>();
            this.vedges.forEach((e: VEdge) => {
                if (!e.source || !e.target) return;
                if (!adj.has(e.source.id)) adj.set(e.source.id, []);
                if (!adj.has(e.target.id)) adj.set(e.target.id, []);
                adj.get(e.source.id)!.push(e.target);
                adj.get(e.target.id)!.push(e.source);
            });

            // -------------------------------------------------------------
            // [预处理 1] 计算全图任意节点对之间的最短路径距离矩阵 (APSP - Floyd Warshall)
            // -------------------------------------------------------------
            const distMatrix: number[][] = Array.from({length: numNodes}, () =>
                new Array(numNodes).fill(Infinity)
            );
            const weightMatrix: number[][] = Array.from({length: numNodes}, () =>
                new Array(numNodes).fill(0)
            );

            for (let i = 0; i < numNodes; i++) distMatrix[i][i] = 0;

            // 根据真实边赋予理想距离基准
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

            // Floyd-Warshall 求解任意节点对最短路径
            for (let k = 0; k < numNodes; k++) {
                for (let i = 0; i < numNodes; i++) {
                    for (let j = 0; j < numNodes; j++) {
                        if (distMatrix[i][k] + distMatrix[k][j] < distMatrix[i][j]) {
                            distMatrix[i][j] = distMatrix[i][k] + distMatrix[k][j];
                        }
                    }
                }
            }

            // 计算权重矩阵 W_ij = 1 / (d_ij ^ 2)
            for (let i = 0; i < numNodes; i++) {
                for (let j = 0; j < numNodes; j++) {
                    if (i !== j && distMatrix[i][j] !== Infinity) {
                        // 考虑节点真实半径，防止过于拥挤
                        const minR = this.vnodes[i].radius + this.vnodes[j].radius;
                        const d = Math.max(distMatrix[i][j], minR);
                        weightMatrix[i][j] = 1 / (d * d);
                    }
                }
            }

            // -------------------------------------------------------------
            // [预处理 2] 拓扑秩序建立与初始坐标设置
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
            // [主循环] Stress Majorization 迭代 (Guttman Transform)
            // -------------------------------------------------------------
            let iter = 0;
            while (iter < ITERATIONS) {
                iter++;
                let maxStressMove = 0;

                // 临时数组存储本轮计算的新坐标
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

                        // Guttman Transform 计算公式：所有其他节点 j 根据理想距离 dij 对 i 投影推拉后的加权平均
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

                // 应用坐标更新，并统计最大位移
                for (let i = 0; i < numNodes; i++) {
                    const vi = this.vnodes[i];
                    const moveX = Math.abs(nextX[i] - vi.center_x);
                    const moveY = Math.abs(nextY[i] - vi.center_y);
                    maxStressMove = Math.max(maxStressMove, moveX, moveY);

                    vi.center_x = nextX[i];
                    vi.center_y = nextY[i];
                }

                // 判定收敛条件提前退出
                if (maxStressMove < ENERGY_THRESHOLD && iter > 10) {
                    console.log(`%cStress 布局平稳收敛，提前退出于第 ${iter} 代。`, 'color: green; font-weight: bold;');
                    break;
                }
            }

            // 将计算出的虚拟坐标映射到真实节点
            this.vnodes.forEach((v: any) => {
                v.nodes.forEach((n: any) => {
                    n.position().x = v.center_x;
                    n.position().y = v.center_y;
                });
            });

            // -------------------------------------------------------------
            // [后处理] 防碰撞 / 重叠消除 (Node Overlap Removal)
            // -------------------------------------------------------------
            if (1) {
                console.log('Anti-collision (Overlap Removal)');
                let colisionFlag = true;
                let numOfCollision = 0;
                const padding = IDEAL_LENGTH;
                let overlapIter = 0;

                while (colisionFlag) {
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

        /////////////////////  删除之后变成只有虚拟节点 vnode 的layout ////////////////
        if (!params.SUBSTRUCTURE_LAYOUT) {
            const IDEAL_LENGTH = params.LEAF_NODE_DISTANCE;
            this.vnodes.forEach((v: any) => {
                if (v.type == 'Star') {
                    const targetNode = v.nodes.find((node: any) => {
                        const structs = node.data('structs') || {};
                        const keys = Object.keys(structs);

                        // 1. 确保 key 的数量有且仅有 1 个，且这个 key 必须是 'Star'
                        const hasOnlyStar = keys.length === 1 && keys[0] === 'Star';

                        // 2. 确保 Star 的 role 属性是 'Center'
                        const isCenter = structs.Star?.role === 'Center';

                        return hasOnlyStar && isCenter;
                    });

                    // if(targetNode){    // star是独立的star, 不是依附在某个Cycle里
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

                        // 2. Position the nodes ring by ring
                        rings.forEach((ringNodes, ringIdx) => {
                            const ringNumber = ringIdx + 1;
                            const radius = ringNumber * ringSpacing;
                            const totalInThisRing = ringNodes.length; // This is the key for even distribution

                            ringNodes.forEach((node, nodeIdx) => {
                                // Evenly distribute based on actual count in THIS ring
                                let angle = (nodeIdx / totalInThisRing) * 2 * Math.PI;

                                // Stagger every ring
                                angle += (Math.PI / totalInThisRing);

                                node.position({
                                    x: v.center_x + Math.cos(angle) * radius,
                                    y: v.center_y + Math.sin(angle) * radius
                                });
                            });
                        });
                    }
                } else if (v.type == 'Chain') {
                    // 1. 依然使用临时对象按 groupId 归类节点
                    const chainGroups: { [key: string]: any[] } = {};

                    v.nodes.forEach((node: any) => {
                        if (node.data('structType') == 'Chain') {
                            const groupId = node.data('groupId');
                            if (!chainGroups[groupId]) {
                                chainGroups[groupId] = [];
                            }
                            if (node.degree() === 1) { //把链子的叶节点放在第一位，用于标记哪个是链的叶节点
                                chainGroups[groupId].unshift(node);//将元素插入到数组的开头，并将原本的元素依次后移。
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
                                // 1. 计算当前时刻的算术平均中心 (质心)
                                let cx = 0, cy = 0;
                                gNodes.forEach((n: any) => {
                                    cx += n.position().x;
                                    cy += n.position().y;
                                });
                                cx /= count;
                                cy /= count;

                                // 2. 根据节点数量计算标准半径 (保证节点间距接近 k)
                                const miniMumRadius = params.CHAIN_MIN_RADIUS;
                                const radius = Math.max((count * params.CYCLE_NODE_SPACING) / (2 * Math.PI), miniMumRadius);

                                // 3. 排序以防止节点在圆周上闪
                                const sorted = gNodes.slice(1);

                                ///////////////////////////////////////////////////
                                // 4. 需要旋转，找出最好的旋转角度
                                let minTotalLength = 10e10;
                                let bestRotate = 0;    //找出最好的旋转角度
                                for (let rotate = 0; rotate < 360; rotate = rotate + 10) {
                                    // 4. 强行覆盖坐标：这是形成“绝对圆”的物理保障
                                    sorted.forEach((n: any, i: number) => {
                                        const angle = (i / count) * 2 * Math.PI + rotate;
                                        n.position({
                                            x: cx + Math.cos(angle) * radius,
                                            y: cy + Math.sin(angle) * radius
                                        });
                                    });
                                    const totalLength = totalEdgeLength(edges);
                                    if (minTotalLength > totalLength) {
                                        minTotalLength = totalLength;
                                        bestRotate = rotate;
                                    }
                                }
                                // 4. 强行覆盖坐标
                                sorted.forEach((n: any, i: number) => {
                                    const angle = (i / count) * 2 * Math.PI + bestRotate;
                                    n.position({
                                        x: cx + Math.cos(angle) * radius,
                                        y: cy + Math.sin(angle) * radius
                                    });
                                });
                                ///////////////////////////////////////////////////

                                gNodes[0].position({
                                    x: cx,
                                    y: cy
                                })
                            }
                        }
                    }
                } else if (v.type == 'Parallel') {
                    let endVec: any = [];
                    nodes.forEach((n: any, i: number) => {
                        if (n.data('parallelGroupIdVec').includes(v.id) && n.data('structType') != 'Parallel') {
                            //提取同一个group的端节点
                            endVec.push(n);
                        }
                    })
                    // console.log('endVec.length:'+endVec.length+' v.id:'+v.id);
                    if (endVec.length >= 2) { //应该>=2，否则就错误
                        const gap = params.PARALLEL_GAP; //垂直分布的步长
                        //有node数组，将里面的所有node在两个点n1,n2中点垂线上均匀分布
                        const p1 = endVec[0].position();
                        const p2 = endVec[1].position();
                        const diff = {x: p2.x - p1.x, y: p2.y - p1.y};

                        layoutRectangular(v.nodes, {x: v.center_x, y: v.center_y}, diff);
                    }
                }
                if (v.type == 'Cycle') {
                    // 1. 检查 nodes 是否存在且不为空
                    if (v.nodes && v.nodes.length > 0) {
                        v.nodes.sort((a: any, b: any) => {
                            // 假设 innerId 是数字。如果是字符串，可以使用 localeCompare
                            const idA = a.data('innerId') ?? 0;
                            const idB = b.data('innerId') ?? 0;
                            return idA - idB; // 升序排序
                        });
                    }
                    // 2. 根据节点数量计算标准半径 (保证节点间距接近 k)
                    const count = v.nodes.length;
                    const k = params.CYCLE_NODE_SPACING;
                    const radius = (count * k) / (2 * Math.PI);

                    // 3. 排序以防止节点在圆周上闪烁
                    const sorted = v.nodes;
                    const sortedReverse = sorted.slice().reverse();
                    let reverseFlag = false;

                    let minTotalLength = 10e10;
                    let bestRotate = 0;    //找出最好的旋转角度

                    //clock-wise
                    for (let rotate = 0; rotate < 360; rotate = rotate + 10) {
                        // 4. 强行覆盖坐标：这是形成“绝对圆”的物理保障
                        sorted.forEach((n: any, i: number) => {
                            const angle = (i / count) * 2 * Math.PI + rotate;
                            n.position({
                                x: v.center_x + Math.cos(angle) * radius,
                                y: v.center_y + Math.sin(angle) * radius
                            });
                        });
                        const totalLength = totalEdgeLength(edges);
                        if (minTotalLength > totalLength) {
                            minTotalLength = totalLength;
                            bestRotate = rotate;
                        }
                    }

                    //anti-clock-wise
                    for (let rotate = 0; rotate < 360; rotate = rotate + 10) {
                        // 4. 强行覆盖坐标：这是形成“绝对圆”的物理保障
                        sortedReverse.forEach((n: any, i: number) => {
                            const angle = (i / count) * 2 * Math.PI + rotate;
                            n.position({
                                x: v.center_x + Math.cos(angle) * radius,
                                y: v.center_y + Math.sin(angle) * radius
                            });
                        });
                        const totalLength = totalEdgeLength(edges);
                        if (minTotalLength > totalLength) {
                            reverseFlag = true;
                            minTotalLength = totalLength;
                            bestRotate = rotate;
                        }
                    }

                    // 4. 强行覆盖坐标：这是形成“绝对圆”的物理保障
                    //console.log('sorted:'+sorted.length);
                    if (!reverseFlag) {
                        sorted.forEach((n: any, i: number) => {
                            const angle = (i / count) * 2 * Math.PI + bestRotate;
                            n.position({
                                x: v.center_x + Math.cos(angle) * radius,
                                y: v.center_y + Math.sin(angle) * radius
                            });
                        });
                    } else {
                        sortedReverse.forEach((n: any, i: number) => {
                            const angle = (i / count) * 2 * Math.PI + bestRotate;
                            n.position({
                                x: v.center_x + Math.cos(angle) * radius,
                                y: v.center_y + Math.sin(angle) * radius
                            });
                        });
                    }
                }
            })

            nodes.forEach((n: any, i: number) => {
                if (n.data('structType') == 'LeafButNotChain') {

                    let fatherPos = n.neighborhood().nodes().first().position();
                    const pos = n.position();

                    let maxTotalLength = 10e10;
                    let bestRotate = 0;    //找出最好的旋转角度
                    let aroundNodesVec: any[] = [];

                    nodes.forEach((nd: any, i: number) => {
                        if (((nd.position().x - fatherPos.x) * (nd.position().x - fatherPos.x) +
                            (nd.position().y - fatherPos.y) * (nd.position().y - fatherPos.y)) < 2 * IDEAL_LENGTH * IDEAL_LENGTH) {
                            aroundNodesVec.push(nd);
                            // console.log('aroundNodesVec:'+nd.id());
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
                                const tmpDis = 1 / Math.sqrt((nd.position().x - n.position().x) * (nd.position().x - n.position().x) +
                                    (nd.position().y - n.position().y) * (nd.position().y - n.position().y));
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

        if (1) {
            let maxDis = 0;
            let maxS = 0;
            let maxT = 0;
            let minDist = 10e10;
            let minS = 0;
            let minT = 0;
            let avgDis = 0;
            edges.forEach((e: { source: () => any; target: () => any; position: { y: number; }; }) => {
                const s = e.source();
                const t = e.target();
                const distance = Math.sqrt(Math.pow(s.position().x - t.position().x, 2) +
                    Math.pow(s.position().y - t.position().y, 2));
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
            console.log("avgDis:", avgDis / edges.length);
        }

        console.log(`========== 独立网络 ${index + 1} ==========`);
        console.log('nodes:', nodes.map(
            (node: cytoscape.NodeSingular) => node.id()
        ));

        console.log('edges:', component.edges().map(
            (edge: cytoscape.EdgeSingular) => edge.id()
        ));

        // Bounding Box
        console.log('Bounding Box:', bb);

        console.log('x1:', bb.x1);
        console.log('y1:', bb.y1);
        console.log('x2:', bb.x2);
        console.log('y2:', bb.y2);

        console.log('width:', bb.w);
        console.log('height:', bb.h);

        console.log('------------------------------------------');


        // =====================================
        // 2. 获取当前 component 的 bounding box, 同时有多个网络，需要对齐
        // =====================================
        const bb2 = nodes.boundingBox();

        console.log(`独立网络 ${index + 1}`);
        console.log('nodes:', nodes.map(
            (node: cytoscape.NodeSingular) => node.id()
        ));

        console.log('edges:', component.edges().map(
            (edge: cytoscape.EdgeSingular) => edge.id()
        ));

        console.log('bounding box:', bb2);


        // =====================================
        // 3. 将 component 移动到目标位置
        // =====================================

        const targetX = currentX;
        const targetY = START_Y;

        const dx = targetX - bb2.x1;
        const dy = targetY - bb2.y1;

        nodes.forEach((node: cytoscape.NodeSingular) => {

            const pos = node.position();

            node.position({
                x: pos.x + dx,
                y: pos.y + dy
            });

        });


        // =====================================
        // 4. 更新下一个 component 的 X
        // =====================================

        currentX += bb2.w + GAP;

    });

    this.captureStep('Final', 'Final layout complete', null);

    this.cy.fit(null, 50);
    this.cy.emit('layoutstop');

    // Expose steps for external access
    if (this.params.STEP_BY_STEP && this.steps.length > 0) {
        console.log(`Step-by-step mode: Captured ${this.steps.length} steps`);
        console.log('Access steps via layout.steps or use layout.goToStep(n)');
    }

    this.layoutStatistics = {
        edgeCrossings: 0
    };

    return this;
};

ForceLayout.prototype.stop = function () {
    return this;
};


/**
 * 改进版布局：让 'star' 类型的节点倾向于分布在外围
 */

/**
 * Navigate to a specific step in step-by-step mode
 */
ForceLayout.prototype.goToStep = function (stepIndex: number) {
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
    if (step.metadata) {
        console.log('Metadata:', step.metadata);
    }

    this.cy.fit(null, 50);
    return this;
};

/**
 * Go to the next step
 */
ForceLayout.prototype.nextStep = function () {
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
ForceLayout.prototype.prevStep = function () {
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
ForceLayout.prototype.listSteps = function () {
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
ForceLayout.prototype.visualizeVirtualNodes = function (step: LayoutStep) {
    // Remove previous virtual node visualizations
    this.cy.$('.virtual-node, .virtual-edge').remove();

    if (!step.virtualNodes || step.virtualNodes.length === 0) {
        return;
    }

    const virtualElements: any[] = [];

    // Add virtual nodes as semi-transparent overlay nodes
    step.virtualNodes.forEach((vnode: any) => {
        virtualElements.push({
            group: 'nodes',
            data: {
                id: `vnode_${vnode.id}`,
                label: `VNode: ${vnode.type}`,
                isVirtual: true
            },
            position: {
                x: vnode.center_x,
                y: vnode.center_y
            },
            classes: 'virtual-node',
            style: {
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
                group: 'edges',
                data: {
                    id: `vedge_${idx}`,
                    source: `vnode_${vedge.source}`,
                    target: `vnode_${vedge.target}`,
                    isVirtual: true
                },
                classes: 'virtual-edge',
                style: {
                    'width': 2,
                    'line-color': '#ff9800',
                    'line-style': 'dashed',
                    'opacity': 0.5
                }
            });
        });
    }

    // Add virtual elements to the graph
    if (virtualElements.length > 0) {
        this.cy.add(virtualElements);
        console.log(`Visualized ${step.virtualNodes.length} virtual nodes and ${step.virtualEdges?.length || 0} virtual edges`);
    }
};

/**
 * Get color for virtual node based on type
 */
ForceLayout.prototype.getVirtualNodeColor = function (type: string) {
    const colorMap: { [key: string]: string } = {
        'Normal': '#999999',
        'Cycle': '#2196F3',
        'Star': '#F48FB1',
        'Chain': '#FFF176',
        'Parallel': '#50C878'
    };
    return colorMap[type] || '#999999';
};

/**
 * Clear all virtual node visualizations
 */
ForceLayout.prototype.clearVirtualNodes = function () {
    this.cy.$('.virtual-node, .virtual-edge').remove();
    return this;
};

export default function register(cytoscape: any) {
    if (!cytoscape) return;
    cytoscape('layout', 'ForceLayout', ForceLayout);
}



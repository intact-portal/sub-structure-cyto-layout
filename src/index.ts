

import cytoscape, {Core, Collection, NodeCollection, EdgeCollection, NodeSingular, EdgeSingular} from 'cytoscape';

// Centralized Layout Parameters
export interface LayoutParameters {
    // Force-directed parameters
    IDEAL_LENGTH: number;
    REPULSION: number;
    SPRING_K: number;
    ITERATIONS: number;
    ANGULAR_STRENGTH: number;
    CENTER_GRAVITY: number;
    USE_ANGULAR_FORCE: boolean;

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
    VNODE_ITERATIONS: 600,
    VNODE_ANGULAR_STRENGTH: 0.1,

    // Layout control flags
    SPREAD_V_NODES: true,
    SUBSTRUCTURE_LAYOUT: true,
    ENABLE_INITIAL_FORCE_LAYOUT: false,
};

class VNode {
    id: any;
    type: any;
    center_x: any;
    center_y: any;
    radius: any;
    rotate_angle: any;
    nodes: any[] | undefined; // 存储节点对象
}

class VEdge {
    source: any;
    target: any;

    // 构造函数
    constructor(source: any, target: any) {
        this.source = source;
        this.target = target;
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
    this.params = { ...DEFAULT_PARAMS, ...(options.params || {}) };

    // Instance-specific arrays instead of global
    this.vnodes = [];
    this.vedges = [];
}

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

function Length(nodes: NodeCollection, node: NodeSingular) {
    let total = 0;
    nodes.forEach(n => {
        if (n.id() !== node.id()) {
            const dx = (n.position().x || 0) - (node.position().x || 0);
            const dy = (n.position().y || 0) - (node.position().y || 0);
            const length = Math.sqrt(dx * dx + dy * dy);
            total += length;
        }
    })
    return total;
}

/////////////// get node similarity matrix. ///////////////
// ///////////If two nodes have same amount and same neighbors, they are likely to be high similarity,
// ///////////value from 0-1//
function getSimilarityMatrix(nodes: NodeCollection) {

    let matrix: number[][] = Array.from({ length: nodes.length }, () => Array(nodes.length).fill(0));
    nodes.forEach((n1,index1) => {
        nodes.forEach((n2,index2) => {
            const neighbors1 = n1.neighborhood().nodes();
            const degree1 = neighbors1.length;
            const neighbors2 = n2.neighborhood().nodes();
            const degree2 = neighbors2.length;

            const count=neighbors1.intersection(neighbors2).length;

            const val=count/Math.min(degree1,degree2);

            matrix[index1][index2]=val;
            matrix[index2][index1]=val;
        })
    })
    return matrix;
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
    colSpacing: number = 80,
    cols?: number
){
    const n = nodes.length;
    if (n === 0) return;

    // 1. Determine Grid Dimensions
    // 'finalCols' will be the number of nodes in the "Vertical Line"
    let finalCols = cols || Math.ceil(Math.sqrt(n));
    if (n < 7) finalCols = n;

    const rows = Math.ceil(n / finalCols);

    // 2. Normalize Vectors
    const mag = Math.sqrt(dirVector.x ** 2 + dirVector.y ** 2) || 1;
    const uForward = { x: dirVector.x / mag, y: dirVector.y / mag };
    const uSide = { x: -uForward.y, y: uForward.x }; // Perpendicular (Vertical) axis

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

    ///////////////////////////////// 1. 锁定【星型结构】(逻辑保持不变) ///////////
    let starIndex:number = 0;
    nodes.forEach((node: any) => {
        const degree = node.degree();
        const neighbors = node.neighborhood().nodes();
        const leafNeighbors = neighbors.filter((n: any) => n.degree() === 1);

        if (leafNeighbors.length >= params.MIN_STAR_LEAVES && degree >= params.MIN_STAR_LEAVES) {
            node.data('structType', 'Star-Center');
            node.data('structColor', '#F48FB1');
            node.data('groupId', 'Star_' + starIndex);

            leafNeighbors.forEach((leaf: any) => {
                leaf.data('structType', 'Star-Member');
                leaf.data('structColor', '#F48FB1');
                leaf.data('groupId', 'Star_' + starIndex);
            });
            starIndex++;
        }
    });

    ///////////////////////////// 2. 识别环状结构 (Cycle) - 迭代 DFS 版 /////////////////


    const visited = new Set<string>();
    const allCycles: string[][] = [];  // 每个子数组代表一个独立的环
    if(1){
            //degree >= 2 means possible in a cycle
            const normalNodes = nodes.toArray().filter((n: any) => n.data('structType') === 'Normal' && n.degree() >= 2);
            const seenCycles = new Set<string>();

            // To avoid duplicate cycles (like A-B-C and B-C-A), we sort and stringify for a check
            console.log("normalNodes:" + normalNodes.length);

            normalNodes.forEach((startNode: any, startIndex: number) => {
                // console.log("startIndex:" + startIndex);
                // We only find cycles where startNode is the node with the lowest index
                // This is a massive optimization to prevent finding the same cycle N times
                const startId = startNode.id();

                const findCycles = (u: any, parent: any, path: string[]) => {
                    const neighbors = u.neighborhood().nodes().toArray().filter((n: any) =>
                        n.data('structType') === 'Normal'
                    );

                    for (const v of neighbors) {
                        const vId = v.id();
                        // 1. Found a cycle back to our specific START node
                        // console.log("path-length:"+path.length+" startId:"+startId);
                        // console.log(path);
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
                            // if(path.length < 10) {
                                findCycles(v, u, [...path, vId]);
                            // }
                        }
                    }
                };

                findCycles(startNode, null, [startId]);
            });
        }

        console.log("All Cycles:", allCycles);


    // --- 2. 二次过滤：去掉重合度 >= 2 的环 ---
    console.log("allCycles:",allCycles.length);
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

        if ( ( !isRedundant && currentCycle.length > 2 && currentCycle.length !=4  ) ) {
            filteredCycles.push(currentCycle);
        }
        if ( ( !isRedundant  && currentCycle.length ==4  ) ) {

            const subNodes = currentCycle.map(id => nodes.toArray().find(n => n.id() === id));

            // console.log("subNodes[1]:",subNodes[1]?.degree(false));
            // console.log("subNodes[2]:",subNodes[2]?.degree(false));
            // console.log("subNodes[3]:",subNodes[3]?.degree(false));
            if(!((subNodes[0]?.degree(false) == 2 && subNodes[2]?.degree(false) == 2 &&
                    subNodes[1]?.degree(false) != 2 && subNodes[3]?.degree(false) != 2) ||
                (subNodes[0]?.degree(false) == 2 && subNodes[2]?.degree(false) == 2 &&
                    subNodes[1]?.degree(false) == 2 && subNodes[3]?.degree(false) == 2
                ))) {
                filteredCycles.push(currentCycle);
            }
        }
    });
    console.log("filteredCycles:",filteredCycles.length);

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

                    innerIndex++;
                }
            });
        })
        circleIndex++;
    })

    console.log("检测到的环总数:", filteredCycles.length);
    console.log("具体环的信息:", filteredCycles);

    ////////////////////////////////////////// 定义链的存储结构  ////////////////////////////
    interface Chain {
        chainId: string;
        nodes: any[]; // 存储节点对象
    }

    const chains: Chain[] = [];
    const processedNodeIds = new Set<string>(); // 避免重复处理

    if(1){
        nodes.forEach((node:any)=>{
            if(node.id()==561) {
                console.log(node.id()+' degree:'+node.degree());
            }
        })
    }

    // 2. 找出所有的叶子节点 (Normal 类型且度数为 1)
    const leafNodes = nodes.filter((n: any) =>
        n.data('structType') === 'Normal' && n.degree() === 1
        // n.degree() === 1
    );

    console.log('num of leaf-node:'+leafNodes.length);
    let chainId = 0;
    leafNodes.forEach((leaf: any) => {
        // console.log('leaves:'+leaf.id());
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
                // chainId++;
                // nodeId = 0;
            }
        }

        // 4. 保存找到的链
        if (currentChainNodes.length >= params.MIN_CHAIN_LENGTH) {
            nodeId=0;
            currentChainNodes.forEach((node: any) => {
                node.data('structType', 'Chain');
                node.data('structColor', '#FFF176');
                node.data('groupId', 'Chain_' + chainId);
                node.data('innerId', nodeId);
                nodeId++;
            })
            chainId++;
            chains.push({
                chainId: `chain_${leaf.id()}`, // 以叶子节点 ID 命名
                nodes: currentChainNodes
            });
        }else{
            /////////////////////////////// leafs that not in a chain ///////////////////////////
            currentChainNodes.forEach((node: any) => {
                node.data('structType', 'LeafButNotChain');
                node.data('structColor', '#aaa');
                node.data('groupId', null);
                node.data('innerId', null);
                nodeId++;
                // console.log('leafNode', node.id());
            })
        }
    });

    /////////////////////////////// 找出平行/钻石结构 Parallel ///////////////////////////////////
    if(1) {
        // let diamonds = [];
        let parallelId = 0;
        //任意两个点是否有共同的neighbor
        for (let i = 0; i < nodes.length; i++) {
            let nodeVecParallel=[];
            let terminalVec=[];
            const u = nodes[i];
            const u1 = u.neighborhood().nodes();

            if(u.data('structType') === 'Normal') {
                for (let j = 0; j < nodes.length; j++) {
                    if (i === j) continue;
                    const v = nodes[j];
                    if (v.data('structType')=== 'Normal') {
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
            if(nodeVecParallel.length >= 2) {
                nodeVecParallel.forEach(v => {
                    nodes.forEach(node => {
                        if(node.id() == v) {
                            node.data('structType', 'Parallel');
                            node.data('structColor', '#50C878');
                            node.data('groupId', 'Parallel'+parallelId);
                        }
                    })
                })

                u1.forEach(v1 => {
                    nodes.forEach(node => {
                        if(node.id() == v1.id()) {
                            node.data('parallelGroupIdVec', [...node.data('parallelGroupIdVec'), 'Parallel' + parallelId]);
                        }
                    })
                })
                parallelId++;
            }
        }
        if(0){
            console.log("@@@@@@@@@@");
            nodes.forEach((node:any)=>{
                console.log(node.id()+' '+node.data('structType')+' '+node.data('parallelGroupIdVec'));
            })
        }
    }

    console.log("检测到的链总数:", chains.length);
    console.log("具体链信息:", chains);
};

ForceLayout.prototype.run = function () {
    const params = this.params;

// 1. 获取用户传入的 boundingBox，如果没有传，则默认为 cy 容器的大小
    const bb = this.boundingBox || this.cy.extent();

    // 2. 计算宽度和高度
    const width = bb.x2 - bb.x1;
    const height = bb.y2 - bb.y1;

    // 3. 计算中心点坐标（后续重力计算需要）
    const centerX = (bb.x1 + bb.x2) / 2;
    const centerY = (bb.y1 + bb.y2) / 2;

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
    const nodes = this.cy.nodes(); // Fetch from cy to get current state
    const edges = this.cy.edges();

    console.log("Updated num of nodes: " + nodes.length);
    console.log("Updated num of edges: " + edges.length);

    // 1. 识别结构 (标记 structType 并通过 components 划分独立环)
    this.identifyStructures(nodes);

    // initialial position draft layout;
    if (params.ENABLE_INITIAL_FORCE_LAYOUT) {
        const IDEAL_LENGTH = params.IDEAL_LENGTH;
        const REPULSION = params.REPULSION;
        const SPRING_K = params.SPRING_K;
        const ITERATIONS = params.ITERATIONS;
        const ANGULAR_STRENGTH = params.ANGULAR_STRENGTH;
        const CENTER_GRAVITY = params.CENTER_GRAVITY;

        for (let iter = 0; iter <= ITERATIONS; iter++) {
            console.log('iter:'+iter);
            // 1. Initialize displacements for this frame
            const disp = new Map<string, { x: number, y: number }>();
            nodes.forEach((n: { id: () => string; }) => disp.set(n.id(), { x: 0, y: 0 }));

            const cooling = Math.pow(1 - iter / ITERATIONS, 2);
            /* ---------- 2. 边弹簧力 attraction ---------- */
            if(1) {
                edges.forEach((e: { source: () => any; target: () => any; }) => {
                    const s = e.source();
                    const t = e.target();

                    if(s!=t) {
                        if (!s || !t) {
                            console.log('no edge');
                            return;
                        }

                        let dx = t.position().x - s.position().x;
                        let dy = t.position().y - s.position().y;
                        let dist = Math.sqrt(dx * dx + dy * dy) || 1;

                        const delta = dist - IDEAL_LENGTH;
                        const force = SPRING_K * delta * (delta > 0 ? 2.0 : 1.0);

                        const fx = force * dx / dist;
                        const fy = force * dy / dist;

                        s.position('x', s.position().x + fx);
                        s.position('y', s.position().y + fy);
                        t.position('x', t.position().x - fx);
                        t.position('y', t.position().y - fy);
                    }
                });
            }

            /* ---------- 1. 节点斥力 repulsion ---------- */
            if(1) {
                for (let i = 0; i < nodes.length; i++) {
                    for (let j = i + 1; j < nodes.length; j++) {
                        const n1 = nodes[i];
                        const n2 = nodes[j];

                        const dx = n1.position().x - n2.position().x;
                        const dy = n1.position().y - n2.position().y;
                        const dist = Math.sqrt(dx * dx + dy * dy) || 1; //at least 1

                        if(dist<IDEAL_LENGTH*5) {
                            let force = REPULSION / (dist * dist);

                            const fx = force * dx / dist;
                            const fy = force * dy / dist;

                            nodes[i].position().x = n1.position().x + fx;
                            nodes[i].position().y = n1.position().y + fy;
                            nodes[j].position().x = n2.position().x - fx;
                            nodes[j].position().y = n2.position().y - fy;
                        }
                    }
                }
            }

            /* ---------- 1. ANGULAR FORCE (Star-like distribution)  ---------- */
            if(1) {
                const adj = new Map<any, any[]>();
                edges.forEach((e: { source: () => any; target: () => any; }) => {
                    if (!adj.has(e.source().id())) adj.set(e.source().id(), []);
                    if (!adj.has(e.target().id())) adj.set(e.target().id(), []);
                    adj.get(e.source().id())!.push(e.target());
                    adj.get(e.target().id())!.push(e.source());
                });

                nodes.forEach((node: any) => {
                    const neighbors = adj.get(node.id()) || [];
                    if (neighbors.length < 2) return;

                    // Get current angles of all neighbors
                    let angles = neighbors.map(nb => ({
                        node: nb,
                        angle: Math.atan2(nb.position()?.y - node.position().y, nb.position()?.x - node.position().x)
                    }));

                    // Sort angles to find adjacent edges
                    angles.sort((a, b) => a.angle - b.angle);

                    // Push neighbor angles away from each other
                    for (let i = 0; i < angles.length; i++) {
                        const next = (i + 1) % angles.length;
                        let diff = angles[next].angle - angles[i].angle;

                        if (diff < 0) diff += Math.PI * 2; // Wrap around circle

                        const optimalDiff = (Math.PI * 2) / angles.length;
                        const adjustment = (diff - optimalDiff) * ANGULAR_STRENGTH * cooling;
                        // const adjustment = (diff - optimalDiff) * ANGULAR_STRENGTH;


                        // Apply rotational shift to the neighbor positions
                        const moveAngle = angles[i].angle + adjustment;
                        const dist = Math.sqrt(
                            Math.pow(angles[i].node.position().x - node.position().x, 2) +
                            Math.pow(angles[i].node.position().y - node.position().y, 2)
                        );

                        angles[i].node.position().x = node.position().x + Math.cos(moveAngle) * dist;
                        angles[i].node.position().y = node.position().y + Math.sin(moveAngle) * dist;

                    }
                });
            }

            /* ---------- D. Final Movement Application ---------- */
            if(1) {
                nodes.forEach((node: any) => {
                    if (node.data('structType') === 'Star-Center') return;
                    const d = disp.get(node.id())!;
                    const limit = 30 * cooling; // Speed limit prevents "jitter"

                    const moveX = Math.max(-limit, Math.min(limit, d.x));
                    const moveY = Math.max(-limit, Math.min(limit, d.y));

                    node.position({
                        x: node.position('x') + moveX,
                        y: node.position('y') + moveY
                    });
                });
            }
        }
    }

    if(1) {
        nodes.forEach((n: any) => {
            if (n.data('structType') === 'Normal' ||
                n.data('structType') === 'LeafButNotChain') {
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
            } else if (n.data('structType') === 'Cycle') {
                let flag = true;
                this.vnodes.forEach((vp: any) => {
                    if (vp.type === 'Cycle' && vp.id === n.data('groupId')) {
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
                if(1){
                    if(n.id()=='2660' || n.id()=='2602'){
                        console.log('!!!',n.data('groupId'));
                    }
                }
            }
        });
    }

    //为虚拟节点建好连接边
    if(1) {
        const edgePairs: { source: string; target: string }[] = [];

        for (const edge of edges) {
            let s=edge.source().id();
            let t=edge.target().id();
            let count=0;

            insideBreak:
                for (let i = 0; i < this.vnodes.length; i++) {
                    const v1 = this.vnodes[i];
                    count = 0;
                    if(!v1.nodes) continue;
                    v1.nodes.forEach((node: any) => {
                        if (node.id() === s || node.id() === t) {
                            count++;
                        }
                    })
                    if (count == 2) {
                        break insideBreak;
                    }
                }

            if(count!=2) {  // counts==2 means the edge is inside of vnode
                edgePairs.push({
                    source: edge.source().id(),
                    target: edge.target().id()
                });
            }
        }
        console.log("getting virtual edges...");
        for (let i = 0; i < this.vnodes.length-1; i++) {
            const v1 = this.vnodes[i];
            for (let j = i + 1; j < this.vnodes.length; j++) {
                // console.log('i:'+i+'   j:' + j);
                const v2 = this.vnodes[j];
                if (!v1.nodes || !v2.nodes) continue;

                if(1) {
                    let flag = false;
                    const nodeVec1 = v1.nodes;
                    const nodeVec2 = v2.nodes;
                    foundEdge:
                        for (const n1 of nodeVec1) {
                            if(n1.data("structType")!='Star-Member') {    // save time
                                for (const n2 of nodeVec2) {
                                    if(n2.data("structType")!='Star-Member') {
                                        for (const edge of edgePairs) {
                                            const source = edge.source;
                                            const target = edge.target;

                                            // Logic fix: Checking both directions for an undirected link
                                            if ((n1.id() === source && n2.id() === target) || (n2.id() === source && n1.id() === target)) {
                                                flag = true;
                                                break foundEdge; // Successfully stops ALL three loops
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    if (flag) {
                        let vedge = new VEdge(v1, v2);
                        this.vedges.push(vedge);
                    }
                }
            }
        }
    }
    ///////////////////////////////////////////////////////////////////////////

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

    //////////////////////////////// 更新半径 ///////////////////////////////////////////////
    this.vnodes.forEach((v1: any) => {
        // if(v1.type=='Normal') {
        //     v1.radius = 1;
        // }
        // if(v1.type=='Cycle') {
        //     v1.radius = 1;
        // }
        // if(v1.type=='Chain') {
        //     v1.radius = 1;
        // }
        // if(v1.type=='Parallel') {
        //     v1.radius = 1;
        // }
        if(v1.type=='Star') {
            v1.radius = params.STAR_RING_SPACING * Math.ceil((-3 + Math.sqrt(9 + 12 * v1.nodes.length)) / 6);
        }else if (v1.nodes && v1.nodes.length > 0) {
            v1.radius = Math.max(v1.nodes.length * params.VNODE_RADIUS_MULTIPLIER, 1) * params.IDEAL_LENGTH;
        }
    });

    /////////////////////////////对虚拟节点的网络用force- layout布局
    if (1) {
        const IDEAL_LENGTH = params.IDEAL_LENGTH;
        const REPULSION = params.REPULSION;
        const SPRING_K = params.SPRING_K;
        const ITERATIONS = params.ITERATIONS;
        const ANGULAR_STRENGTH = params.ANGULAR_STRENGTH;
        const USE_ANGULAR_FORCE = params.USE_ANGULAR_FORCE;

        console.log('ITERATIONS:'+ITERATIONS);
        for (let iter = 0; iter < ITERATIONS; iter++) {

            // 1. Initialize Displacement Map (Crucial for stability)
            const disp = new Map<string, { x: number, y: number }>();
            this.vnodes.forEach((n: VNode) => disp.set(n.id, { x: 0, y: 0 }));

            // Global cooling factor: starts at 1.0, ends at 0.0
            const cooling = Math.pow(1 - iter / ITERATIONS, 2);

            /* ---------- A. Attraction (Spring) with Radius ---------- */
            this.vedges.forEach((e: VEdge) => {
                const s = e.source;
                const t = e.target;
                if (!s || !t) return;

                const dx = t.center_x - s.center_x;
                const dy = t.center_y - s.center_y;
                const centerDist = Math.sqrt(dx * dx + dy * dy) || 1;

                // The "Actual Gap" between the surfaces of the nodes
                const surfaceDist = centerDist - (s.radius + t.radius);

                // We want the surfaceDist to equal IDEAL_LENGTH
                const delta = surfaceDist - IDEAL_LENGTH;
                const force = SPRING_K * delta * (delta > 0 ? 1.5 : 1.0);

                const fx = (force * dx) / centerDist;
                const fy = (force * dy) / centerDist;

                s.center_x += fx;
                s.center_y += fy;
                t.center_x -= fx;
                t.center_y -= fy;
            });

            /* ---------- B. Repulsion (Volume-Aware) ---------- */
            for (let i = 0; i < this.vnodes.length; i++) {
                for (let j = i + 1; j < this.vnodes.length; j++) {
                    const n1 = this.vnodes[i];
                    const n2 = this.vnodes[j];

                    const dx = n1.center_x - n2.center_x;
                    const dy = n1.center_y - n2.center_y;

                    const centerDist = Math.sqrt(dx * dx + dy * dy) || 1;

                    const minDistance = n1.radius + n2.radius;
                    // const minDistance = 2*(n1.radius + n2.radius);

                    let force = 0;
                    if (centerDist < minDistance) {
                        // COLLISION: Violent push to separate overlapping nodes
                        force = REPULSION * 2 / centerDist;
                    } else if(centerDist < 4*minDistance) {
                        // NORMAL: Repulsion based on surface-to-surface gap
                        const gap = centerDist - minDistance;
                        // As gap approaches 0, force increases
                        force = REPULSION / (gap * gap + 10);
                    }else{
                        force=0.1;
                    }

                    const fx = (force * dx) / centerDist;
                    const fy = (force * dy) / centerDist;

                    this.vnodes[i].center_x += fx;
                    this.vnodes[i].center_y += fy;
                    this.vnodes[j].center_x -= fx;
                    this.vnodes[j].center_y -= fy;
                }
            }

            if(0){
                this.vnodes.forEach((v1: any) => {
                    if(v1.id==375) {
                        console.log(v1.id,' pos:',v1.center_x,v1.center_y);
                    }
                })
            }

            /* ---------- star Repulsion (Volume-Aware) ---------- */
            if(0){
                const CENTER_GRAVITY=0.01;
                this.vnodes.forEach((n: VNode) => {
                    const dx = n.center_x - centerX;
                    const dy = n.center_y - centerY;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

                    if (n.type === 'Star') {
                        // --- 离心力：让 Star 节点往外走 ---
                        // 目标半径设为屏幕短边的一半（约 0.8 倍，留出边缘）
                        const targetRadius = Math.min(width, height) * 0.4;
                        const strength = 0.05; // 离心力强度

                        // 如果距离中心太近，就往外推；如果太远，就往回拉
                        const factor = (dist - targetRadius) * strength;
                        n.center_x -= (dx / dist) * factor * cooling;
                        n.center_y -= (dy / dist) * factor * cooling;
                    } else {
                        // --- 向心力：让普通节点往中间聚 ---
                        n.center_x -= dx * CENTER_GRAVITY * cooling;
                        n.center_y -= dy * CENTER_GRAVITY * cooling;
                    }
                });
            }

            if(USE_ANGULAR_FORCE) {
                const adj = new Map<any, VNode[]>();
                this.vedges.forEach((e: VEdge) => {
                    if (!adj.has(e.source.id)) adj.set(e.source.id, []);
                    if (!adj.has(e.target.id)) adj.set(e.target.id, []);
                    adj.get(e.source.id)!.push(e.target);
                    adj.get(e.target.id)!.push(e.source);
                });

                this.vnodes.forEach((node: VNode) => {

                    const neighbors = adj.get(node.id) || [];
                    if (neighbors.length < 2) return;

                    // Get current angles of all neighbors
                    let angles = neighbors.map(nb => ({
                        node: nb,
                        angle: Math.atan2(nb.center_y - node.center_y, nb.center_x - node.center_x)
                    }));

                    // Sort angles to find adjacent edges
                    angles.sort((a, b) => a.angle - b.angle);

                    // Push neighbor angles away from each other
                    for (let i = 0; i < angles.length; i++) {
                        const next = (i + 1) % angles.length;
                        let diff = angles[next].angle - angles[i].angle;

                        if (diff < 0) diff += Math.PI * 2; // Wrap around circle
                        const cooling = Math.pow(1 - iter / ITERATIONS, 2);

                        const optimalDiff = (Math.PI * 2) / angles.length;
                        const adjustment = (diff - optimalDiff) * ANGULAR_STRENGTH * cooling;

                        // Apply rotational shift to the neighbor positions
                        const moveAngle = angles[i].angle + adjustment;
                        const dist = Math.sqrt(
                            Math.pow(angles[i].node.center_x - node.center_x, 2) +
                            Math.pow(angles[i].node.center_y - node.center_y, 2)
                        );
                        angles[i].node.center_x = node.center_x + Math.cos(moveAngle) * dist;
                        angles[i].node.center_y = node.center_y + Math.sin(moveAngle) * dist;
                    }
                });
            }

        }
    }

    //////////////////////////////// /////////////////////////////////////////////
    if (params.SPREAD_V_NODES) {
        this.vnodes.forEach((v: any) => {
            v.nodes.forEach((n: any) => {
                n.position().x = v.center_x + Math.random() * 5;
                n.position().y = v.center_y + Math.random() * 5;
            })
        });
    }

    /////////////////////  删除之后变成虚拟节点 vnode 的layout ////////////////
    if (params.SUBSTRUCTURE_LAYOUT) {
    // if (0) {
        const IDEAL_LENGTH = params.LEAF_NODE_DISTANCE;
        this.vnodes.forEach((v: any) => {
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
                let  reverseFlag=false;

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
                        reverseFlag=true;
                        minTotalLength = totalLength;
                        bestRotate = rotate;
                    }
                }

                // 4. 强行覆盖坐标：这是形成“绝对圆”的物理保障
                //console.log('sorted:'+sorted.length);
                if(!reverseFlag) {
                    sorted.forEach((n: any, i: number) => {
                        const angle = (i / count) * 2 * Math.PI + bestRotate;
                        n.position({
                            x: v.center_x + Math.cos(angle) * radius,
                            y: v.center_y + Math.sin(angle) * radius
                        });
                    });
                }else{
                    sortedReverse.forEach((n: any, i: number) => {
                        const angle = (i / count) * 2 * Math.PI + bestRotate;
                        n.position({
                            x: v.center_x + Math.cos(angle) * radius,
                            y: v.center_y + Math.sin(angle) * radius
                        });
                    });
                }
            } else if (v.type == 'Star') {
                if(1){
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

                            // Stagger every other ring
                            if (ringNumber % 2 === 0) {
                                angle += (Math.PI / totalInThisRing);
                            }

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
                const finalGroups2 = Object.keys(chainGroups).map(key => {
                    const group = chainGroups[key];
                    return group.sort((a, b) => Number(a.data('innerId')) - Number(b.data('innerId')));
                });

                for (const groupId in chainGroups) {
                    if (chainGroups.hasOwnProperty(groupId)) {
                        const gNodes = chainGroups[groupId];
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
                            // 4. 强行覆盖坐标：这是形成“绝对圆”的物理保障
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
            }else if (v.type == 'Parallel' ) {
                let endVec:any = [];
                nodes.forEach((n: any, i: number) => {
                    if (n.data('parallelGroupIdVec').includes(v.id) && n.data('structType') != 'Parallel') {
                        //提取同一个group的端节点
                        endVec.push(n);
                    }
                })
                // console.log('endVec.length:'+endVec.length+' v.id:'+v.id);
                if(endVec.length >= 2){ //应该>=2，否则就错误
                    const gap = params.PARALLEL_GAP; //垂直分布的步长
                    //有node数组，将里面的所有node在两个点n1,n2中点垂线上均匀分布
                    const p1 = endVec[0].position();
                    const p2 = endVec[1].position();
                    const diff={x:p2.x-p1.x, y:p2.y-p1.y};

                    layoutRectangular(v.nodes,{x:v.center_x,y:v.center_y},diff);
                }
            }
        })

        nodes.forEach((n: any, i: number) => {
            if(n.data('structType') == 'LeafButNotChain') {
                // console.log('layout:'+n.id()+' ->:'+n.neighborhood().nodes().first().id());
                let fatherPos=n.neighborhood().nodes().first().position();
                const pos=n.position();

                let maxTotalLength = 10e10;
                let bestRotate = 0;    //找出最好的旋转角度
                let aroundNodesVec:any[]=[];

                nodes.forEach((nd: any, i: number) => {
                    if(((nd.position().x-fatherPos.x)*(nd.position().x-fatherPos.x)+
                        (nd.position().y-fatherPos.y)*(nd.position().y-fatherPos.y))<2*IDEAL_LENGTH*IDEAL_LENGTH){
                        aroundNodesVec.push(nd);
                        // console.log('aroundNodesVec:'+nd.id());
                    }
                })

                for (let rotate = 0; rotate <= 360; rotate = rotate + 10) {
                    n.position({
                        x: fatherPos.x + Math.cos(rotate*3.14/180) * IDEAL_LENGTH,
                        y: fatherPos.y + Math.sin(rotate*3.14/180) * IDEAL_LENGTH
                    });
                    let totalLength = 0;
                    aroundNodesVec.forEach((nd: any, i: number) => {
                        if(nd.id()!=n.id()) {
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
                // console.log('bestRotate:'+bestRotate);
                n.position({
                    x: fatherPos.x + Math.cos(bestRotate*3.14/180) * IDEAL_LENGTH,
                    y: fatherPos.y + Math.sin(bestRotate*3.14/180) * IDEAL_LENGTH
                });
                // console.log('ssss');
            }
        })
    }

    if(1) {
        console.log("num of virtual edges:", this.vedges.length);
        console.log('num of sudo-nodes:', this.vnodes.length);
        let maxDis = 0;
        let maxS=0;
        let maxT=0;
        let minDist=10e10;
        let minS=0;
        let minT=0;
        let avgDis = 0;
        edges.forEach((e: { source: () => any; target: () => any; position: { y: number; }; }) => {
            const s = e.source();
            const t = e.target();
            const distance = Math.sqrt(Math.pow(s.position().x - t.position().x, 2) +
                Math.pow(s.position().y - t.position().y, 2));
            if (maxDis < distance) {
                maxDis = distance;
                maxS=s.id();
                maxT=t.id();
            }
            if(minDist>distance) {
                minDist=distance;
                minS=s.id();
                minT=t.id();
            }
            avgDis += distance;
        })
        console.log("maxDis:", maxDis, " ", maxS, "->", maxT);
        console.log("minDist:", minDist, " ", minS, "->", minT);
        console.log("avgDis:", avgDis / edges.length);
    }

    if(1){
        nodes.forEach((n1: any) => {
            nodes.forEach((n2: any) => {
                if(n1.id()=='2660' && n2.id()=='2602') {
                    let dist=Math.sqrt((n1.position().x-n2.position().x)*(n1.position().x-n2.position().x)
                        +(n1.position().y-n2.position().y)*(n1.position().y-n2.position().y));
                    console.log(n1.id(),'->',n2.id(),':',dist);
                }
            })
        })
    }

    this.cy.fit(null, 50);
    this.cy.emit('layoutstop');

    return this;
};

ForceLayout.prototype.stop = function () {
    return this;
};

export default function register(cytoscape: any) {
    if (!cytoscape) return;
    cytoscape('layout', 'ForceLayout', ForceLayout);
}
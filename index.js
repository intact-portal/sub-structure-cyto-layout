// @ts-ignore
export const DEFAULT_PARAMS = {
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
    constructor(id, x, y, radius) {
        this.id = id;
        this.center_x = x;
        this.center_y = y;
        this.radius = radius;
        // 2. 【初始化：默认不赋值，即为 undefined】
        this._permanentOrder = undefined;
    }
}
class VEdge {
    // normally is 1, but can be 2 or more for like parallel edges
    // 构造函数
    constructor(source, target, weight = 1) {
        this.source = source;
        this.target = target;
        this.weight = weight;
    }
}
/////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * 结构增强版力导向布局
 */
function ForceLayout(options) {
    this.options = options;
    this.cy = options.cy;
    this.eles = options.eles;
    // Merge user-provided parameters with defaults
    this.params = Object.assign(Object.assign({}, DEFAULT_PARAMS), (options.params || {}));
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
ForceLayout.prototype.captureStep = function (stepName, description, metadata) {
    if (!this.params.STEP_BY_STEP)
        return;
    const nodes = this.cy.nodes();
    const nodePositions = {};
    nodes.forEach((node) => {
        nodePositions[node.id()] = {
            x: node.position().x,
            y: node.position().y
        };
    });
    // Deep clone virtual nodes and edges if they exist
    const virtualNodes = this.vnodes.length > 0 ? JSON.parse(JSON.stringify(this.vnodes.map((v) => {
        var _a;
        return ({
            id: v.id,
            type: v.type,
            center_x: v.center_x,
            center_y: v.center_y,
            radius: v.radius,
            rotate_angle: v.rotate_angle,
            nodeIds: ((_a = v.nodes) === null || _a === void 0 ? void 0 : _a.map((n) => n.id())) || []
        });
    }))) : undefined;
    const virtualEdges = this.vedges.length > 0 ? JSON.parse(JSON.stringify(this.vedges.map((e) => ({
        source: e.source.id,
        target: e.target.id
    })))) : undefined;
    const step = {
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
function areNodesEqual(arr1, arr2) {
    // 1. 长度不等，肯定不相同
    if (arr1.length !== arr2.length)
        return false;
    // 2. 提取所有 ID 并放入 Set
    const ids1 = new Set(arr1.map(node => node.id()));
    // 3. 检查 arr2 中的每个 ID 是否都在 Set 中
    return arr2.every(node => ids1.has(node.id()));
}
////////////////sum length of all edges ////////////////
function totalEdgeLength(edges) {
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
    });
    return total;
}
/**
 * 将 Node 数组排列成矩形矩阵
 *
 * dirVector：矩形长边方向
 * colSpacing：长边方向上节点之间的距离
 * rowSpacing：短边方向上行与行之间的距离
 * cols：每行节点数量，不传则自动计算
 */
function layoutRectangular(nodes, center, dirVector, rowSpacing = 60, colSpacing = 60, cols) {
    const n = nodes.length;
    if (n === 0) {
        return;
    }
    // ============================================================
    // 1. 确定矩阵尺寸
    // ============================================================
    let finalCols;
    if (cols !== undefined && cols > 0) {
        finalCols = Math.min(cols, n);
    }
    else {
        finalCols = Math.ceil(Math.sqrt(n));
    }
    let rows = Math.ceil(n / finalCols);
    // 少量节点直接放一行
    if (n < 5) {
        finalCols = 1;
        rows = n;
    }
    // ============================================================
    // 2. 计算两个单位方向向量
    //
    // uLong  = 长边方向 = dirVector
    // uShort = 短边方向 = 垂直于 dirVector
    // ============================================================
    const magnitude = Math.sqrt(dirVector.x * dirVector.x +
        dirVector.y * dirVector.y);
    const safeMagnitude = Math.max(magnitude, 0.000001);
    const uLong = {
        x: dirVector.x / safeMagnitude,
        y: dirVector.y / safeMagnitude
    };
    const uShort = {
        x: -uLong.y,
        y: uLong.x
    };
    // ============================================================
    // 3. 遍历所有 Node
    // ============================================================
    nodes.forEach((node, i) => {
        // 当前节点所在的行
        const row = Math.floor(i / finalCols);
        // 当前节点所在的列
        const col = i % finalCols;
        // --------------------------------------------------------
        // 当前行实际有多少个节点
        // --------------------------------------------------------
        const isLastRow = row === rows - 1;
        const nodesInThisRow = isLastRow
            ? (n % finalCols || finalCols)
            : finalCols;
        // ========================================================
        // 4. 长边方向的位置
        //
        // 例如：
        //
        // ● ● ● ●
        //
        // 会围绕 center 对称
        // ========================================================
        const longWidth = (nodesInThisRow - 1) * colSpacing;
        const offsetLong = col * colSpacing - longWidth / 2;
        // ========================================================
        // 5. 短边方向的位置
        //
        // 例如：
        //
        // ● ● ● ●
        // ● ● ● ●
        // ● ●
        //
        // 每一行整体居中
        // ========================================================
        const totalShortHeight = (rows - 1) * rowSpacing;
        const offsetShort = row * rowSpacing - totalShortHeight / 2;
        // ========================================================
        // 6. 计算最终坐标
        //
        // position =
        //      center
        //    + 长边方向偏移
        //    + 短边方向偏移
        // ========================================================
        const x = center.x +
            offsetLong * uLong.x +
            offsetShort * uShort.x;
        const y = center.y +
            offsetLong * uLong.y +
            offsetShort * uShort.y;
        node.position({
            x,
            y
        });
    });
}
ForceLayout.prototype.identifyStructures = function (nodes) {
    const params = this.params;
    // 0. 重置所有标记
    nodes.data('structType', 'Normal');
    nodes.data('structColor', '#999999');
    nodes.data('groupId', null); // 新增：重置分组 ID for cycle
    nodes.data('innerId', null); // index inner a circle
    nodes.data('parallelGroupIdVec', []);
    // improve the above 'data' definition
    nodes.data('structs', {});
    ///////////////////////////// 2. detecting Cycle - by DFS algorithm /////////////////
    const allCycles = []; // each sub-array represents an independent cycle
    if (1) {
        const normalNodes = nodes.toArray().filter((n) => n.data('structType') === 'Normal' && n.degree() >= 2); //degree >= 2 means possible in a cycle
        const seenCycles = new Set();
        // To avoid duplicate cycles (like A-B-C and B-C-A), we sort and stringify for a check
        normalNodes.forEach((startNode, startIndex) => {
            // We only find cycles where startNode is the node with the lowest index
            // This is a massive optimization to prevent finding the same cycle N times
            const startId = startNode.id();
            const findCycles = (u, parent, path) => {
                const neighbors = u.neighborhood().nodes().toArray().filter((n) => n.data('structType') === 'Normal');
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
    const filteredCycles = [];
    allCycles.sort((a, b) => b.length - a.length);
    // 建议先按环的大小排序，通常保留“小环”更有意义（基础环往往更短）
    allCycles.forEach((currentCycle) => {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const currentSet = new Set(currentCycle);
        // 检查当前环是否与已保存的任何一个环有 2 个以上节点重合
        const isRedundant = filteredCycles.some(existingCycle => {
            let overlapCount = 0;
            for (const nodeId of existingCycle) {
                if (currentSet.has(nodeId)) {
                    overlapCount++;
                }
                // 性能优化：一旦发现重合点达到 2 个，立即停止计数
                if (overlapCount >= 2)
                    return true;
            }
            return false;
        });
        if ((!isRedundant && currentCycle.length > 2 && currentCycle.length != 4)) {
            filteredCycles.push(currentCycle);
        }
        if ((!isRedundant && currentCycle.length == 4)) {
            const subNodes = currentCycle.map(id => nodes.toArray().find(n => n.id() === id));
            if (!((((_a = subNodes[0]) === null || _a === void 0 ? void 0 : _a.degree(false)) == 2 && ((_b = subNodes[2]) === null || _b === void 0 ? void 0 : _b.degree(false)) == 2 &&
                ((_c = subNodes[1]) === null || _c === void 0 ? void 0 : _c.degree(false)) != 2 && ((_d = subNodes[3]) === null || _d === void 0 ? void 0 : _d.degree(false)) != 2) ||
                (((_e = subNodes[0]) === null || _e === void 0 ? void 0 : _e.degree(false)) == 2 && ((_f = subNodes[2]) === null || _f === void 0 ? void 0 : _f.degree(false)) == 2 &&
                    ((_g = subNodes[1]) === null || _g === void 0 ? void 0 : _g.degree(false)) == 2 && ((_h = subNodes[3]) === null || _h === void 0 ? void 0 : _h.degree(false)) == 2))) {
                filteredCycles.push(currentCycle);
            }
        }
    });
    let circleIndex = 1; // why 1 works ????
    filteredCycles.forEach((currentCycle) => {
        let innerIndex = 0;
        currentCycle.forEach((circle_node) => {
            nodes.forEach((node) => {
                if (node.data('structType') === 'Normal' && node.id() === circle_node) {
                    node.data('structType', 'Cycle');
                    node.data('structColor', '#2196F3');
                    node.data('groupId', 'Cycle_' + circleIndex);
                    node.data('innerId', innerIndex);
                    // for multiple struct types, we use a 'structs' object to store the data
                    node.data('structs', Object.assign(Object.assign({}, node.data('structs')), { Cycle: {
                            color: '#2196F3',
                            groupId: 'Cycle_' + circleIndex,
                            innerId: innerIndex
                        } }));
                    innerIndex++;
                }
            });
        });
        circleIndex++;
    });
    console.log("num of cycles: ", filteredCycles.length);
    const chains = [];
    const processedNodeIds = new Set(); // 避免重复处理
    // 2. 找出所有的叶子节点 (Normal 类型且度数为 1)
    const leafNodes = nodes.filter((n) => n.data('structType') === 'Normal' && n.degree() === 1);
    let chainId = 0;
    leafNodes.forEach((leaf) => {
        if (processedNodeIds.has(leaf.id()))
            return;
        const currentChainNodes = [];
        let currentNode = leaf;
        let nodeId = 0;
        // 3. 沿着链向内溯源
        while (currentNode) {
            currentChainNodes.push(currentNode);
            processedNodeIds.add(currentNode.id());
            // 寻找下一个邻居
            const neighbors = currentNode.neighborhood().nodes().filter((n) => n.data('structType') === 'Normal' && !processedNodeIds.has(n.id()));
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
            }
            else {
                // 没有邻居或有多个邻居（分叉），链结束
                currentNode = null;
            }
        }
        // 4. 保存找到的链
        if (currentChainNodes.length >= params.MIN_CHAIN_LENGTH) {
            nodeId = 0;
            currentChainNodes.forEach((node) => {
                node.data('structType', 'Chain');
                node.data('structColor', '#FFF176');
                node.data('groupId', 'Chain_' + chainId);
                node.data('innerId', nodeId);
                node.data('structs', Object.assign(Object.assign({}, node.data('structs')), { Chain: {
                        color: '#FFF176',
                        groupId: 'Chain_' + chainId,
                        innerId: nodeId
                    } }));
                nodeId++;
            });
            chainId++;
            chains.push({
                chainId: `chain_${leaf.id()}`, // 以叶子节点 ID 命名
                nodes: currentChainNodes
            });
        }
        else {
            /////////////////////////////// leafs that not in a chain ///////////////////////////
            currentChainNodes.forEach((node) => {
                node.data('structType', 'LeafButNotChain');
                node.data('structColor', '#aaa');
                node.data('groupId', null);
                node.data('innerId', null);
                node.data('structs', Object.assign(Object.assign({}, node.data('structs')), { LeafButNotChain: {
                        color: '#aaa',
                        groupId: null,
                        innerId: null
                    } }));
                nodeId++;
            });
        }
    });
    ///////////////////////////////// 星型结构 ///////////
    let starIndex = 0;
    nodes.forEach((node) => {
        const degree = node.degree();
        const neighbors = node.neighborhood().nodes();
        const leafNeighbors = neighbors.filter((n) => n.degree() === 1);
        if (leafNeighbors.length >= params.MIN_STAR_LEAVES && degree >= params.MIN_STAR_LEAVES) {
            if (node.data('structType') != 'Cycle' && node.data('structType') != 'Chain') {
                node.data('structType', 'Star-Center');
                node.data('structColor', '#F48FB1');
                node.data('groupId', 'Star_' + starIndex);
                node.data('structs', Object.assign(Object.assign({}, node.data('structs')), { Star: {
                        role: 'Center',
                        color: '#F48FB1',
                        groupId: `Star_${starIndex}`
                    } }));
                leafNeighbors.forEach((leaf) => {
                    leaf.data('structType', 'Star-Member');
                    leaf.data('structColor', '#F48FB1');
                    leaf.data('groupId', 'Star_' + starIndex);
                    leaf.data('structs', Object.assign(Object.assign({}, leaf.data('structs')), { Star: {
                            role: 'Member',
                            color: '#F48FB1',
                            groupId: `Star_${starIndex}`
                        } }));
                });
                if (1) {
                }
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
            const u = nodes[i];
            const u1 = u.neighborhood().nodes();
            if (u.data('structType') === 'Normal') {
                for (let j = 0; j < nodes.length; j++) {
                    if (i === j)
                        continue;
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
                            node.data('structs', Object.assign(Object.assign({}, node.data('structs')), { Parallel: {
                                    color: '#50C878',
                                    groupId: `Parallel_${parallelId}`
                                } }));
                        }
                    });
                });
                u1.forEach(v1 => {
                    nodes.forEach(node => {
                        if (node.id() == v1.id()) {
                            node.data('parallelGroupIdVec', [...node.data('parallelGroupIdVec'), 'Parallel' + parallelId]);
                        }
                    });
                });
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
    const networkInfos = [];
    components.forEach((component, index) => {
        let nodes = component.nodes();
        const edges = component.edges();
        this.vnodes = [];
        this.vedges = [];
        console.log(`independent net: ${index + 1}`);
        // 1. get user defined boundingBox，if not then default cy container
        const bb = this.boundingBox || this.cy.extent();
        // 2. 计算宽度和高度
        const width = bb.x2 - bb.x1;
        const height = bb.y2 - bb.y1;
        // 1. Run removal logic first
        const seenPairs = new Set();
        const toRemove = this.eles.edges().filter((edge) => {
            const sourceId = edge.source().id();
            const targetId = edge.target().id();
            if (sourceId === targetId)
                return true;
            const pairKey = [sourceId, targetId].sort().join('---');
            if (seenPairs.has(pairKey))
                return true;
            seenPairs.add(pairKey);
            return false;
        });
        this.cy.remove(toRemove);
        // 2. NOW define your collections to get the updated state
        if (params.RANDOMIZE_INITIAL_POSITION) {
            nodes.forEach((node) => {
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
        this.identifyStructures(nodes);
        this.captureStep('Structure Detection', 'Structures identified (Stars, Cycles, Chains, Parallel)', {
            stars: nodes.filter((n) => { var _a; return (_a = n.data('structType')) === null || _a === void 0 ? void 0 : _a.startsWith('Star'); }).length,
            cycles: nodes.filter((n) => n.data('structType') === 'Cycle').length,
            chains: nodes.filter((n) => n.data('structType') === 'Chain').length,
            parallel: nodes.filter((n) => n.data('structType') === 'Parallel').length
        });
        //************ 将每种类型分类保存到二维数组中 *///////////
        if (1) {
            nodes.forEach((n) => {
                var _a;
                if (n.data('structType') === 'Normal' || n.data('structType') === 'LeafButNotChain') {
                    let nodesarray = [];
                    nodesarray.push(n);
                    this.vnodes.push({
                        type: 'Normal',
                        id: n.id(),
                        center_x: n.data.x,
                        center_y: n.data.y,
                        radius: 1,
                        rotate_angle: 0,
                        nodes: nodesarray
                    });
                    // }else if (n.data('structType') === 'Cycle') {
                }
                else if (((_a = n.data('structs')) === null || _a === void 0 ? void 0 : _a.Cycle) != null) {
                    let flag = true;
                    this.vnodes.forEach((vp) => {
                        var _a, _b;
                        // if (vp.type === 'Cycle' && vp.id === n.data('groupId')) {
                        if (vp.type === 'Cycle' && vp.id === ((_b = (_a = n.data('structs')) === null || _a === void 0 ? void 0 : _a.Cycle) === null || _b === void 0 ? void 0 : _b.groupId)) { // for cycle that has star
                            vp.nodes.push(n);
                            flag = false;
                        }
                    });
                    if (flag) { //还没保存过
                        let nodesarray = [];
                        nodesarray.push(n);
                        this.vnodes.push({
                            type: 'Cycle',
                            id: n.data("groupId"),
                            center_x: n.data.x,
                            center_y: n.data.y,
                            radius: 1,
                            rotate_angle: 0,
                            nodes: nodesarray
                        });
                    }
                }
                else if (n.data('structType') === 'Chain') {
                    let flag = true;
                    this.vnodes.forEach((vp) => {
                        if (vp.type === 'Chain' && vp.id === n.data('groupId')) {
                            vp.nodes.push(n);
                            flag = false;
                        }
                    });
                    if (flag) { //还没保存过
                        let nodesarray = [];
                        nodesarray.push(n);
                        this.vnodes.push({
                            type: 'Chain',
                            id: n.data("groupId"),
                            center_x: n.data.x,
                            center_y: n.data.y,
                            radius: 1,
                            rotate_angle: 0,
                            nodes: nodesarray
                        });
                    }
                }
                else if (n.data('structType') === 'Parallel') {
                    let flag = true;
                    this.vnodes.forEach((vp) => {
                        if (vp.type === 'Parallel' && vp.id === n.data('groupId')) {
                            vp.nodes.push(n);
                            flag = false;
                        }
                    });
                    if (flag) { //还没保存过
                        let nodesarray = [];
                        nodesarray.push(n);
                        this.vnodes.push({
                            type: 'Parallel',
                            id: n.data("groupId"),
                            center_x: n.data.x,
                            center_y: n.data.y,
                            radius: 1,
                            rotate_angle: 0,
                            nodes: nodesarray
                        });
                    }
                }
                else if (n.data('structType') == 'Star-Center' || n.data('structType') == 'Star-Member') {
                    // } else if ((n.data('structType') == 'Star-Center' || n.data('structType') == 'Star-Member' ) && (n.data('structs')?.Cycle == null ) ) {
                    let flag = true;
                    this.vnodes.forEach((vp) => {
                        if (vp.type === 'Star' && vp.id === n.data('groupId')) {
                            vp.nodes.push(n);
                            flag = false;
                        }
                    });
                    if (flag) { //还没保存过
                        let nodesarray = [];
                        nodesarray.push(n);
                        this.vnodes.push({
                            type: 'Star',
                            id: n.data("groupId"),
                            center_x: n.data.x,
                            center_y: n.data.y,
                            radius: 1,
                            rotate_angle: 0,
                            nodes: nodesarray
                        });
                    }
                }
            });
        }
        this.captureStep('Virtual Nodes Created', 'Virtual nodes created for structures', { vnodeCount: this.vnodes.length });
        console.log("#####");
        //construct virtual edges for virtual nodes
        if (1) {
            // --------------------------------------------------------
            // 1. 建立：真实 Node ID -> VNode
            // --------------------------------------------------------
            const nodeToVNode = new Map();
            for (const vnode of this.vnodes) {
                if (!vnode.nodes)
                    continue;
                for (const node of vnode.nodes) {
                    // Star-Member 是否需要参与 VNode edge 建立，
                    // 保持和你原来的逻辑一致：
                    //
                    // 原代码在真正建立 edge 时：
                    // if (n1.data("structType") != 'Star-Member')
                    //
                    // 因此这里可以直接忽略 Star-Member。
                    if (node.data("structType") === "Star-Member") {
                        continue;
                    }
                    nodeToVNode.set(node.id(), vnode);
                }
            }
            // --------------------------------------------------------
            // 2. 遍历真实 Edge
            //
            // 直接确定：
            //
            // realNode1 -> VNode1
            // realNode2 -> VNode2
            //
            // 然后：
            //
            // VNode1 <-> VNode2 : connectionCount++
            // --------------------------------------------------------
            const connectionMap = new Map();
            for (const edge of edges) {
                const sourceNode = edge.source();
                const targetNode = edge.target();
                const sourceId = sourceNode.id();
                const targetId = targetNode.id();
                const sourceVNode = nodeToVNode.get(sourceId);
                const targetVNode = nodeToVNode.get(targetId);
                // 如果找不到对应 VNode，跳过
                if (!sourceVNode || !targetVNode) {
                    continue;
                }
                // ----------------------------------------------------
                // Edge 在同一个 VNode 内部
                //
                // 原来的逻辑：
                //
                // count == 2
                //
                // 表示 edge 两端都在同一个 vnode，
                // 因此不建立 virtual edge。
                // ----------------------------------------------------
                if (sourceVNode === targetVNode) {
                    continue;
                }
                // ----------------------------------------------------
                // 为了保证：
                //
                // A -> B
                // B -> A
                //
                // 被认为是同一条 VEdge
                //
                // 使用 vnode index / id 建立唯一 key
                // ----------------------------------------------------
                const id1 = sourceVNode.id;
                const id2 = targetVNode.id;
                const key = id1 < id2
                    ? `${id1}---${id2}`
                    : `${id2}---${id1}`;
                const existing = connectionMap.get(key);
                if (existing) {
                    existing.count++;
                }
                else {
                    connectionMap.set(key, {
                        source: id1 < id2
                            ? sourceVNode
                            : targetVNode,
                        target: id1 < id2
                            ? targetVNode
                            : sourceVNode,
                        count: 1
                    });
                }
            }
            // --------------------------------------------------------
            // 3. 根据 connectionMap 创建 VEdge
            // --------------------------------------------------------
            connectionMap.forEach(({ source, target, count }) => {
                const vedge = new VEdge(source, target, count);
                this.vedges.push(vedge);
            });
            console.log(`Virtual edges created: ${this.vedges.length}`);
        }
        console.log("@@@@@@");
        this.captureStep('Virtual Edges Created', 'Virtual edges created between virtual nodes', { vedgeCount: this.vedges.length });
        ///////////////////////////////////////////////////////////////////////////
        /////////////////////////update virtual nodes's neighbors////////////////////////////////
        this.vedges.forEach((vedge) => {
            vedge.source.neighbors = vedge.source.neighbors || [];
            vedge.target.neighbors = vedge.target.neighbors || [];
            vedge.source.neighbors.push(vedge.target);
            vedge.target.neighbors.push(vedge.source);
        });
        ///////////////////////////////// 更新虚拟节点的中心 //////////////////////////
        this.vnodes.forEach((v1) => {
            if (v1.nodes && v1.nodes.length > 0) {
                const sumX = v1.nodes.reduce((acc, curr) => acc + (curr.position().x || 0), 0);
                const sumY = v1.nodes.reduce((acc, curr) => acc + (curr.position().y || 0), 0);
                v1.center_x = sumX / v1.nodes.length;
                v1.center_y = sumY / v1.nodes.length;
            }
            else {
                v1.center_x = v1.center_x || 0;
                v1.center_y = v1.center_y || 0;
            }
        });
        console.log("00000");
        //////////////////////////////// 更新半径 update radius for virtual nodes /////////////////////////////
        if (1) {
            this.vnodes.forEach((v1) => {
                if (v1.type == 'Star') {
                    const allMemberNode = v1.nodes.filter((node) => node.data('structType') !== 'Star-Center');
                    const ringSpacing = params.STAR_RING_SPACING;
                    const baseNodesInFirstRing = params.STAR_BASE_NODES_PER_RING;
                    // 1. Pre-calculate how many nodes go into each ring
                    const rings = [];
                    let tempNodes = [...allMemberNode];
                    let currentRingSize = baseNodesInFirstRing;
                    while (tempNodes.length > 0) {
                        // Take the next chunk of nodes for this ring
                        rings.push(tempNodes.splice(0, currentRingSize));
                        // Increase capacity for the next ring
                        currentRingSize += baseNodesInFirstRing;
                    }
                    v1.radius = (rings.length + 0) * ringSpacing;
                }
                else if (v1.type == 'Cycle') {
                    const count = v1.nodes.length;
                    const k = params.CYCLE_NODE_SPACING;
                    v1.radius = (count * k) / (2 * Math.PI);
                }
                else if (v1.type == 'Parallel') {
                    // v1.radius = 300;
                    const n = v1.nodes.length;
                    if (n === 0) {
                        v1.radius = 0;
                    }
                    else {
                        // 1. 镜像原布局函数的行列核心逻辑
                        let finalCols = Math.ceil(Math.sqrt(n));
                        if (n < 3)
                            finalCols = n;
                        const rows = Math.ceil(n / finalCols);
                        // 2. 定义好你在布局里传入的间距（假设都用 60）
                        const colSpacing = 60;
                        const rowSpacing = 60;
                        // 3. 计算网格的长和宽（边缘中心距）
                        const totalWidth = (finalCols - 1) * colSpacing;
                        const totalHeight = (rows - 1) * rowSpacing;
                        // 4. 使用勾股定理计算中心到顶角的距离，并加上单个节点自身的安全留白（比如 20）
                        const nodeSelfRadius = 20;
                        v1.radius = Math.sqrt(Math.pow((totalWidth / 2), 2) + Math.pow((totalHeight / 2), 2)) + nodeSelfRadius;
                    }
                }
                else if (v1.type == 'Chain') {
                    const count = v1.nodes.length;
                    const miniMumRadius = params.CHAIN_MIN_RADIUS;
                    v1.radius = Math.max((count * params.CYCLE_NODE_SPACING) / (2 * Math.PI), miniMumRadius);
                }
                else {
                    v1.radius = 10;
                }
            });
        }
        this.captureStep('Virtual Nodes Positioned', 'Virtual node centers and radii calculated', null);
        console.log("1111");
        //******************** virtual node force layout ************************
        if (layout_algorithm === 'MY_ForceLayout') {
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
            // 调整退出阈值：当全图任何节点的最大移动量都小于 0.5 像素时，才认为真正静止
            const ENERGY_THRESHOLD = 0.5;
            // 提前提取构建邻接表，供“初始秩序建立”和“后期角度力”共同无缝复用
            const adj = new Map();
            this.vedges.forEach((e) => {
                if (!e.source || !e.target)
                    return;
                if (!adj.has(e.source.id))
                    adj.set(e.source.id, []);
                if (!adj.has(e.target.id))
                    adj.set(e.target.id, []);
                adj.get(e.source.id).push(e.target);
                adj.get(e.target.id).push(e.source);
            });
            this.vnodes.forEach((node) => {
                if (!node._permanentOrder) {
                    const allNeighbors = adj.get(node.id) || [];
                    // 过滤出叶子节点（度数小于等于2的末端挂载节点）
                    const leafNeighbors = allNeighbors.filter((nb) => {
                        const nbEdges = adj.get(nb.id) || [];
                        return nbEdges.length <= 2;
                    });
                    if (leafNeighbors.length >= 2) {
                        // 排序建立绝对干净的初始拓扑阵列
                        leafNeighbors.sort((a, b) => a.id.localeCompare(b.id));
                        node._permanentOrder = leafNeighbors.map((a) => a.id);
                        // 顺便给它们一个初始的、绝对不交叉的星型辐射状几何分布基础
                        leafNeighbors.forEach((nb, index) => {
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
                    this.vnodes.forEach((v) => {
                        v.nodes.forEach((n) => {
                            n.position().x = v.center_x + Math.random() * 5;
                            n.position().y = v.center_y + Math.random() * 5;
                        });
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
                    this.vedges.forEach((e) => {
                        const s = e.source;
                        const t = e.target;
                        if (!s || !t)
                            return;
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
                            }
                            else {
                                const gap = centerDist - minDistance;
                                force = REPULSION / (gap * gap + 20);
                            }
                            // 排斥力同样引入降温系数
                            force *= cooling;
                            const maxForceLimit = REPULSION * 2 * cooling;
                            if (force > maxForceLimit)
                                force = maxForceLimit;
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
                    const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a));
                    const ANGULAR_STRENGTH = params.ANGULAR_STRENGTH;
                    const MAX_FORCE = 2.0;
                    this.vnodes.forEach((node) => {
                        if (!node._permanentOrder ||
                            node._permanentOrder.length < 2) {
                            return;
                        }
                        const orderMap = new Map(node._permanentOrder.map((id, index) => [
                            id,
                            index
                        ]));
                        const leaves = this.vnodes.filter((v) => orderMap.has(v.id));
                        const count = leaves.length;
                        if (count < 2) {
                            return;
                        }
                        const idealGap = (Math.PI * 2) / count;
                        const items = leaves
                            .map((nb) => {
                            const dx = nb.center_x -
                                node.center_x;
                            const dy = nb.center_y -
                                node.center_y;
                            return {
                                nb,
                                dx,
                                dy,
                                dist: Math.sqrt(dx * dx +
                                    dy * dy) || 1,
                                angle: Math.atan2(dy, dx)
                            };
                        })
                            .sort((a, b) => a.angle -
                            b.angle);
                        for (let i = 0; i < count; i++) {
                            const left = items[i];
                            const right = items[(i + 1) %
                                count];
                            let gap = norm(right.angle -
                                left.angle);
                            if (gap < 0) {
                                gap +=
                                    Math.PI * 2;
                            }
                            // 已经够开
                            if (gap >=
                                idealGap) {
                                continue;
                            }
                            const gapError = idealGap -
                                gap;
                            let force = gapError *
                                ANGULAR_STRENGTH;
                            force =
                                Math.min(force, MAX_FORCE);
                            // left切线方向
                            const ltx = -left.dy /
                                left.dist;
                            const lty = left.dx /
                                left.dist;
                            // right切线方向
                            const rtx = -right.dy /
                                right.dist;
                            const rty = right.dx /
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
                            if (typeof maxAngularMove !==
                                "undefined") {
                                maxAngularMove =
                                    Math.max(maxAngularMove, force);
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
            this.vnodes.forEach((v) => {
                v.nodes.forEach((n) => {
                    n.position().x = v.center_x;
                    n.position().y = v.center_y;
                });
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
                this.captureStep('Anti-collision', 'Eliminate all collisions', { iterations: ITERATIONS });
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
                                numOfCollision++;
                            }
                        }
                    }
                }
            }
            this.captureStep('Virtual Node Layout', 'Force-directed layout applied to virtual nodes', { iterations: ITERATIONS });
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
            if (numNodes === 0)
                return;
            // 索引映射表：ID -> 数组下标，方便矩阵运算
            const nodeIndexMap = new Map();
            this.vnodes.forEach((v, i) => nodeIndexMap.set(v.id, i));
            // 邻接表提取供初始化复用
            const adj = new Map();
            this.vedges.forEach((e) => {
                if (!e.source || !e.target)
                    return;
                if (!adj.has(e.source.id))
                    adj.set(e.source.id, []);
                if (!adj.has(e.target.id))
                    adj.set(e.target.id, []);
                adj.get(e.source.id).push(e.target);
                adj.get(e.target.id).push(e.source);
            });
            // -------------------------------------------------------------
            // [预处理 1] 计算全图任意节点对之间的最短路径距离矩阵 (APSP - Floyd Warshall)
            // -------------------------------------------------------------
            const distMatrix = Array.from({ length: numNodes }, () => new Array(numNodes).fill(Infinity));
            const weightMatrix = Array.from({ length: numNodes }, () => new Array(numNodes).fill(0));
            for (let i = 0; i < numNodes; i++)
                distMatrix[i][i] = 0;
            // 根据真实边赋予理想距离基准
            this.vedges.forEach((e) => {
                if (!e.source || !e.target)
                    return;
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
            this.vnodes.forEach((node) => {
                if (!node._permanentOrder) {
                    const allNeighbors = adj.get(node.id) || [];
                    const leafNeighbors = allNeighbors.filter((nb) => {
                        const nbEdges = adj.get(nb.id) || [];
                        return nbEdges.length <= 2;
                    });
                    if (leafNeighbors.length >= 2) {
                        leafNeighbors.sort((a, b) => a.id.localeCompare(b.id));
                        node._permanentOrder = leafNeighbors.map((a) => a.id);
                        leafNeighbors.forEach((nb, index) => {
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
                        if (i === j)
                            continue;
                        const vj = this.vnodes[j];
                        const wij = weightMatrix[i][j];
                        if (wij === 0)
                            continue;
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
                    }
                    else {
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
            this.vnodes.forEach((v) => {
                v.nodes.forEach((n) => {
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
                this.captureStep('Anti-collision', 'Eliminate all collisions', { iterations: ITERATIONS });
            }
            this.captureStep('Virtual Node Layout', 'Stress Majorization layout applied to virtual nodes', { iterations: ITERATIONS });
        }
        /////////////////////////////////////////////////////////////////////////////
        if (1) {
            if (params.SPREAD_V_NODES) {
                this.vnodes.forEach((v) => {
                    v.nodes.forEach((n) => {
                        n.position().x = v.center_x + Math.random() * 5;
                        n.position().y = v.center_y + Math.random() * 5;
                    });
                });
                this.captureStep('Nodes Spread to VNode Centers', 'Real nodes spread to their virtual node centers', null);
            }
        }
        /////////////////////  删除之后变成只有虚拟节点 vnode 的layout ////////////////
        if (!params.SUBSTRUCTURE_LAYOUT) {
            const IDEAL_LENGTH = params.LEAF_NODE_DISTANCE;
            this.vnodes.forEach((v) => {
                if (v.type == 'Star') {
                    // if(targetNode){    // star是独立的star, 不是依附在某个Cycle里
                    if (1) {
                        const allMemberNode = v.nodes.filter((node) => node.data('structType') !== 'Star-Center');
                        const ringSpacing = params.STAR_RING_SPACING;
                        const baseNodesInFirstRing = params.STAR_BASE_NODES_PER_RING;
                        // 1. Pre-calculate how many nodes go into each ring
                        const rings = [];
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
                            const lastNode = rings.pop()[0];
                            rings[rings.length - 1].push(lastNode);
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
                }
                else if (v.type == 'Chain') {
                    // 1. 依然使用临时对象按 groupId 归类节点
                    const chainGroups = {};
                    v.nodes.forEach((node) => {
                        if (node.data('structType') == 'Chain') {
                            const groupId = node.data('groupId');
                            if (!chainGroups[groupId]) {
                                chainGroups[groupId] = [];
                            }
                            if (node.degree() === 1) { //把链子的叶节点放在第一位，用于标记哪个是链的叶节点
                                chainGroups[groupId].unshift(node); //将元素插入到数组的开头，并将原本的元素依次后移。
                            }
                            else {
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
                                // 1. 计算当前节点的算术平均中心
                                // ============================================================
                                let cx = 0;
                                let cy = 0;
                                gNodes.forEach((n) => {
                                    cx += n.position().x;
                                    cy += n.position().y;
                                });
                                cx /= count;
                                cy /= count;
                                // ============================================================
                                // 2. 特殊处理：只有 3 个节点
                                //
                                // 三个节点组成严格等边三角形
                                //
                                // 注意：
                                // 不使用 CHAIN_MIN_RADIUS
                                // 防止三角形被强行撑大
                                // ============================================================
                                if (count === 3) {
                                    // --------------------------------------------------------
                                    // 三角形边长
                                    //
                                    // CYCLE_NODE_SPACING 表示希望的节点间距
                                    // --------------------------------------------------------
                                    const sideLength = params.CYCLE_NODE_SPACING;
                                    // --------------------------------------------------------
                                    // 等边三角形外接圆半径
                                    //
                                    // side = sqrt(3) * radius
                                    //
                                    // 所以：
                                    //
                                    // radius = side / sqrt(3)
                                    // --------------------------------------------------------
                                    const radius = sideLength /
                                        Math.sqrt(3);
                                    // ========================================================
                                    // 3. 搜索最佳旋转角度
                                    //
                                    // 与普通 network 使用完全一样的策略
                                    //
                                    // 0°
                                    // 10°
                                    // 20°
                                    // ...
                                    // 350°
                                    //
                                    // 每次计算：
                                    //
                                    // totalEdgeLength(edges)
                                    //
                                    // 找最小值
                                    // ========================================================
                                    let minTotalLength = Number.POSITIVE_INFINITY;
                                    let bestRotate = 0;
                                    for (let rotate = 0; rotate < 360; rotate += 10) {
                                        // ----------------------------------------------------
                                        // 三个节点均匀分布在圆周
                                        //
                                        // 每两个节点之间：
                                        //
                                        // 120°
                                        //
                                        // 因此天然形成等边三角形
                                        // ----------------------------------------------------
                                        gNodes.forEach((n, i) => {
                                            const angle = i *
                                                2 *
                                                Math.PI /
                                                3
                                                +
                                                    rotate *
                                                        Math.PI /
                                                        180;
                                            n.position({
                                                x: cx +
                                                    Math.cos(angle) *
                                                        radius,
                                                y: cy +
                                                    Math.sin(angle) *
                                                        radius
                                            });
                                        });
                                        // ----------------------------------------------------
                                        // 计算当前旋转角度下的总边长
                                        // ----------------------------------------------------
                                        const totalLength = totalEdgeLength(edges);
                                        // ----------------------------------------------------
                                        // 保存最优旋转
                                        // ----------------------------------------------------
                                        if (totalLength <
                                            minTotalLength) {
                                            minTotalLength =
                                                totalLength;
                                            bestRotate =
                                                rotate;
                                        }
                                    }
                                    // ========================================================
                                    // 4. 使用最佳旋转角度重新设置位置
                                    // ========================================================
                                    gNodes.forEach((n, i) => {
                                        const angle = i *
                                            2 *
                                            Math.PI /
                                            3
                                            +
                                                bestRotate *
                                                    Math.PI /
                                                    180;
                                        n.position({
                                            x: cx +
                                                Math.cos(angle) *
                                                    radius,
                                            y: cy +
                                                Math.sin(angle) *
                                                    radius
                                        });
                                    });
                                    // ========================================================
                                    // 5. 输出调试信息
                                    // ========================================================
                                    console.log('======================================');
                                    console.log('Triangle layout');
                                    console.log('Node count:', count);
                                    console.log('Center:', `(${cx.toFixed(2)}, ${cy.toFixed(2)})`);
                                    console.log('Radius:', radius.toFixed(2));
                                    console.log('Side length:', sideLength.toFixed(2));
                                    console.log('Best rotate:', `${bestRotate}°`);
                                    console.log('Total edge length:', minTotalLength.toFixed(2));
                                    console.log('======================================');
                                    return;
                                }
                                // ============================================================
                                // 3. count > 3
                                //
                                // 保持原来的布局策略：
                                //
                                // gNodes[0]
                                //     ↓
                                // 中心节点
                                //
                                // gNodes[1...]
                                //     ↓
                                // 圆周节点
                                // ============================================================
                                // ============================================================
                                // 4. 根据节点数量计算标准半径
                                // ============================================================
                                const miniMumRadius = params.CHAIN_MIN_RADIUS;
                                const radius = Math.max((count *
                                    params.CYCLE_NODE_SPACING) /
                                    (2 * Math.PI), miniMumRadius);
                                // ============================================================
                                // 5. 排序 / 圆周节点
                                // ============================================================
                                const sorted = gNodes.slice(1);
                                // ============================================================
                                // 6. 搜索最佳旋转角度
                                // ============================================================
                                let minTotalLength = Number.POSITIVE_INFINITY;
                                let bestRotate = 0;
                                for (let rotate = 0; rotate < 360; rotate += 10) {
                                    // --------------------------------------------------------
                                    // 强行覆盖圆周节点坐标
                                    // --------------------------------------------------------
                                    sorted.forEach((n, i) => {
                                        const angle = (i /
                                            sorted.length) *
                                            2 *
                                            Math.PI
                                            +
                                                rotate *
                                                    Math.PI /
                                                    180;
                                        n.position({
                                            x: cx +
                                                Math.cos(angle) *
                                                    radius,
                                            y: cy +
                                                Math.sin(angle) *
                                                    radius
                                        });
                                    });
                                    // --------------------------------------------------------
                                    // 计算当前旋转下的总边长
                                    // --------------------------------------------------------
                                    const totalLength = totalEdgeLength(edges);
                                    // --------------------------------------------------------
                                    // 保存最佳旋转
                                    // --------------------------------------------------------
                                    if (totalLength <
                                        minTotalLength) {
                                        minTotalLength =
                                            totalLength;
                                        bestRotate =
                                            rotate;
                                    }
                                }
                                // ============================================================
                                // 7. 使用最佳旋转角度
                                // ============================================================
                                sorted.forEach((n, i) => {
                                    const angle = (i /
                                        sorted.length) *
                                        2 *
                                        Math.PI
                                        +
                                            bestRotate *
                                                Math.PI /
                                                180;
                                    n.position({
                                        x: cx +
                                            Math.cos(angle) *
                                                radius,
                                        y: cy +
                                            Math.sin(angle) *
                                                radius
                                    });
                                });
                                // ============================================================
                                // 8. 第一个节点放在中心
                                // ============================================================
                                gNodes[0].position({
                                    x: cx,
                                    y: cy
                                });
                            }
                        }
                    }
                }
                else if (v.type == 'Parallel') {
                    let endVec = [];
                    nodes.forEach((n, i) => {
                        if (n.data('parallelGroupIdVec').includes(v.id) && n.data('structType') != 'Parallel') {
                            //提取同一个group的端节点
                            endVec.push(n);
                        }
                    });
                    // console.log('endVec.length:'+endVec.length+' v.id:'+v.id);
                    if (endVec.length >= 2) { //应该>=2，否则就错误
                        //有node数组，将里面的所有node在两个点n1,n2中点垂线上均匀分布
                        const p1 = endVec[0].position();
                        const p2 = endVec[1].position();
                        const diff = { x: p2.x - p1.x, y: p2.y - p1.y };
                        layoutRectangular(v.nodes, { x: v.center_x, y: v.center_y }, diff);
                    }
                }
                if (v.type == 'Cycle') {
                    // 1. 检查 nodes 是否存在且不为空
                    if (v.nodes && v.nodes.length > 0) {
                        v.nodes.sort((a, b) => {
                            var _a, _b;
                            // 假设 innerId 是数字。如果是字符串，可以使用 localeCompare
                            const idA = (_a = a.data('innerId')) !== null && _a !== void 0 ? _a : 0;
                            const idB = (_b = b.data('innerId')) !== null && _b !== void 0 ? _b : 0;
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
                    let bestRotate = 0; //找出最好的旋转角度
                    //clock-wise
                    for (let rotate = 0; rotate < 360; rotate = rotate + 10) {
                        // 4. 强行覆盖坐标：这是形成“绝对圆”的物理保障
                        sorted.forEach((n, i) => {
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
                        sortedReverse.forEach((n, i) => {
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
                        sorted.forEach((n, i) => {
                            const angle = (i / count) * 2 * Math.PI + bestRotate;
                            n.position({
                                x: v.center_x + Math.cos(angle) * radius,
                                y: v.center_y + Math.sin(angle) * radius
                            });
                        });
                    }
                    else {
                        sortedReverse.forEach((n, i) => {
                            const angle = (i / count) * 2 * Math.PI + bestRotate;
                            n.position({
                                x: v.center_x + Math.cos(angle) * radius,
                                y: v.center_y + Math.sin(angle) * radius
                            });
                        });
                    }
                }
            });
            nodes.forEach((n, i) => {
                if (n.data('structType') == 'LeafButNotChain') {
                    let fatherPos = n.neighborhood().nodes().first().position();
                    let maxTotalLength = 10e10;
                    let bestRotate = 0; //找出最好的旋转角度
                    let aroundNodesVec = [];
                    nodes.forEach((nd, i) => {
                        if (((nd.position().x - fatherPos.x) * (nd.position().x - fatherPos.x) +
                            (nd.position().y - fatherPos.y) * (nd.position().y - fatherPos.y)) < 2 * IDEAL_LENGTH * IDEAL_LENGTH) {
                            aroundNodesVec.push(nd);
                            // console.log('aroundNodesVec:'+nd.id());
                        }
                    });
                    for (let rotate = 0; rotate <= 360; rotate = rotate + 10) {
                        n.position({
                            x: fatherPos.x + Math.cos(rotate * 3.14 / 180) * IDEAL_LENGTH,
                            y: fatherPos.y + Math.sin(rotate * 3.14 / 180) * IDEAL_LENGTH
                        });
                        let totalLength = 0;
                        aroundNodesVec.forEach((nd, i) => {
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
            });
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
        rotateNetworkToMinimumBoundingBox(nodes);
        // 获取这个 component 中所有不同的 parent ID
        //add parent node in cytoscape based on substructure
        // const parentIds = new Set<string>();
        // if(1){
        //
        //     nodes.forEach((node: any) => {
        //
        //         const parentId = index+"_"+node.data('groupId');
        //
        //         if (parentId) {
        //             parentIds.add(parentId);
        //             node.data('parent', parentId);
        //         }
        //
        //     });
        //
        //     // 创建所有 parent node
        //     parentIds.forEach((parentId: string) => {
        //         // 防止 parent 已经存在
        //         if (this.cy.getElementById(parentId).empty()) {
        //
        //             this.cy.add({
        //                 group: 'nodes',
        //                 data: {
        //                     id: parentId,
        //                     label: parentId
        //                 }
        //             });
        //
        //         }
        //     });
        //
        //
        // }
        if (1) {
            let maxDis = 0;
            let maxS = 0;
            let maxT = 0;
            let minDist = 10e10;
            let minS = 0;
            let minT = 0;
            let avgDis = 0;
            edges.forEach((e) => {
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
            });
            console.log("maxDis:", maxDis, " ", maxS, "->", maxT);
            console.log("minDist:", minDist, " ", minS, "->", minT);
            console.log("avgDis:", avgDis / edges.length);
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
            // 当前 network 中所有 parent ID
            const parentIds = new Set();
            nodes.forEach((node) => {
                const groupId = node.data('groupId');
                if (groupId) {
                    parentIds.add(index + "_" + groupId);
                }
            });
            // ========================================
            // 创建 parent
            // ========================================
            parentIds.forEach((parentId) => {
                // parent 已经存在
                if (!this.cy.getElementById(parentId).empty()) {
                    return;
                }
                // 找到 children
                const children = nodes.filter((node) => {
                    return (index + "_" + node.data('groupId')) === parentId;
                });
                if (children.length === 0) {
                    return;
                }
                // ========================================
                // ① 保存 children 原始位置
                // ========================================
                const originalPositions = new Map();
                children.forEach((node) => {
                    const pos = node.position();
                    originalPositions.set(node.id(), {
                        x: pos.x,
                        y: pos.y
                    });
                });
                // ========================================
                // ② 根据原始位置计算 bounding box
                // ========================================
                const bb = children.boundingBox();
                const centerX = (bb.x1 + bb.x2) / 2;
                const centerY = (bb.y1 + bb.y2) / 2;
                // ========================================
                // ③ 创建 parent
                // ========================================
                const parent = this.cy.add({
                    group: 'nodes',
                    data: {
                        id: parentId,
                        label: parentId
                    },
                    position: {
                        x: centerX,
                        y: centerY
                    },
                    classes: 'network-parent'
                }).first();
                // ========================================
                // ④ 建立 compound relationship
                // ========================================
                children.forEach((node) => {
                    node.move({
                        parent: parentId
                    });
                });
                // ========================================
                // ⑤ 恢复 children 原来的绝对位置
                // ========================================
                children.forEach((node) => {
                    const original = originalPositions.get(node.id());
                    if (!original) {
                        return;
                    }
                    node.position({
                        x: original.x,
                        y: original.y
                    });
                });
                // ========================================
                // ⑥ 恢复 parent 中心位置
                // ========================================
                parent.position({
                    x: centerX,
                    y: centerY
                });
                // ========================================
                // ⑦ 检查
                // ========================================
                console.log('Parent:', parent.id(), 'isParent:', parent.isParent(), 'children:', parent.children().length, parent.children().map((node) => node.id()));
            });
        });
    }
    this.captureStep('Final', 'Final layout complete', null);
    this.cy.fit(null, 50);
    this.cy.emit('layoutstop');
    // Expose steps for external access
    if (this.params.STEP_BY_STEP && this.steps.length > 0) {
        console.log(`Step-by-step mode: Captured ${this.steps.length} steps`);
        console.log('Access steps via layout.steps or use layout.goToStep(n)');
    }
    return this;
};
/**
 * 获取面积最小的bounding box 并且按照该bounding box将network旋转到轴平行的矩形框中，x轴大于y轴
 * @param nodes
 */
function rotateNetworkToMinimumBoundingBox(nodes) {
    if (!nodes ||
        nodes.length === 0) {
        return null;
    }
    // ============================================================
    // 1. 获取 network 中所有 node 的四个角点
    //
    // 注意：
    //
    // 这里考虑 node 自身的 width / height
    // 而不仅仅是 node.position()
    // ============================================================
    const points = [];
    nodes.forEach((node) => {
        const pos = node.position();
        const width = node.outerWidth();
        const height = node.outerHeight();
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        points.push({
            x: pos.x -
                halfWidth,
            y: pos.y -
                halfHeight
        });
        points.push({
            x: pos.x +
                halfWidth,
            y: pos.y -
                halfHeight
        });
        points.push({
            x: pos.x +
                halfWidth,
            y: pos.y +
                halfHeight
        });
        points.push({
            x: pos.x -
                halfWidth,
            y: pos.y +
                halfHeight
        });
    });
    // ============================================================
    // 2. Convex Hull
    // ============================================================
    const sortedPoints = [...points].sort((a, b) => {
        if (a.x !== b.x) {
            return (a.x -
                b.x);
        }
        return (a.y -
            b.y);
    });
    const cross = (o, a, b) => {
        return ((a.x - o.x) *
            (b.y - o.y)
            -
                (a.y - o.y) *
                    (b.x - o.x));
    };
    const lower = [];
    for (const p of sortedPoints) {
        while (lower.length >= 2 &&
            cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
            lower.pop();
        }
        lower.push(p);
    }
    const upper = [];
    for (let i = sortedPoints.length - 1; i >= 0; i--) {
        const p = sortedPoints[i];
        while (upper.length >= 2 &&
            cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
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
    // 3. 搜索 Minimum Area Bounding Rectangle
    // ============================================================
    let bestArea = Number.POSITIVE_INFINITY;
    let bestWidth = 0;
    let bestHeight = 0;
    let bestAngle = 0;
    let bestCenterX = 0;
    let bestCenterY = 0;
    for (let i = 0; i < hull.length; i++) {
        const p1 = hull[i];
        const p2 = hull[(i + 1) %
            hull.length];
        // --------------------------------------------------------
        // 当前凸包边的角度
        // --------------------------------------------------------
        const edgeAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        // --------------------------------------------------------
        // 将当前边旋转到 X 轴
        // --------------------------------------------------------
        const cos = Math.cos(-edgeAngle);
        const sin = Math.sin(-edgeAngle);
        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        // --------------------------------------------------------
        // 旋转所有 hull 点
        // --------------------------------------------------------
        hull.forEach((p) => {
            const x = p.x * cos -
                p.y * sin;
            const y = p.x * sin +
                p.y * cos;
            minX =
                Math.min(minX, x);
            maxX =
                Math.max(maxX, x);
            minY =
                Math.min(minY, y);
            maxY =
                Math.max(maxY, y);
        });
        const width = maxX -
            minX;
        const height = maxY -
            minY;
        const area = width *
            height;
        // --------------------------------------------------------
        // 找面积最小的矩形
        // --------------------------------------------------------
        if (area <
            bestArea) {
            bestArea =
                area;
            bestWidth =
                width;
            bestHeight =
                height;
            bestAngle =
                edgeAngle;
            // ----------------------------------------------------
            // 旋转坐标系中的中心
            // ----------------------------------------------------
            const centerXRot = (minX +
                maxX) / 2;
            const centerYRot = (minY +
                maxY) / 2;
            // ----------------------------------------------------
            // 转回原坐标
            // ----------------------------------------------------
            bestCenterX =
                centerXRot *
                    Math.cos(edgeAngle)
                    -
                        centerYRot *
                            Math.sin(edgeAngle);
            bestCenterY =
                centerXRot *
                    Math.sin(edgeAngle)
                    +
                        centerYRot *
                            Math.cos(edgeAngle);
        }
    }
    // ============================================================
    // 4. 保证：
    //
    // width >= height
    //
    // 即：
    //
    // 长边沿 X 轴
    // 短边沿 Y 轴
    // ============================================================
    if (bestHeight >
        bestWidth) {
        const temp = bestWidth;
        bestWidth =
            bestHeight;
        bestHeight =
            temp;
        // --------------------------------------------------------
        // 旋转 90°
        // --------------------------------------------------------
        bestAngle +=
            Math.PI / 2;
    }
    // ============================================================
    // 5. Normalize angle
    //
    // [-PI, PI]
    // ============================================================
    while (bestAngle >
        Math.PI) {
        bestAngle -=
            2 * Math.PI;
    }
    while (bestAngle <
        -Math.PI) {
        bestAngle +=
            2 * Math.PI;
    }
    // ============================================================
    // 6. 真正旋转 network
    //
    // 以 bounding box center 为旋转中心
    // ============================================================
    const cos = Math.cos(-bestAngle);
    const sin = Math.sin(-bestAngle);
    nodes.forEach((node) => {
        const pos = node.position();
        // ----------------------------------------------------
        // 相对于 network center
        // ----------------------------------------------------
        const dx = pos.x -
            bestCenterX;
        const dy = pos.y -
            bestCenterY;
        // ----------------------------------------------------
        // 旋转
        //
        // -bestAngle
        // ----------------------------------------------------
        const newX = bestCenterX +
            dx * cos -
            dy * sin;
        const newY = bestCenterY +
            dx * sin +
            dy * cos;
        node.position({
            x: newX,
            y: newY
        });
    });
    // ============================================================
    // 7. 旋转以后重新计算 Bounding Box
    //
    // 此时应该已经是 X/Y 轴平行
    // ============================================================
    const finalBB = nodes.boundingBox();
    // ============================================================
    // 8. 输出信息
    // ============================================================
    console.log('======================================');
    console.log('Network minimum bounding box');
    console.log('Original minimum area:', bestArea.toFixed(2));
    console.log('Rotation:', (bestAngle *
        180 /
        Math.PI).toFixed(2), 'degrees');
    console.log('Minimum rectangle:', `${bestWidth.toFixed(2)} × ${bestHeight.toFixed(2)}`);
    console.log('Final Cytoscape BB:', `${finalBB.w.toFixed(2)} × ${finalBB.h.toFixed(2)}`);
    console.log('Final aspect:', (finalBB.w /
        finalBB.h).toFixed(3));
    console.log('======================================');
    // ============================================================
    // 9. 返回结果
    // ============================================================
    return {
        width: finalBB.w,
        height: finalBB.h,
        area: finalBB.w *
            finalBB.h,
        angle: bestAngle,
        centerX: bestCenterX,
        centerY: bestCenterY
    };
}
// If there are multiple networks, organize them into multiple rows.
// Networks with similar sizes are preferentially placed in the same row.
ForceLayout.prototype.packNetworks = function (networks) {
    var _a, _b;
    if (!networks || networks.length === 0) {
        return;
    }
    // ============================================================
    // 1. Canvas
    // ============================================================
    const container = this.cy.container();
    const canvasWidth = (_a = container === null || container === void 0 ? void 0 : container.clientWidth) !== null && _a !== void 0 ? _a : 1200;
    const canvasHeight = (_b = container === null || container === void 0 ? void 0 : container.clientHeight) !== null && _b !== void 0 ? _b : 800;
    const canvasAspect = canvasWidth /
        canvasHeight;
    console.log('Canvas:', canvasWidth, canvasHeight);
    console.log('Canvas aspect:', canvasAspect.toFixed(3));
    // ============================================================
    // 2. Parameters
    // ============================================================
    const H_GAP = 60;
    const V_GAP = 80;
    const SEARCH_STEPS = 300;
    // ------------------------------------------------------------
    // Weight
    //
    // aspect:
    //     整体布局比例
    //
    // similarity:
    //     同一行 network 尺寸相似程度
    //
    // balance:
    //     避免某一行特别拥挤
    // ------------------------------------------------------------
    const ASPECT_WEIGHT = 0.60;
    const SIZE_SIMILARITY_WEIGHT = 0.30;
    const ROW_BALANCE_WEIGHT = 0.10;
    // ============================================================
    // 3. Get real bounding boxes
    // ============================================================
    networks.forEach((network) => {
        const bb = network.nodes.boundingBox();
        network.x1 = bb.x1;
        network.y1 = bb.y1;
        network.x2 = bb.x2;
        network.y2 = bb.y2;
        network.width = bb.w;
        network.height = bb.h;
        network.centerX =
            (bb.x1 + bb.x2) / 2;
        network.centerY =
            (bb.y1 + bb.y2) / 2;
        // ----------------------------------------------------
        // 一个综合尺寸指标
        //
        // 使用 sqrt(area)，比单纯 width 更合理
        // ----------------------------------------------------
        network.area =
            Math.max(network.width *
                network.height, 1);
        network.size =
            Math.sqrt(network.area);
        // ----------------------------------------------------
        // aspect
        // ----------------------------------------------------
        network.aspect =
            network.width /
                Math.max(network.height, 1);
    });
    // ============================================================
    // 4. Sort
    //
    // 大 → 小
    //
    // size 是主要依据
    // nodeCount 作为辅助
    // ============================================================
    const sortedNetworks = [...networks].sort((a, b) => {
        if (a.nodeCount !==
            b.nodeCount) {
            return (b.nodeCount -
                a.nodeCount);
        }
        return (b.size -
            a.size);
    });
    console.log('Sorted networks:', sortedNetworks.map((n) => `${n.nodeCount} (${Math.round(n.width)}×${Math.round(n.height)})`));
    // ============================================================
    // 5. Size normalization
    //
    // 用 log(size) 计算尺寸差异
    //
    // 这样：
    //
    // 100 → 200
    //
    // 和
    //
    // 500 → 1000
    //
    // 都被认为是相同的 2 倍差异。
    // ============================================================
    const allSizes = sortedNetworks.map((n) => Math.log(Math.max(n.size, 1)));
    const minLogSize = Math.min(...allSizes);
    const maxLogSize = Math.max(...allSizes);
    const sizeRange = Math.max(maxLogSize -
        minLogSize, 0.0001);
    sortedNetworks.forEach((network) => {
        network.normalizedSize =
            (Math.log(Math.max(network.size, 1)) -
                minLogSize) /
                sizeRange;
    });
    // ============================================================
    // 6. Width range
    // ============================================================
    const maxNetworkWidth = Math.max(...sortedNetworks.map((n) => n.width));
    const totalNetworkWidth = sortedNetworks.reduce((sum, n) => {
        return (sum +
            n.width);
    }, 0);
    const minWidth = maxNetworkWidth;
    const maxWidth = totalNetworkWidth +
        H_GAP *
            Math.max(sortedNetworks.length - 1, 0);
    console.log('Search width:', minWidth, '→', maxWidth);
    // ============================================================
    // 7. Make rows
    //
    // 与原来的区别：
    //
    // 不只是 widthLimit。
    //
    // 每次准备加入一个 network 时，
    // 会检查：
    //
    //     1. width 是否放得下
    //     2. size 是否与当前 row 接近
    //
    // 但是这里仍然保持大 → 小的稳定顺序。
    // ============================================================
    const makeRows = (widthLimit) => {
        const rows = [];
        let currentRow = [];
        let currentWidth = 0;
        sortedNetworks.forEach((network) => {
            const networkWidth = network.width;
            // =================================================
            // First network
            // =================================================
            if (currentRow.length === 0) {
                currentRow.push(network);
                currentWidth =
                    networkWidth;
                return;
            }
            // =================================================
            // Width check
            // =================================================
            const requiredWidth = currentWidth +
                H_GAP +
                networkWidth;
            if (requiredWidth >
                widthLimit) {
                rows.push(currentRow);
                currentRow = [
                    network
                ];
                currentWidth =
                    networkWidth;
                return;
            }
            // =================================================
            // Size similarity check
            // =================================================
            const currentMeanSize = currentRow.reduce((sum, n) => sum +
                n.normalizedSize, 0) /
                currentRow.length;
            const sizeDifference = Math.abs(network.normalizedSize -
                currentMeanSize);
            // -------------------------------------------------
            // 不要让尺寸差距太大的 network 自动进入同一行
            //
            // 但是不能太严格，否则会产生大量行。
            // -------------------------------------------------
            const SIZE_THRESHOLD = 0.35;
            if (sizeDifference >
                SIZE_THRESHOLD &&
                currentRow.length >= 2) {
                rows.push(currentRow);
                currentRow = [
                    network
                ];
                currentWidth =
                    networkWidth;
                return;
            }
            // =================================================
            // Add
            // =================================================
            currentRow.push(network);
            currentWidth =
                requiredWidth;
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
    const calculateLayoutSize = (rows) => {
        let totalWidth = 0;
        let totalHeight = 0;
        rows.forEach((row, rowIndex) => {
            let rowWidth = 0;
            let rowHeight = 0;
            row.forEach((network, index) => {
                rowWidth +=
                    network.width;
                if (index <
                    row.length - 1) {
                    rowWidth +=
                        H_GAP;
                }
                rowHeight =
                    Math.max(rowHeight, network.height);
            });
            totalWidth =
                Math.max(totalWidth, rowWidth);
            totalHeight +=
                rowHeight;
            if (rowIndex <
                rows.length - 1) {
                totalHeight +=
                    V_GAP;
            }
        });
        return {
            width: totalWidth,
            height: totalHeight
        };
    };
    // ============================================================
    // 9. Calculate row size similarity score
    //
    // 0 = 非常好
    // 1 = 非常差
    //
    // 使用 row 内最大/最小尺寸比例。
    //
    // 例如：
    //
    // 100, 110, 120
    //
    // → 很好
    //
    // 100, 500, 1000
    //
    // → 很差
    // ============================================================
    const calculateSizeSimilarity = (rows) => {
        if (rows.length === 0) {
            return 1;
        }
        let totalPenalty = 0;
        let totalWeight = 0;
        rows.forEach((row) => {
            if (row.length <= 1) {
                return;
            }
            const sizes = row.map((n) => Math.log(Math.max(n.size, 1)));
            const min = Math.min(...sizes);
            const max = Math.max(...sizes);
            const difference = max - min;
            // ------------------------------------------------
            // row 越大，惩罚越大
            // ------------------------------------------------
            const weight = row.length;
            totalPenalty +=
                difference *
                    weight;
            totalWeight +=
                weight;
        });
        if (totalWeight === 0) {
            return 0;
        }
        return (totalPenalty /
            totalWeight /
            Math.max(sizeRange, 0.0001));
    };
    // ============================================================
    // 10. Row balance score
    //
    // 避免：
    //
    // Row 1: 6 networks
    // Row 2: 1 network
    //
    // 这种极端情况。
    // ============================================================
    const calculateRowBalance = (rows) => {
        if (rows.length <= 1) {
            return 0;
        }
        const counts = rows.map((row) => row.length);
        const mean = counts.reduce((a, b) => a + b, 0) /
            counts.length;
        if (mean <= 0) {
            return 0;
        }
        const variance = counts.reduce((sum, count) => {
            return (sum +
                Math.pow(count - mean, 2));
        }, 0) /
            counts.length;
        return (Math.sqrt(variance) /
            mean);
    };
    // ============================================================
    // 11. Search best layout
    // ============================================================
    let bestRows = [];
    let bestScore = Number.POSITIVE_INFINITY;
    let bestWidth = 0;
    let bestHeight = 0;
    let bestAspect = 0;
    let bestSimilarity = 0;
    for (let i = 0; i < SEARCH_STEPS; i++) {
        const testWidth = minWidth +
            (maxWidth -
                minWidth) *
                i /
                Math.max(SEARCH_STEPS - 1, 1);
        // ========================================================
        // Make rows
        // ========================================================
        const rows = makeRows(testWidth);
        if (!rows ||
            rows.length === 0) {
            continue;
        }
        // ========================================================
        // Layout size
        // ========================================================
        const layoutSize = calculateLayoutSize(rows);
        const layoutWidth = layoutSize.width;
        const layoutHeight = layoutSize.height;
        if (layoutWidth <= 0 ||
            layoutHeight <= 0) {
            continue;
        }
        // ========================================================
        // Layout aspect
        // ========================================================
        const layoutAspect = layoutWidth /
            layoutHeight;
        // ========================================================
        // Aspect error
        // ========================================================
        const aspectError = Math.abs(Math.log(layoutAspect /
            canvasAspect));
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
        // 非常轻微的惩罚
        // ========================================================
        const rowPenalty = rows.length /
            Math.max(sortedNetworks.length, 1);
        // ========================================================
        // Final score
        //
        // 重点：
        //
        // aspect 仍然是第一目标
        //
        // 但 size similarity 明显参与优化。
        // ========================================================
        const score = aspectError *
            ASPECT_WEIGHT *
            100
            +
                similarityError *
                    SIZE_SIMILARITY_WEIGHT *
                    10
            +
                rowBalanceError *
                    ROW_BALANCE_WEIGHT
            +
                rowPenalty *
                    0.01;
        // ========================================================
        // Save best
        // ========================================================
        if (score <
            bestScore) {
            bestScore =
                score;
            bestRows =
                rows;
            bestWidth =
                layoutWidth;
            bestHeight =
                layoutHeight;
            bestAspect =
                layoutAspect;
            bestSimilarity =
                similarityError;
        }
    }
    // ============================================================
    // 12. Fallback
    // ============================================================
    if (bestRows.length === 0) {
        bestRows =
            makeRows(minWidth);
        const fallbackSize = calculateLayoutSize(bestRows);
        bestWidth =
            fallbackSize.width;
        bestHeight =
            fallbackSize.height;
        bestAspect =
            bestWidth /
                Math.max(bestHeight, 1);
        bestSimilarity =
            calculateSizeSimilarity(bestRows);
    }
    // ============================================================
    // 13. Final order
    //
    // 搜索：
    //
    //     大 → 小
    //
    // 显示：
    //
    //     小 → 大
    // ============================================================
    const finalRows = bestRows.map((row) => {
        return [
            ...row
        ].reverse();
    });
    // ============================================================
    // 14. Output result
    // ============================================================
    console.log('======================================');
    console.log('Canvas:', `${canvasWidth} × ${canvasHeight}`);
    console.log('Canvas aspect:', canvasAspect.toFixed(3));
    console.log('Best layout:', `${bestWidth} × ${bestHeight}`);
    console.log('Best layout aspect:', bestAspect.toFixed(3));
    console.log('Aspect difference:', Math.abs(bestAspect -
        canvasAspect).toFixed(3));
    console.log('Size similarity error:', bestSimilarity.toFixed(3));
    console.log('Rows:', finalRows.length);
    // ============================================================
    // 15. Output rows
    // ============================================================
    finalRows.forEach((row, rowIndex) => {
        console.log(`Row ${rowIndex + 1}:`, row.map((n) => `${n.nodeCount} nodes (${Math.round(n.width)}×${Math.round(n.height)})`));
    });
    // ============================================================
    // 16. Calculate row infos
    // ============================================================
    const rowInfos = [];
    finalRows.forEach((row) => {
        let rowWidth = 0;
        let rowHeight = 0;
        row.forEach((network, index) => {
            rowWidth +=
                network.width;
            if (index <
                row.length - 1) {
                rowWidth +=
                    H_GAP;
            }
            rowHeight =
                Math.max(rowHeight, network.height);
        });
        rowInfos.push({
            row,
            width: rowWidth,
            height: rowHeight
        });
    });
    // ============================================================
    // 17. Final layout size
    // ============================================================
    let totalLayoutWidth = 0;
    let totalLayoutHeight = 0;
    rowInfos.forEach((info, index) => {
        totalLayoutWidth =
            Math.max(totalLayoutWidth, info.width);
        totalLayoutHeight +=
            info.height;
        if (index <
            rowInfos.length - 1) {
            totalLayoutHeight +=
                V_GAP;
        }
    });
    const finalAspect = totalLayoutWidth /
        Math.max(totalLayoutHeight, 1);
    // ============================================================
    // 18. Final log
    // ============================================================
    console.log('======================================');
    console.log('Final layout size:', totalLayoutWidth, '×', totalLayoutHeight);
    console.log('Canvas size:', canvasWidth, '×', canvasHeight);
    console.log('Canvas aspect:', canvasAspect.toFixed(3));
    console.log('Layout aspect:', finalAspect.toFixed(3));
    console.log('Aspect difference:', Math.abs(finalAspect -
        canvasAspect).toFixed(3));
    // ============================================================
    // 19. Center layout
    // ============================================================
    const layoutStartX = (canvasWidth -
        totalLayoutWidth) / 2;
    const layoutStartY = (canvasHeight -
        totalLayoutHeight) / 2;
    // ============================================================
    // 20. Pack networks
    // ============================================================
    let currentY = layoutStartY;
    rowInfos.forEach((info) => {
        const row = info.row;
        let currentX = layoutStartX;
        row.forEach((network) => {
            // =================================================
            // Current bounding box
            // =================================================
            const bb = network.nodes.boundingBox();
            // =================================================
            // Move X
            // =================================================
            const dx = currentX -
                bb.x1;
            // =================================================
            // Move Y
            // =================================================
            const networkCenterY = (bb.y1 +
                bb.y2) / 2;
            const rowCenterY = currentY +
                info.height / 2;
            const dy = rowCenterY -
                networkCenterY;
            // =================================================
            // Move nodes
            // =================================================
            network.nodes.forEach((node) => {
                const pos = node.position();
                node.position({
                    x: pos.x +
                        dx,
                    y: pos.y +
                        dy
                });
            });
            // =================================================
            // Next network
            // =================================================
            currentX +=
                network.width +
                    H_GAP;
        });
        // ========================================================
        // Next row
        // ========================================================
        currentY +=
            info.height +
                V_GAP;
    });
    // ============================================================
    // 21. Final verification
    // ============================================================
    console.log('======================================');
    console.log('Final packed layout:', `${totalLayoutWidth} × ${totalLayoutHeight}`);
    console.log('Canvas:', `${canvasWidth} × ${canvasHeight}`);
    console.log('Canvas aspect:', canvasAspect.toFixed(3));
    console.log('Layout aspect:', finalAspect.toFixed(3));
    console.log('Aspect difference:', Math.abs(finalAspect -
        canvasAspect).toFixed(3));
    // ============================================================
    // 22. Final network positions
    // ============================================================
    finalRows.forEach((row, rowIndex) => {
        row.forEach((network) => {
            const bb = network.nodes.boundingBox();
            console.log(`Row ${rowIndex + 1}`, `nodes=${network.nodeCount}`, `x=${bb.x1.toFixed(1)}`, `y=${bb.y1.toFixed(1)}`, `w=${bb.w.toFixed(1)}`, `h=${bb.h.toFixed(1)}`);
        });
    });
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
ForceLayout.prototype.goToStep = function (stepIndex) {
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
    nodes.forEach((node) => {
        const pos = step.nodePositions[node.id()];
        if (pos) {
            node.position({ x: pos.x, y: pos.y });
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
    }
    else {
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
    }
    else {
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
    this.steps.forEach((step, index) => {
        const current = index === this.currentStepIndex ? ' ← CURRENT' : '';
        console.log(`  [${index}] ${step.stepName}: ${step.description}${current}`);
    });
    return this.steps.map((s) => ({
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
ForceLayout.prototype.visualizeVirtualNodes = function (step) {
    var _a;
    // Remove previous virtual node visualizations
    this.cy.$('.virtual-node, .virtual-edge').remove();
    if (!step.virtualNodes || step.virtualNodes.length === 0) {
        return;
    }
    const virtualElements = [];
    // Add virtual nodes as semi-transparent overlay nodes
    step.virtualNodes.forEach((vnode) => {
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
        step.virtualEdges.forEach((vedge, idx) => {
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
        console.log(`Visualized ${step.virtualNodes.length} virtual nodes and ${((_a = step.virtualEdges) === null || _a === void 0 ? void 0 : _a.length) || 0} virtual edges`);
    }
};
/**
 * Get color for virtual node based on type
 */
ForceLayout.prototype.getVirtualNodeColor = function (type) {
    const colorMap = {
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
export default function register(cytoscape) {
    if (!cytoscape)
        return;
    cytoscape('layout', 'ForceLayout', ForceLayout);
}

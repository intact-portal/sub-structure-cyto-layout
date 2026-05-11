class VNode {
}
class VEdge {
    // 构造函数
    constructor(source, target) {
        this.source = source;
        this.target = target;
    }
}
/**
 * 判断线段 AB 和线段 CD 是否相交
 */
function areEdgesIntersecting(A, B, C, D) {
    // 快速排斥试验：如果两个线段的包围盒都不重叠，肯定不相交
    if (Math.max(A.x, B.x) < Math.min(C.x, D.x) ||
        Math.max(C.x, D.x) < Math.min(A.x, B.x) ||
        Math.max(A.y, B.y) < Math.min(C.y, D.y) ||
        Math.max(C.y, D.y) < Math.min(A.y, B.y)) {
        return false;
    }
    // 跨立试验：使用叉积判断
    function crossProduct(p1, p2, p3) {
        return (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
    }
    const cp1 = crossProduct(A, B, C);
    const cp2 = crossProduct(A, B, D);
    const cp3 = crossProduct(C, D, A);
    const cp4 = crossProduct(C, D, B);
    // 如果满足跨立条件，则相交
    return (cp1 * cp2 < 0) && (cp3 * cp4 < 0);
}
/**
 * 找出所有交叉的边
 */
function findIntersectingEdges(nodes, edges) {
    const intersections = [];
    // 辅助函数：通过 id 获取坐标
    const getPos = (id) => {
        const n = nodes.find(node => node.id === id);
        return { x: (n === null || n === void 0 ? void 0 : n.center_x) || 0, y: (n === null || n === void 0 ? void 0 : n.center_y) || 0 };
    };
    for (let i = 0; i < edges.length; i++) {
        for (let j = i + 1; j < edges.length; j++) {
            const e1 = edges[i];
            const e2 = edges[j];
            // 排除共有顶点的边（共有顶点的边在端点处相交，不属于布局重叠）
            if (e1.source === e2.source || e1.source === e2.target ||
                e1.target === e2.source || e1.target === e2.target) {
                continue;
            }
            const A = getPos(e1.source);
            const B = getPos(e1.target);
            const C = getPos(e2.source);
            const D = getPos(e2.target);
            if (areEdgesIntersecting(A, B, C, D)) {
                intersections.push({ edge1: e1, edge2: e2 });
            }
        }
    }
    return intersections;
}
/**
 * 自动解开所有交叉边
 * 逻辑：遍历交叉边，尝试旋转端点，直到全局清零或达到尝试上限
 */
function untangleAllEdges(nodes, edges) {
    let intersections = findIntersectingEdges(nodes, edges);
    let maxGlobalAttempts = 50; // 防止陷入死循环
    let attemptCount = 0;
    while (intersections.length > 0 && attemptCount < maxGlobalAttempts) {
        // 取出第一对交叉的边
        const { edge1, edge2 } = intersections[0];
        // 决策：我们尝试旋转 edge1 的 target 节点，以 source 为中心
        // 你也可以根据 degree (连接数) 动态选择更合适的端点
        const success = tryIncrementalRotation(edge1.target, edge1.source, nodes, edges);
        if (!success) {
            // 如果 edge1 没转成，换个方向，尝试旋转 edge2 的端点
            tryIncrementalRotation(edge2.target, edge2.source, nodes, edges);
        }
        // 重新扫描当前的交叉情况
        intersections = findIntersectingEdges(nodes, edges);
        attemptCount++;
    }
    if (intersections.length === 0) {
        console.log("所有交叉已成功解开！");
    }
    else {
        console.warn("达到最大尝试次数，仍存在交叉。");
    }
}
/**
 * 尝试通过增量旋转某个节点来消除交叉
 */
function tryIncrementalRotation(targetId, centerId, nodes, edges) {
    const targetNode = nodes.find(n => n.id === targetId);
    const centerNode = nodes.find(n => n.id === centerId);
    // 记录初始状态
    const originalPos = { x: targetNode.center_x, y: targetNode.center_y };
    const dx = originalPos.x - centerNode.center_x;
    const dy = originalPos.y - centerNode.center_y;
    const radius = Math.sqrt(dx * dx + dy * dy);
    const startAngle = Math.atan2(dy, dx);
    // 步长 10 度 (弧度)
    const step = 10 * (Math.PI / 180);
    // 尝试 10°, -10°, 20°, -20° ... 直到 180°
    for (let i = 1; i <= 18; i++) {
        for (let direction of [1, -1]) {
            const angleOffset = step * i * direction;
            const newAngle = startAngle + angleOffset;
            // 应用新位置
            targetNode.center_x = centerNode.center_x + Math.cos(newAngle) * radius;
            targetNode.center_y = centerNode.center_y + Math.sin(newAngle) * radius;
            // 检查：这种旋转是否减少了总交叉数，且不产生新的交叉？
            // 这里我们要求严一点：旋转后，全局交叉必须比之前少，且当前这对边不再交叉
            const newIntersections = findIntersectingEdges(nodes, edges);
            // 如果当前这种摆放方式更优，则保留
            if (newIntersections.length < findIntersectingEdges(nodes, edges).length + 1) {
                // 实际上这里最理想的判断是：
                // 1. 原本那两个边不交叉了
                // 2. 没有引入新的交叉
                if (!checkSpecificEdgeIntersection(targetId, nodes, edges)) {
                    return true;
                }
            }
        }
    }
    // 失败则回滚
    targetNode.center_x = originalPos.x;
    targetNode.center_y = originalPos.y;
    return false;
}
/**
 * 辅助功能：仅检查某特定节点相关的边是否还存在交叉
 */
function checkSpecificEdgeIntersection(nodeId, nodes, edges) {
    // 找出所有与该节点相关的边
    const relevantEdges = edges.filter(e => e.source === nodeId || e.target === nodeId);
    // 这里简化处理：依然检查全局，确保安全
    return findIntersectingEdges(nodes, edges).length > 0;
}
/////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * 结构增强版力导向布局
 */
function ForceLayout(options) {
    this.options = options;
    this.cy = options.cy;
    this.eles = options.eles;
}
//判断两个node数组是否相同，不用考虑顺序
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
 * @param nodes Cytoscape 节点数组
 * @param center 矩形中心坐标
 * @param dirVector 长边（行进）方向向量
 * @param rowSpacing 行与行之间的距离
 * @param colSpacing 同一行内点与点的距离
 * @param cols 每行固定的点数（不传则自动计算为接近正方形的比例）
 */
function layoutRectangular(nodes, center, dirVector, rowSpacing = 60, colSpacing = 80, cols) {
    const n = nodes.length;
    if (n === 0)
        return;
    // 1. 计算行列结构
    const finalCols = cols || Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / finalCols);
    // 2. 向量单位化：主轴 u1 (行进方向), 切轴 u2 (并排方向)
    const mag = Math.sqrt(Math.pow(dirVector.x, 2) + Math.pow(dirVector.y, 2));
    const u1 = { x: dirVector.x / mag, y: dirVector.y / mag };
    const u2 = { x: -u1.y, y: u1.x }; // 垂直于 u1
    // 3. 计算整体占用空间以实现中心对齐
    const totalHeight = (rows - 1) * rowSpacing;
    nodes.forEach((node, i) => {
        const r = Math.floor(i / finalCols); // 当前第几行
        const c = i % finalCols; // 当前第几列
        // 计算当前行实际拥有的点数（处理最后一行不满的情况）
        const isLastRow = r === rows - 1;
        const nodesInThisRow = isLastRow ? (n % finalCols || finalCols) : finalCols;
        // 4. 计算偏移量
        // offsetMajor: 沿着 dirVector 的偏移
        const offsetMajor = (r * rowSpacing) - (totalHeight / 2);
        // offsetMinor: 垂直于 dirVector 的偏移
        // 这里的 (nodesInThisRow - 1) 实现末行居中对齐的关键
        const currentRowWidth = (nodesInThisRow - 1) * colSpacing;
        const offsetMinor = (c * colSpacing) - (currentRowWidth / 2);
        // 5. 应用位置
        node.position({
            x: center.x + (offsetMajor * u1.x) + (offsetMinor * u2.x),
            y: center.y + (offsetMajor * u1.y) + (offsetMinor * u2.y)
        });
    });
}
ForceLayout.prototype.identifyStructures = function (nodes) {
    // 0. 重置所有标记
    nodes.data('structType', 'Normal');
    nodes.data('structColor', '#999999');
    nodes.data('groupId', null); // 新增：重置分组 ID for cycle
    nodes.data('innerId', null); // index inner a circle
    nodes.data('parallelGroupIdVec', []);
    ///////////////////////////////// 1. 锁定【星型结构】(逻辑保持不变) ///////////
    let starIndex = 0;
    nodes.forEach((node) => {
        const degree = node.degree();
        const neighbors = node.neighborhood().nodes();
        const leafNeighbors = neighbors.filter((n) => n.degree() === 1);
        if (leafNeighbors.length >= 3 && degree >= 3) {
            node.data('structType', 'Star-Center');
            node.data('structColor', '#F48FB1');
            node.data('groupId', 'Star_' + starIndex);
            leafNeighbors.forEach((leaf) => {
                leaf.data('structType', 'Star-Member');
                leaf.data('structColor', '#F48FB1');
                leaf.data('groupId', 'Star_' + starIndex);
            });
            starIndex++;
        }
    });
    ///////////////////////////// 2. 识别环状结构 (Cycle) - 迭代 DFS 版 /////////////////
    const visited = new Set();
    const allCycles = []; // 每个子数组代表一个独立的环
    if (1) {
        const normalNodes = nodes.toArray().filter((n) => n.data('structType') === 'Normal');
        const seenCycles = new Set();
        // To avoid duplicate cycles (like A-B-C and B-C-A), we sort and stringify for a check
        console.log("normalNodes:" + normalNodes.length);
        normalNodes.forEach((startNode, startIndex) => {
            // console.log("startIndex:" + startIndex);
            // We only find cycles where startNode is the node with the lowest index
            // This is a massive optimization to prevent finding the same cycle N times
            const startId = startNode.id();
            const findCycles = (u, parent, path) => {
                const neighbors = u.neighborhood().nodes().toArray().filter((n) => n.data('structType') === 'Normal');
                for (const v of neighbors) {
                    const vId = v.id();
                    // 1. Found a cycle back to our specific START node
                    if (vId === startId && path.length >= 3) {
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
                    const vIdx = normalNodes.findIndex(node => node.id() === vId);
                    if (vIdx > startIndex && !path.includes(vId)) {
                        findCycles(v, u, [...path, vId]);
                    }
                }
            };
            findCycles(startNode, null, [startId]);
        });
    }
    console.log("All Cycles:", allCycles);
    // --- 2. 二次过滤：去掉重合度 >= 2 的环 ---
    console.log("allCycles:", allCycles.length);
    const filteredCycles = [];
    allCycles.sort((a, b) => b.length - a.length);
    // 建议先按环的大小排序，通常保留“小环”更有意义（基础环往往更短）
    allCycles.forEach((currentCycle) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
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
            console.log("subNodes[1]:", (_a = subNodes[1]) === null || _a === void 0 ? void 0 : _a.degree(false));
            console.log("subNodes[2]:", (_b = subNodes[2]) === null || _b === void 0 ? void 0 : _b.degree(false));
            console.log("subNodes[3]:", (_c = subNodes[3]) === null || _c === void 0 ? void 0 : _c.degree(false));
            if (!((((_d = subNodes[0]) === null || _d === void 0 ? void 0 : _d.degree(false)) == 2 && ((_e = subNodes[2]) === null || _e === void 0 ? void 0 : _e.degree(false)) == 2 &&
                ((_f = subNodes[1]) === null || _f === void 0 ? void 0 : _f.degree(false)) != 2 && ((_g = subNodes[3]) === null || _g === void 0 ? void 0 : _g.degree(false)) != 2) ||
                (((_h = subNodes[0]) === null || _h === void 0 ? void 0 : _h.degree(false)) == 2 && ((_j = subNodes[2]) === null || _j === void 0 ? void 0 : _j.degree(false)) == 2 &&
                    ((_k = subNodes[1]) === null || _k === void 0 ? void 0 : _k.degree(false)) == 2 && ((_l = subNodes[3]) === null || _l === void 0 ? void 0 : _l.degree(false)) == 2))) {
                filteredCycles.push(currentCycle);
            }
        }
    });
    console.log("filteredCycles:", filteredCycles.length);
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
                    innerIndex++;
                }
            });
        });
        circleIndex++;
    });
    console.log("检测到的环总数:", filteredCycles.length);
    console.log("具体环的信息:", filteredCycles);
    const chains = [];
    const processedNodeIds = new Set(); // 避免重复处理
    if (1) {
        nodes.forEach((node) => {
            if (node.id() == 561) {
                console.log(node.id() + ' degree:' + node.degree());
            }
        });
    }
    // 2. 找出所有的叶子节点 (Normal 类型且度数为 1)
    const leafNodes = nodes.filter((n) => n.data('structType') === 'Normal' && n.degree() === 1
    // n.degree() === 1
    );
    console.log('num of leaf-node:' + leafNodes.length);
    let chainId = 0;
    leafNodes.forEach((leaf) => {
        // console.log('leaves:'+leaf.id());
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
                // chainId++;
                // nodeId = 0;
            }
        }
        // 4. 保存找到的链
        if (currentChainNodes.length >= 2) {
            nodeId = 0;
            currentChainNodes.forEach((node) => {
                node.data('structType', 'Chain');
                node.data('structColor', '#FFF176');
                node.data('groupId', 'Chain_' + chainId);
                node.data('innerId', nodeId);
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
                nodeId++;
                // console.log('leafNode', node.id());
            });
        }
    });
    /////////////////////////////// 找出平行/钻石结构 Parallel ///////////////////////////////////
    if (1) {
        // let diamonds = [];
        let parallelId = 0;
        //任意两个点是否有共同的neighbor
        for (let i = 0; i < nodes.length; i++) {
            let nodeVec = [];
            let terminalVec = [];
            const u = nodes[i];
            const u1 = u.neighborhood().nodes();
            if (u.data('structType') === 'Normal') {
                for (let j = 0; j < nodes.length; j++) {
                    if (i === j)
                        continue;
                    const v = nodes[j];
                    if (v.data('structType') === 'Normal') {
                        const v1 = v.neighborhood().nodes();
                        if (areNodesEqual(v1, u1) && v1.length >= 2 && u1.length >= 2) {
                            if (nodeVec.length === 0) {
                                nodeVec.push(u);
                            }
                            nodeVec.push(v);
                        }
                    }
                }
            }
            if (nodeVec.length >= 3) {
                nodeVec.forEach(v => {
                    v.data('structType', 'Parallel');
                    v.data('structColor', '#50C878');
                    v.data('groupId', 'Parallel' + parallelId);
                });
                u1.forEach(v => {
                    v.data('parallelGroupIdVec').push('Parallel' + parallelId);
                });
                parallelId++;
                // console.log('parallel'+parallelId+'   end:'+u1.length);
                // console.log(nodeVec.map(node=>node.id()));
            }
            else {
                nodeVec = [];
            }
        }
        // console.log('parallels:', diamonds);
    }
    console.log("检测到的链总数:", chains.length);
    console.log("具体链信息:", chains);
};
ForceLayout.prototype.run = function () {
    var _a, _b, _c, _d;
    const nodes = this.eles.nodes();
    const edges = this.eles.edges();
    console.log("num of nodes:" + nodes.length);
    console.log("num of edges:" + edges.length);
    if (1) { //remove duplicate edges////////////
        const seenPairs = new Set();
        const toRemove = this.eles.edges().filter((edge) => {
            const sourceId = edge.source().id();
            const targetId = edge.target().id();
            // Self-loop check
            if (sourceId === targetId)
                return true;
            // Duplicate check
            const pairKey = [sourceId, targetId].sort().join('---');
            if (seenPairs.has(pairKey))
                return true;
            seenPairs.add(pairKey);
            return false;
        });
        this.cy.remove(toRemove);
    }
    // 1. 识别结构 (标记 structType 并通过 components 划分独立环)
    this.identifyStructures(nodes);
    let vnodes = [];
    let vedges = [];
    console.log(2);
    nodes.forEach((n) => {
        if (n.data('structType') === 'Normal') {
            let nodesarray = [];
            nodesarray.push(n);
            vnodes.push({
                type: 'Normal',
                id: n.id(),
                center_x: n.data.x,
                center_y: n.data.y,
                radius: 1,
                rotate_angle: 0,
                nodes: nodesarray
            });
        }
        else if (n.data('structType') === 'Cycle') {
            let flag = true;
            vnodes.forEach((vp) => {
                if (vp.type === 'Cycle' && vp.id === n.data('groupId')) {
                    vp.nodes.push(n);
                    flag = false;
                }
            });
            if (flag) { //还没保存过
                let nodesarray = [];
                nodesarray.push(n);
                vnodes.push({
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
            vnodes.forEach((vp) => {
                if (vp.type === 'Chain' && vp.id === n.data('groupId')) {
                    vp.nodes.push(n);
                    flag = false;
                }
            });
            if (flag) { //还没保存过
                let nodesarray = [];
                nodesarray.push(n);
                vnodes.push({
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
            vnodes.forEach((vp) => {
                if (vp.type === 'Parallel' && vp.id === n.data('groupId')) {
                    vp.nodes.push(n);
                    flag = false;
                }
            });
            if (flag) { //还没保存过
                let nodesarray = [];
                nodesarray.push(n);
                vnodes.push({
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
        else if (n.data('structType') === 'Star-Center' ||
            n.data('structType') === 'Star-Member') {
            let flag = true;
            vnodes.forEach((vp) => {
                if (vp.type === 'Star' && vp.id === n.data('groupId')) {
                    vp.nodes.push(n);
                    flag = false;
                }
            });
            if (flag) { //还没保存过
                let nodesarray = [];
                nodesarray.push(n);
                vnodes.push({
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
    //为虚拟节点建好连接边
    if (1) {
        const edgePairs = [];
        for (const edge of edges) {
            let s = edge.source().id();
            let t = edge.target().id();
            let count = 0;
            insideBreak: for (let i = 0; i < vnodes.length; i++) {
                const v1 = vnodes[i];
                count = 0;
                if (!v1.nodes)
                    continue;
                v1.nodes.forEach((node) => {
                    if (node.id() === s || node.id() === t) {
                        count++;
                    }
                });
                if (count == 2) {
                    break insideBreak;
                }
            }
            if (count != 2) { // counts==2 means the edge is inside of vnode
                edgePairs.push({
                    source: edge.source().id(),
                    target: edge.target().id()
                });
            }
        }
        console.log("getting virtual edges...");
        for (let i = 0; i < vnodes.length - 1; i++) {
            const v1 = vnodes[i];
            for (let j = i + 1; j < vnodes.length; j++) {
                // console.log('i:'+i+'   j:' + j);
                const v2 = vnodes[j];
                if (!v1.nodes || !v2.nodes)
                    continue;
                const nodeIds1 = v1.nodes.map((node) => node.id());
                const nodeIds2 = v2.nodes.map((node) => node.id());
                let flag = false;
                foundEdge: // Label is now in the same scope as the 'break'
                 for (const n1 of nodeIds1) {
                    for (const n2 of nodeIds2) {
                        for (const edge of edgePairs) {
                            const source = edge.source;
                            const target = edge.target;
                            // Logic fix: Checking both directions for an undirected link
                            if ((n1 === source && n2 === target) || (n2 === source && n1 === target)) {
                                flag = true;
                                break foundEdge; // Successfully stops ALL three loops
                            }
                        }
                    }
                }
                if (flag) {
                    let vedge = new VEdge(v1, v2);
                    vedges.push(vedge);
                }
            }
        }
    }
    ///////////////////////////////////////////////////////////////////////////
    ///////////////////////////////// 更新虚拟节点的中心 //////////////////////////
    vnodes.forEach((v1) => {
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
    /////////////////////////////  计算全部vnode的平均中心  ////////////////////////
    let sum_x = 0;
    let sum_y = 0;
    vnodes.forEach((v) => {
        sum_x = sum_x + v.center_x;
        sum_y = sum_y + v.center_y;
    });
    let avg_x = sum_x / vnodes.length;
    let avg_y = sum_y / vnodes.length;
    //////////////////////////////// force-layout ////////////////////////////////
    const IDEAL_LENGTH = 200; //120;
    const REPULSION = 20000; //2000;
    const SPRING_K = 0.01; //0.02;
    const DAMPING = 0.85;
    const ITERATIONS = 300; //300;
    console.log(3);
    console.log("virtual edges:", vedges.length);
    if (1) {
        const nodeMap = new Map(vnodes.map(n => [n.id, n]));
        for (let iter = 0; iter < ITERATIONS; iter++) {
            if (0) {
                /* ---------- 2. 边弹簧力 attraction ---------- */
                vedges.forEach(e => {
                    const s = e.source;
                    const t = e.target;
                    if (!s || !t) {
                        console.log('no edge');
                        return;
                    }
                    let dx = t.center_x - s.center_x;
                    let dy = t.center_y - s.center_y;
                    let dist = Math.sqrt(dx * dx + dy * dy);
                    // const delta = dist - IDEAL_LENGTH * s.nodes.length * t.nodes.length * 0.01;
                    const ratio = Math.min(Math.max((s.nodes.length * t.nodes.length) / 10, 1), 5);
                    const delta = dist - IDEAL_LENGTH * ratio;
                    const force = SPRING_K * delta;
                    const fx = force * dx / dist;
                    const fy = force * dy / dist;
                    s.center_x += fx;
                    s.center_y += fy;
                    t.center_x -= fx;
                    t.center_y -= fy;
                });
            }
            /* ---------- 1. 节点斥力 ---------- */
            for (let i = 0; i < vnodes.length; i++) {
                for (let j = i + 1; j < vnodes.length; j++) {
                    const n1 = vnodes[i];
                    const n2 = vnodes[j];
                    const len1 = (_b = (_a = n1.nodes) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 1;
                    const len2 = (_d = (_c = n2.nodes) === null || _c === void 0 ? void 0 : _c.length) !== null && _d !== void 0 ? _d : 1;
                    const ratio = Math.max((len1 * len2) / 3, 1); ///// adjust for vnode radius
                    const dx = n1.center_x - n2.center_x;
                    const dy = n1.center_y - n2.center_y;
                    const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
                    const force = (ratio) * REPULSION / (dist * dist);
                    const fx = force * dx / dist;
                    const fy = force * dy / dist;
                    n1.center_x += fx;
                    n1.center_y += fy;
                    n2.center_x -= fx;
                    n2.center_y -= fy;
                }
            }
            /* ---------- 3. 边交叉抑制（中点斥力） ---------- */
            if (1) {
                const mids = vedges.map(e => {
                    let s = nodeMap.get(e.source.id);
                    let t = nodeMap.get(e.target.id);
                    return {
                        x: (s.center_x + t.center_x) / 2,
                        y: (s.center_y + t.center_y) / 2,
                        s,
                        t
                    };
                });
                for (let i = 0; i < mids.length; i++) {
                    for (let j = i + 1; j < mids.length; j++) {
                        const m1 = mids[i];
                        const m2 = mids[j];
                        const dx = m1.x - m2.x;
                        const dy = m1.y - m2.y;
                        const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
                        if (dist < 80) {
                            const force = 5 / dist;
                            const fx = force * dx;
                            const fy = force * dy;
                            m1.s.center_x += fx;
                            m1.s.center_y += fy;
                            m1.t.center_x += fx;
                            m1.t.center_y += fy;
                            m2.s.center_x -= fx;
                            m2.s.center_y -= fy;
                            m2.t.center_x -= fx;
                            m2.t.center_y -= fy;
                        }
                    }
                }
            }
        }
    }
    // untangleAllEdges(vnodes,vedges);
    console.log(4);
    if (1) {
        vnodes.forEach((v) => {
            v.nodes.forEach((n) => {
                n.position().x = v.center_x + Math.random() * 10;
                n.position().y = v.center_y + Math.random() * 10;
            });
        });
    }
    console.log(5);
    /////////////////////  删除之后变成虚拟节点 vnode 的layout ////////////////
    if (1) {
        vnodes.forEach((v) => {
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
                const k = 100;
                const radius = (count * k) / (2 * Math.PI);
                // 3. 排序以防止节点在圆周上闪烁
                const sorted = v.nodes;
                let minTotalLength = 10e10;
                let bestRotate = 0; //找出最好的旋转角度
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
                // 4. 强行覆盖坐标：这是形成“绝对圆”的物理保障
                //console.log('sorted:'+sorted.length);
                sorted.forEach((n, i) => {
                    const angle = (i / count) * 2 * Math.PI + bestRotate;
                    n.position({
                        x: v.center_x + Math.cos(angle) * radius,
                        y: v.center_y + Math.sin(angle) * radius
                    });
                });
            }
            else if (v.type == 'Star') {
                if (1) {
                    const allMemberNode = v.nodes.filter((node) => node.data('structType') !== 'Star-Center');
                    const ringSpacing = 100;
                    const baseNodesInFirstRing = 6;
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
                            gNodes.forEach((n) => {
                                cx += n.position().x;
                                cy += n.position().y;
                            });
                            cx /= count;
                            cy /= count;
                            // 2. 根据节点数量计算标准半径 (保证节点间距接近 k)
                            const miniMumRadius = 150;
                            const radius = Math.max((count * 100) / (2 * Math.PI), miniMumRadius);
                            // 3. 排序以防止节点在圆周上闪
                            const sorted = gNodes.slice(1);
                            ///////////////////////////////////////////////////
                            // 4. 需要旋转，找出最好的旋转角度
                            let minTotalLength = 10e10;
                            let bestRotate = 0; //找出最好的旋转角度
                            for (let rotate = 0; rotate < 360; rotate = rotate + 10) {
                                // 4. 强行覆盖坐标：这是形成“绝对圆”的物理保障
                                sorted.forEach((n, i) => {
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
                            sorted.forEach((n, i) => {
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
                            });
                        }
                    }
                }
            }
            else if (v.type == 'Parallel') {
                let endVec = [];
                const mids = v.nodes;
                nodes.forEach((n, i) => {
                    if (n.data('parallelGroupIdVec').includes(v.id) && n.data('structType') != 'Parallel') {
                        //提取同一个group的端节点
                        endVec.push(n);
                    }
                });
                if (endVec.length >= 2) { //应该>=2，否则就错误
                    let gap = 80; //垂直分布的步长
                    //有node数组，将里面的所有node在两个点n1,n2中点垂线上均匀分布
                    const p1 = endVec[0].position();
                    const p2 = endVec[1].position();
                    const diff = { x: p1.x - p2.x, y: p2.y - p2.y };
                    layoutRectangular(v.nodes, { x: v.center_x, y: v.center_y }, diff);
                }
            }
        });
        nodes.forEach((n, i) => {
            if (n.data('structType') == 'LeafButNotChain') {
                // console.log('layout:'+n.id()+' ->:'+n.neighborhood().nodes().first().id());
                let fatherPos = n.neighborhood().nodes().first().position();
                const pos = n.position();
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
                // console.log('bestRotate:'+bestRotate);
                n.position({
                    x: fatherPos.x + Math.cos(bestRotate * 3.14 / 180) * IDEAL_LENGTH,
                    y: fatherPos.y + Math.sin(bestRotate * 3.14 / 180) * IDEAL_LENGTH
                });
                // console.log('ssss');
            }
        });
    }
    const iterations = 300;
    const k = 100;
    const temp = 20;
    ///////////////////////////////////////
    this.cy.fit(null, 50);
    this.cy.emit('layoutstop');
    return this;
};
ForceLayout.prototype.stop = function () {
    return this;
};
export default function register(cytoscape) {
    if (!cytoscape)
        return;
    cytoscape('layout', 'ForceLayout', ForceLayout);
}

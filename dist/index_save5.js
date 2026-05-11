/**
 * 结构增强版力导向布局
 */
function ForceLayout(options) {
    this.options = options;
    this.cy = options.cy;
    this.eles = options.eles;
}
function totalEdgeLength(edges) {
    let total = 0;
    edges.forEach(edge => {
        const s = edge.source();
        const t = edge.target();
        if (s && t) {
            const dx = (t.position().x || 0) - (s.position().x || 0);
            const dy = (t.position().y || 0) - (s.position().y || 0);
            // 欧几里得距离公式: sqrt(dx^2 + dy^2)
            const length = Math.sqrt(dx * dx + dy * dy);
            total += length;
        }
    });
    return total;
}
ForceLayout.prototype.identifyStructures = function (nodes) {
    // 0. 重置所有标记
    nodes.data('structType', 'Normal');
    nodes.data('structColor', '#999999');
    nodes.data('groupId', null); // 新增：重置分组 ID for cycle
    nodes.data('innerId', null); // index inner a circle
    // 1. 锁定【星型结构】(逻辑保持不变)
    let starIndex = 0;
    nodes.forEach((node) => {
        const degree = node.degree();
        const neighbors = node.neighborhood().nodes();
        const leafNeighbors = neighbors.filter((n) => n.degree() === 1);
        // node.data('ID', node.id());
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
    // 2. 识别环状结构 (Cycle) - 迭代 DFS 版
    const visited = new Set();
    // 修改：改为存储数组的数组，每个子数组代表一个独立的环
    const allCycles = [];
    nodes.forEach((startNode) => {
        if (visited.has(startNode.id()) || startNode.data('structType') !== 'Normal')
            return;
        const stack = [
            { node: startNode, parent: null, neighborIdx: 0 }
        ];
        const pathStack = [startNode]; // 存储节点对象，方便操作
        const pathIds = [startNode.id()]; // 专门存 ID 用于快速检索
        visited.add(startNode.id());
        while (stack.length > 0) {
            const currentFrame = stack[stack.length - 1];
            const u = currentFrame.node;
            const neighbors = u.neighborhood().nodes().toArray().filter((n) => n.data('structType') === 'Normal');
            if (currentFrame.neighborIdx < neighbors.length) {
                const v = neighbors[currentFrame.neighborIdx];
                currentFrame.neighborIdx++;
                const vId = v.id();
                // 跳过直接回头的父节点（防止在无向图中把“来回路”当成环）
                if (currentFrame.parent && vId === currentFrame.parent.id())
                    continue;
                // 关键逻辑：如果 vId 在当前路径栈中，说明找到了一个环
                if (pathIds.includes(vId)) {
                    const startIndex = pathIds.indexOf(vId);
                    // 截取环节点：从 vId 第一次出现的位置到路径末尾
                    const currentCycle = pathIds.slice(startIndex);
                    allCycles.push(currentCycle);
                    continue;
                }
                // 如果没访问过，继续深入
                if (!visited.has(vId)) {
                    visited.add(vId);
                    pathStack.push(v);
                    pathIds.push(vId);
                    stack.push({ node: v, parent: u, neighborIdx: 0 });
                }
            }
            else {
                // 回溯
                stack.pop();
                pathStack.pop();
                pathIds.pop();
            }
        }
    });
    console.log("检测到的环总数:", allCycles.length);
    console.log("具体环信息:", allCycles);
    // --- 2. 二次过滤：去掉重合度 >= 2 的环 ---
    const filteredCycles = [];
    // 建议先按环的大小排序，通常保留“小环”更有意义（基础环往往更短）
    allCycles.sort((a, b) => b.length - a.length);
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
                if (overlapCount >= 2)
                    return true;
            }
            return false;
        });
        if (!isRedundant) {
            filteredCycles.push(currentCycle);
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
                    innerIndex++;
                }
            });
        });
        circleIndex++;
    });
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
            currentNode.data('structType', 'Chain');
            currentNode.data('structColor', '#FFF176');
            currentNode.data('groupId', 'Chain_' + chainId);
            currentNode.data('innerId', nodeId);
            nodeId++;
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
                    chainId++;
                    nodeId = 0;
                    break;
                }
                currentNode = nextNode;
            }
            else {
                // 没有邻居或有多个邻居（分叉），链结束
                currentNode = null;
                chainId++;
                nodeId = 0;
            }
        }
        // 4. 保存找到的链
        if (currentChainNodes.length > 0) {
            chains.push({
                chainId: `chain_${leaf.id()}`, // 以叶子节点 ID 命名
                nodes: currentChainNodes
            });
        }
    });
    console.log("检测到的链总数:", chains.length);
    console.log("具体链信息:", chains);
};
ForceLayout.prototype.run = function () {
    const nodes = this.eles.nodes();
    const edges = this.eles.edges();
    // 1. 识别结构 (标记 structType 并通过 components 划分独立环)
    this.identifyStructures(nodes);
    class VNode {
    }
    class VEdge {
        // 构造函数
        constructor(source, target) {
            this.source = source;
            this.target = target;
        }
    }
    let vnodes = [];
    let vedges = [];
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
        else if (n.data('structType') === 'Star-Center' || n.data('structType') === 'Star-Member') {
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
    console.log(vnodes);
    //为虚拟节点建好连接边
    vnodes.forEach((v1) => {
        vnodes.forEach((v2) => {
            if (v1 != v2) {
                let flag = false;
                v1.nodes.forEach((n1) => {
                    v2.nodes.forEach((n2) => {
                        edges.forEach((edge) => {
                            let source = edge.source();
                            let target = edge.target();
                            if ((n1 == source && n2 == target) || (n2 == source && n2 == target)) {
                                flag = true;
                                // break; ?????
                            }
                        });
                    });
                });
                if (flag) {
                    let vedge = new VEdge(v1, v2);
                    vedges.push(vedge);
                }
            }
        });
    });
    ////////更新虚拟节点的中心
    vnodes.forEach((v1) => {
        if (v1.nodes && v1.nodes.length > 0) {
            const sumX = v1.nodes.reduce((acc, curr) => acc + (curr.position().x || 0), 0);
            const sumY = v1.nodes.reduce((acc, curr) => acc + (curr.position().y || 0), 0);
            console.log(v1.nodes);
            v1.center_x = sumX / v1.nodes.length;
            v1.center_y = sumY / v1.nodes.length;
        }
        else {
            v1.center_x = v1.center_x || 0;
            v1.center_y = v1.center_y || 0;
        }
    });
    /// 更新半径
    vnodes.forEach((v1) => {
        if (v1.nodes && v1.nodes.length > 0) {
            v1.radius = v1.nodes.length / 10;
        }
    });
    if (0) {
        vnodes.forEach((v) => {
            console.log('vnode:' + v.id + ' ->' + v.center_y + ', ' + v.center_y + ' r:' + v.radius);
        });
    }
    /////////////////// force-layout ////////////////////
    if (1) {
        const IDEAL_LENGTH = 200; //120;
        const REPULSION = 200000; //2000;
        const SPRING_K = 0.02;
        const DAMPING = 0.85;
        const ITERATIONS = 300; //300;
        const nodeMap = new Map(vnodes.map(n => [n.id, n]));
        for (let iter = 0; iter < ITERATIONS; iter++) {
            /* ---------- 2. 边弹簧力 ---------- */
            vedges.forEach(e => {
                const s = e.source;
                const t = e.target;
                if (!s || !t) {
                    console.log('no edge');
                    return;
                }
                let dx = t.center_x - s.center_x;
                let dy = t.center_y - s.center_y;
                let dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
                // const delta = dist - IDEAL_LENGTH;
                const delta = dist - IDEAL_LENGTH * s.radius * t.radius;
                const force = SPRING_K * delta;
                const fx = force * dx / dist;
                const fy = force * dy / dist;
                s.center_x += fx;
                s.center_y += fy;
                t.center_x -= fx;
                t.center_y -= fy;
            });
            /* ---------- 1. 节点斥力 ---------- */
            for (let i = 0; i < vnodes.length; i++) {
                for (let j = i + 1; j < vnodes.length; j++) {
                    const n1 = vnodes[i];
                    const n2 = vnodes[j];
                    const dx = n1.center_x - n2.center_x;
                    const dy = n1.center_y - n2.center_y;
                    const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
                    const force = REPULSION / (dist * dist);
                    const fx = force * dx / dist;
                    const fy = force * dy / dist;
                    n1.center_x += fx;
                    n1.center_y += fy;
                    n2.center_x -= fx;
                    n2.center_y -= fy;
                    // console.log('fx:'+fx+" force:"+force+" dx:"+dx+" dist:"+dist);
                }
            }
            /* ---------- 3. 边交叉抑制（中点斥力） ---------- */
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
            //
            // /* ---------- 4. 阻尼 ---------- */
            // vnodes.forEach(n => {
            //     n.center_x *= DAMPING;
            //     n.center_y *= DAMPING;
            // });
        }
    }
    if (1) {
        vnodes.forEach((v) => {
            console.log('vnode: ' + v.id + ' :' + v.center_y + ' ' + v.center_y + ' r:' + v.radius);
        });
    }
    if (1) {
        vnodes.forEach((v) => {
            v.nodes.forEach((n) => {
                n.position().x = v.center_x + Math.random() * 100;
                n.position().y = v.center_y + Math.random() * 100;
                // console.log('random:'+Math.random());
            });
        });
    }
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
                // 4. 强行覆盖坐标：这是形成“绝对圆”的物理保障
                sorted.forEach((n, i) => {
                    const angle = (i / count) * 2 * Math.PI;
                    n.position({
                        x: v.center_x + Math.cos(angle) * radius,
                        y: v.center_y + Math.sin(angle) * radius
                    });
                });
            }
            else if (v.type == 'Star') {
                v.nodes.forEach((n, i) => {
                    if (n.data('structType') == 'Star-Center') {
                        n.position({
                            x: v.center_x,
                            y: v.center_y,
                        });
                    }
                    else {
                        const angle = (i / v.nodes.length) * 2 * Math.PI;
                        n.position({
                            x: v.center_x + Math.cos(angle) * 1.5 * 100,
                            y: v.center_y + Math.sin(angle) * 1.5 * 100
                        });
                    }
                });
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
                        if (count >= 3) {
                            // 1. 计算当前时刻的算术平均中心 (质心)
                            let cx = 0, cy = 0;
                            gNodes.forEach((n) => {
                                cx += n.position().x;
                                cy += n.position().y;
                            });
                            cx /= count;
                            cy /= count;
                            // 2. 根据节点数量计算标准半径 (保证节点间距接近 k)
                            const radius = (count * 100) / (2 * Math.PI);
                            // 3. 排序以防止节点在圆周上闪
                            const sorted = gNodes.slice(1);
                            // 4. 强行覆盖坐标：这是形成“绝对圆”的物理保障
                            sorted.forEach((n, i) => {
                                const angle = (i / count) * 2 * Math.PI;
                                n.position({
                                    x: cx + Math.cos(angle) * radius,
                                    y: cy + Math.sin(angle) * radius
                                });
                            });
                            gNodes[0].position({
                                x: cx,
                                y: cy
                            });
                        }
                    }
                }
            }
        });
    }
    if (0) {
        nodes.forEach((n) => {
            console.log(n.id() + ' ' + n.position().x + ' ' + n.position().y);
        });
        console.log(vnodes);
    }
    const iterations = 300;
    const k = 100;
    const temp = 20;
    ///////////////////////////////////////
    this.cy.fit(null, 50);
    this.cy.emit('layoutstop');
    return this;
};
ForceLayout.prototype.run2 = function () {
    const nodes = this.eles.nodes();
    const edges = this.eles.edges();
    // 1. 识别结构 (标记 structType 并通过 components 划分独立环)
    this.identifyStructures(nodes);
    const iterations = 80;
    const k = 100;
    const temp = 20;
    for (let iter = 0; iter < iterations; iter++) {
        const disp = new Map();
        //?
        nodes.forEach((n) => disp.set(n.id(), { x: 0, y: 0 }));
        // --- A. 基础斥力计算 ---
        nodes.forEach((v) => {
            const vPos = v.position();
            nodes.forEach((u) => {
                if (v === u)
                    return;
                const uPos = u.position();
                const dx = vPos.x - uPos.x;
                const dy = vPos.y - uPos.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const fr = (k * k) / dist;
                const d = disp.get(v.id());
                d.x += (dx / dist) * fr;
                d.y += (dy / dist) * fr;
            });
        });
        // --- B. 基础引力计算 ---
        edges.forEach((edge) => {
            const s = edge.source();
            const t = edge.target();
            const sPos = s.position();
            const tPos = t.position();
            const dx = sPos.x - tPos.x;
            const dy = sPos.y - tPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const fa = (dist * dist) / k;
            const dS = disp.get(s.id());
            const dT = disp.get(t.id());
            dS.x -= (dx / dist) * fa;
            dS.y -= (dy / dist) * fa;
            dT.x += (dx / dist) * fa;
            dT.y += (dy / dist) * fa;
        });
        // --- C. 环结构刚体平移处理 ---
        // 1. 依然使用临时对象按 groupId 归类节点
        const cycleGroups = {};
        nodes.forEach((node) => {
            const groupId = node.data('groupId');
            // 过滤逻辑
            if (!groupId || node.data('structType') != 'Cycle')
                return;
            if (!cycleGroups[groupId]) {
                cycleGroups[groupId] = [];
            }
            cycleGroups[groupId].push(node);
        });
        const finalGroups = Object.keys(cycleGroups).map(key => {
            const group = cycleGroups[key];
            return group.sort((a, b) => Number(a.data('innerId')) - Number(b.data('innerId')));
        });
        for (const groupId in cycleGroups) {
            if (cycleGroups.hasOwnProperty(groupId)) {
                const group = cycleGroups[groupId];
                const gNodes = group;
                //处理每个环
                // cycleGroups.forEach((group: any) => {
                //     const gNodes = group.nodes();
                let totalDx = 0, totalDy = 0;
                gNodes.forEach((n) => {
                    const d = disp.get(n.id());
                    totalDx += d.x;
                    totalDy += d.y;
                });
                // 核心：将环内所有节点的位移强行统一，使其作为整体平移
                const avgDx = totalDx / gNodes.length;
                const avgDy = totalDy / gNodes.length;
                gNodes.forEach((n) => {
                    const d = disp.get(n.id());
                    d.x = avgDx;
                    d.y = avgDy;
                });
            }
        }
        // --- D. 应用位置更新 (含温度冷却) ---
        const t = temp * (1 - iter / iterations);
        nodes.forEach((n) => {
            const d = disp.get(n.id());
            const dist = Math.sqrt(d.x * d.x + d.y * d.y) || 1;
            const actualDisp = Math.min(dist, t);
            n.position({
                x: n.position().x + (d.x / dist) * actualDisp,
                y: n.position().y + (d.y / dist) * actualDisp
            });
        });
        // --- E. 【最终修正】强行回归绝对圆周 ---
        // 这一步必须在 position 更新之后，确保没有任何后续代码修改坐标
        for (const groupId in cycleGroups) {
            if (cycleGroups.hasOwnProperty(groupId)) {
                const group = cycleGroups[groupId];
                const gNodes = group;
                // 处理逻辑
                // cycleGroups.forEach((group: any) => {
                //     const gNodes = group.nodes();
                const count = gNodes.length;
                if (count < 3)
                    break;
                // 1. 计算当前时刻的算术平均中心 (质心)
                let cx = 0, cy = 0;
                gNodes.forEach((n) => {
                    cx += n.position().x;
                    cy += n.position().y;
                });
                cx /= count;
                cy /= count;
                // 2. 根据节点数量计算标准半径 (保证节点间距接近 k)
                const radius = (count * k) / (2 * Math.PI);
                // 3. 排序以防止节点在圆周上闪烁
                // => a.data("innerId").localeCompare(b.data("innerId")));
                const sorted = gNodes;
                // 4. 强行覆盖坐标：这是形成“绝对圆”的物理保障
                sorted.forEach((n, i) => {
                    const angle = (i / count) * 2 * Math.PI;
                    n.position({
                        x: cx + Math.cos(angle) * radius,
                        y: cy + Math.sin(angle) * radius
                    });
                });
            }
        }
        ///////////////////// 星型结构绝对投影  /////////////////////////////////////
        nodes.filter('[structType="Star-Center"]').forEach((center) => {
            const members = center.neighborhood().nodes().filter('[structType="Star-Member"]');
            const cPos = center.position();
            const sorted = members.toArray().sort((a, b) => a.id().localeCompare(b.id()));
            sorted.forEach((m, i) => {
                const angle = (i / sorted.length) * 2 * Math.PI;
                m.position({
                    x: cPos.x + Math.cos(angle) * 1.5 * k,
                    y: cPos.y + Math.sin(angle) * 1.5 * k
                });
            });
        });
        ////////////////////  chain  结构  /////////////////////////////////
        if (1) {
            // 1. 依然使用临时对象按 groupId 归类节点
            const chainGroups = {};
            nodes.forEach((node) => {
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
            // for (const groupId in chainGroups) {
            //
            //     if (chainGroups.hasOwnProperty(groupId)) {
            //         const gNodes = chainGroups[groupId];
            //         let totalDx = 0, totalDy = 0;
            //         gNodes.forEach((n: any) => {
            //             const d = disp.get(n.id())!;
            //             totalDx += d.x;
            //             totalDy += d.y;
            //         });
            //         // 核心：将环内所有节点的位移强行统一，使其作为整体平移
            //         const avgDx = totalDx / (gNodes.length);
            //         const avgDy = totalDy / (gNodes.length);
            //         gNodes.forEach((n: any) => {
            //             const d = disp.get(n.id())!;
            //             d.x = avgDx;
            //             d.y = avgDy;
            //         });
            //     }
            // }
            for (const groupId in chainGroups) {
                if (chainGroups.hasOwnProperty(groupId)) {
                    const gNodes = chainGroups[groupId];
                    const count = gNodes.length;
                    if (count >= 3) {
                        // 1. 计算当前时刻的算术平均中心 (质心)
                        let cx = 0, cy = 0;
                        gNodes.forEach((n) => {
                            cx += n.position().x;
                            cy += n.position().y;
                        });
                        cx /= count;
                        cy /= count;
                        // 2. 根据节点数量计算标准半径 (保证节点间距接近 k)
                        const radius = (count * k) / (2 * Math.PI);
                        // 3. 排序以防止节点在圆周上闪烁
                        // const sorted = mpare(b.data("innerId")));
                        const sorted = gNodes.slice(1);
                        // 4. 强行覆盖坐标：这是形成“绝对圆”的物理保障
                        sorted.forEach((n, i) => {
                            const angle = (i / count) * 2 * Math.PI;
                            n.position({
                                x: cx + Math.cos(angle) * radius,
                                y: cy + Math.sin(angle) * radius
                            });
                        });
                        gNodes[0].position({
                            x: cx,
                            y: cy
                        });
                    }
                }
            }
        }
    }
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

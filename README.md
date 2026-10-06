# LUMINA

**LUMINA** is a [Cytoscape.js](https://js.cytoscape.org/) layout extension that is **structure-aware**: instead of treating every node the same, it detects common substructures in your graph, collapses each one into a *virtual node*, lays out the virtual nodes with either a force-directed or a stress-majorization solver, and then expands every substructure back into a clean, purpose-built arrangement.

Written in TypeScript. Registered under the layout name `lumina` (the legacy name `substructure-layout` is still registered as an alias).

## Features

- **Substructure detection**
  - **Cycle** – laid out as a perfect circle
  - **Chain** – a path hanging off a leaf, laid out as a ring with its leaf end in the middle
  - **Star** – a hub with leaf neighbours, laid out in concentric rings
  - **Parallel** – nodes sharing the same neighbours, laid out as an aligned grid between their shared endpoints
  - Leaves that don't belong to a chain are placed on a circle around their parent
- **Two interchangeable solvers** for the virtual-node graph: `force` and `stress`
- **Multiple connected components** are each laid out independently, rotated to their minimum bounding box, and packed into rows that match the canvas aspect ratio
- **Compound parents** (`.substructure-group`) are generated for each detected substructure
- **Step-by-step mode** to inspect and replay every stage of the pipeline

## How it works

1. Split the graph into connected components.
2. Detect cycles, chains, stars and parallel groups.
3. Create one virtual node per substructure (single nodes become their own virtual node) and virtual edges between them.
4. Compute a radius for each virtual node from its type and size.
5. Run the selected solver (`force` or `stress`) on the virtual graph, then an anti-collision pass.
6. Expand each virtual node into its real nodes using the substructure-specific arrangement.
7. Rotate each component to its minimum-area bounding box and pack all components onto the canvas.

## Installation

```bash
npm install cytoscape @intact-ebi/cytoscape-lumina
```

`cytoscape` (^3) is a peer dependency.

## Usage

```ts
import cytoscape from 'cytoscape';
import registerLumina from '@intact-ebi/cytoscape-lumina';

registerLumina(cytoscape);

const cy = cytoscape({ container: document.getElementById('cy'), elements: [/* ... */] });

cy.layout({
  name: 'lumina',
  layoutAlgorithm: 'stress',   // 'stress' (default) or 'force'

  // shared by both algorithms
  idealLength: 100,
  iterations: 600,

  // used only when layoutAlgorithm is 'force'
  force: { repulsion: 300, springK: 0.15, useAngularForce: true },

  // used only when layoutAlgorithm is 'stress'
  stress: { weightExponent: 2 }
}).run();
```

Registration is idempotent, so it is safe to call more than once (e.g. with hot reload).

## Options

Options are split by who uses them:

- **Shared** options are passed at the top level and apply to both algorithms.
- **Force-only** options go under `force: { ... }` and are ignored when `layoutAlgorithm` is `'stress'`.
- **Stress-only** options go under `stress: { ... }` and are ignored when `layoutAlgorithm` is `'force'`.

Internally these map to upper-case constants (e.g. `idealLength` → `IDEAL_LENGTH`); `DEFAULT_PARAMS` and `resolveParams` are exported if you need them.

### Algorithm

| Option | Default | Description |
| --- | --- | --- |
| `layoutAlgorithm` | `'stress'` | `'force'` or `'stress'`. |

### Shared solver options (both algorithms)

| Option | Default | Description |
| --- | --- | --- |
| `idealLength` | `100` | Ideal surface-to-surface gap between connected virtual nodes. Spring rest length for `force`, base of the target distance for `stress`; also the radius of the initial radial placement of leaf virtual nodes in both. |
| `iterations` | `600` | Maximum iterations of the main solver loop. |
| `convergenceThreshold` | `0.5` | Stop early once the largest movement of any virtual node is below this many pixels. |
| `collisionPadding` | `idealLength` | Extra gap enforced between virtual nodes in the anti-collision pass. |
| `maxOverlapIterations` | `300` | Safety cap for the anti-collision loop (stress). |

### Force-only options (`force: { ... }`)

| Option | Default | Description |
| --- | --- | --- |
| `repulsion` | `300` | Repulsion strength between virtual nodes. |
| `springK` | `0.15` | Spring stiffness of virtual edges. |
| `overlapRepulsionFactor` | `5` | Overlapping virtual nodes repel this many times harder. |
| `coolingExponent` | `2` | Annealing: `cooling = (1 − iter / iterations) ^ coolingExponent`. |
| `useAngularForce` | `false` | Spread leaf virtual nodes evenly in angle around their hub. |
| `angularStrength` | `0.2` | Strength of the angular force (needs `useAngularForce`). |
| `angularMaxForce` | `2.0` | Per-step cap on the angular force (needs `useAngularForce`). |

### Stress-only options (`stress: { ... }`)

| Option | Default | Description |
| --- | --- | --- |
| `weightExponent` | `2` | Stress weights are `w_ij = 1 / d_ij ^ weightExponent`; `2` is classic stress majorization. |

### Structure detection

| Option | Default | Description |
| --- | --- | --- |
| `minStarLeaves` | `3` | Minimum leaf neighbours for a node to become a star centre. |
| `minCycleLength` | `3` | Minimum number of nodes in a detected cycle. |
| `maxCycleLength` | `30` | Reserved. Currently **not enforced** by the cycle search. |
| `minChainLength` | `2` | Minimum number of nodes in a chain. |
| `minParallelNeighbors` | `2` | Minimum shared neighbours for nodes to count as a parallel group. |

### Substructure spacing

| Option | Default | Description |
| --- | --- | --- |
| `cycleNodeSpacing` | `100` | Target spacing between neighbouring nodes on a cycle (also sizes chain rings and virtual node radii). |
| `starRingSpacing` | `100` | Distance between concentric rings of a star. |
| `starBaseNodesPerRing` | `6` | Nodes in the first star ring; each further ring holds this many more. |
| `chainMinRadius` | `150` | Minimum radius of a chain ring. |
| `leafNodeDistance` | `200` | Distance of non-chain leaves from their parent (only used when `substructureLayout` is `false`). |

### Flags

| Option | Default | Description |
| --- | --- | --- |
| `randomizeInitialPositions` | `false` | Randomize node positions inside the bounding box before the layout starts. |
| `spreadVNodes` | `true` | After solving, scatter real nodes slightly around their virtual node centre. |
| `substructureLayout` | `false` | When `false` (default), each substructure is arranged internally (circle, rings, grid, ...). When `true`, that step is skipped. |
| `stepByStep` | `false` | Record a snapshot after each stage (see below). |

### Backward compatibility

The old flat force options (`repulsion`, `springK`, `useAngularForce`, `angularStrength`) and the legacy upper-case `params: { ... }` object are still accepted. Nested `force` / `stress` objects take priority.

## Step-by-step debugging

Set `stepByStep: true`, keep a reference to the layout, and run it:

```ts
const layout = cy.layout({ name: 'lumina', stepByStep: true });
layout.run();

layout.listSteps();   // print and return all captured steps
layout.goToStep(3);   // jump to a step
layout.nextStep();
layout.prevStep();
layout.clearVirtualNodes();
```

Each step restores real-node positions and overlays the virtual nodes (translucent circles) and virtual edges (dashed lines) at that stage.

## Which algorithm should I use?

- **`stress`** (default) – deterministic-looking, globally consistent distances, good for most graphs. Tune with `idealLength` and `weightExponent`. Cost grows with the number of virtual nodes (all-pairs shortest paths).
- **`force`** – classic spring-and-repulsion with annealing, plus an optional angular force for evenly fanned-out leaves. Tune with `repulsion`, `springK` and `useAngularForce`.

## Notes

- Nodes with 8 or more neighbours are skipped during cycle search, for performance.
- Self-loops and duplicate edges are ignored by the layout.
- Generated compound parents have the class `substructure-group` and ids of the form `<componentIndex>_<groupId>`; they are removed and regenerated on each run.

## License

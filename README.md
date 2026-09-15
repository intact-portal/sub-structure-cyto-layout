# LUMINA: 

## Usage

### Installation

```zsh
npm install @intact-portal/sub-structure-cyto-layout cytoscape
```

### Minimal import

```js
import cytoscape from 'cytoscape';
import registerSubstructureLayout from '@intact-portal/sub-structure-cyto-layout';

registerSubstructureLayout(cytoscape);

const cy = cytoscape({
container: document.getElementById('cy'),
elements
});

cy.layout({
name: 'substructure-layout'
}).run();
```

### Demo project

```js
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cytoscape LUMINA demo</title>
  <style>
    html,
    body {
      height: 100%;
      margin: 0;
      font-family: system-ui, sans-serif;
    }

    body {
      display: grid;
      grid-template-rows: auto 1fr;
    }
  </style>

  <script type="importmap">
    {
      "imports": {
        "cytoscape": "./node_modules/cytoscape/dist/cytoscape.esm.min.mjs",
        "@intact-ebi/cytoscape-lumina": "./node_modules/@intact-ebi/cytoscape-lumina/dist/index.js"
      }
    }
  </script>
</head>
<body>
  <header>
    <h1>LUMINA layout demo</h1>
  </header>
  <main id="cy" aria-label="Interactive network graph"></main>

  <script type="module">
    import cytoscape from 'cytoscape';
    import registerSubstructureLayout from '@intact-ebi/cytoscape-lumina';

    registerSubstructureLayout(cytoscape);

    const elements = [
      { data: { id: 'a' } },
      { data: { id: 'b' } },
      { data: { id: 'c' } },
      { data: { id: 'd' } },
      { data: { id: 'hub' } },
      { data: { id: 'leaf-1' } },
      { data: { id: 'leaf-2' } },
      { data: { id: 'leaf-3' } },
      { data: { id: 'chain-1' } },
      { data: { id: 'chain-2' } },
      { data: { id: 'ab', source: 'a', target: 'b' } },
      { data: { id: 'bc', source: 'b', target: 'c' } },
      { data: { id: 'cd', source: 'c', target: 'd' } },
      { data: { id: 'da', source: 'd', target: 'a' } },
      { data: { id: 'c-hub', source: 'c', target: 'hub' } },
      { data: { id: 'hub-leaf-1', source: 'hub', target: 'leaf-1' } },
      { data: { id: 'hub-leaf-2', source: 'hub', target: 'leaf-2' } },
      { data: { id: 'hub-leaf-3', source: 'hub', target: 'leaf-3' } },
      { data: { id: 'd-chain-1', source: 'd', target: 'chain-1' } },
      { data: { id: 'chain-1-chain-2', source: 'chain-1', target: 'chain-2' } }
    ];

    const cy = cytoscape({
      container: document.getElementById('cy'),
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(id)',
          }
        },
      ]
    });

    cy.layout({
      name: 'substructure-layout',
    }).run();
  </script>
</body>
</html>
```

## Configuration

TODO

## Development

TODO
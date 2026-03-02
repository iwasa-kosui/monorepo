import { visit } from 'unist-util-visit';

export function remarkMermaid() {
  return (tree) => {
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'mermaid' || !parent) return;

      const value = node.value.replace(/</g, '&lt;').replace(/>/g, '&gt;');

      parent.children.splice(index, 1, {
        type: 'html',
        value: `<pre class="mermaid">${value}</pre>`,
      });
    });
  };
}

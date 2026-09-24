// Svelte action for the title bar of a modeless window: drags the bar's parent element
// around the viewport and reports the new position, which the window applies as its own
// `left`/`top`. A window that cannot be moved covers the very text it works on.
export function dragWindow(node: HTMLElement, onMove: (pos: { left: number; top: number }) => void) {
  function down(e: PointerEvent) {
    // Capturing the pointer retargets the click to the bar, so a press that started on
    // a button of the bar would never reach it.
    const win = node.parentElement;
    if (e.button !== 0 || !win || (e.target as Element).closest('button')) return;
    const box = win.getBoundingClientRect();
    const dx = e.clientX - box.left;
    const dy = e.clientY - box.top;
    node.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      onMove({
        left: Math.max(0, Math.min(window.innerWidth - box.width, ev.clientX - dx)),
        top: Math.max(0, Math.min(window.innerHeight - box.height, ev.clientY - dy)),
      });
    };
    const up = () => {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
    };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
  }
  node.addEventListener('pointerdown', down);
  return { destroy: () => node.removeEventListener('pointerdown', down) };
}

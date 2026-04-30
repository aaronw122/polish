<script>
  import { createEventDispatcher, onDestroy } from 'svelte';

  export let rect = null;
  export let active = false;
  export let element = null;

  const dispatch = createEventDispatcher();

  const MIN_SIZE = 10;

  // Handle definitions: position key, cursor, which axes are affected,
  // and whether this handle moves the top/left edge (vs bottom/right).
  const HANDLES = [
    { key: 'nw', cursor: 'nwse-resize', affectsWidth: true,  affectsHeight: true,  movesLeft: true,  movesTop: true  },
    { key: 'n',  cursor: 'ns-resize',   affectsWidth: false, affectsHeight: true,  movesLeft: false, movesTop: true  },
    { key: 'ne', cursor: 'nesw-resize', affectsWidth: true,  affectsHeight: true,  movesLeft: false, movesTop: true  },
    { key: 'e',  cursor: 'ew-resize',   affectsWidth: true,  affectsHeight: false, movesLeft: false, movesTop: false },
    { key: 'se', cursor: 'nwse-resize', affectsWidth: true,  affectsHeight: true,  movesLeft: false, movesTop: false },
    { key: 's',  cursor: 'ns-resize',   affectsWidth: false, affectsHeight: true,  movesLeft: false, movesTop: false },
    { key: 'sw', cursor: 'nesw-resize', affectsWidth: true,  affectsHeight: true,  movesLeft: true,  movesTop: false },
    { key: 'w',  cursor: 'ew-resize',   affectsWidth: true,  affectsHeight: false, movesLeft: true,  movesTop: false },
  ];

  // Corner handle keys — these get aspect ratio constraint
  const CORNER_KEYS = new Set(['nw', 'ne', 'se', 'sw']);

  // Drag state
  let dragging = false;
  let dragHandle = null;
  let startMouseX = 0;
  let startMouseY = 0;
  let startWidth = 0;
  let startHeight = 0;
  let startLeft = 0;
  let startTop = 0;
  let aspectRatio = 1;
  let isFlowPositioned = false;
  let savedBodyCursor = '';
  let savedBodyUserSelect = '';

  // Compute handle positions from rect
  function getHandleStyle(handle) {
    if (!rect) return 'display: none;';
    const hSize = 8;
    const hitSize = 16;
    const offset = hitSize / 2;

    let x, y;

    // Horizontal position
    if (handle.key.includes('w')) {
      x = rect.left - offset;
    } else if (handle.key.includes('e')) {
      x = rect.left + rect.width - offset;
    } else {
      x = rect.left + rect.width / 2 - offset;
    }

    // Vertical position
    if (handle.key.includes('n')) {
      y = rect.top - offset;
    } else if (handle.key.includes('s')) {
      y = rect.top + rect.height - offset;
    } else {
      y = rect.top + rect.height / 2 - offset;
    }

    return `left: ${x}px; top: ${y}px; width: ${hitSize}px; height: ${hitSize}px; cursor: ${handle.cursor};`;
  }

  function onHandleMousedown(e, handle) {
    e.preventDefault();
    e.stopPropagation();

    if (!rect || !element) return;

    dragging = true;
    dragHandle = handle;
    startMouseX = e.clientX;
    startMouseY = e.clientY;
    startWidth = rect.width;
    startHeight = rect.height;
    startLeft = rect.left;
    startTop = rect.top;
    aspectRatio = startWidth / startHeight;

    // Detect flow positioning for margin adjustments
    const pos = window.getComputedStyle(element).position;
    isFlowPositioned = (pos === 'static' || pos === 'relative');

    // Lock cursor on body during drag
    savedBodyCursor = document.body.style.cursor;
    savedBodyUserSelect = document.body.style.userSelect;
    document.body.style.cursor = handle.cursor;
    document.body.style.userSelect = 'none';

    window.addEventListener('mousemove', onDragMove, true);
    window.addEventListener('mouseup', onDragEnd, true);

    dispatch('resizestart', { handle: handle.key });
  }

  function onDragMove(e) {
    if (!dragging || !dragHandle) return;

    const deltaX = e.clientX - startMouseX;
    const deltaY = e.clientY - startMouseY;

    let newWidth = startWidth;
    let newHeight = startHeight;

    // Compute raw dimensions based on handle direction
    if (dragHandle.affectsWidth) {
      if (dragHandle.movesLeft) {
        newWidth = startWidth - deltaX;
      } else {
        newWidth = startWidth + deltaX;
      }
    }

    if (dragHandle.affectsHeight) {
      if (dragHandle.movesTop) {
        newHeight = startHeight - deltaY;
      } else {
        newHeight = startHeight + deltaY;
      }
    }

    // Apply aspect ratio constraint for corner handles (unless Shift is held)
    const isCorner = CORNER_KEYS.has(dragHandle.key);
    if (isCorner && !e.shiftKey) {
      const absDx = Math.abs(deltaX);
      const absDy = Math.abs(deltaY);

      if (absDx >= absDy) {
        // Width is primary axis — height follows
        newHeight = newWidth / aspectRatio;
      } else {
        // Height is primary axis — width follows
        newWidth = newHeight * aspectRatio;
      }
    }

    // Enforce minimum size
    newWidth = Math.max(MIN_SIZE, newWidth);
    newHeight = Math.max(MIN_SIZE, newHeight);

    // Build property changes
    const changes = {};

    if (dragHandle.affectsWidth) {
      changes['width'] = Math.round(newWidth) + 'px';
    }
    if (dragHandle.affectsHeight) {
      changes['height'] = Math.round(newHeight) + 'px';
    }

    // For corner handles with aspect ratio, both dimensions always change
    if (isCorner && !e.shiftKey) {
      changes['width'] = Math.round(newWidth) + 'px';
      changes['height'] = Math.round(newHeight) + 'px';
    }

    // For flow-positioned elements, moving the top/left edge requires
    // margin adjustments to keep the opposite edge anchored.
    if (isFlowPositioned) {
      if (dragHandle.movesTop && dragHandle.affectsHeight) {
        const heightDelta = newHeight - startHeight;
        changes['margin-top'] = Math.round(-heightDelta) + 'px';
      }
      if (dragHandle.movesLeft && dragHandle.affectsWidth) {
        const widthDelta = newWidth - startWidth;
        changes['margin-left'] = Math.round(-widthDelta) + 'px';
      }
    }

    dispatch('resize', { changes, handle: dragHandle.key });
  }

  function onDragEnd() {
    if (!dragging || !dragHandle) return;

    // Restore cursor and user-select
    document.body.style.cursor = savedBodyCursor;
    document.body.style.userSelect = savedBodyUserSelect;

    window.removeEventListener('mousemove', onDragMove, true);
    window.removeEventListener('mouseup', onDragEnd, true);

    dispatch('resizeend', { handle: dragHandle.key });

    dragging = false;
    dragHandle = null;
  }

  // Cleanup listeners if component is destroyed mid-drag
  onDestroy(() => {
    if (dragging) {
      document.body.style.cursor = savedBodyCursor;
      document.body.style.userSelect = savedBodyUserSelect;
      window.removeEventListener('mousemove', onDragMove, true);
      window.removeEventListener('mouseup', onDragEnd, true);
    }
  });
</script>

{#if active && rect}
  {#each HANDLES as handle}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
      class="polish-resize-handle"
      class:dragging
      style={getHandleStyle(handle)}
      on:mousedown={(e) => onHandleMousedown(e, handle)}
    >
      <div class="polish-resize-handle-dot"></div>
    </div>
  {/each}
{/if}

<style>
  .polish-resize-handle {
    position: fixed;
    z-index: 5;
    pointer-events: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 1;
    transition: opacity 0.1s ease;
  }

  .polish-resize-handle-dot {
    width: 8px;
    height: 8px;
    background: rgba(255, 255, 255, 0.9);
    border: 1.5px solid rgba(59, 130, 246, 1);
    border-radius: 1px;
    box-shadow: 0 0 3px rgba(0, 0, 0, 0.3);
  }
</style>

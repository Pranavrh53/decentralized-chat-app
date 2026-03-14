import React, { useRef, useEffect } from "react";

/**
 * ThermodynamicGrid — Interactive canvas heatmap.
 * Black-and-white thermal palette.
 */
const ThermodynamicGrid = ({ resolution = 25, coolingFactor = 0.98, style }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let grid;
    let cols = 0;
    let rows = 0;
    let width = 0;
    let height = 0;
    let animId;

    const mouse = { x: -1000, y: -1000, prevX: -1000, prevY: -1000, active: false };

    // Black & white thermal gradient
    const getThermalColor = (t) => {
      const v = Math.min(255, Math.max(0, Math.round(t * 255)));
      return `rgb(${v}, ${v}, ${v})`;
    };

    const resize = () => {
      width = container.offsetWidth;
      height = container.offsetHeight;
      canvas.width = width;
      canvas.height = height;
      cols = Math.ceil(width / resolution);
      rows = Math.ceil(height / resolution);
      grid = new Float32Array(cols * rows).fill(0);
    };

    const handleMouseMove = (e) => {
      const rect = container.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.active = true;
    };

    const handleMouseLeave = () => {
      mouse.active = false;
    };

    const update = () => {
      if (mouse.active) {
        const dx = mouse.x - mouse.prevX;
        const dy = mouse.y - mouse.prevY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const steps = Math.ceil(dist / (resolution / 2));

        for (let s = 0; s <= steps; s++) {
          const t = steps > 0 ? s / steps : 0;
          const x = mouse.prevX + dx * t;
          const y = mouse.prevY + dy * t;
          const col = Math.floor(x / resolution);
          const row = Math.floor(y / resolution);
          const radius = 2;

          for (let i = -radius; i <= radius; i++) {
            for (let j = -radius; j <= radius; j++) {
              const c = col + i;
              const r2 = row + j;
              if (c >= 0 && c < cols && r2 >= 0 && r2 < rows) {
                const idx = c + r2 * cols;
                const d = Math.sqrt(i * i + j * j);
                if (d <= radius) {
                  grid[idx] = Math.min(1.0, grid[idx] + 0.3 * (1 - d / radius));
                }
              }
            }
          }
        }
      }

      mouse.prevX = mouse.x;
      mouse.prevY = mouse.y;

      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, width, height);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = c + r * cols;
          const temp = grid[idx];
          grid[idx] *= coolingFactor;

          if (temp > 0.05) {
            const x = c * resolution;
            const y = r * resolution;
            const size = resolution * (0.8 + temp * 0.5);
            const offset = (resolution - size) / 2;
            ctx.fillStyle = getThermalColor(temp);
            ctx.fillRect(x + offset, y + offset, size, size);
          } else if (c % 2 === 0 && r % 2 === 0) {
            const x = c * resolution;
            const y = r * resolution;
            ctx.fillStyle = "#111111";
            ctx.fillRect(x + resolution / 2 - 1, y + resolution / 2 - 1, 2, 2);
          }
        }
      }

      animId = requestAnimationFrame(update);
    };

    window.addEventListener("resize", resize);
    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);

    resize();
    update();

    return () => {
      window.removeEventListener("resize", resize);
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
      if (animId) cancelAnimationFrame(animId);
    };
  }, [resolution, coolingFactor]);

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0, zIndex: 0, overflow: "hidden", background: "#000", ...style }}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
    </div>
  );
};

export default ThermodynamicGrid;

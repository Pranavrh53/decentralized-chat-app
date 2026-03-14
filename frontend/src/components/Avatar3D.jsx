import React, { useEffect, useRef } from "react";
import * as THREE from "three";

const Avatar3D = ({ address, size = 40 }) => {
  const containerRef = useRef(null);
  const frameRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = size;
    const height = size;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, width / height, 0.1, 100);
    camera.position.z = 4;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const baseAddress = address && address.startsWith("0x") && address.length > 8
      ? address
      : "0x0000000000000000000000000000000000000000";
    const hueSeed = parseInt(baseAddress.slice(2, 8), 16) % 360;
    const hue = 5 + (hueSeed % 25); // red / orange band 5–30
    const baseColor = new THREE.Color(`hsl(${hue}, 90%, 55%)`);
    const wireColor = new THREE.Color(`hsl(${hue}, 90%, 70%)`);

    const geometry = new THREE.IcosahedronGeometry(1.2, 0);
    const material = new THREE.MeshPhongMaterial({
      color: baseColor,
      shininess: 80,
      emissive: new THREE.Color(`hsl(${hue}, 80%, 15%)`),
      specular: new THREE.Color("#ffffff"),
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(geometry),
      new THREE.LineBasicMaterial({ color: wireColor, linewidth: 1 })
    );
    mesh.add(wire);

    const ringGeometry = new THREE.TorusGeometry(1.7, 0.04, 8, 64);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: wireColor,
      transparent: true,
      opacity: 0.9,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2.5;
    scene.add(ring);

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambient);

    const redLight = new THREE.PointLight(0xff3300, 1.6, 10);
    redLight.position.set(3, 2, 4);
    scene.add(redLight);

    const backLight = new THREE.PointLight(0xffffff, 0.4, 10);
    backLight.position.set(-3, -2, -4);
    scene.add(backLight);

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      mesh.rotation.y += 0.008;
      mesh.rotation.x += 0.003;
      ring.rotation.z += 0.006;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      geometry.dispose();
      ringGeometry.dispose();
      material.dispose();
      ringMaterial.dispose();
      renderer.dispose();
      container.innerHTML = "";
    };
  }, [address, size]);

  return (
    <div
      ref={containerRef}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        position: "relative",
      }}
    />
  );
};

export default Avatar3D;


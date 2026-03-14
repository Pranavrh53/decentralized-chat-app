import React, { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * 3D animated character avatar - waves / says hi.
 * Unique colors per address. Uses Three.js (no extra deps).
 */
const AvatarAnimated3D = ({ address, size = 80, action = "wave" }) => {
  const containerRef = useRef(null);
  const frameRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const w = size;
    const h = size;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 100);
    camera.position.set(0, 0.2, 2.8);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // Unique colors from address
    const seed = address && address.startsWith("0x") ? address : "0x0000000000000000000000000000000000000000";
    const hue = (parseInt(seed.slice(2, 8), 16) % 360) / 360;
    const skinColor = new THREE.Color().setHSL(0.08 + (parseInt(seed.slice(8, 10), 16) % 10) / 100, 0.4, 0.7);
    const outfitColor = new THREE.Color().setHSL(hue, 0.75, 0.45);
    const accentColor = new THREE.Color().setHSL(hue, 0.9, 0.6);

    const matSkin = new THREE.MeshLambertMaterial({ color: skinColor });
    const matOutfit = new THREE.MeshLambertMaterial({ color: outfitColor });
    const matAccent = new THREE.MeshLambertMaterial({ color: accentColor });

    const group = new THREE.Group();

    // Head
    const headGeo = new THREE.SphereGeometry(0.28, 16, 12);
    const head = new THREE.Mesh(headGeo, matSkin);
    head.position.y = 0.75;
    group.add(head);

    // Body (torso)
    const bodyGeo = new THREE.CapsuleGeometry(0.2, 0.4, 4, 8);
    const body = new THREE.Mesh(bodyGeo, matOutfit);
    body.position.y = 0.35;
    group.add(body);

    // Left arm (wave arm) - cylinder
    const armGeo = new THREE.CapsuleGeometry(0.06, 0.35, 4, 6);
    const leftArm = new THREE.Mesh(armGeo, matSkin);
    leftArm.position.set(-0.35, 0.65, 0);
    leftArm.rotation.z = Math.PI / 2;
    group.add(leftArm);

    // Right arm - cylinder
    const rightArm = new THREE.Mesh(armGeo, matSkin);
    rightArm.position.set(0.25, 0.5, 0.08);
    rightArm.rotation.z = -Math.PI / 3;
    group.add(rightArm);

    scene.add(group);

    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambient);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1);
    keyLight.position.set(2, 2, 3);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xff8844, 0.4);
    fillLight.position.set(-1.5, 1, 2);
    scene.add(fillLight);

    let time = 0;
    const baseArmZ = leftArm.rotation.z;

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      time += 0.03;

      // Idle bob
      group.position.y = Math.sin(time * 1.5) * 0.02;

      // Wave: left arm goes up and down
      const wave = Math.sin(time * 4) * 0.6 + 0.2;
      leftArm.rotation.z = baseArmZ - Math.PI / 2 - wave * Math.PI * 0.8;
      leftArm.rotation.x = Math.sin(time * 4) * 0.15;

      // Subtle head tilt
      head.rotation.z = Math.sin(time * 2) * 0.05;

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      headGeo.dispose();
      bodyGeo.dispose();
      armGeo.dispose();
      matSkin.dispose();
      matOutfit.dispose();
      matAccent.dispose();
      renderer.dispose();
      container.innerHTML = "";
    };
  }, [address, size, action]);

  return (
    <div
      ref={containerRef}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        background: "radial-gradient(circle at 30% 30%, rgba(255,60,0,0.1), transparent 70%)",
      }}
    />
  );
};

export default AvatarAnimated3D;

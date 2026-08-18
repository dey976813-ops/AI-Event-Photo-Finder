import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mockPhotos } from '../../utils/mockData';

const PhotoCloud = ({ scrollProgress = 0 }) => {
  const group = useRef();
  
  // Create a memoized array of photo meshes. Reduce count on smaller screens.
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const photoCount = isMobile ? 20 : 50;

  const photos = useMemo(() => {
    return Array.from({ length: photoCount }).map((_, i) => {
      // Random positions in a sphere-like shape
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const radius = 5 + Math.random() * 10;

      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = radius * Math.cos(phi);

      // Random rotation
      const rotation = [
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      ];

      return {
        position: [x, y, z],
        rotation,
        scale: 0.5 + Math.random() * 1.5,
        // For a real app, use texture loader. Using colored planes for MVP performance
        color: new THREE.Color().setHSL(Math.random() * 0.1 + 0.1, 0.5, 0.2)
      };
    });
  }, []);

  useFrame((state) => {
    if (!group.current) return;
    
    // Base slow rotation
    group.current.rotation.y += 0.001;
    group.current.rotation.x += 0.0005;

    // Scroll effect - move towards camera and rotate faster
    if (scrollProgress !== undefined) {
      group.current.position.z = scrollProgress * 15;
      group.current.rotation.y += scrollProgress * 0.01;
    }
  });

  return (
    <group ref={group}>
      {photos.map((props, i) => (
        <mesh key={i} position={props.position} rotation={props.rotation} scale={props.scale}>
          <planeGeometry args={[1, 1.5]} />
          <meshBasicMaterial color={props.color} side={THREE.DoubleSide} transparent opacity={0.8} />
        </mesh>
      ))}
    </group>
  );
};

export default PhotoCloud;

import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// -----------------------------------------------------------------------------
// SHADER CHUNKS - Simplex Noise for organic displacement
// -----------------------------------------------------------------------------
const noiseParsVertex = `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }
`;

/**
 * Custom Material Hook for "Organic" look with self-illumination
 * Extends MeshStandardMaterial with vertex displacement and color variation
 */
function useOrganicMaterial(colorHigh = "#00ddee", colorLow = "#004466", emissiveStrength = 0.5) {
  const materialRef = useRef();
  
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColorHigh: { value: new THREE.Color(colorHigh) },
    uColorLow: { value: new THREE.Color(colorLow) },
    uEmissiveStrength: { value: emissiveStrength },
  }), [colorHigh, colorLow, emissiveStrength]);

  const onBeforeCompile = useMemo(() => (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uColorHigh = uniforms.uColorHigh;
    shader.uniforms.uColorLow = uniforms.uColorLow;
    shader.uniforms.uEmissiveStrength = uniforms.uEmissiveStrength;

    // Inject Vertex Shader
    shader.vertexShader = `
      uniform float uTime;
      uniform float uEmissiveStrength;
      varying float vNoise;
      ${noiseParsVertex}
    ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      
      vec3 worldOffset = vec3(0.0);
      #ifdef USE_INSTANCING
        worldOffset = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #endif
      
      float noiseFreq = 1.8;
      float noiseSpeed = 0.4;
      
      float n = snoise(position * noiseFreq + worldOffset * 0.15 + uTime * noiseSpeed);
      vNoise = n;
      
      float displacementStrength = 0.25;
      transformed += normal * n * displacementStrength;
      `
    );

    // Inject Fragment Shader
    shader.fragmentShader = `
      uniform vec3 uColorHigh;
      uniform vec3 uColorLow;
      uniform float uEmissiveStrength;
      varying float vNoise;
    ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      
      vec3 organicColor = mix(uColorLow, uColorHigh, smoothstep(-0.5, 0.5, vNoise));
      diffuseColor.rgb *= organicColor;
      
      // Self-illumination - like a sun, not just reflection
      diffuseColor.rgb += organicColor * uEmissiveStrength;
      
      vec3 viewDirFresnel = normalize(vViewPosition);
      vec3 normalFresnel = normalize(vNormal);
      float fresnel = pow(1.0 - abs(dot(viewDirFresnel, normalFresnel)), 2.0);
      
      // Strong rim glow
      diffuseColor.rgb += uColorHigh * fresnel * 0.6;
      `
    );
    
    if (materialRef.current) {
      materialRef.current.userData.shader = shader;
    }
  }, [uniforms]);

  useFrame((state) => {
    if (materialRef.current?.userData.shader) {
      materialRef.current.userData.shader.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return { materialRef, onBeforeCompile };
}

// Color palettes for different neuron types (5 colors)
const NEURON_COLORS = [
  { high: "#00ffff", low: "#006688", emissive: 0.6 },  // Cyan
  { high: "#ff66aa", low: "#660044", emissive: 0.5 },  // Magenta/Pink
  { high: "#66ff99", low: "#004422", emissive: 0.5 },  // Green
  { high: "#ffaa44", low: "#664400", emissive: 0.5 },  // Orange
  { high: "#aa88ff", low: "#332266", emissive: 0.5 },  // Purple
];

/**
 * Single Neuron Group with specific color
 */
function NeuronGroup({ count, spread, colorIndex }) {
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colors = NEURON_COLORS[colorIndex % NEURON_COLORS.length];
  const { materialRef, onBeforeCompile } = useOrganicMaterial(colors.high, colors.low, colors.emissive);
  
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = spread * Math.cbrt(Math.random());
      
      const position = new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      );
      
      const scale = 0.12 + Math.random() * 0.22;
      const speed = 0.12 + Math.random() * 0.25;
      const phase = Math.random() * Math.PI * 2;
      
      temp.push({ position, scale, phase, speed, originalPosition: position.clone() });
    }
    return temp;
  }, [count, spread]);

  useEffect(() => {
    if (!meshRef.current) return;
    particles.forEach((particle, i) => {
      dummy.position.copy(particle.position);
      dummy.scale.setScalar(particle.scale);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [particles, dummy]);

  useFrame((state) => {
    if (!meshRef.current) return;
    const time = state.clock.elapsedTime;
    
    particles.forEach((particle, i) => {
      dummy.position.set(
        particle.originalPosition.x + Math.sin(time * particle.speed + particle.phase) * 0.2,
        particle.originalPosition.y + Math.cos(time * particle.speed + particle.phase) * 0.2,
        particle.originalPosition.z + Math.sin(time * particle.speed * 0.7 + particle.phase) * 0.15
      );
      
      dummy.scale.setScalar(particle.scale);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });
    
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[null, null, count]}>
      <icosahedronGeometry args={[1, 8]} />
      <meshStandardMaterial
        ref={materialRef}
        onBeforeCompile={onBeforeCompile}
        color="#ffffff"
        roughness={0.2}
        metalness={0.1}
        transparent
        opacity={0.9}
      />
    </instancedMesh>
  );
}

/**
 * Organic Neurons - Multiple color groups
 */
function Neurons({ totalCount = 60, spread = 7 }) {
  const countPerGroup = Math.ceil(totalCount / 5);
  
  return (
    <group>
      {NEURON_COLORS.map((_, index) => (
        <NeuronGroup 
          key={index} 
          count={countPerGroup} 
          spread={spread} 
          colorIndex={index} 
        />
      ))}
    </group>
  );
}

/**
 * Connection lines with pulsing opacity
 */
function Connections({ neurons, connectionDistance = 3 }) {
  const linesRef = useRef();
  
  const connections = useMemo(() => {
    const lines = [];
    const positions = neurons.map(n => n.position);
    
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dist = positions[i].distanceTo(positions[j]);
        if (dist < connectionDistance && dist > 0.5) {
          lines.push(positions[i], positions[j]);
        }
      }
    }
    return lines;
  }, [neurons, connectionDistance]);

  const lineGeometry = useMemo(() => {
    return new THREE.BufferGeometry().setFromPoints(connections);
  }, [connections]);

  useFrame((state) => {
    if (linesRef.current) {
      linesRef.current.material.opacity = 0.12 + Math.sin(state.clock.elapsedTime * 0.5) * 0.05;
    }
  });

  return (
    <lineSegments ref={linesRef} geometry={lineGeometry}>
      <lineBasicMaterial 
        color="#88ddff" 
        transparent 
        opacity={0.2}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </lineSegments>
  );
}

/**
 * Signal particles with subtle movement - multi-colored
 */
function SignalParticles({ count = 200, spread = 8 }) {
  const pointsRef = useRef();
  
  const particles = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    
    // Color options for particles
    const particleColors = [
      new THREE.Color("#00ffff"),
      new THREE.Color("#ff66aa"),
      new THREE.Color("#66ff99"),
      new THREE.Color("#ffaa44"),
      new THREE.Color("#aa88ff"),
    ];
    
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = spread * Math.cbrt(Math.random());
      
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      
      // Random color from palette
      const color = particleColors[Math.floor(Math.random() * particleColors.length)];
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
      
      speeds[i] = 0.3 + Math.random() * 0.7;
    }
    
    return { positions, colors, speeds };
  }, [count, spread]);

  useFrame((state) => {
    if (!pointsRef.current) return;
    const positions = pointsRef.current.geometry.attributes.position.array;
    const time = state.clock.elapsedTime;
    
    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      const speed = particles.speeds[i];
      
      positions[idx] += Math.sin(time * speed) * 0.01;
      positions[idx + 1] += Math.cos(time * speed) * 0.01;
      positions[idx + 2] += Math.sin(time * speed * 0.5) * 0.006;
    }
    
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={particles.positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={count}
          array={particles.colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.08}
        transparent
        opacity={0.7}
        sizeAttenuation
        vertexColors
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

/**
 * Core sphere with organic shader - the central BRIGHTEST glowing cell
 */
function CoreSphere() {
  // Extra bright emissive for center - like a sun
  const { materialRef, onBeforeCompile } = useOrganicMaterial("#ffffff", "#00ccff", 1.2);
  const meshRef = useRef();
  
  // Pulsing glow animation
  useFrame((state) => {
    if (meshRef.current) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 0.8) * 0.08;
      meshRef.current.scale.setScalar(pulse);
    }
  });
  
  return (
    <group>
      {/* Main core */}
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[1.2, 16]} />
        <meshStandardMaterial
          ref={materialRef}
          onBeforeCompile={onBeforeCompile}
          color="#ffffff"
          roughness={0.1}
          metalness={0.05}
          transparent
          opacity={0.95}
        />
      </mesh>
      
      {/* Inner glow sphere */}
      <mesh>
        <sphereGeometry args={[0.8, 32, 32]} />
        <meshBasicMaterial 
          color="#00ffff" 
          transparent 
          opacity={0.6}
        />
      </mesh>
      
      {/* Outer glow halo */}
      <mesh>
        <sphereGeometry args={[1.8, 32, 32]} />
        <meshBasicMaterial 
          color="#00aaff" 
          transparent 
          opacity={0.15}
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  );
}

/**
 * Rotating outer rings with additive blending - multi-colored
 */
function OuterRings() {
  const groupRef = useRef();

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.06;
      groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.04) * 0.15;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Cyan ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[3.5, 0.02, 16, 100]} />
        <meshBasicMaterial color="#00ffff" transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* Pink ring */}
      <mesh rotation={[Math.PI / 2.5, 0.3, 0]}>
        <torusGeometry args={[4.2, 0.015, 16, 100]} />
        <meshBasicMaterial color="#ff66aa" transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* Green ring */}
      <mesh rotation={[Math.PI / 3, -0.2, 0.5]}>
        <torusGeometry args={[5, 0.012, 16, 100]} />
        <meshBasicMaterial color="#66ff99" transparent opacity={0.25} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* Purple ring */}
      <mesh rotation={[Math.PI / 1.8, 0.5, -0.3]}>
        <torusGeometry args={[5.8, 0.01, 16, 100]} />
        <meshBasicMaterial color="#aa88ff" transparent opacity={0.2} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

/**
 * Main NeuralNetwork component
 */
export default function NeuralNetwork() {
  const neuronData = useMemo(() => {
    const count = 60;
    const spread = 7;
    const temp = [];
    
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = spread * Math.cbrt(Math.random());
      
      const position = new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      );
      
      temp.push({ position });
    }
    return temp;
  }, []);

  return (
    <group>
      <CoreSphere />
      <OuterRings />
      <Neurons count={60} spread={7} />
      <Connections neurons={neuronData} connectionDistance={3} />
      <SignalParticles count={150} spread={8} />
    </group>
  );
}

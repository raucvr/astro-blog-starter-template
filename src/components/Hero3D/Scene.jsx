import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import NeuralNetwork from './NeuralNetwork.jsx';

/**
 * LoadingFallback - 简单的加载占位符
 */
function LoadingFallback() {
  return (
    <mesh visible={false}>
      <boxGeometry />
      <meshBasicMaterial />
    </mesh>
  );
}

/**
 * SceneContent - 包含灯光和3D对象
 */
const SceneContent = () => {
  return (
    <>
      {/* 灯光设置 - 适合浅色背景 */}
      <ambientLight intensity={0.6} color="#ffffff" />
      
      {/* 主光源 - 柔和的白色光 */}
      <directionalLight 
        position={[10, 10, 5]} 
        intensity={1} 
        color="#ffffff"
      />
      
      {/* 补充光 - 蓝绿色调 */}
      <pointLight position={[-10, -5, -10]} intensity={0.5} color="#00aaaa" />
      <pointLight position={[5, -10, 5]} intensity={0.3} color="#0088ff" />

      {/* 神经网络动画 */}
      <NeuralNetwork />
    </>
  );
};

/**
 * Scene - 主入口组件
 */
export default function Scene() {
  return (
    <div style={{ 
      width: '100%', 
      height: '100%', 
      minHeight: '500px',
      position: 'relative'
    }}>
      <Canvas
        dpr={[1, 1.5]}
        gl={{ 
          antialias: false, 
          alpha: true, 
          powerPreference: 'high-performance',
          stencil: false,
          depth: true
        }}
        camera={{ position: [0, 0, 12], fov: 50 }}
        style={{ background: 'transparent' }}
      >
        <Suspense fallback={<LoadingFallback />}>
          <PerspectiveCamera makeDefault position={[0, 0, 12]} />
          
          <SceneContent />
          
          {/* 相机控制 */}
          <OrbitControls 
            enableZoom={false} 
            enablePan={false} 
            autoRotate 
            autoRotateSpeed={0.3}
            minPolarAngle={Math.PI / 3}
            maxPolarAngle={Math.PI / 1.8}
            enableDamping
            dampingFactor={0.05}
          />

          {/* 后期处理 - 轻微效果适合浅色背景 */}
          <EffectComposer disableNormalPass multisampling={0}>
            <Bloom 
              luminanceThreshold={0.6}
              mipmapBlur
              intensity={0.5}
              radius={0.6}
            />
          </EffectComposer>
        </Suspense>
      </Canvas>
    </div>
  );
}


import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { motion, useScroll, useTransform } from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import PhotoCloud from '../../components/3d/PhotoCloud';
import { Camera, ScanFace, Search, Images } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const Landing = () => {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    // GSAP Animations for scroll-driven story
    const ctx = gsap.context(() => {
      // Scene 1 to 2 transition
      gsap.to('.scene-1-text', {
        opacity: 0,
        y: -50,
        scrollTrigger: {
          trigger: '.scene-2',
          start: 'top bottom',
          end: 'top center',
          scrub: true,
        }
      });
    }, containerRef);

    const handleScroll = () => {
      const totalScroll = document.documentElement.scrollTop;
      const windowHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const scroll = `${totalScroll / windowHeight}`;
      setScrollProgress(Number(scroll));
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      ctx.revert();
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <div ref={containerRef} className="bg-background text-primary min-h-[500vh]">
      {/* Fixed 3D Background */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-60">
        <Canvas camera={{ position: [0, 0, 10], fov: 60 }}>
          <ambientLight intensity={0.5} />
          <PhotoCloud scrollProgress={scrollProgress} />
        </Canvas>
      </div>

      {/* Foreground Content */}
      <div className="relative z-10">
        {/* Navbar */}
        <nav className="fixed top-0 left-0 right-0 p-6 flex justify-between items-center glass-panel m-4 z-50">
          <div className="font-display font-bold text-xl tracking-wider">MOMENTAI.</div>
          <div className="flex gap-4">
            <button onClick={() => navigate('/login')} className="text-sm font-medium hover:text-accent transition-colors">Photographer Login</button>
            <button onClick={() => navigate('/event/evt_1')} className="text-sm font-medium bg-white text-background px-4 py-2 rounded-full hover:bg-white/90 transition-colors">Find Photos</button>
          </div>
        </nav>

        {/* Hero / Scene 1 */}
        <section className="h-screen flex flex-col items-center justify-center text-center px-4">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="scene-1-text"
          >
            <h1 className="text-6xl md:text-8xl font-display font-bold mb-4 tracking-tighter">YOUR MOMENTS.</h1>
            <h1 className="text-6xl md:text-8xl font-display font-bold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-accent to-white">FOUND BY AI.</h1>
            <p className="text-xl text-secondary max-w-2xl mx-auto mb-12">
              Stop scrolling through hundreds of event photos. Let AI find every moment you're in.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button onClick={() => navigate('/event/evt_1')} className="px-8 py-4 bg-accent text-background rounded-full font-semibold text-lg hover:bg-accent/90 transition-all flex items-center justify-center gap-2">
                <ScanFace className="w-5 h-5" />
                Find My Photos
              </button>
              <button onClick={() => navigate('/login')} className="px-8 py-4 bg-white/10 text-white rounded-full font-semibold text-lg hover:bg-white/20 transition-all backdrop-blur-md">
                For Photographers
              </button>
            </div>
          </motion.div>
        </section>

        {/* Scene 2 */}
        <section className="scene-2 h-screen flex flex-col items-center justify-center text-center">
          <h2 className="text-5xl md:text-7xl font-display font-bold mb-4">WHERE AM I?</h2>
          <p className="text-2xl text-secondary">STOP SCROLLING.</p>
        </section>

        {/* Scene 3 */}
        <section className="scene-3 h-screen flex flex-col items-center justify-center text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-ai/5 backdrop-blur-3xl -z-10" />
          <h2 className="text-5xl md:text-7xl font-display font-bold mb-8 text-ai">JUST SHOW US YOUR FACE.</h2>
          <div className="w-64 h-64 border-2 border-ai/50 rounded-3xl relative flex items-center justify-center overflow-hidden">
            <ScanFace className="w-24 h-24 text-ai/80" />
            <motion.div 
              animate={{ top: ['-10%', '110%'] }}
              transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
              className="absolute left-0 right-0 h-1 bg-ai/80 shadow-[0_0_20px_rgba(99,102,241,1)]" 
            />
          </div>
        </section>

        {/* Photographer Section */}
        <section className="min-h-screen bg-black/80 backdrop-blur-xl flex items-center py-24">
          <div className="max-w-7xl mx-auto px-6 w-full grid md:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-4xl md:text-6xl font-display font-bold mb-6">ARE YOU THE ONE BEHIND THE CAMERA?</h2>
              <p className="text-xl text-secondary mb-8">
                Upload your event photos once. Let every guest find themselves automatically.
              </p>
              <button onClick={() => navigate('/login')} className="px-8 py-4 bg-white text-background rounded-full font-semibold text-lg hover:bg-white/90 transition-all flex items-center gap-2">
                <Camera className="w-5 h-5" />
                Start as a Photographer
              </button>
            </div>
            
            <div className="space-y-6">
              {[
                { icon: <Images />, title: "UPLOAD", desc: "Upload thousands of photos" },
                { icon: <Search />, title: "AI INDEXES", desc: "Faces are detected and indexed" },
                { icon: <ScanFace />, title: "GUEST SCANS", desc: "Guests scan their face via QR" },
              ].map((step, i) => (
                <div key={i} className="glass-panel p-6 flex items-center gap-6">
                  <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center text-accent">
                    {step.icon}
                  </div>
                  <div>
                    <h3 className="font-bold text-xl">{step.title}</h3>
                    <p className="text-secondary">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

      </div>
    </div>
  );
};

export default Landing;

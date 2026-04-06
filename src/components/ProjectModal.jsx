// src/components/ProjectModal.jsx
import React from 'react'
import { motion } from 'framer-motion'

const PROJECTS = {
  corps: {
    title: 'Corps App',
    tech: 'Flutter · ASP.NET Core · Azure · MySQL · JWT',
    desc: 'Award-winning event & booking app. Built secure auth, booking flows, QR scanning, and cloud integration.'
  },
  ai: {
    title: 'AI Chatbot Prototype',
    tech: 'Python · React · AWS · Azure AI · RAG',
    desc: 'Generative chatbot using RAG, LLM orchestration and backend orchestration for an educational institute.'
  },
  rc: {
    title: 'IoT RC Car',
    tech: 'Raspberry Pi · Python · WebSockets · Cloudflare Tunnel',
    desc: 'Remote-access RC car with live camera streaming and a React-based control dashboard.'
  },
  mech: {
    title: 'Voxel Mech Builder',
    tech: 'Unity · C# · Voxel Engine',
    desc: '3D voxel mech building game with in-game TUI and modular mech construction.'
  },
  skills: {
    title: 'Skills & Tech',
    tech: 'JS · TS · Python · C# · Unity · React · AWS · Azure',
    desc: 'A concise overview of my core technical skills and tools.'
  },
  values: {
    title: 'Values & Story',
    tech: '',
    desc: 'Resilient, disciplined: father, married, worked through degree and earned 3 awards for excellence.'
  }
}

export default function ProjectModal({ slug, onClose }) {
  if(!slug) return null
  const p = PROJECTS[slug] || PROJECTS['skills']
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute inset-0 z-40 flex items-center justify-center pointer-events-auto">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div initial={{scale:0.95, opacity:0}} animate={{scale:1, opacity:1}} className="relative z-50 max-w-2xl bg-slate-900 rounded p-6 shadow-lg border border-white/10">
        <h2 className="text-2xl font-bold">{p.title}</h2>
        <p className="italic text-slate-400 mt-1">{p.tech}</p>
        <p className="mt-4 text-slate-200">{p.desc}</p>
        <div className="mt-6 flex gap-3">
          <a className="px-3 py-1 bg-indigo-600 rounded" href="#" onClick={(e)=>{e.preventDefault(); alert('Download CV link action') }}>Download CV</a>
          <button className="px-3 py-1 border rounded border-white/10" onClick={onClose}>Close</button>
        </div>
      </motion.div>
    </motion.div>
  )
} 

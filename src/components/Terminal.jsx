// src/components/Terminal.jsx
import React, { useState, useRef, useEffect } from 'react'

export default function Terminal({ onCommand }) {
  const PROMPT = 'barlow@portfolio:~$ '
  const [history, setHistory] = useState([ 'Welcome to BARLOW.EXE — type \"help\" to begin.' ])
  const [input, setInput] = useState('')
  const ref = useRef()

  useEffect(()=>{ ref.current?.focus() }, [])

  function run(cmdRaw){
    const cmd = cmdRaw.trim()
    if(!cmd) return
    setHistory(h=>[...h, PROMPT+cmd])
    switch(true){
      case cmd === 'help':
        setHistory(h=>[...h, 'Commands: help, about, skills, projects, personality, play_demo, download_cv, open_project <slug>'])
        break
      case cmd === 'about':
        setHistory(h=>[...h, 'Hi — I\\\'m Barlow. Full-stack dev and problem-solver. Father, married, award-winning.'])
        break
      case cmd === 'skills':
        setHistory(h=>[...h, 'JavaScript, TypeScript, Python, C#, Java, SQL, React, Next.js, ASP.NET Core, Unity, AWS, Azure'])
        break
      case cmd === 'projects':
        setHistory(h=>[...h, 'Available projects: corps | ai | rc | mech | directory | portfolio'])
        break
      case cmd.startsWith('open_project'):
        const parts = cmd.split(' ')
        const slug = parts[1] || null
        setHistory(h=>[...h, `Opening project ${slug}...`])
        if(onCommand) onCommand('open_project '+slug)
        break
      case cmd === 'personality':
        setHistory(h=>[...h, 'Resilient, disciplined, quick learner, team player, practical problem-solver.'] )
        break
      case cmd === 'play_demo':
        setHistory(h=>[...h, 'Launching demo...'])
        if(onCommand) onCommand('play_demo')
        break
      case cmd === 'download_cv':
        setHistory(h=>[...h, 'CV download: (link available on site)'])
        break
      default:
        setHistory(h=>[...h, `Command not found: ${cmd}`])
    }
    setInput('')
  }

  function onKey(e){
    if(e.key === 'Enter') run(input)
  }

  return (
    <div className="bg-slate-900 p-6 rounded-lg font-mono">
      <div style={{minHeight: '220px'}} className="text-slate-300 text-sm">
        {history.map((line,i)=> <div key={i} className="whitespace-pre-wrap">{line}</div>)}
      </div>

      <div className="mt-3 flex">
        <div className="text-green-400 mr-2">{PROMPT}</div>
        <input ref={ref} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={onKey}
          className="bg-black flex-1 outline-none text-white" placeholder="type a command..." />
        <button className="ml-3 px-3 py-1 bg-indigo-600 rounded" onClick={()=>run(input)}>Run</button>
      </div>

      <div className="mt-4 text-slate-400 text-xs">Tip: try <span className="text-white">play_demo</span> or <span className="text-white">projects</span></div>
    </div>
  )
}

import React, { useState } from "react";
import Game from "./components/Game.jsx";
import Terminal from "./components/Terminal";
import ProjectModal from "./components/ProjectModal.jsx";

function App() {
  const [openProject, setOpenProject] = useState(null);

  function handleCommand(cmd) {
    if (!cmd) return;
    if (cmd.startsWith("open_project")) {
      const parts = cmd.split(" ");
      const slug = parts[1] || null;
      setOpenProject(slug);
    }
    if (cmd === "play_demo") {
      // quick demo: open skills platform
      setOpenProject("skills");
    }
  }

  return (
    <div className="flex flex-col w-full h-full bg-black">
      <Terminal onCommand={handleCommand} />
      <div className="flex-1 relative">
        <Game onOpenProject={(slug) => setOpenProject(slug)} />
        <ProjectModal slug={openProject} onClose={() => setOpenProject(null)} />
      </div>
    </div>
  );
}

export default App;
